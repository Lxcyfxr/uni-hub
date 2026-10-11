import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/db', () => ({ getDb: () => ({}) }))
vi.mock('../src/main/docs/library', () => ({ list: () => [], search: () => [] }))

import { excerpt, fold, matches, tokensOf } from '../src/main/search'

describe('fold / tokensOf', () => {
  it('ignoriert Groß-/Kleinschreibung und Umlautpunkte', () => {
    expect(fold('Über Größe')).toBe('uber große')
    expect(tokensOf('  Anatomie   ÜBER ')).toEqual(['anatomie', 'uber'])
  })
  it('begrenzt die Zahl der Suchwörter', () => {
    expect(tokensOf('a b c d e f g h')).toHaveLength(6)
  })
})

describe('matches', () => {
  it('verlangt alle Suchwörter, in beliebiger Reihenfolge', () => {
    expect(matches('Herz-Kreislauf Vorlesung Anatomie', tokensOf('anatomie herz'))).toBe(true)
    expect(matches('Herz-Kreislauf Vorlesung', tokensOf('anatomie herz'))).toBe(false)
  })
  it('findet Umlaute mit und ohne Punkte', () => {
    expect(matches('Prüfung Biochemie', tokensOf('prufung'))).toBe(true)
    expect(matches('Prufung', tokensOf('prüfung'))).toBe(true)
  })
})

describe('excerpt', () => {
  it('zeigt Text um die Fundstelle und kürzt', () => {
    const text = 'x'.repeat(100) + ' Herzklappe ' + 'y'.repeat(100)
    const out = excerpt(text, ['herzklappe'])
    expect(out).toContain('Herzklappe')
    expect(out.startsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(110)
  })
  it('entfernt HTML', () => {
    expect(excerpt('<b>Fett</b>&nbsp;gedruckt', ['fett'])).toBe('Fett gedruckt')
  })
})
