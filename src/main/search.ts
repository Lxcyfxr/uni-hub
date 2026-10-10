import { getDb } from './db'
import * as docs from './docs/library'
import type { SearchResult } from '@shared/ipc'

/** Höchstzahl der Treffer pro Bereich */
const PER_GROUP = 6
/** Termine werden in diesem Zeitfenster um heute gesucht (Tage) */
const EVENT_PAST_DAYS = 180
const EVENT_FUTURE_DAYS = 540

/** Kleinbuchstaben ohne Akzente/Umlautpunkte, damit „uber“ auch „Über“ findet. */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function tokensOf(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean).slice(0, 6)
}

/** Alle Suchwörter kommen im Text vor. */
export function matches(haystack: string, tokens: string[]): boolean {
  const h = fold(haystack)
  return tokens.every((t) => h.includes(t))
}

const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Ausschnitt um die erste Fundstelle, damit man sieht, warum etwas passt. */
export function excerpt(text: string, tokens: string[], max = 90): string {
  const t = plain(text)
  const lower = t.toLowerCase()
  const at = tokens.map((k) => lower.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const from = Math.max(0, at - 25)
  return (from > 0 ? '…' : '') + t.slice(from, from + max) + (from + max < t.length ? '…' : '')
}

const dateLabel = (iso: string, allDay: boolean) => {
  const d = new Date(allDay ? iso + 'T00:00:00' : iso)
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  return allDay ? day : `${day}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

export function globalSearch(query: string): SearchResult[] {
  const tokens = tokensOf(query)
  if (!tokens.length) return []
  const db = getDb()
  const out: SearchResult[] = []

  // Aufgaben: offene zuerst, dann nach Fälligkeit
  const todos = db.prepare("SELECT id, title, notes, due, status FROM todos ORDER BY (status = 'done'), due IS NULL, due").all() as unknown as {
    id: number
    title: string
    notes: string | null
    due: string | null
    status: string
  }[]
  todos
    .filter((t) => matches(`${t.title} ${t.notes ?? ''}`, tokens))
    .slice(0, PER_GROUP)
    .forEach((t) =>
      out.push({
        kind: 'todo',
        id: t.id,
        title: t.title,
        subtitle: t.status === 'done' ? 'Erledigt' : t.due ? `Fällig ${dateLabel(t.due, true)}` : 'Offen',
        module: 'todo'
      })
    )

  // Termine: Fenster um heute, die nächsten bzw. letzten zuerst
  const now = Date.now()
  const events = db
    .prepare('SELECT id, title, start, all_day, location, description FROM calendar_events WHERE start >= ? AND start <= ? ORDER BY start')
    .all(
      new Date(now - EVENT_PAST_DAYS * 86_400_000).toISOString().slice(0, 10),
      new Date(now + EVENT_FUTURE_DAYS * 86_400_000).toISOString()
    ) as unknown as { id: number; title: string; start: string; all_day: number; location: string | null; description: string | null }[]
  const seen = new Set<string>()
  events
    .filter((e) => matches(`${e.title} ${e.location ?? ''} ${e.description ?? ''}`, tokens))
    .filter((e) => {
      const key = `${e.title}|${e.start}` // derselbe Termin in zwei Kalendern nur einmal
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Math.abs(Date.parse(a.start) - now) - Math.abs(Date.parse(b.start) - now))
    .slice(0, PER_GROUP)
    .forEach((e) =>
      out.push({
        kind: 'event',
        id: e.id,
        title: e.title,
        subtitle: [dateLabel(e.start, !!e.all_day), e.location].filter(Boolean).join(' · '),
        module: 'calendar',
        date: e.start.slice(0, 10)
      })
    )

  // Lernplan: Fächer und Themen
  const subjects = db.prepare('SELECT id, name FROM study_subjects ORDER BY name').all() as unknown as { id: number; name: string }[]
  subjects
    .filter((s) => matches(s.name, tokens))
    .slice(0, 3)
    .forEach((s) => out.push({ kind: 'subject', id: s.id, title: s.name, subtitle: 'Fach', module: 'study' }))
  const topics = db
    .prepare('SELECT t.id, t.title, t.done, s.name AS subject FROM study_topics t JOIN study_subjects s ON s.id = t.subject_id ORDER BY s.name, t.position')
    .all() as unknown as { id: number; title: string; done: number; subject: string }[]
  topics
    .filter((t) => matches(`${t.title} ${t.subject}`, tokens))
    .slice(0, PER_GROUP)
    .forEach((t) => out.push({ kind: 'topic', id: t.id, title: t.title, subtitle: `${t.subject}${t.done ? ' · erledigt' : ''}`, module: 'study' }))

  // Karteikarten: Sortierfeld (Vorderseite) und Tags
  const notes = db.prepare('SELECT id, sort_text, tags FROM anki_notes').all() as unknown as { id: number; sort_text: string; tags: string }[]
  const deckOf = db.prepare('SELECT d.name FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE c.note_id = ? LIMIT 1')
  let cards = 0
  for (const n of notes) {
    if (cards >= PER_GROUP) break
    if (!matches(`${n.sort_text} ${n.tags}`, tokens)) continue
    const deck = (deckOf.get(n.id) as { name: string } | undefined)?.name ?? null
    out.push({ kind: 'card', id: n.id, title: plain(n.sort_text).slice(0, 120) || '(leer)', subtitle: deck, module: 'anki' })
    cards++
  }

  // Dokumente: Volltext (Titel und Inhalt) sowie eigene Notizen
  const titles = new Map(docs.list().map((d) => [d.id, d.title]))
  const docIds = new Set<number>()
  const addDoc = (id: number, subtitle: string | null) => {
    const title = titles.get(id)
    if (title === undefined || docIds.has(id) || docIds.size >= PER_GROUP) return
    docIds.add(id)
    out.push({ kind: 'doc', id, title, subtitle, module: 'docs' })
  }
  try {
    for (const h of docs.search(query.trim().slice(0, 200))) addDoc(h.id, plain(h.snippet.replace(/[\u0001\u0002]/g, '')).slice(0, 120) || null)
  } catch {
    /* ungültige Suchsyntax: nur die Notizen durchsuchen */
  }
  const noted = db.prepare("SELECT id, notes FROM documents WHERE notes != ''").all() as unknown as { id: number; notes: string }[]
  for (const d of noted) if (matches(d.notes, tokens)) addDoc(d.id, 'Notiz: ' + excerpt(d.notes, tokens))

  return out
}
