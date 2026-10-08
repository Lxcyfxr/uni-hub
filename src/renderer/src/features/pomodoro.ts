import { create } from 'zustand'

export type Phase = 'work' | 'short' | 'long'
export type Status = 'idle' | 'running' | 'paused'

export interface PomodoroSettings {
  /** Minuten */
  work: number
  short: number
  long: number
  /** Fokus-Durchgänge bis zur langen Pause */
  cycles: number
  autoStart: boolean
  sound: boolean
}

export interface PomodoroTarget {
  subjectId: number | null
  topicId: number | null
  label: string
}

export const DEFAULT_SETTINGS: PomodoroSettings = { work: 25, short: 5, long: 15, cycles: 4, autoStart: false, sound: true }

const SETTINGS_KEY = 'ui.pomodoro'
const clamp = (n: number, min: number, max: number, fallback: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback)

export function sanitize(s: Partial<PomodoroSettings>): PomodoroSettings {
  return {
    work: clamp(s.work ?? DEFAULT_SETTINGS.work, 1, 180, DEFAULT_SETTINGS.work),
    short: clamp(s.short ?? DEFAULT_SETTINGS.short, 1, 60, DEFAULT_SETTINGS.short),
    long: clamp(s.long ?? DEFAULT_SETTINGS.long, 1, 120, DEFAULT_SETTINGS.long),
    cycles: clamp(s.cycles ?? DEFAULT_SETTINGS.cycles, 2, 12, DEFAULT_SETTINGS.cycles),
    autoStart: !!(s.autoStart ?? DEFAULT_SETTINGS.autoStart),
    sound: !!(s.sound ?? DEFAULT_SETTINGS.sound)
  }
}

export const phaseMs = (s: PomodoroSettings, phase: Phase) => (phase === 'work' ? s.work : phase === 'short' ? s.short : s.long) * 60_000

interface State {
  settings: PomodoroSettings
  phase: Phase
  status: Status
  /** Zielzeitpunkt (ms), nur gültig bei status = running */
  endsAt: number
  remainingMs: number
  /** abgeschlossene Fokus-Durchgänge seit Beginn der Zählung */
  cycleCount: number
  target: PomodoroTarget | null
  /** wird nach jedem protokollierten Durchgang erhöht, damit Ansichten Statistiken neu laden */
  sessionsVersion: number
  load(): Promise<void>
  setSettings(patch: Partial<PomodoroSettings>): void
  setTarget(t: PomodoroTarget | null): void
  setPhase(p: Phase): void
  start(): void
  startFor(t: PomodoroTarget): void
  pause(): void
  reset(): void
  skip(): void
}

function beep(): void {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.15)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch {
    /* Audio nicht verfügbar */
  }
}

/**
 * Windows-Benachrichtigung über den Hauptprozess (Klick öffnet den Lernplaner). Den Ton übernimmt der eigene
 * Signalton, damit er sich per Einstellung abschalten lässt – die Benachrichtigung selbst bleibt stumm.
 */
function notify(title: string, body: string, sound: boolean): void {
  window.uni.app.notify({ title, body, silent: true, navigate: 'study' }).catch(() => {
    try {
      new Notification(title, { body, silent: true })
    } catch {
      /* Benachrichtigungen nicht verfügbar */
    }
  })
  if (sound) beep()
}

let timer: ReturnType<typeof setInterval> | null = null

