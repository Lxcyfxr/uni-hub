/** Grundaufwand je Umfang (S, M, L) in Minuten */
export const BASE_MINUTES: Record<number, number> = { 1: 60, 2: 120, 3: 240 }
/** Schwierigkeit (leicht, mittel, schwer) als Faktor auf den Grundaufwand */
export const DIFFICULTY_FACTOR: Record<number, number> = { 1: 0.75, 2: 1, 3: 1.5 }

export const EFFORT_LABEL: Record<number, string> = { 1: 'S', 2: 'M', 3: 'L' }
export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'leicht', 2: 'mittel', 3: 'schwer' }

/** Geschätzter Gesamtaufwand eines Themas in Minuten (ohne Anpassung an die persönliche Lerngeschwindigkeit). */
export const baseMinutes = (effort: number, difficulty: number): number => (BASE_MINUTES[effort] ?? BASE_MINUTES[2]) * (DIFFICULTY_FACTOR[difficulty] ?? 1)
