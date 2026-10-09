import { createHash, randomBytes } from 'crypto'
import { getDb } from '../db'
import { FIELD_SEP, cardOrds, clozeNumbers, hasContent, plainTitle, type RenderNotetype } from '@shared/anki-render'
import type { AnkiBrowseQuery, AnkiBrowseResult, AnkiNote, AnkiNoteInput, AnkiNotetype } from '@shared/ipc'

/* ---------- Notiztypen ---------- */

interface NtRow {
  id: number
  name: string
  kind: string
  fields: string
  templates: string
  css: string
}

const toNotetype = (r: NtRow): AnkiNotetype => ({
  id: r.id,
  name: r.name,
  kind: r.kind === 'cloze' ? 'cloze' : 'standard',
  fields: JSON.parse(r.fields),
  templates: JSON.parse(r.templates),
  css: r.css
})

const DEFAULT_CSS = '.card { font-size: 20px; text-align: center; }\n.cloze { font-weight: bold; color: #4096ff; }\nhr#answer { opacity: 0.3; }'

export const notetypeHash = (nt: Pick<AnkiNotetype, 'kind' | 'fields' | 'templates' | 'css'>) =>
  createHash('sha1').update(JSON.stringify([nt.kind, nt.fields, nt.templates, nt.css])).digest('hex')

export function insertNotetype(nt: Omit<AnkiNotetype, 'id'>): number {
  const db = getDb()
  const hash = notetypeHash(nt)
  const existing = db.prepare('SELECT id FROM anki_notetypes WHERE hash = ?').get(hash) as unknown as { id: number } | undefined
  if (existing) return existing.id
  const res = db
    .prepare('INSERT INTO anki_notetypes (name,kind,fields,templates,css,hash) VALUES (?,?,?,?,?,?)')
    .run(nt.name, nt.kind, JSON.stringify(nt.fields), JSON.stringify(nt.templates), nt.css, hash)
  return Number(res.lastInsertRowid)
}

let defaultsEnsured = false

