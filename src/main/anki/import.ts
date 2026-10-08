import { BrowserWindow, dialog, type Session } from 'electron'
import { mkdtempSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { zstdDecompressSync } from 'zlib'
import yauzl from 'yauzl'
import { getDb } from '../db'
import { FIELD_SEP, plainTitle } from '@shared/anki-render'
import { getOrCreateDeck, insertNotetype, notetypes, saveNote } from './store'
import { mediaRoot, safeFileName } from './media'
import type { AnkiDownloadEvent, AnkiImportResult, AnkiProgress } from '@shared/ipc'

type Progress = (p: AnkiProgress) => void

/* ---------- Mini-Protobuf (für das neue Anki-Format) ---------- */

interface PbField {
  field: number
  num: number
  bytes: Uint8Array | null
}

function* protoFields(buf: Uint8Array): Generator<PbField> {
  let pos = 0
  const varint = (): number => {
    let result = 0
    let mul = 1
    for (;;) {
      if (pos >= buf.length) throw new Error('Protobuf: unerwartetes Ende')
      const b = buf[pos++]
      result += (b & 0x7f) * mul
      if (!(b & 0x80)) return result
      mul *= 128
    }
  }
  while (pos < buf.length) {
    const tag = varint()
    const field = Math.floor(tag / 8)
    const wire = tag % 8
    if (wire === 0) yield { field, num: varint(), bytes: null }
    else if (wire === 2) {
      const len = varint()
      yield { field, num: 0, bytes: buf.subarray(pos, pos + len) }
      pos += len
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else throw new Error('Protobuf: unbekannter Wire-Typ')
  }
}

const utf8 = (b: Uint8Array) => Buffer.from(b).toString('utf8')

/* ---------- Zip-Zugriff ---------- */

const isZstd = (b: Uint8Array) => b.length >= 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd
const maybeZstd = (b: Buffer): Buffer => (isZstd(b) ? zstdDecompressSync(b) : b)

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => (err || !zip ? reject(err ?? new Error('Zip konnte nicht geöffnet werden')) : resolve(zip)))
  })
}

function listEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const map = new Map<string, yauzl.Entry>()
    zip.on('entry', (e: yauzl.Entry) => {
      map.set(e.fileName, e)
      zip.readEntry()
    })
    zip.on('end', () => resolve(map))
    zip.on('error', reject)
    zip.readEntry()
  })
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('Eintrag nicht lesbar'))
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}

/* ---------- Quellformate ---------- */

interface SrcNotetype {
  key: string
  name: string
  kind: 'standard' | 'cloze'
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
  css: string
}

interface SrcNote {
  guid: string
  mid: string
  tags: string
  flds: string
}

interface SrcCard {
  nid: number
  did: number
  odid: number
  ord: number
  type: number
  queue: number
  due: number
  ivl: number
  factor: number
  reps: number
  lapses: number
  data: string
}

interface Source {
  crt: number
  notetypes: SrcNotetype[]
  decks: Map<number, string>
  notes: Map<number, SrcNote>
  cards: SrcCard[]
}

function readLegacy(db: DatabaseSync): { crt: number; notetypes: SrcNotetype[]; decks: Map<number, string> } {
  const col = db.prepare('SELECT crt, models, decks FROM col').get() as unknown as { crt: number; models: string; decks: string }
  const models = JSON.parse(col.models) as Record<string, any>
  const decks = JSON.parse(col.decks) as Record<string, any>
  return {
    crt: col.crt,
    notetypes: Object.values(models).map((m) => ({
      key: String(m.id),
      name: String(m.name),
      kind: m.type === 1 ? 'cloze' : 'standard',
      fields: [...m.flds].sort((a: any, b: any) => a.ord - b.ord).map((f: any) => String(f.name)),
      templates: [...m.tmpls].sort((a: any, b: any) => a.ord - b.ord).map((t: any) => ({ name: String(t.name), qfmt: String(t.qfmt), afmt: String(t.afmt) })),
      css: String(m.css ?? '')
    })),
    decks: new Map(Object.values(decks).map((d) => [Number(d.id), String(d.name)]))
  }
}

/**
 * Das neue Anki-Format deklariert die Sortierung "unicase", die node:sqlite nicht registrieren kann
 * (Abfragen schlagen dann mit "no such collation sequence" fehl). Im Schema-Text der temporären Kopie
 * wird sie durch gleich langes "nocase " ersetzt; gelesen wird nur per Tabellenscan, die Indexreihenfolge ist egal.
 */
