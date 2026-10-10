import { BrowserWindow, powerMonitor } from 'electron'
import { getDb, kvGet, kvSet } from './db'
import { toast } from './notify'

/* ---------- Fristen (Aufgaben mit Fälligkeitsdatum) ---------- */

/** Mögliche Vorlaufzeiten in Tagen (0 = nur heute fällige und überfällige) */
export const DEADLINE_LEADS = [0, 1, 2, 3, 7]

export interface DeadlineSettings {
  enabled: boolean
  /** Wie viele Tage im Voraus Fristen gemeldet werden */
  lead: number
  /** Uhrzeit (volle Stunde), ab der die Tagesmeldung kommt */
  hour: number
}

const DEADLINE_KEY = 'ui.deadlines'
const LAST_DAY_KEY = 'deadlines.lastDay'
const MAX_LINES = 4

export function readDeadlineSettings(): DeadlineSettings {
  try {
    const v = JSON.parse(kvGet(DEADLINE_KEY) ?? '{}') as Partial<DeadlineSettings>
    return {
      enabled: v.enabled !== false,
      lead: DEADLINE_LEADS.includes(v.lead ?? -1) ? (v.lead as number) : 1,
      hour: Number.isInteger(v.hour) && (v.hour as number) >= 0 && (v.hour as number) <= 23 ? (v.hour as number) : 8
    }
  } catch {
    return { enabled: true, lead: 1, hour: 8 }
  }
}

export const dayString = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayDiff = (from: string, to: string): number => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000)

export interface DeadlineRow {
  title: string
  due: string
}

/** Baut Titel und Text der Tagesmeldung; null, wenn nichts ansteht. */
export function describeDeadlines(rows: DeadlineRow[], today: string): { title: string; body: string } | null {
  if (!rows.length) return null
  const label = (due: string): string => {
    const d = dayDiff(today, due)
    if (d < 0) return d === -1 ? 'Seit gestern überfällig' : `Seit ${-d} Tagen überfällig`
    if (d === 0) return 'Heute fällig'
    if (d === 1) return 'Morgen fällig'
    return `In ${d} Tagen fällig`
  }
  const sorted = [...rows].sort((a, b) => a.due.localeCompare(b.due))
  const lines = sorted.slice(0, MAX_LINES).map((r) => `${label(r.due)}: ${r.title.slice(0, 60)}`)
  if (sorted.length > MAX_LINES) lines.push(`… und ${sorted.length - MAX_LINES} weitere`)
  const overdue = sorted.filter((r) => r.due < today).length
  const title = rows.length === 1 ? 'Frist: 1 Aufgabe' : `Fristen: ${rows.length} Aufgaben`
  return { title: overdue ? `${title} (${overdue} überfällig)` : title, body: lines.join('\n') }
}

/** Meldet einmal pro Tag (ab der gewählten Uhrzeit) anstehende Fristen. Liefert die Zahl der gemeldeten Aufgaben. */
export function checkDeadlines(win: BrowserWindow, now = new Date()): number {
  const s = readDeadlineSettings()
  if (!s.enabled || win.isDestroyed() || now.getHours() < s.hour) return 0
  const today = dayString(now)
  if (kvGet(LAST_DAY_KEY) === today) return 0
  const last = new Date(now)
  last.setDate(last.getDate() + s.lead)
  const rows = getDb()
    .prepare('SELECT title, due FROM todos WHERE done = 0 AND due IS NOT NULL AND due <= ? ORDER BY due')
    .all(dayString(last)) as unknown as DeadlineRow[]
  kvSet(LAST_DAY_KEY, today)
  const msg = describeDeadlines(rows, today)
  if (!msg) return 0
  toast(win, { ...msg, navigate: 'todo' })
  return rows.length
}

/* ---------- Lernpause-Erinnerung ---------- */

export const BREAK_INTERVALS = [30, 45, 60, 90, 120]

export interface BreakSettings {
  enabled: boolean
  /** Aktive Lernzeit in Minuten bis zur Erinnerung */
  interval: number
}

const BREAK_KEY = 'ui.breakReminder'
/** Ist Uni-Hub so lange nicht aktiv genutzt, zählt das als Pause */
const BREAK_GAP_MS = 5 * 60_000
/** Leerlauf (Sekunden), ab dem die Nutzung nicht mehr als aktiv gilt */
const IDLE_LIMIT_S = 120
const TICK_MS = 30_000

export function readBreakSettings(): BreakSettings {
  try {
    const v = JSON.parse(kvGet(BREAK_KEY) ?? '{}') as Partial<BreakSettings>
    return { enabled: v.enabled !== false, interval: BREAK_INTERVALS.includes(v.interval ?? -1) ? (v.interval as number) : 90 }
  } catch {
    return { enabled: true, interval: 90 }
  }
}

export interface BreakState {
  activeMs: number
  lastActive: number
  lastTick: number
}

/** Zählt aktive Nutzungszeit; eine Lücke von mehr als 5 Minuten setzt den Zähler zurück. */
export function advanceBreak(state: BreakState, active: boolean, now: number): BreakState {
  const elapsed = Math.min(now - state.lastTick, 2 * TICK_MS)
  const gap = now - state.lastActive > BREAK_GAP_MS
  if (!active) return { ...state, activeMs: gap ? 0 : state.activeMs, lastTick: now }
  return { activeMs: (gap ? 0 : state.activeMs) + elapsed, lastActive: now, lastTick: now }
}

/** Startet Fristen-Prüfung und Pausen-Erinnerung; liefert eine Funktion zum Stoppen. */
export function startDeadlineAndBreakReminders(win: BrowserWindow): () => void {
  const start = Date.now()
  let state: BreakState = { activeMs: 0, lastActive: start, lastTick: start }

  const runDeadlines = () => {
    try {
      checkDeadlines(win)
    } catch (err) {
      console.warn('Fristenerinnerung fehlgeschlagen:', err)
    }
  }
  const tick = () => {
    try {
      if (win.isDestroyed()) return
      const now = Date.now()
      const active = win.isVisible() && !win.isMinimized() && win.isFocused() && powerMonitor.getSystemIdleTime() < IDLE_LIMIT_S
      state = advanceBreak(state, active, now)
      const s = readBreakSettings()
      if (s.enabled && state.activeMs >= s.interval * 60_000) {
        const minutes = Math.round(state.activeMs / 60_000)
        state = { ...state, activeMs: 0 }
        toast(win, {
          title: 'Zeit für eine Lernpause',
          body: `Du lernst seit etwa ${minutes} Minuten. Steh kurz auf, trink etwas und gönn den Augen eine Pause.`,
          navigate: 'study'
        })
      }
    } catch (err) {
      console.warn('Pausenerinnerung fehlgeschlagen:', err)
    }
  }

  const first = setTimeout(runDeadlines, 8_000)
  const deadlineTimer = setInterval(runDeadlines, 5 * 60_000)
  const breakTimer = setInterval(tick, TICK_MS)
  return () => {
    clearTimeout(first)
    clearInterval(deadlineTimer)
    clearInterval(breakTimer)
  }
}
