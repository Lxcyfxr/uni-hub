import { BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { basename, extname } from 'path'
import * as ical from 'node-ical'
import { getDb } from '../db'
import type { CalendarEvent, CalendarEventInput, CalendarSource } from '@shared/ipc'

const DAY_MS = 24 * 60 * 60 * 1000
/** Zeitfenster, in das wiederkehrende Termine beim Sync ausgerollt werden. */
const WINDOW_PAST_MS = 365 * DAY_MS
const WINDOW_FUTURE_MS = 365 * DAY_MS

interface Row {
  id: number
  name: string
  kind: 'url' | 'file' | 'local'
  url: string | null
  color: string
  last_sync: string | null
  error: string | null
}

interface ParsedEvent {
  uid: string | null
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  description: string | null
}

const toSource = (r: Row): CalendarSource => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  url: r.url,
  color: r.color,
  lastSync: r.last_sync,
  error: r.error
})

/** Ganztägige Termine als 'YYYY-MM-DD' in ihrer Ursprungs-Zeitzone. */
function dayKey(d: Date): string {
  const tz = (d as Date & { tz?: string }).tz
  // Ohne Zeitzone liefert node-ical Ganztägige als lokale Mitternacht (Systemzeitzone)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

const text = (v: unknown): string | null => {
  if (v == null) return null
  const s = typeof v === 'object' && 'val' in (v as object) ? String((v as { val: unknown }).val) : String(v)
  return s.trim() || null
}

export function parseIcs(body: string): ParsedEvent[] {
  const from = new Date(Date.now() - WINDOW_PAST_MS)
  const to = new Date(Date.now() + WINDOW_FUTURE_MS)
  const out: ParsedEvent[] = []

  for (const item of Object.values(ical.parseICS(body))) {
    if (!item || item.type !== 'VEVENT') continue
    const ev = item as ical.VEvent
    // Einzel-Überschreibungen (recurrences) werden über die Haupt-Serie expandiert
    if (ev.recurrenceid && !ev.rrule) {
      // Alleinstehende Instanz ohne Serie: normal behandeln
    }
    const instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true })
    for (const inst of instances) {
      const src = (inst.event ?? ev) as ical.VEvent
      const allDay = inst.isFullDay
      out.push({
        uid: text(src.uid),
        title: text(inst.summary) ?? '(ohne Titel)',
        start: allDay ? dayKey(inst.start) : inst.start.toISOString(),
        end: allDay ? dayKey(inst.end) : inst.end.toISOString(),
        allDay,
        location: text(src.location),
        description: text(src.description)
      })
    }
  }
  return out
}

