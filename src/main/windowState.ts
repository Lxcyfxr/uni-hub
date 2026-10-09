import { BrowserWindow, screen } from 'electron'
import { kvGet, kvSet } from './db'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const KEY = 'ui.window'
const DEFAULT: WindowState = { width: 1400, height: 900, maximized: false }
const MIN_W = 900
const MIN_H = 600

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Zuletzt gespeicherte Fenstergröße/-position; nur verwenden, wenn das Fenster noch auf einem Bildschirm sichtbar wäre. */
export function loadWindowState(): WindowState {
  try {
    const s = JSON.parse(kvGet(KEY) ?? 'null') as Partial<WindowState> | null
    if (!s || !num(s.width) || !num(s.height)) return DEFAULT
    const state: WindowState = {
      width: Math.min(Math.max(Math.round(s.width), MIN_W), 10_000),
      height: Math.min(Math.max(Math.round(s.height), MIN_H), 10_000),
      maximized: s.maximized === true
    }
    if (num(s.x) && num(s.y)) {
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea
        return s.x! + 100 < a.x + a.width && s.x! + state.width - 100 > a.x && s.y! >= a.y - 20 && s.y! + 100 < a.y + a.height
      })
      if (visible) {
        state.x = Math.round(s.x)
        state.y = Math.round(s.y)
      }
    }
    return state
  } catch {
    return DEFAULT
  }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    try {
      kvSet(KEY, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
    } catch (e) {
      console.warn('Fensterzustand konnte nicht gespeichert werden:', e)
    }
  }
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  win.on('close', save)
}