export function patchUnicase(buf: Buffer): Buffer {
  const needle = Buffer.from('unicase')
  const replacement = Buffer.from('nocase ')
  for (let i = buf.indexOf(needle); i >= 0; i = buf.indexOf(needle, i + needle.length)) {
    if (i >= 8 && buf.subarray(i - 8, i).toString('latin1').toLowerCase() === 'collate ') replacement.copy(buf, i)
  }
  return buf
}

function readModern(db: DatabaseSync): { crt: number; notetypes: SrcNotetype[]; decks: Map<number, string> } {
  const crt = (db.prepare('SELECT crt FROM col').get() as unknown as { crt: number }).crt
  const nts = db.prepare('SELECT id, name, config FROM notetypes').all() as unknown as { id: number; name: string; config: Uint8Array }[]
  const flds = db.prepare('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord').all() as unknown as { ntid: number; ord: number; name: string }[]
  const tmpls = db.prepare('SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord').all() as unknown as { ntid: number; ord: number; name: string; config: Uint8Array }[]
  const decks = db.prepare('SELECT id, name FROM decks').all() as unknown as { id: number; name: string }[]

  const notetypes = nts.map((nt): SrcNotetype => {
    let kind: 'standard' | 'cloze' = 'standard'
    let css = ''
    for (const f of protoFields(nt.config)) {
      if (f.field === 1 && f.bytes === null) kind = f.num === 1 ? 'cloze' : 'standard'
      if (f.field === 3 && f.bytes) css = utf8(f.bytes)
    }
    return {
      key: String(nt.id),
      name: nt.name,
      kind,
      fields: flds.filter((f) => f.ntid === nt.id).sort((a, b) => a.ord - b.ord).map((f) => f.name),
      templates: tmpls
        .filter((t) => t.ntid === nt.id)
        .sort((a, b) => a.ord - b.ord)
        .map((t) => {
          let qfmt = ''
          let afmt = ''
          for (const f of protoFields(t.config)) {
            if (f.field === 1 && f.bytes) qfmt = utf8(f.bytes)
            if (f.field === 2 && f.bytes) afmt = utf8(f.bytes)
          }
          return { name: t.name, qfmt, afmt }
        }),
      css
    }
  })
  return { crt, notetypes, decks: new Map(decks.map((d) => [d.id, d.name.replace(/\u001f/g, '::')])) }
}

function readSource(dbPath: string): Source {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const modern = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notetypes'").get()
    const base = modern ? readModern(db) : readLegacy(db)
    const notes = new Map<number, SrcNote>()
    for (const n of db.prepare('SELECT id, guid, mid, tags, flds FROM notes').all() as unknown as (SrcNote & { id: number; mid: number })[]) {
      notes.set(n.id, { guid: n.guid, mid: String(n.mid), tags: n.tags, flds: n.flds })
    }
    const cards = db
      .prepare('SELECT nid, did, odid, ord, type, queue, due, ivl, factor, reps, lapses, data FROM cards')
      .all() as unknown as SrcCard[]
    return { ...base, notes, cards }
  } finally {
    db.close()
  }
}

/** Medienliste: altes Format = JSON-Objekt, neues Format = (zstd-komprimiertes) Protobuf. */
function parseMediaList(raw: Buffer): Map<string, string> {
  const buf = maybeZstd(raw)
  const map = new Map<string, string>()
  if (buf[0] === 0x7b /* { */) {
    for (const [idx, name] of Object.entries(JSON.parse(buf.toString('utf8')) as Record<string, string>)) map.set(idx, name)
    return map
  }
  let idx = 0
  for (const f of protoFields(buf)) {
    if (f.field !== 1 || !f.bytes) continue
    for (const g of protoFields(f.bytes)) if (g.field === 1 && g.bytes) map.set(String(idx), utf8(g.bytes))
    idx++
  }
  return map
}

/* ---------- Fortschritt von Anki auf FSRS abbilden ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function cardState(c: SrcCard, crt: number, keep: boolean) {
  const base = { state: 0, due: Date.now(), stability: 0, difficulty: 0, scheduledDays: 0, reps: 0, lapses: 0, lastReview: null as number | null, position: c.due }
  if (!keep || c.type !== 2) return { ...base, suspended: c.queue === -1 ? 1 : 0 }
  let memory: { s?: number; d?: number } = {}
  try {
    memory = c.data ? JSON.parse(c.data) : {}
  } catch {
    /* ohne FSRS-Daten */
  }
  const ivl = Math.max(1, c.ivl)
  const dueMs = (crt + c.due * 86_400) * 1000
  return {
    state: 2,
    due: dueMs,
    // Näherung: Stabilität ≈ aktuelles Intervall, Schwierigkeit aus dem Anki-Ease-Faktor
    stability: typeof memory.s === 'number' && memory.s > 0 ? memory.s : ivl,
    difficulty: typeof memory.d === 'number' && memory.d > 0 ? clamp(memory.d, 1, 10) : clamp(5 + (2500 - (c.factor || 2500)) / 250, 1, 10),
    scheduledDays: ivl,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: dueMs - ivl * 86_400_000,
    position: 0,
    suspended: c.queue === -1 ? 1 : 0
  }
}

