import type { AnkiImportResult } from './ipc'

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function summarizeImport(r: AnkiImportResult): string {
  const parts = [plural(r.notes, 'Notiz', 'Notizen'), plural(r.cards, 'Karte', 'Karten')]
  if (r.media) parts.push(plural(r.media, 'Mediendatei', 'Mediendateien'))
  return `${parts.join(', ')} importiert${r.skipped ? ` (${r.skipped} bereits vorhanden, übersprungen)` : ''}`
}
