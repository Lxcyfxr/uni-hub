// Einzige Stelle für alle Farben der Oberfläche (Hell und Dunkel). Änderungen hier wirken überall.
// Eigenes Schema in Blau/Türkis, inspiriert von einer klinischen Optik – kein offizielles Corporate Design.
// Die Werte werden als CSS-Variablen (--uh-*) auf <html> gesetzt (themeMode.tsx) und speisen die antd-Tokens.

export type Mode = 'light' | 'dark'

const light = {
  bg: '#f3f6fa',
  surface: '#ffffff',
  border: '#d6dfea',
  text: '#10223a',
  textSecondary: '#4a5d78',
  primary: '#0b4f9c',
  primaryHover: '#0a417f',
  primaryBg: '#e4eef9',
  accent: '#0c8f9b',
  success: '#1f8a5b',
  warning: '#c77d0a',
  danger: '#c93b47',
  magenta: '#a33c8f',
  purple: '#6a4fc2',
  grey: '#5e6b7d',
  sidebar: '#0b2545',
  paper: '#ffffff'
}

const dark: typeof light = {
  bg: '#0a1220',
  surface: '#111c2e',
  border: '#263852',
  text: '#e7edf6',
  textSecondary: '#9fb0c7',
  primary: '#5fa2ea',
  primaryHover: '#80b6f0',
  primaryBg: '#12294a',
  accent: '#3cc0cc',
  success: '#4cc38a',
  warning: '#f0b04a',
  danger: '#f0727c',
  magenta: '#d878c6',
  purple: '#9c86f0',
  grey: '#9aa8ba',
  sidebar: '#0d1626',
  paper: '#ffffff'
}

export const PALETTES: Record<Mode, typeof light> = { light, dark }
type Key = keyof typeof light

/** Setzt die Farbwerte des Modus als CSS-Variablen auf dem Wurzelelement. */
export function applyPalette(mode: Mode): void {
  const root = document.documentElement
  for (const [k, val] of Object.entries(PALETTES[mode])) root.style.setProperty(`--uh-${k}`, val)
  root.style.colorScheme = mode
}

const v = (k: Key) => `var(--uh-${k})`

/** Mischt eine Farbe (auch CSS-Variable) mit Transparenz, z. B. tint(BRAND, 15). */
export const tint = (color: string, percent: number): string => `color-mix(in srgb, ${color} ${percent}%, transparent)`

/** Grundpalette (folgt dem Modus) */
export const C = {
  blue: v('primary'),
  green: v('success'),
  red: v('danger'),
  orange: v('warning'),
  magenta: v('magenta'),
  purple: v('purple'),
  cyan: v('accent'),
  gold: v('warning'),
  crimson: v('danger'),
  grey: v('grey'),
  blueLight: v('primary'),
  redLight: v('danger'),
  greenLight: v('success')
} as const

/** Marke */
export const BRAND = v('primary')
export const SUCCESS = v('success')

/** Weiß mit Deckkraft, für Text und Linien auf der dunklen Seitenleiste bzw. im Dark Mode */
export const ON_DARK = {
  text: 'rgba(255,255,255,0.85)',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.45)',
  textFaint: 'rgba(255,255,255,0.25)',
  dot: 'rgba(255,255,255,0.18)',
  border: 'rgba(255,255,255,0.12)',
  borderSoft: 'rgba(255,255,255,0.06)',
  fill: 'rgba(255,255,255,0.08)',
  solid: '#fff'
} as const

/** Neutrale Überlagerung (funktioniert hell wie dunkel) */
export const NEUTRAL_FILL = 'rgba(128,128,128,0.12)'

/** Pomodoro-Phasen */
export const PHASE = { work: C.red, short: C.green, long: C.blue } as const

/** Anki-Zähler */
export const ANKI = { new: C.blueLight, learn: C.redLight, due: C.greenLight } as const

/** Aufgaben */
export const TODO = {
  overdue: C.redLight,
  priorityHigh: C.red,
  doneAction: C.green,
  calendar: C.orange,
  fallbackGroup: C.grey
} as const

export const STATUS = { open: C.grey, doing: C.blue, done: C.green } as const

/**
 * Auswahl für Fach-/Kalenderfarben. Diese Werte werden gespeichert, deshalb feste Hex-Werte
 * (klein geschrieben), die auf hellem und dunklem Grund funktionieren.
 */
export const PALETTE = ['#0b4f9c', '#0c8f9b', '#1f8a5b', '#c77d0a', '#c93b47', '#a33c8f', '#6a4fc2', '#5e6b7d']
export const DEFAULT_SOURCE_COLOR = PALETTE[0]

/** Aktuelle-Uhrzeit-Linie im Kalender */
export const NOW_LINE = C.red

/** Hervorhebungen (Auswahl, Hover, Fortschritt) */
export const HIGHLIGHT = {
  running: tint(BRAND, 12),
  dropTarget: tint(BRAND, 8),
  selected: tint(BRAND, 15),
  bar: tint(BRAND, 45)
} as const

/** Dateityp-Symbole */
export const FILE = { pdf: C.red, word: C.blue, ppt: C.orange, image: C.green } as const

/** Dokument-Vorschau (iframe, immer „Papier“, unabhängig vom Theme) */
export const PAPER = { bg: '#fff', text: '#222', border: '#bbb' } as const

/** Anki-Kartenansicht (iframe, immer dunkel; CSS-Variablen reichen nicht in iframes) */
export const CARD = { bg: '#111c2e', text: '#e7edf6', link: '#5fa2ea' } as const

/** Startseite: Fortschrittsring */
export const PROGRESS_RING = { '0%': BRAND, '100%': SUCCESS }
