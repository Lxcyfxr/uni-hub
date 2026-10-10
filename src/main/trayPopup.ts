import { BrowserWindow, nativeTheme, screen, type Rectangle } from 'electron'
import { kvGet } from './db'
import { listSources, events } from './calendar/ical'
import { list as listTodos } from './todos/store'
import { SECURE_WEB_PREFERENCES } from './security'
import type { CalendarEvent, ModuleId, Todo } from '@shared/ipc'

/** Standard: ein Klick auf das Symbol im Infobereich zeigt die heutigen Termine. */
export const trayPopupEnabled = (): boolean => kvGet('ui.trayPopup') !== '0'

const WIDTH = 340
const HEIGHT = 460

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dayString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const clock = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

export interface TodayEntry {
  title: string
  color: string
  location: string | null
  allDay: boolean
  start: number
  end: number
}

/** Termine, die heute (lokal) stattfinden, sortiert: Ganztägige zuerst, dann nach Beginn. */
export function todaysEntries(evs: CalendarEvent[], colors: Map<number, string>, now: Date): TodayEntry[] {
  const today = dayString(now)
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const to = from + 86_400_000
  return evs
    .filter((e) => {
      if (e.allDay) return e.start <= today && e.end > today
      const s = Date.parse(e.start)
      const en = Date.parse(e.end)
      return s < to && (en > from || (en === s && s >= from))
    })
    .map((e) => ({
      title: e.title,
      color: colors.get(e.sourceId) ?? '#1677ff',
      location: e.location,
      allDay: e.allDay,
      start: e.allDay ? from : Date.parse(e.start),
      end: e.allDay ? to : Date.parse(e.end)
    }))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
}

const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1677ff')

