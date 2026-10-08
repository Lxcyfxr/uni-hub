import { BrowserWindow, dialog } from 'electron'
import { readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { getDb } from '../db'
import { FIELD_SEP, mediaRefs, renameMediaRefs, stripHtml } from '@shared/anki-render'
import { deckSubtree, getNotetype } from './store'
import { dayStart } from './sched'
import { resolveMedia, safeFileName } from './media'
import { stat } from 'fs/promises'
import type { AnkiNotetype, AnkiProgress } from '@shared/ipc'

type Progress = (p: AnkiProgress) => void

/** Obergrenze für die Gesamtgröße der Medien (das Paket wird im Speicher gebaut) */
const MAX_MEDIA_BYTES = 1_000_000_000

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null,
  dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null,
  tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null,
  usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null,
  lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`

const DECK_BASE = {
  usn: -1,
  lrnToday: [0, 0],
  revToday: [0, 0],
  newToday: [0, 0],
  timeToday: [0, 0],
  collapsed: false,
  browserCollapsed: false,
  desc: '',
  dyn: 0,
  conf: 1,
  extendNew: 10,
  extendRev: 50
}

const DEFAULT_CONF = {
  '1': {
    id: 1,
    mod: 0,
    name: 'Default',
    usn: 0,
    maxTaken: 60,
    autoplay: true,
    timer: 0,
    replayq: true,
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 }
  }
}

interface CardRow {
  id: number
  note_id: number
  deck_id: number
  ord: number
  position: number
  state: number
  due: number
  stability: number
  difficulty: number
  scheduled_days: number
  reps: number
  lapses: number
  suspended: number
}

interface NoteRow {
  id: number
  notetype_id: number
  guid: string
  fields: string
  tags: string
  media_ns: string
  modified_at: number
}

/** Indizes der Felder, die ein Vorlagentext verwendet (für "req" im alten Format) */
function fieldsUsed(qfmt: string, fields: string[]): number[] {
  const used = new Set<number>()
  for (const m of qfmt.matchAll(/\{\{([^{}#^/][^{}]*?)\}\}/g)) {
    const idx = fields.indexOf(m[1].split(':').pop()!.trim())
    if (idx >= 0) used.add(idx)
  }
  return [...used]
}

function buildModel(nt: AnkiNotetype, id: number, deckId: number, sec: number) {
  return {
    id,
    name: nt.name,
    type: nt.kind === 'cloze' ? 1 : 0,
    mod: sec,
    usn: -1,
    sortf: 0,
    did: deckId,
    css: nt.css,
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    tags: [],
    vers: [],
    flds: nt.fields.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
    tmpls: nt.templates.map((t, ord) => ({ name: t.name, ord, qfmt: t.qfmt, afmt: t.afmt, bqfmt: '', bafmt: '', bfont: '', bsize: 0, did: null })),
    req: nt.kind === 'cloze' ? [[0, 'all', [0]]] : nt.templates.map((t, i) => [i, 'any', fieldsUsed(t.qfmt, nt.fields)])
  }
}

export async function exportDeck(win: BrowserWindow, deckId: number, withProgress: boolean, progress: Progress): Promise<number | null> {
  const db = getDb()
  const ids = deckSubtree(deckId)
  const marks = ids.map(() => '?').join(',')
  const deckRow = db.prepare('SELECT name FROM anki_decks WHERE id = ?').get(deckId) as unknown as { name: string }

  const target = await dialog.showSaveDialog(win, {
    title: 'Stapel exportieren',
    defaultPath: `${safeFileName(deckRow.name.replace(/::/g, ' - '))}.apkg`,
    filters: [{ name: 'Anki-Paket', extensions: ['apkg'] }]
  })
  if (target.canceled || !target.filePath) return null

  progress({ phase: 'Daten sammeln', done: 0, total: 1 })
  const cards = db.prepare(`SELECT * FROM anki_cards WHERE deck_id IN (${marks}) ORDER BY position, id`).all(...ids) as unknown as CardRow[]
  if (!cards.length) throw new Error('Der Stapel enthält keine Karten')
  const noteIds = [...new Set(cards.map((c) => c.note_id))]
  const notes: NoteRow[] = []
  for (let i = 0; i < noteIds.length; i += 500) {
    const chunk = noteIds.slice(i, i + 500)
    notes.push(...(db.prepare(`SELECT id, notetype_id, guid, fields, tags, media_ns, modified_at FROM anki_notes WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as unknown as NoteRow[]))
  }
  const decks = db.prepare(`SELECT id, name FROM anki_decks WHERE id IN (${marks}) ORDER BY name`).all(...ids) as unknown as { id: number; name: string }[]

  const base = Date.now()
  let seq = 0
  const nextId = () => base + ++seq
  const sec = Math.floor(base / 1000)
  const crt = Math.floor(dayStart(base) / 1000)

  const deckIdMap = new Map(decks.map((d) => [d.id, nextId()]))
  const ntIds = [...new Set(notes.map((n) => n.notetype_id))]
  const notetypesUsed = new Map(ntIds.map((id) => [id, getNotetype(id)]))
  const modelIdMap = new Map(ntIds.map((id) => [id, nextId()]))
  const noteIdMap = new Map(notes.map((n) => [n.id, nextId()]))
  const firstDeck = deckIdMap.values().next().value as number

  const decksJson: Record<string, unknown> = { '1': { ...DECK_BASE, id: 1, name: 'Default', mod: sec } }
  for (const d of decks) decksJson[String(deckIdMap.get(d.id))] = { ...DECK_BASE, id: deckIdMap.get(d.id), name: d.name, mod: sec }
  const modelsJson: Record<string, unknown> = {}
  for (const [id, nt] of notetypesUsed) modelsJson[String(modelIdMap.get(id))] = buildModel(nt, modelIdMap.get(id)!, firstDeck, sec)

  // Medien einsammeln (Namenskollisionen zwischen verschiedenen Importen auflösen)
  progress({ phase: 'Medien sammeln', done: 0, total: notes.length })
  const exported = new Map<string, { index: number; path: string }>()
  const usedNames = new Map<string, string>() // Exportname -> Quelle (ns/name)
  const mediaFiles: { index: number; path: string }[] = []
  let mediaBytes = 0
  const noteFields = new Map<number, string[]>()
  for (const [i, n] of notes.entries()) {
    if (i % 500 === 0) progress({ phase: 'Medien sammeln', done: i, total: notes.length })
    let values = n.fields.split(FIELD_SEP)
    const rename = new Map<string, string>()
    for (const name of new Set(values.flatMap((v) => mediaRefs(v)))) {
      const file = await resolveMedia(n.media_ns, name)
      if (!file) continue
      const source = `${n.media_ns}/${name}`
      let exportName = name
      if (usedNames.has(exportName) && usedNames.get(exportName) !== source) exportName = `${n.media_ns}_${name}`
      if (exportName !== name) rename.set(name, exportName)
      if (!usedNames.has(exportName)) {
        usedNames.set(exportName, source)
        mediaBytes += (await stat(file)).size
        if (mediaBytes > MAX_MEDIA_BYTES) throw new Error('Die Medien dieses Stapels sind zu groß für den Export (über 1 GB)')
        const entry = { index: mediaFiles.length, path: file }
        mediaFiles.push(entry)
        exported.set(exportName, entry)
      }
    }
    if (rename.size) values = values.map((v) => renameMediaRefs(v, rename))
    noteFields.set(n.id, values)
  }

  // Sammlung im alten Anki-Format (Schema 11) schreiben
  progress({ phase: 'Paket bauen', done: 0, total: 1 })
  const tmp = join(tmpdir(), `unihub-export-${Date.now()}.anki2`)
  const out = new DatabaseSync(tmp)
  try {
    out.exec(SCHEMA)
    const conf = {
      nextPos: cards.length + 1, estTimes: true, activeDecks: [1], sortType: 'noteFld', timeLim: 0, sortBackwards: false, addToCur: true,
      curDeck: 1, newBury: true, newSpread: 0, dueCounts: true, curModel: String(modelIdMap.values().next().value), collapseTime: 1200
    }
    out.prepare('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)').run(crt, base, base, JSON.stringify(conf), JSON.stringify(modelsJson), JSON.stringify(decksJson), JSON.stringify(DEFAULT_CONF), '{}')

    const insNote = out.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    const insCard = out.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    out.exec('BEGIN')
    for (const n of notes) {
      const values = noteFields.get(n.id)!
      const sortField = stripHtml(values[0] ?? '')
      const csum = parseInt(createHash('sha1').update(sortField).digest('hex').slice(0, 8), 16)
      insNote.run(noteIdMap.get(n.id)!, n.guid, modelIdMap.get(n.notetype_id)!, Math.floor(n.modified_at / 1000), -1, n.tags, values.join(FIELD_SEP), sortField, csum, 0, '')
    }
    cards.forEach((c, i) => {
      const review = withProgress && c.state === 2
      const factor = review ? Math.round(Math.min(5000, Math.max(1300, 2500 - (c.difficulty - 5) * 250))) : 0
      const type = review ? 2 : 0
      const queue = c.suspended ? -1 : review ? 2 : 0
      const due = review ? Math.floor((c.due / 1000 - crt) / 86_400) : i + 1
      const ivl = review ? Math.max(1, c.scheduled_days || Math.round(c.stability)) : 0
      insCard.run(nextId(), noteIdMap.get(c.note_id)!, deckIdMap.get(c.deck_id)!, c.ord, sec, -1, type, queue, due, ivl, factor, review ? c.reps : 0, review ? c.lapses : 0, 0, 0, 0, 0, '')
    })
    out.exec('COMMIT')
    out.close()

    const zip: Zippable = {
      'collection.anki2': [new Uint8Array(await readFile(tmp)), { level: 6 }],
      media: strToU8(JSON.stringify(Object.fromEntries([...exported].map(([name, e]) => [String(e.index), name]))))
    }
    for (const e of exported.values()) zip[String(e.index)] = [new Uint8Array(await readFile(e.path)), { level: 0 }]
    await writeFile(target.filePath, zipSync(zip))
    progress({ phase: 'Fertig', done: 1, total: 1 })
    return notes.length
  } finally {
    try {
      out.close()
    } catch {
      /* bereits geschlossen */
    }
    await rm(tmp, { force: true })
  }
}
