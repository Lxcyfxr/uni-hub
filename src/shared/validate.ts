/**
 * Prüfung von Eingaben der Oberfläche im Hauptprozess. Der Renderer gilt als nicht vertrauenswürdig:
 * Typ, Länge und Wertebereich werden hier festgelegt, bevor etwas an Dateisystem, Datenbank oder Fenster geht.
 * Reine Funktionen ohne Electron-Abhängigkeit.
 */

export class InputError extends Error {}

const fail = (what: string): never => {
  throw new InputError(`Ungültige Eingabe: ${what}`)
}

/** Positive ganze Zahl (Datenbank-ID) */
export function id(v: unknown, what = 'ID'): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) fail(what)
  return v as number
}

export function idList(v: unknown, max = 10_000): number[] {
  if (!Array.isArray(v) || v.length > max) fail('Liste')
  return (v as unknown[]).map((x) => id(x))
}

export function str(v: unknown, max = 1000, what = 'Text'): string {
  if (typeof v !== 'string' || v.length > max) fail(what)
  return v as string
}

/** Text oder null/leer -> null */
export function optStr(v: unknown, max = 1000, what = 'Text'): string | null {
  if (v === null || v === undefined || v === '') return null
  return str(v, max, what)
}

/** ID oder null/undefined -> null */
export function optId(v: unknown): number | null {
  return v === null || v === undefined ? null : id(v)
}

/** Ganze Zahl in einem Bereich */
export function int(v: unknown, min: number, max: number, what = 'Zahl'): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(what)
  return v as number
}

export function strList(v: unknown, maxItems = 200, maxLen = 1000): string[] {
  if (!Array.isArray(v) || v.length > maxItems) fail('Liste')
  return (v as unknown[]).map((x) => str(x, maxLen))
}

export function bool(v: unknown): boolean {
  return v === true
}

export function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], what = 'Wert'): T {
  if (!allowed.includes(v as T)) fail(what)
  return v as T
}

export function ownKey<T extends object>(v: unknown, obj: T, what = 'Name'): keyof T {
  if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(obj, v)) fail(what)
  return v as keyof T
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Fensterbereich für eingebettete Ansichten: endliche, begrenzte Zahlen */
export function bounds(v: unknown): Rect {
  if (typeof v !== 'object' || v === null) return fail('Bereich')
  const o = v as Record<string, unknown>
  const num = (x: unknown, min: number, max: number) => {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) fail('Bereich')
    return Math.round(x as number)
  }
  return { x: num(o.x, -20_000, 20_000), y: num(o.y, -20_000, 20_000), width: num(o.width, 0, 20_000), height: num(o.height, 0, 20_000) }
}

/** Absoluter Windows-Pfad (Laufwerk oder UNC), begrenzte Länge, ohne Steuerzeichen */
export function absolutePath(v: unknown): string {
  const s = str(v, 1024, 'Pfad')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(s) || !/^([A-Za-z]:[\\/]|\\\\[^\\/]+[\\/])/.test(s)) fail('Pfad')
  return s
}

export function paths(v: unknown, max = 500): string[] {
  if (!Array.isArray(v) || v.length > max) fail('Pfadliste')
  return (v as unknown[]).map(absolutePath)
}

/** 'YYYY-MM-DD' oder ISO-Zeitstempel */
export function dayOrIso(v: unknown, what = 'Datum'): string {
  const s = str(v, 40, what)
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s) || Number.isNaN(Date.parse(s))) fail(what)
  return s
}

/** Farbe als #rrggbb */
export function hexColor(v: unknown): string {
  const s = str(v, 7, 'Farbe')
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) fail('Farbe')
  return s
}