export const usePomodoro = create<State>((set, get) => {
  const stopTimer = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const logWork = (minutes: number) => {
    const { target } = get()
    if (minutes < 1) return
    window.uni.study
      .logSession(target?.subjectId ?? null, target?.topicId ?? null, minutes)
      .then(() => set((s) => ({ sessionsVersion: s.sessionsVersion + 1 })))
      .catch((e) => console.warn('Lernsitzung konnte nicht gespeichert werden', e))
  }

  /** Wechselt in die nächste Phase; Fokus-Zeit wird dabei gutgeschrieben. */
  const advance = (opts: { elapsedMinutes: number; announce: boolean }) => {
    stopTimer()
    const { phase, settings, cycleCount } = get()
    let next: Phase
    let count = cycleCount
    if (phase === 'work') {
      logWork(opts.elapsedMinutes)
      count = cycleCount + 1
      next = count % settings.cycles === 0 ? 'long' : 'short'
      if (opts.announce) notify('Fokus-Runde geschafft 🍅', next === 'long' ? `Lange Pause: ${settings.long} Minuten` : `Kurze Pause: ${settings.short} Minuten`, settings.sound)
    } else {
      next = 'work'
      if (opts.announce) notify('Pause vorbei', 'Zeit für die nächste Fokus-Runde.', settings.sound)
    }
    set({ phase: next, status: 'idle', remainingMs: phaseMs(settings, next), cycleCount: count })
    if (settings.autoStart && opts.announce) get().start()
  }

  const tick = () => {
    const { status, endsAt, remainingMs, settings } = get()
    if (status !== 'running') return stopTimer()
    const left = endsAt - Date.now()
    if (left <= 0) return advance({ elapsedMinutes: settings.work, announce: true })
    // nur bei Sekundenwechsel neu rendern
    if (Math.ceil(left / 1000) !== Math.ceil(remainingMs / 1000)) set({ remainingMs: left })
  }

  return {
    settings: DEFAULT_SETTINGS,
    phase: 'work',
    status: 'idle',
    endsAt: 0,
    remainingMs: phaseMs(DEFAULT_SETTINGS, 'work'),
    cycleCount: 0,
    target: null,
    sessionsVersion: 0,

    async load() {
      try {
        const raw = await window.uni.ui.get(SETTINGS_KEY)
        if (!raw) return
        const settings = sanitize(JSON.parse(raw))
        set((s) => ({ settings, remainingMs: s.status === 'idle' ? phaseMs(settings, s.phase) : s.remainingMs }))
      } catch (e) {
        console.warn('Pomodoro-Einstellungen konnten nicht geladen werden', e)
      }
    },

    setSettings(patch) {
      const settings = sanitize({ ...get().settings, ...patch })
      set((s) => ({ settings, remainingMs: s.status === 'idle' ? phaseMs(settings, s.phase) : s.remainingMs }))
      window.uni.ui.set(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {})
    },

    setTarget: (target) => set({ target }),

    setPhase(phase) {
      if (get().status === 'running') return
      stopTimer()
      set({ phase, status: 'idle', remainingMs: phaseMs(get().settings, phase) })
    },

    start() {
      const { status, remainingMs, settings, phase } = get()
      if (status === 'running') return
      const left = status === 'paused' ? remainingMs : phaseMs(settings, phase)
      set({ status: 'running', endsAt: Date.now() + left, remainingMs: left })
      stopTimer()
      timer = setInterval(tick, 250)
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
    },

    startFor(target) {
      const { phase, status } = get()
      set({ target })
      if (phase === 'work' && status === 'running') return
      if (phase !== 'work') {
        stopTimer()
        set({ phase: 'work', status: 'idle', remainingMs: phaseMs(get().settings, 'work') })
      }
      get().start()
    },

    pause() {
      if (get().status !== 'running') return
      stopTimer()
      set({ status: 'paused', remainingMs: Math.max(0, get().endsAt - Date.now()) })
    },

    reset() {
      // Abgebrochene Runden werden nicht gutgeschrieben
      stopTimer()
      const { settings, phase } = get()
      set({ status: 'idle', remainingMs: phaseMs(settings, phase) })
    },

    skip() {
      const { phase, status, settings, remainingMs, endsAt } = get()
      let elapsedMinutes = 0
      if (phase === 'work' && status !== 'idle') {
        const left = status === 'running' ? Math.max(0, endsAt - Date.now()) : remainingMs
        elapsedMinutes = Math.floor((phaseMs(settings, 'work') - left) / 60_000)
      }
      // Eine übersprungene Fokus-Runde ohne volle Minute zählt nicht
      if (phase === 'work' && elapsedMinutes < 1) {
        stopTimer()
        set({ status: 'idle', phase: 'short', remainingMs: phaseMs(settings, 'short') })
        return
      }
      advance({ elapsedMinutes, announce: false })
    }
  }
})

export const fmtClock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const PHASE_LABEL: Record<Phase, string> = { work: 'Fokus', short: 'Kurze Pause', long: 'Lange Pause' }
