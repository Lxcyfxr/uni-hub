import { describe, expect, it } from 'vitest'
import * as v from '@shared/validate'

describe('Eingabeprüfung', () => {
  it('akzeptiert nur positive ganze Zahlen als ID', () => {
    expect(v.id(5)).toBe(5)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '5', null, undefined, {}, [1], 2 ** 60]) expect(() => v.id(bad)).toThrow(v.InputError)
  })

  it('begrenzt Listen und Texte', () => {
    expect(v.idList([1, 2, 3])).toEqual([1, 2, 3])
    expect(() => v.idList([1, 'x'])).toThrow()
    expect(() => v.idList(new Array(20).fill(1), 10)).toThrow()
    expect(() => v.str('a'.repeat(11), 10)).toThrow()
    expect(() => v.str(42 as unknown)).toThrow()
    expect(v.optStr('')).toBeNull()
    expect(v.optStr(undefined)).toBeNull()
    expect(v.optStr('x')).toBe('x')
  })

  it('erlaubt nur eigene Schlüssel (nicht Prototyp-Eigenschaften wie constructor)', () => {
    const modules = { mail: 1, lehre: 2 }
    expect(v.ownKey('mail', modules)).toBe('mail')
    for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'gibtsnicht', 5, null]) expect(() => v.ownKey(bad, modules)).toThrow()
  })

  it('prüft Fensterbereiche auf endliche, begrenzte Zahlen', () => {
    expect(v.bounds({ x: 10.4, y: 20, width: 800, height: 600 })).toEqual({ x: 10, y: 20, width: 800, height: 600 })
    for (const bad of [null, 'x', { x: 0, y: 0, width: NaN, height: 1 }, { x: 0, y: 0, width: 1, height: Infinity }, { x: 0, y: 0, width: -1, height: 1 }, { x: 1e9, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1 }]) {
      expect(() => v.bounds(bad)).toThrow()
    }
  })

  it('erlaubt nur absolute Windows-Pfade ohne Steuerzeichen', () => {
    expect(v.absolutePath('C:\\Users\\x\\a.pdf')).toBe('C:\\Users\\x\\a.pdf')
    expect(v.absolutePath('D:/Daten/a.pdf')).toBe('D:/Daten/a.pdf')
    expect(v.absolutePath('\\\\server\\freigabe\\a.pdf')).toBe('\\\\server\\freigabe\\a.pdf')
    for (const bad of ['relativ\\a.pdf', '..\\..\\a.pdf', '/etc/passwd', 'file:///C:/a', 'C:\\a\u0000.pdf', '', 'x'.repeat(2000), 5]) expect(() => v.absolutePath(bad)).toThrow()
    expect(() => v.paths(new Array(600).fill('C:\\a'))).toThrow()
  })

  it('prüft Datums- und Farbwerte', () => {
    expect(v.dayOrIso('2026-11-03')).toBe('2026-11-03')
    expect(v.dayOrIso('2026-11-03T08:00:00.000Z')).toBe('2026-11-03T08:00:00.000Z')
    for (const bad of ['3.11.2026', '2026-13-45', '2026-11-03; DROP TABLE todos', 'morgen', '']) expect(() => v.dayOrIso(bad)).toThrow()
    expect(v.hexColor('#1677ff')).toBe('#1677ff')
    for (const bad of ['red', '#fff', '#12345g', 'javascript:1']) expect(() => v.hexColor(bad)).toThrow()
  })

  it('oneOf und bool', () => {
    expect(v.oneOf(3, [1, 2, 3] as const)).toBe(3)
    expect(() => v.oneOf(9, [1, 2, 3] as const)).toThrow()
    expect(v.bool(true)).toBe(true)
    expect(v.bool('true')).toBe(false)
  })
})