/** Statisches HTML für das Popup; Aktionen sind Links auf uni-action://…, es läuft kein Skript. */
export function renderTodayHtml(entries: TodayEntry[], todos: Todo[], now: Date, dark: boolean): string {
  const today = dayString(now)
  const nowMs = now.getTime()
  const nextIdx = entries.findIndex((e) => !e.allDay && e.start > nowMs)
  const due = todos.filter((t) => !t.done && t.due && t.due <= today)

  const rows = entries
    .map((e, i) => {
      const over = !e.allDay && e.end <= nowMs
      const running = !e.allDay && e.start <= nowMs && e.end > nowMs
      const time = e.allDay ? 'Ganztägig' : e.end > e.start ? `${clock(new Date(e.start))}–${clock(new Date(e.end))}` : clock(new Date(e.start))
      const badge = running ? '<span class="badge">läuft</span>' : i === nextIdx ? '<span class="badge soon">als Nächstes</span>' : ''
      return `<a class="row${over ? ' over' : ''}" href="uni-action://calendar"><span class="bar" style="background:${safeColor(e.color)}"></span><span class="body"><span class="title">${esc(e.title)}</span><span class="meta">${esc(time)}${e.location ? ' · ' + esc(e.location) : ''} ${badge}</span></span></a>`
    })
    .join('')

  const todoRows = due
    .slice(0, 6)
    .map(
      (t) =>
        `<a class="row" href="uni-action://todo"><span class="bar" style="background:#fa8c16"></span><span class="body"><span class="title">${esc(t.title)}</span><span class="meta">${t.due! < today ? 'Überfällig' : 'Heute fällig'}</span></span></a>`
    )
    .join('')
  const more = due.length > 6 ? `<div class="empty">… und ${due.length - 6} weitere</div>` : ''

  const heading = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const colors = dark
    ? '--bg:#1f1f1f;--fg:#ececec;--muted:#9a9a9a;--line:#333;--hover:#2a2a2a;--badge:#2f3b52;--badgefg:#8ab4ff'
    : '--bg:#ffffff;--fg:#1f1f1f;--muted:#6b6b6b;--line:#e6e6e6;--hover:#f3f3f3;--badge:#e6f0ff;--badgefg:#1458c8'

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
:root{${colors};color-scheme:${dark ? 'dark' : 'light'}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.35 "Segoe UI",system-ui,sans-serif;user-select:none;cursor:default}
body{display:flex;flex-direction:column;border:1px solid var(--line)}
h1{font-size:15px;margin:0;padding:14px 16px 4px;font-weight:600}
.sub{padding:0 16px 8px;color:var(--muted);font-size:12px}
.list{flex:1;overflow-y:auto;padding:0 8px;scrollbar-width:none}
h2{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:10px 8px 4px;font-weight:600}
.row{display:flex;gap:10px;padding:7px 8px;border-radius:6px;color:inherit;text-decoration:none}
.row:hover{background:var(--hover)}
.row.over{opacity:.5}
.bar{width:4px;border-radius:2px;flex-shrink:0}
.body{display:flex;flex-direction:column;min-width:0}
.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{font-size:12px;color:var(--muted)}
.badge{font-size:10px;padding:1px 6px;border-radius:8px;background:var(--badge);color:var(--badgefg);margin-left:4px}
.empty{padding:24px 8px;text-align:center;color:var(--muted)}
.foot{display:flex;border-top:1px solid var(--line)}
.foot a{flex:1;text-align:center;padding:10px;color:inherit;text-decoration:none;font-size:13px}
.foot a:hover{background:var(--hover)}
.foot a+a{border-left:1px solid var(--line)}
</style></head><body>
<h1>Heute</h1><div class="sub">${esc(heading)}</div>
<div class="list">
${entries.length ? `<h2>Termine</h2>${rows}` : ''}
${due.length ? `<h2>Aufgaben</h2>${todoRows}${more}` : ''}
${!entries.length && !due.length ? '<div class="empty">Heute steht nichts an.</div>' : ''}
</div>
<div class="foot"><a href="uni-action://calendar">Kalender</a><a href="uni-action://open">Uni-Hub öffnen</a></div>
</body></html>`
}

let popup: BrowserWindow | null = null
let lastHidden = 0

function position(trayBounds: Rectangle): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const area = display.workArea
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - WIDTH / 2)
  // Taskleiste unten (üblich): Popup darüber; sonst darunter
  const above = trayBounds.y > area.y + area.height / 2
  const y = above ? trayBounds.y - HEIGHT - 6 : trayBounds.y + trayBounds.height + 6
  return {
    x: Math.min(Math.max(x, area.x + 6), area.x + area.width - WIDTH - 6),
    y: Math.min(Math.max(y, area.y + 6), area.y + area.height - HEIGHT - 6)
  }
}

function build(): string {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  const colors = new Map(listSources().map((s) => [s.id, s.color]))
  const entries = todaysEntries(events(from.toISOString(), to.toISOString()), colors, now)
  return renderTodayHtml(entries, listTodos(), now, nativeTheme.shouldUseDarkColors)
}

/** Zeigt bzw. schließt das Tages-Popup am Symbol im Infobereich. */
export function toggleTodayPopup(trayBounds: Rectangle, open: (module: ModuleId | 'window') => void): void {
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    popup.hide()
    return
  }
  // Der Klick auf das Symbol nimmt dem Popup zuerst den Fokus (blur → hide); dann nicht gleich wieder öffnen
  if (Date.now() - lastHidden < 300) return

  if (!popup || popup.isDestroyed()) {
    popup = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: { ...SECURE_WEB_PREFERENCES, javascript: false, devTools: false }
    })
    const wc = popup.webContents
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (event, url) => {
      event.preventDefault()
      const action = url.startsWith('uni-action://') ? url.slice('uni-action://'.length).replace(/\/$/, '') : ''
      if (action === 'calendar' || action === 'todo') open(action)
      else if (action === 'open') open('window')
      else return
      popup?.hide()
    })
    popup.on('blur', () => {
      lastHidden = Date.now()
      popup?.hide()
    })
    popup.on('closed', () => {
      popup = null
    })
  }

  const { x, y } = position(trayBounds)
  popup.setBounds({ x, y, width: WIDTH, height: HEIGHT })
  popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(build())).then(
    () => {
      if (!popup || popup.isDestroyed()) return
      popup.show()
      popup.focus()
    },
    (err) => console.warn('Tages-Popup konnte nicht geladen werden:', err)
  )
}
