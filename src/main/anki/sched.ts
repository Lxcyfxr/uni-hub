import { fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { getDb, kvGet } from '../db'
import { FIELD_SEP, renderCard, rewriteCssMedia, rewriteMedia } from '@shared/anki-render'
import { deckSubtree, getNotetype } from './store'
import type { AnkiDeck, AnkiPreview, AnkiStudyCard, AnkiStudyCounts, AnkiStudyNext } from '@shared/ipc'

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))

const DAY_MS = 86_400_000
/** Lernkarten, die in den nächsten Minuten fällig werden, dürfen schon jetzt kommen. */
const LEARN_AHEAD_MS = 20 * 60_000

/** Beginn des Lerntags (Wechsel um 4 Uhr morgens, wie bei Anki) */
export function dayStart(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(4, 0, 0, 0)
  if (d.getTime() > now) d.setDate(d.getDate() - 1)
  return d.getTime()
}

export function newPerDay(): number {
  const raw = kvGet('ui.ankiNewPerDay')
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 9999) : 20
}

interface Counts {
  total: number
  nw: number
  lrn: number
  rev: number
  introduced: number
}

/** Zähler je Stapel (ohne Unterstapel) */
function countsByDeck(now: number): Map<number, Counts> {
  const db = getDb()
  const map = new Map<number, Counts>()
  const rows = db
    .prepare(
      `SELECT deck_id,
              COUNT(*) AS total,
              SUM(CASE WHEN state = 0 AND suspended = 0 THEN 1 ELSE 0 END) AS nw,
              SUM(CASE WHEN state IN (1,3) AND suspended = 0 AND due <= ? THEN 1 ELSE 0 END) AS lrn,
              SUM(CASE WHEN state = 2 AND suspended = 0 AND due <= ? THEN 1 ELSE 0 END) AS rev
       FROM anki_cards GROUP BY deck_id`
    )
    .all(now + LEARN_AHEAD_MS, dayStart(now) + DAY_MS) as unknown as { deck_id: number; total: number; nw: number; lrn: number; rev: number }[]
  for (const r of rows) map.set(r.deck_id, { total: r.total, nw: r.nw, lrn: r.lrn, rev: r.rev, introduced: 0 })
  const intro = db
    .prepare(
      `SELECT c.deck_id, COUNT(*) AS n FROM anki_revlog r JOIN anki_cards c ON c.id = r.card_id
       WHERE r.state = 0 AND r.reviewed_at >= ? GROUP BY c.deck_id`
    )
    .all(dayStart(now)) as unknown as { deck_id: number; n: number }[]
  for (const r of intro) {
    const c = map.get(r.deck_id) ?? { total: 0, nw: 0, lrn: 0, rev: 0, introduced: 0 }
    c.introduced = r.n
    map.set(r.deck_id, c)
  }
  return map
}

export function decksWithCounts(): AnkiDeck[] {
  const now = Date.now()
  const decks = getDb().prepare('SELECT id, name FROM anki_decks').all() as unknown as { id: number; name: string }[]
  const per = countsByDeck(now)
  const limit = newPerDay()
  return decks
    .map((d) => {
      const sum = { total: 0, nw: 0, lrn: 0, rev: 0, introduced: 0 }
      for (const e of decks) {
        if (e.name !== d.name && !e.name.startsWith(d.name + '::')) continue
        const c = per.get(e.id)
        if (!c) continue
        sum.total += c.total
        sum.nw += c.nw
        sum.lrn += c.lrn
        sum.rev += c.rev
        sum.introduced += c.introduced
      }
      return {
        id: d.id,
        name: d.name,
        total: sum.total,
        newCount: Math.min(sum.nw, Math.max(0, limit - sum.introduced)),
        learnCount: sum.lrn,
        dueCount: sum.rev
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true }))
}

/* ---------- Karten rendern ---------- */

interface CardRow {
  id: number
  note_id: number
  deck_id: number
  ord: number
  state: number
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  last_review: number | null
}

interface JoinedCard extends CardRow {
  fields: string
  tags: string
  media_ns: string
  notetype_id: number
  deck: string
}

function loadJoined(cardId: number): JoinedCard {
  const r = getDb()
    .prepare(
      `SELECT c.*, n.fields, n.tags, n.media_ns, n.notetype_id, d.name AS deck
       FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id JOIN anki_decks d ON d.id = c.deck_id WHERE c.id = ?`
    )
    .get(cardId) as unknown as JoinedCard | undefined
  if (!r) throw new Error('Karte nicht gefunden')
  return r
}

function renderJoined(r: JoinedCard): AnkiPreview {
  const nt = getNotetype(r.notetype_id)
  const { question, answer } = renderCard(nt, r.fields.split(FIELD_SEP), r.ord, { tags: r.tags.trim(), deck: r.deck })
  return { question: rewriteMedia(question, r.media_ns), answer: rewriteMedia(answer, r.media_ns), css: rewriteCssMedia(nt.css, r.media_ns) }
}

export function cardPreview(cardId: number): AnkiPreview {
  return renderJoined(loadJoined(cardId))
}

export function preview(notetypeId: number, fields: string[], ord: number, mediaNs: string): AnkiPreview {
  const nt = getNotetype(notetypeId)
  const ns = /^[a-z0-9]{1,32}$/.test(mediaNs) ? mediaNs : 'own'
  const { question, answer } = renderCard(nt, fields, ord, {})
  return { question: rewriteMedia(question, ns), answer: rewriteMedia(answer, ns), css: rewriteCssMedia(nt.css, ns) }
}

