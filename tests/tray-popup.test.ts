import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, nativeTheme: {}, screen: {} }))
vi.mock('../src/main/db', () => ({ kvGet: () => null }))
vi.mock('../src/main/calendar/ical', () => ({ listSources: () => [], events: () => [] }))
vi.mock('../src/main/todos/store', () => ({ list: () => [] }))
vi.mock('../src/main/security', () => ({ SECURE_WEB_PREFERENCES: {} }))

import { renderTodayHtml, todaysEntries } from '../src/main/trayPopup'
import type { CalendarEvent, Todo } from '../src/shared/ipc'

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: 1, sourceId: 1, title: 'T', start: '', end: '', allDay: false, location: null, description: null, editable: false, ...p
})

describe('todaysEntries', () => {
  const now = new Date(2026, 9, 10, 12, 0)
  const at = (h: number, m = 0, d = 10) => new Date(2026, 9, d, h, m).toISOString()
  it('behält nur heutige Termine, Ganztägige zuerst', () => {
    const out = todaysEntries(
      [
        ev({ id: 1, title: 'Gestern', start: at(10, 0, 9), end: at(11, 0, 9) }),
        ev({ id: 2, title: 'Vorlesung', start: at(14), end: at(16) }),
        ev({ id: 3, title: 'Frühstück', start: at(8), end: at(9) }),
        ev({ id: 4, title: 'Feiertag', allDay: true, start: '2026-10-10', end: '2026-10-11' }),
        ev({ id: 5, title: 'Morgen', start: at(9, 0, 11), end: at(10, 0, 11) })
      ],
      new Map(),
      now
    )
    expect(out.map((e) => e.title)).toEqual(['Feiertag', 'Frühstück', 'Vorlesung'])
  })
})

describe('renderTodayHtml', () => {
  const now = new Date(2026, 9, 10, 12, 0)
  it('maskiert HTML in Titeln und lässt kein Skript zu', () => {
    const html = renderTodayHtml(
      [{ title: '<img src=x onerror=alert(1)>', color: 'red;background:url(x)', location: null, allDay: true, start: 0, end: 1 }],
      [],
      now,
      true
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('red;background')
    expect(html).toContain("default-src 'none'")
  })
  it('zeigt fällige und überfällige Aufgaben, aber keine erledigten', () => {
    const todo = (p: Partial<Todo>): Todo => ({ id: 1, title: 'A', notes: null, due: '2026-10-10', priority: 1, status: 'open', done: false, categoryId: null, ...p })
    const html = renderTodayHtml([], [todo({ title: 'Heute' }), todo({ id: 2, title: 'Alt', due: '2026-10-01' }), todo({ id: 3, title: 'Fertig', done: true }), todo({ id: 4, title: 'Später', due: '2026-10-20' })], now, false)
    expect(html).toContain('Heute fällig')
    expect(html).toContain('Überfällig')
    expect(html).not.toContain('Fertig')
    expect(html).not.toContain('Später')
  })
  it('meldet einen leeren Tag', () => {
    expect(renderTodayHtml([], [], now, false)).toContain('Heute steht nichts an.')
  })
})