/* ---------- .apkg-Import ---------- */

export async function importApkg(file: string, keepProgress: boolean, progress: Progress): Promise<AnkiImportResult> {
  const zip = await openZip(file)
  const tmp = join(tmpdir(), `unihub-anki-${Date.now()}.db`)
  const ns = `imp${Date.now().toString(36)}`
  try {
    progress({ phase: 'Paket lesen', done: 0, total: 1 })
    const entries = await listEntries(zip)
    const collectionName = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((n) => entries.has(n))
    if (!collectionName) throw new Error('Keine Anki-Sammlung in der Datei gefunden – ist das eine .apkg-Datei?')
    await writeFile(tmp, patchUnicase(maybeZstd(await readEntry(zip, entries.get(collectionName)!))))
    const src = readSource(tmp)

    const db = getDb()
    const result: AnkiImportResult = { decks: 0, notes: 0, cards: 0, media: 0, skipped: 0 }

    // Notiztypen
    const ntMap = new Map<string, number>()
    const ntInfo = new Map<string, SrcNotetype>()
    for (const nt of src.notetypes) {
      if (!nt.fields.length || !nt.templates.length) continue
      ntMap.set(nt.key, insertNotetype({ name: nt.name, kind: nt.kind, fields: nt.fields, templates: nt.templates, css: nt.css }))
      ntInfo.set(nt.key, nt)
    }

    // Stapel (nur die, in denen Karten liegen)
    const deckMap = new Map<number, number>()
    const effDeck = (c: SrcCard) => (c.odid > 0 ? c.odid : c.did)
    const touched = new Set<number>()
    for (const c of src.cards) {
      const did = effDeck(c)
      if (deckMap.has(did)) continue
      deckMap.set(did, getOrCreateDeck(src.decks.get(did) ?? 'Importiert'))
      touched.add(deckMap.get(did)!)
    }
    result.decks = touched.size

    // Notizen und Karten
    const cardsByNote = new Map<number, SrcCard[]>()
    for (const c of src.cards) {
      const list = cardsByNote.get(c.nid)
      if (list) list.push(c)
      else cardsByNote.set(c.nid, [c])
    }
    const findGuid = db.prepare('SELECT 1 FROM anki_notes WHERE guid = ? AND notetype_id = ?')
    const insNote = db.prepare('INSERT INTO anki_notes (notetype_id,guid,fields,sort_text,tags,media_ns,created_at,modified_at) VALUES (?,?,?,?,?,?,?,?)')
    const insCard = db.prepare(
      `INSERT INTO anki_cards (note_id,deck_id,ord,position,state,due,stability,difficulty,scheduled_days,reps,lapses,last_review,suspended)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const total = src.notes.size
    let done = 0
    const now = Date.now()
    db.exec('BEGIN')
    try {
      for (const [nid, n] of src.notes) {
        if (++done % 500 === 0) progress({ phase: 'Notizen importieren', done, total })
        const localNt = ntMap.get(n.mid)
        const info = ntInfo.get(n.mid)
        const cards = cardsByNote.get(nid)
        if (localNt === undefined || !info || !cards) continue
        if (findGuid.get(n.guid, localNt)) {
          result.skipped++
          continue
        }
        const values = n.flds.split(FIELD_SEP)
        while (values.length < info.fields.length) values.push('')
        const flds = values.slice(0, info.fields.length).join(FIELD_SEP)
        const tags = n.tags.trim() ? ` ${n.tags.trim()} ` : ''
        const noteId = Number(insNote.run(localNt, n.guid, flds, plainTitle(values[0] ?? ''), tags, ns, now, now).lastInsertRowid)
        result.notes++
        for (const c of cards) {
          const s = cardState(c, src.crt, keepProgress)
          insCard.run(noteId, deckMap.get(effDeck(c))!, c.ord, s.position, s.state, s.due, s.stability, s.difficulty, s.scheduledDays, s.reps, s.lapses, s.lastReview, s.suspended)
          result.cards++
        }
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    // Medien
    if (result.notes > 0 && entries.has('media')) {
      const list = parseMediaList(await readEntry(zip, entries.get('media')!))
      const dir = join(mediaRoot(), ns)
      await mkdir(dir, { recursive: true })
      let i = 0
      for (const [idx, name] of list) {
        if (++i % 100 === 0) progress({ phase: 'Medien kopieren', done: i, total: list.size })
        const entry = entries.get(idx)
        if (!entry) continue
        try {
          await writeFile(join(dir, safeFileName(name)), maybeZstd(await readEntry(zip, entry)))
          result.media++
        } catch (e) {
          console.warn('Mediendatei übersprungen:', name, e)
        }
      }
    }
    progress({ phase: 'Fertig', done: 1, total: 1 })
    return result
  } finally {
    zip.close()
    await rm(tmp, { force: true })
  }
}

export async function importApkgDialog(win: BrowserWindow, keepProgress: boolean, progress: Progress): Promise<AnkiImportResult | null> {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Anki-Paket importieren',
    properties: ['openFile'],
    filters: [{ name: 'Anki-Pakete', extensions: ['apkg', 'colpkg'] }]
  })
  if (pick.canceled || !pick.filePaths[0]) return null
  return importApkg(pick.filePaths[0], keepProgress, progress)
}

/**
 * .apkg/.colpkg-Downloads aus einer Webansicht direkt in Anki importieren statt sie zu speichern.
 * Fremde Pakete starten ohne Lernfortschritt (alle Karten neu); mehrere Downloads laufen nacheinander.
 */
export function captureApkgDownloads(ses: Session, progress: Progress, notify: (e: AnkiDownloadEvent) => void): void {
  let queue: Promise<void> = Promise.resolve()
  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename()
    if (!/\.(apkg|colpkg)$/i.test(filename)) return
    // Der Speicherpfad muss synchron gesetzt werden, sonst fragt Electron mit einem Speichern-Dialog nach
    const dir = mkdtempSync(join(tmpdir(), 'uni-hub-apkg-'))
    item.setSavePath(join(dir, safeFileName(filename)))
    notify({ status: 'downloading', filename })
    item.once('done', (_e, state) => {
      queue = queue.then(async () => {
        try {
          if (state !== 'completed') throw new Error(state === 'cancelled' ? 'Download abgebrochen' : 'Download fehlgeschlagen')
          notify({ status: 'importing', filename })
          const result = await importApkg(item.getSavePath(), false, progress)
          notify({ status: 'done', filename, result })
        } catch (err) {
          notify({ status: 'error', filename, error: String((err as Error)?.message ?? err) })
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(() => {})
        }
      })
    })
  })
}

/* ---------- Text/CSV ---------- */

/** RFC-4180-artiges Parsen mit Anführungszeichen und Zeilenumbrüchen in Feldern. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.length)) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.length)) rows.push(row)
  return rows
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>')

export function importDelimited(text: string, deckId: number, hasHeader: boolean): AnkiImportResult {
  const lines = text.replace(/^﻿/, '')
  const headerLines = lines.split(/\r?\n/).filter((l) => l.startsWith('#'))
  const body = lines.split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n')
  const asHtml = headerLines.some((l) => /^#html:\s*true/i.test(l))
  const sample = body.split('\n').find((l) => l.trim()) ?? ''
  const count = (c: string) => sample.split(c).length - 1
  const delim = headerLines.some((l) => /^#separator:\s*tab/i.test(l)) ? '\t' : [['\t', count('\t')], [';', count(';')], [',', count(',')]].sort((a, b) => (b[1] as number) - (a[1] as number))[0][0] as string
  let rows = parseDelimited(body, delim)
  if (hasHeader) rows = rows.slice(1)

  const basic = notetypes().find((n) => n.kind === 'standard' && n.fields.length === 2 && n.templates.length === 1)
  if (!basic) throw new Error('Kein einfacher Notiztyp vorhanden')
  const fmt = (s: string) => (asHtml ? s : escapeHtml(s.trim()))
  const result: AnkiImportResult = { decks: 1, notes: 0, cards: 0, media: 0, skipped: 0 }
  for (const r of rows) {
    if (r.length < 2 || !r[0].trim() || !r[1].trim()) {
      result.skipped++
      continue
    }
    saveNote({ notetypeId: basic.id, deckId, fields: [fmt(r[0]), fmt(r[1])], tags: (r[2] ?? '').split(/[\s,]+/).filter(Boolean) })
    result.notes++
    result.cards++
  }
  return result
}

export async function importTextDialog(win: BrowserWindow, deckId: number, hasHeader: boolean): Promise<AnkiImportResult | null> {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Text-/CSV-Datei importieren',
    properties: ['openFile'],
    filters: [{ name: 'Text/CSV', extensions: ['txt', 'csv', 'tsv'] }]
  })
  if (pick.canceled || !pick.filePaths[0]) return null
  return importDelimited(await readFile(pick.filePaths[0], 'utf8'), deckId, hasHeader)
}
