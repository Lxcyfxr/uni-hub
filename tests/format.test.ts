import { describe, expect, it } from 'vitest'
import { plural, summarizeImport } from '@shared/format'

describe('Formatierung', () => {
  it('beugt Einzahl und Mehrzahl', () => {
    expect(plural(1, 'Karte', 'Karten')).toBe('1 Karte')
    expect(plural(0, 'Karte', 'Karten')).toBe('0 Karten')
    expect(plural(12, 'Karte', 'Karten')).toBe('12 Karten')
  })

  it('fasst einen Import zusammen', () => {
    expect(summarizeImport({ decks: 1, notes: 1, cards: 2, media: 0, skipped: 0 })).toBe('1 Notiz, 2 Karten importiert')
    expect(summarizeImport({ decks: 1, notes: 3, cards: 4, media: 5, skipped: 2 })).toBe(
      '3 Notizen, 4 Karten, 5 Mediendateien importiert (2 bereits vorhanden, übersprungen)'
    )
  })
})