/* ---------- Wiederholen ---------- */

const toFsrs = (r: CardRow): FsrsCard => ({
  due: new Date(r.due),
  stability: r.stability,
  difficulty: r.difficulty,
  elapsed_days: r.elapsed_days,
  scheduled_days: r.scheduled_days,
  learning_steps: r.learning_steps,
  reps: r.reps,
  lapses: r.lapses,
  state: r.state as State,
  last_review: r.last_review ? new Date(r.last_review) : undefined
})

function fmtInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '<1 Min'
  if (min < 60) return `${Math.round(min)} Min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} Std`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} T`
  if (d < 365) return `${Number((d / 30).toFixed(1))} Mon`
  return `${Number((d / 365).toFixed(1))} J`
}

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

function toStudyCard(r: JoinedCard, now: number): AnkiStudyCard {
  const rec = scheduler.repeat(toFsrs(r), new Date(now))
  const p = renderJoined(r)
  const label = (g: Grade) => fmtInterval(rec[g].card.due.getTime() - now)
  return {
    cardId: r.id,
    noteId: r.note_id,
    state: r.state === 0 ? 'new' : r.state === 2 ? 'review' : 'learning',
    question: p.question,
    answer: p.answer,
    css: p.css,
    previews: { 1: label(Rating.Again), 2: label(Rating.Hard), 3: label(Rating.Good), 4: label(Rating.Easy) }
  }
}

export function next(deckId: number): AnkiStudyNext {
  const db = getDb()
  const ids = deckSubtree(deckId)
  const marks = ids.map(() => '?').join(',')
  const now = Date.now()
  const endOfDay = dayStart(now) + DAY_MS

  const c = db
    .prepare(
      `SELECT SUM(CASE WHEN state = 0 AND suspended = 0 THEN 1 ELSE 0 END) AS nw,
              SUM(CASE WHEN state IN (1,3) AND suspended = 0 AND due <= ? THEN 1 ELSE 0 END) AS lrn,
              SUM(CASE WHEN state = 2 AND suspended = 0 AND due <= ? THEN 1 ELSE 0 END) AS rev
       FROM anki_cards WHERE deck_id IN (${marks})`
    )
    .get(now + LEARN_AHEAD_MS, endOfDay, ...ids) as unknown as { nw: number | null; lrn: number | null; rev: number | null }
  const introduced = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM anki_revlog r JOIN anki_cards c ON c.id = r.card_id
           WHERE r.state = 0 AND r.reviewed_at >= ? AND c.deck_id IN (${marks})`
        )
        .get(dayStart(now), ...ids) as unknown as { n: number }
    ).n
  )
  const newLeft = Math.max(0, newPerDay() - introduced)
  const counts: AnkiStudyCounts = { new: Math.min(c.nw ?? 0, newLeft), learn: c.lrn ?? 0, due: c.rev ?? 0 }

  // Nur diese festen Bausteine kommen in die Abfrage; es wird nie Text von außen eingesetzt
  const PICK = {
    learningNow: { cond: 'state IN (1,3) AND due <= ?', order: 'due' },
    reviewToday: { cond: 'state = 2 AND due <= ?', order: 'due' },
    newCard: { cond: 'state = 0', order: 'position, id' },
    learningAhead: { cond: 'state IN (1,3) AND due <= ?', order: 'due' }
  } as const
  const pick = (kind: keyof typeof PICK, ...args: number[]) => {
    const { cond, order } = PICK[kind]
    return db
      .prepare(`SELECT id FROM anki_cards WHERE deck_id IN (${marks}) AND suspended = 0 AND ${cond} ORDER BY ${order} LIMIT 1`)
      .get(...ids, ...args) as unknown as { id: number } | undefined
  }

  const hit =
    pick('learningNow', now) ??
    pick('reviewToday', endOfDay) ??
    (newLeft > 0 ? pick('newCard') : undefined) ??
    pick('learningAhead', now + LEARN_AHEAD_MS)

  return { card: hit ? toStudyCard(loadJoined(hit.id), now) : null, counts }
}

export function answer(cardId: number, rating: 1 | 2 | 3 | 4): void {
  if (!GRADES.includes(rating)) throw new Error('Ungültige Bewertung')
  const db = getDb()
  const row = db.prepare('SELECT * FROM anki_cards WHERE id = ?').get(cardId) as unknown as CardRow | undefined
  if (!row) throw new Error('Karte nicht gefunden')
  const now = Date.now()
  const result = scheduler.repeat(toFsrs(row), new Date(now))[rating as Grade]
  const nc = result.card
  db.exec('BEGIN')
  try {
    db.prepare(
      `UPDATE anki_cards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
         learning_steps = ?, reps = ?, lapses = ?, last_review = ? WHERE id = ?`
    ).run(nc.state, nc.due.getTime(), nc.stability, nc.difficulty, nc.elapsed_days, nc.scheduled_days, nc.learning_steps, nc.reps, nc.lapses, now, cardId)
    db.prepare('INSERT INTO anki_revlog (card_id,rating,state,reviewed_at,scheduled_days) VALUES (?,?,?,?,?)').run(cardId, rating, row.state, now, nc.scheduled_days)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