function replaceEvents(sourceId: number, events: ParsedEvent[]): void {
  const db = getDb()
  const ins = db.prepare(
    'INSERT INTO calendar_events (source_id,uid,title,start,end,all_day,location,description) VALUES (?,?,?,?,?,?,?,?)'
  )
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM calendar_events WHERE source_id = ?').run(sourceId)
    for (const e of events) ins.run(sourceId, e.uid, e.title, e.start, e.end, e.allDay ? 1 : 0, e.location, e.description)
    db.prepare('UPDATE calendar_sources SET last_sync = ?, error = NULL WHERE id = ?').run(new Date().toISOString(), sourceId)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function listSources(): CalendarSource[] {
  return (getDb().prepare('SELECT * FROM calendar_sources ORDER BY id').all() as unknown as Row[]).map(toSource)
}

function normalizeCalUrl(input: string): string {
  const u = input.trim().replace(/^webcal:\/\//i, 'https://')
  if (!/^https?:\/\//i.test(u)) throw new Error('Bitte eine gültige iCal-Adresse (https:// oder webcal://) eingeben')
  return u
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Kalender-Server antwortete mit HTTP ${res.status}`)
  const body = await res.text()
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Die Adresse liefert keinen iCal-Kalender')
  return body
}

export async function addUrlSource(name: string, urlInput: string, color: string): Promise<void> {
  const url = normalizeCalUrl(urlInput)
  // Erst testen, dann speichern – so landet keine kaputte Quelle in der Liste
  const events = parseIcs(await fetchIcs(url))
  const res = getDb().prepare("INSERT INTO calendar_sources (name,kind,url,color) VALUES (?, 'url', ?, ?)").run(name.trim() || 'Kalender', url, color)
  replaceEvents(Number(res.lastInsertRowid), events)
}

export async function importFile(win: BrowserWindow): Promise<number | null> {
  const pick = await dialog.showOpenDialog(win, {
    title: 'iCal-Datei importieren',
    filters: [{ name: 'iCalendar', extensions: ['ics', 'ical'] }],
    properties: ['openFile']
  })
  if (pick.canceled || !pick.filePaths[0]) return null
  const file = pick.filePaths[0]
  const events = parseIcs(await readFile(file, 'utf8'))
  const name = basename(file, extname(file))
  const res = getDb().prepare("INSERT INTO calendar_sources (name,kind,color) VALUES (?, 'file', '#52c41a')").run(name)
  replaceEvents(Number(res.lastInsertRowid), events)
  return events.length
}

export function removeSource(id: number): void {
  // Die Quelle „Eigene Termine“ ist fest und lässt sich nicht entfernen
  getDb().prepare("DELETE FROM calendar_sources WHERE id = ? AND kind != 'local'").run(id)
}

function localSourceId(): number {
  const db = getDb()
  const row = db.prepare("SELECT id FROM calendar_sources WHERE kind = 'local'").get() as { id: number } | undefined
  if (row) return row.id
  const res = db.prepare("INSERT INTO calendar_sources (name,kind,color) VALUES ('Eigene Termine', 'local', '#722ed1')").run()
  return Number(res.lastInsertRowid)
}

export function saveEvent(input: CalendarEventInput): void {
  const title = input.title.trim()
  if (!title) throw new Error('Bitte einen Titel eingeben')
  if (input.end < input.start) throw new Error('Das Ende liegt vor dem Beginn')
  const db = getDb()
  const loc = input.location?.trim() || null
  const desc = input.description?.trim() || null
  if (input.id) {
    const res = db
      .prepare(
        `UPDATE calendar_events SET title=?, start=?, end=?, all_day=?, location=?, description=?
         WHERE id = ? AND source_id IN (SELECT id FROM calendar_sources WHERE kind = 'local')`
      )
      .run(title, input.start, input.end, input.allDay ? 1 : 0, loc, desc, input.id)
    if (!res.changes) throw new Error('Dieser Termin ist schreibgeschützt')
  } else {
    db.prepare('INSERT INTO calendar_events (source_id,uid,title,start,end,all_day,location,description) VALUES (?,?,?,?,?,?,?,?)').run(
      localSourceId(),
      `${randomUUID()}@unihub`,
      title,
      input.start,
      input.end,
      input.allDay ? 1 : 0,
      loc,
      desc
    )
  }
}

export function deleteEvent(id: number): void {
  getDb()
    .prepare("DELETE FROM calendar_events WHERE id = ? AND source_id IN (SELECT id FROM calendar_sources WHERE kind = 'local')")
    .run(id)
}

const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsDay = (d: string) => d.replace(/-/g, '')

export async function exportIcs(win: BrowserWindow): Promise<number | null> {
  const rows = getDb()
    .prepare(
      `SELECT e.uid, e.title, e.start, e.end, e.all_day, e.location, e.description FROM calendar_events e
       JOIN calendar_sources s ON s.id = e.source_id WHERE s.kind = 'local' ORDER BY e.start`
    )
    .all() as any[]
  const target = await dialog.showSaveDialog(win, {
    title: 'Eigene Termine exportieren',
    defaultPath: 'uni-hub-termine.ics',
    filters: [{ name: 'iCalendar', extensions: ['ics'] }]
  })
  if (target.canceled || !target.filePath) return null
  const stamp = icsUtc(new Date().toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Uni-Hub//DE', 'CALSCALE:GREGORIAN']
  for (const r of rows) {
    lines.push('BEGIN:VEVENT', `UID:${r.uid ?? randomUUID() + '@unihub'}`, `DTSTAMP:${stamp}`)
    if (r.all_day) lines.push(`DTSTART;VALUE=DATE:${icsDay(r.start)}`, `DTEND;VALUE=DATE:${icsDay(r.end)}`)
    else lines.push(`DTSTART:${icsUtc(r.start)}`, `DTEND:${icsUtc(r.end)}`)
    lines.push(`SUMMARY:${icsEscape(r.title)}`)
    if (r.location) lines.push(`LOCATION:${icsEscape(r.location)}`)
    if (r.description) lines.push(`DESCRIPTION:${icsEscape(r.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  await writeFile(target.filePath, lines.join('\r\n') + '\r\n', 'utf8')
  return rows.length
}

export async function syncSource(id: number): Promise<void> {
  const db = getDb()
  const src = db.prepare("SELECT * FROM calendar_sources WHERE id = ? AND kind = 'url'").get(id) as unknown as Row | undefined
  if (!src?.url) return
  try {
    replaceEvents(id, parseIcs(await fetchIcs(src.url)))
  } catch (e) {
    db.prepare('UPDATE calendar_sources SET error = ? WHERE id = ?').run(String((e as Error).message ?? e), id)
  }
}

export async function syncAll(): Promise<void> {
  const rows = getDb().prepare("SELECT id FROM calendar_sources WHERE kind = 'url'").all() as unknown as { id: number }[]
  await Promise.all(rows.map((r) => syncSource(r.id)))
}

export function events(fromIso: string, toIso: string): CalendarEvent[] {
  // Ganztägige Termine sind 'YYYY-MM-DD' und sortieren lexikografisch korrekt gegen das Datumspräfix der Grenzen
  const fromDay = fromIso.slice(0, 10)
  const toDay = toIso.slice(0, 10)
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.source_id, e.title, e.start, e.end, e.all_day, e.location, e.description, (s.kind = 'local') AS editable
       FROM calendar_events e JOIN calendar_sources s ON s.id = e.source_id
       WHERE (e.all_day = 1 AND e.start <= ? AND e.end > ?) OR (e.all_day = 0 AND e.start < ? AND e.end > ?)
       ORDER BY e.start`
    )
    .all(toDay, fromDay, toIso, fromIso) as any[]
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    start: r.start,
    end: r.end,
    allDay: !!r.all_day,
    location: r.location,
    description: r.description,
    editable: !!r.editable
  }))
}
