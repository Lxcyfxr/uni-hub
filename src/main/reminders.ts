import { BrowserWindow } from 'electron'
import { getDb, kvGet, kvSet } from './db'
import { toast } from './notify'

/** Mögliche Vorlaufzeiten in Minuten (0 = zum Beginn) */
export const REMINDER_LEADS = [0, 5, 10, 15, 30, 60]

export interface ReminderSettings {
  enabled: boolean
  lead: number
}

const SETTINGS_KEY = 'ui.calReminder'
const SENT_KEY = 'reminders.sent'
/** Wird ein Termin kurz nach Beginn entdeckt (z. B. App-Start), gibt es noch eine Erinnerung */
const GRACE_MS = 60_000
const MAX_TOASTS = 3

export function readReminderSettings(): ReminderSettings {
  try {
    const v = JSON.parse(kvGet(SETTINGS_KEY) ?? '{}') as Partial<ReminderSettings>
    return { enabled: v.enabled !== false, lead: REMINDER_LEADS.includes(v.lead ?? -1) ? (v.lead as number) : 10 }
  } catch {
    return { enabled: true, lead: 10 }
  }
}

/** Bereits gemeldete Termine (Schlüssel → Startzeit), damit nach einem Neustart nichts doppelt kommt */
export function loadSent(): Map<string, number> {
  try {
    return new Map(JSON.parse(kvGet(SENT_KEY) ?? '[]') as [string, number][])
  } catch {
    return new Map()
  }
}

function saveSent(sent: Map<string, number>, now: number): void {
  for (const [k, start] of sent) if (start < now - 2 * 24 * 3600_000) sent.delete(k)
  kvSet(SENT_KEY, JSON.stringify([...sent]))
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

interface Row {
  title: string
  start: string
  end: string
  location: string | null
}

/** Prüft, ob Termine bald beginnen, und meldet sie. Liefert die Zahl der gemeldeten Termine. */
export function checkReminders(win: BrowserWindow, sent: Map<string, number>, now = Date.now()): number {
  const settings = readReminderSettings()
  if (!settings.enabled || win.isDestroyed()) return 0
  const rows = getDb()
    .prepare('SELECT title, start, end, location FROM calendar_events WHERE all_day = 0 AND start >= ? AND start <= ? ORDER BY start')
    .all(new Date(now - GRACE_MS).toISOString(), new Date(now + settings.lead * 60_000).toISOString()) as unknown as Row[]

  const due: Row[] = []
  for (const r of rows) {
    // Derselbe Termin in zwei Kalendern soll nur einmal melden
    const key = `${r.title}|${r.start}`
    if (sent.has(key)) continue
    sent.set(key, Date.parse(r.start))
    due.push(r)
  }
  if (!due.length) return 0
  saveSent(sent, now)

  for (const r of due.slice(0, MAX_TOASTS)) {
    const minutes = Math.round((Date.parse(r.start) - now) / 60_000)
    const when = minutes <= 0 ? 'Beginnt jetzt' : `In ${minutes} Min`
    toast(win, {
      title: r.title.slice(0, 120),
      body: [when, `${clock(r.start)}–${clock(r.end)}`, r.location].filter(Boolean).join(' · '),
      navigate: 'calendar'
    })
  }
  if (due.length > MAX_TOASTS) {
    toast(win, { title: `${due.length - MAX_TOASTS} weitere Termine beginnen bald`, body: 'Alle Termine findest du im Kalender.', navigate: 'calendar' })
  }
  return due.length
}

/** Startet die regelmäßige Prüfung; liefert eine Funktion zum Stoppen. */
export function startReminders(win: BrowserWindow): () => void {
  const sent = loadSent()
  const run = () => {
    try {
      checkReminders(win, sent)
    } catch (err) {
      console.warn('Terminerinnerung fehlgeschlagen:', err)
    }
  }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, 30_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