/** Legt die eingebauten Notiztypen an (auch nach einem Import); insertNotetype vermeidet Duplikate. */
function ensureDefaults(): void {
  if (defaultsEnsured) return
  defaultsEnsured = true
  insertNotetype({
    name: 'Einfach',
    kind: 'standard',
    fields: ['Vorderseite', 'Rückseite'],
    templates: [{ name: 'Karte 1', qfmt: '{{Vorderseite}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Rückseite}}' }],
    css: DEFAULT_CSS
  })
  insertNotetype({
    name: 'Einfach (+ umgekehrte Karte)',
    kind: 'standard',
    fields: ['Vorderseite', 'Rückseite'],
    templates: [
      { name: 'Karte 1', qfmt: '{{Vorderseite}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Rückseite}}' },
      { name: 'Karte 2', qfmt: '{{Rückseite}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Vorderseite}}' }
    ],
    css: DEFAULT_CSS
  })
  insertNotetype({
    name: 'Lückentext',
    kind: 'cloze',
    fields: ['Text', 'Zusatz'],
    templates: [{ name: 'Lückentext', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>\n{{Zusatz}}' }],
    css: DEFAULT_CSS
  })
}

export function notetypes(): AnkiNotetype[] {
  ensureDefaults()
  return (getDb().prepare('SELECT * FROM anki_notetypes ORDER BY id').all() as unknown as NtRow[]).map(toNotetype)
}

export function getNotetype(id: number): AnkiNotetype {
  const r = getDb().prepare('SELECT * FROM anki_notetypes WHERE id = ?').get(id) as unknown as NtRow | undefined
  if (!r) throw new Error('Notiztyp nicht gefunden')
  return toNotetype(r)
}

export const asRender = (nt: AnkiNotetype): RenderNotetype => nt

/* ---------- Stapel ---------- */

export function normalizeDeckName(name: string): string {
  const parts = name.split('::').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
  if (!parts.length) throw new Error('Bitte einen Namen eingeben')
  return parts.join('::')
}

export function getOrCreateDeck(name: string): number {
  const db = getDb()
  const n = normalizeDeckName(name)
  const row = db.prepare('SELECT id FROM anki_decks WHERE name = ?').get(n) as unknown as { id: number } | undefined
  if (row) return row.id
  return Number(db.prepare('INSERT INTO anki_decks (name) VALUES (?)').run(n).lastInsertRowid)
}

export function createDeck(name: string): number {
  const n = normalizeDeckName(name)
  if (getDb().prepare('SELECT 1 FROM anki_decks WHERE name = ?').get(n)) throw new Error('Ein Stapel mit diesem Namen existiert bereits')
  return getOrCreateDeck(n)
}

/** Stapel plus alle Unterstapel */
export function deckSubtree(id: number): number[] {
  const db = getDb()
  const d = db.prepare('SELECT name FROM anki_decks WHERE id = ?').get(id) as unknown as { name: string } | undefined
  if (!d) throw new Error('Stapel nicht gefunden')
  const rows = db.prepare('SELECT id, name FROM anki_decks').all() as unknown as { id: number; name: string }[]
  return rows.filter((r) => r.name === d.name || r.name.startsWith(d.name + '::')).map((r) => r.id)
}

export function renameDeck(id: number, newName: string): void {
  const db = getDb()
  const n = normalizeDeckName(newName)
  const cur = db.prepare('SELECT name FROM anki_decks WHERE id = ?').get(id) as unknown as { name: string } | undefined
  if (!cur) throw new Error('Stapel nicht gefunden')
  if (n === cur.name) return
  const all = db.prepare('SELECT id, name FROM anki_decks').all() as unknown as { id: number; name: string }[]
  const moving = all.filter((d) => d.name === cur.name || d.name.startsWith(cur.name + '::'))
  const movingIds = new Set(moving.map((d) => d.id))
  const taken = new Set(all.filter((d) => !movingIds.has(d.id)).map((d) => d.name))
  const renamed = moving.map((d) => ({ id: d.id, name: n + d.name.slice(cur.name.length) }))
  if (renamed.some((d) => taken.has(d.name))) throw new Error('Ein Stapel mit diesem Namen existiert bereits')
  db.exec('BEGIN')
  try {
    // Zweiphasig, damit eindeutige Namen während der Umbenennung nicht kollidieren
    const upd = db.prepare('UPDATE anki_decks SET name = ? WHERE id = ?')
    renamed.forEach((d) => upd.run(`\u0000${d.id}`, d.id))
    renamed.forEach((d) => upd.run(d.name, d.id))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function deleteDeck(id: number): void {
  const db = getDb()
  const ids = deckSubtree(id)
  const marks = ids.map(() => '?').join(',')
  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM anki_cards WHERE deck_id IN (${marks})`).run(...ids)
    db.prepare(`DELETE FROM anki_decks WHERE id IN (${marks})`).run(...ids)
    db.exec('DELETE FROM anki_notes WHERE id NOT IN (SELECT note_id FROM anki_cards)')
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/* ---------- Notizen & Karten ---------- */

interface NoteRow {
  id: number
  notetype_id: number
  fields: string
  tags: string
  media_ns: string
}

const parseTags = (s: string) => s.split(/\s+/).filter(Boolean)
const joinTags = (tags: string[]) => {
  const clean = [...new Set(tags.map((t) => t.trim().replace(/\s+/g, '_')).filter(Boolean))]
  return clean.length ? ` ${clean.join(' ')} ` : ''
}

export const newGuid = () => randomBytes(8).toString('base64url')

export function nextPosition(): number {
  return Number((getDb().prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM anki_cards').get() as unknown as { p: number }).p)
}

export function insertCard(noteId: number, deckId: number, ord: number, position: number): void {
  getDb()
    .prepare('INSERT INTO anki_cards (note_id,deck_id,ord,position,state,due) VALUES (?,?,?,?,0,?)')
    .run(noteId, deckId, ord, position, Date.now())
}

function validate(nt: AnkiNotetype, fields: string[]): number[] {
  if (fields.length !== nt.fields.length) throw new Error('Feldanzahl passt nicht zum Notiztyp')
  if (nt.kind === 'cloze') {
    if (!clozeNumbers(fields).length) throw new Error('Mindestens eine Lücke nötig, z. B. {{c1::Antwort}}')
  } else if (!hasContent(fields[0])) {
    throw new Error(`Das Feld „${nt.fields[0]}“ darf nicht leer sein`)
  }
  const ords = cardOrds(nt, fields)
  if (!ords.length) throw new Error('Mit diesen Feldern entsteht keine Karte – die Vorderseite ist leer')
  return ords
}

export function saveNote(input: AnkiNoteInput): number {
  const db = getDb()
  const nt = getNotetype(input.notetypeId)
  const fields = input.fields.map((f) => f ?? '')
  const ords = validate(nt, fields)
  if (!db.prepare('SELECT 1 FROM anki_decks WHERE id = ?').get(input.deckId)) throw new Error('Stapel nicht gefunden')
  const now = Date.now()
  const flds = fields.join(FIELD_SEP)
  const title = plainTitle(fields[0])
  const tags = joinTags(input.tags)

  db.exec('BEGIN')
  try {
    let noteId: number
    if (input.id) {
      noteId = input.id
      const res = db
        .prepare('UPDATE anki_notes SET fields = ?, sort_text = ?, tags = ?, modified_at = ? WHERE id = ? AND notetype_id = ?')
        .run(flds, title, tags, now, noteId, nt.id)
      if (!res.changes) throw new Error('Notiz nicht gefunden')
      const existing = db.prepare('SELECT id, ord, reps FROM anki_cards WHERE note_id = ?').all(noteId) as unknown as { id: number; ord: number; reps: number }[]
      db.prepare('UPDATE anki_cards SET deck_id = ? WHERE note_id = ?').run(input.deckId, noteId)
      // Nicht mehr erzeugte, noch ungelernte Karten entfernen; neue ergänzen
      for (const c of existing) if (!ords.includes(c.ord) && c.reps === 0) db.prepare('DELETE FROM anki_cards WHERE id = ?').run(c.id)
      const have = new Set(existing.map((c) => c.ord))
      const pos = nextPosition()
      ords.filter((o) => !have.has(o)).forEach((o, i) => insertCard(noteId, input.deckId, o, pos + i))
    } else {
      const res = db
        .prepare('INSERT INTO anki_notes (notetype_id,guid,fields,sort_text,tags,media_ns,created_at,modified_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(nt.id, newGuid(), flds, title, tags, 'own', now, now)
      noteId = Number(res.lastInsertRowid)
      const pos = nextPosition()
      ords.forEach((o, i) => insertCard(noteId, input.deckId, o, pos + i))
    }
    db.exec('COMMIT')
    return noteId
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function deleteNotes(ids: number[]): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      db.prepare(`DELETE FROM anki_notes WHERE id IN (${chunk.map(() => '?').join(',')})`).run(...chunk)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function getNote(id: number): AnkiNote {
  const db = getDb()
  const n = db.prepare('SELECT id, notetype_id, fields, tags, media_ns FROM anki_notes WHERE id = ?').get(id) as unknown as NoteRow | undefined
  if (!n) throw new Error('Notiz nicht gefunden')
  const card = db.prepare('SELECT deck_id FROM anki_cards WHERE note_id = ? ORDER BY ord LIMIT 1').get(id) as unknown as { deck_id: number } | undefined
  return {
    id: n.id,
    notetypeId: n.notetype_id,
    deckId: card?.deck_id ?? 0,
    fields: n.fields.split(FIELD_SEP),
    tags: parseTags(n.tags),
    mediaNs: n.media_ns
  }
}

export function setSuspended(cardId: number, suspended: boolean): void {
  getDb().prepare('UPDATE anki_cards SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, cardId)
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export function browse(q: AnkiBrowseQuery): AnkiBrowseResult {
  const db = getDb()
  const where: string[] = []
  const params: (string | number)[] = []
  if (q.deckId != null) {
    const ids = deckSubtree(q.deckId)
    where.push(`c.deck_id IN (${ids.map(() => '?').join(',')})`)
    params.push(...ids)
  }
  for (const token of q.text.split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push("(n.fields LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')")
    const like = `%${likeEscape(token)}%`
    params.push(like, like)
  }
  const from = `FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id JOIN anki_notetypes t ON t.id = n.notetype_id JOIN anki_decks d ON d.id = c.deck_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
  const total = Number((db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params) as unknown as { n: number }).n)
  const limit = Math.min(Math.max(q.limit, 1), 200)
  const rows = db
    .prepare(
      `SELECT c.id AS card_id, c.note_id, c.ord, c.state, c.due, c.suspended, n.sort_text, n.tags, t.name AS notetype, d.name AS deck
       ${from} ORDER BY n.id DESC, c.ord LIMIT ? OFFSET ?`
    )
    .all(...params, limit, Math.max(q.offset, 0)) as unknown as {
    card_id: number
    note_id: number
    ord: number
    state: number
    due: number
    suspended: number
    sort_text: string
    tags: string
    notetype: string
    deck: string
  }[]
  return {
    total,
    rows: rows.map((r) => ({
      cardId: r.card_id,
      noteId: r.note_id,
      title: r.sort_text || '(leer)',
      ord: r.ord,
      notetype: r.notetype,
      deck: r.deck,
      status: r.suspended ? 'suspended' : r.state === 0 ? 'new' : r.state === 2 ? 'review' : 'learning',
      due: r.state === 0 ? null : new Date(r.due).toISOString(),
      tags: parseTags(r.tags)
    }))
  }
}
