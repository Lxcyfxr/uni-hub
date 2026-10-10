import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, powerMonitor: {} }))
vi.mock('../src/main/db', () => ({ getDb: () => ({}), kvGet: () => null, kvSet: () => {} }))
vi.mock('../src/main/notify', () => ({ toast: () => true }))

import { advanceBreak, dayString, describeDeadlines } from '../src/main/deadlines'

describe('describeDeadlines', () => {
  it('liefert null ohne Fristen', () => {
    expect(describeDeadlines([], '2026-10-10')).toBeNull()
  })
  it('beschriftet heute, morgen und überfällig', () => {
    const m = describeDeadlines(
      [
        { title: 'Anmeldung', due: '2026-10-11' },
        { title: 'Abgabe', due: '2026-10-10' },
        { title: 'Alt', due: '2026-10-08' }
      ],
      '2026-10-10'
    )!
    expect(m.title).toBe('Fristen: 3 Aufgaben (1 überfällig)')
    expect(m.body.split('\n')).toEqual(['Seit 2 Tagen überfällig: Alt', 'Heute fällig: Abgabe', 'Morgen fällig: Anmeldung'])
  })
  it('kürzt lange Listen', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, due: '2026-10-12' }))
    expect(describeDeadlines(rows, '2026-10-10')!.body).toContain('… und 2 weitere')
  })
})

describe('dayString', () => {
  it('formatiert lokal als JJJJ-MM-TT', () => {
    expect(dayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('advanceBreak', () => {
  const t0 = 1_000_000
  it('summiert aktive Zeit', () => {
    let s = { activeMs: 0, lastActive: t0, lastTick: t0 }
    s = advanceBreak(s, true, t0 + 30_000)
    s = advanceBreak(s, true, t0 + 60_000)
    expect(s.activeMs).toBe(60_000)
  })
  it('setzt nach mehr als 5 Minuten Pause zurück', () => {
    let s = { activeMs: 50 * 60_000, lastActive: t0, lastTick: t0 }
    s = advanceBreak(s, false, t0 + 6 * 60_000)
    expect(s.activeMs).toBe(0)
  })
  it('behält den Zähler bei kurzer Unterbrechung', () => {
    let s = { activeMs: 10 * 60_000, lastActive: t0, lastTick: t0 }
    s = advanceBreak(s, false, t0 + 2 * 60_000)
    expect(s.activeMs).toBe(10 * 60_000)
  })
})
