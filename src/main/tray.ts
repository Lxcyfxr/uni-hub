import { app, BrowserWindow, Menu, Tray } from 'electron'
import { kvGet, kvSet } from './db'
import { trayIcon } from './icon'
import { toast } from './notify'
import { toggleTodayPopup, trayPopupEnabled } from './trayPopup'
import type { ModuleId } from '@shared/ipc'

const SETTING_KEY = 'ui.trayOnClose'
const HINT_KEY = 'tray.hintShown'

/** Standard: Schließen versteckt das Fenster, die App läuft im Infobereich weiter. */
export const trayOnClose = (): boolean => kvGet(SETTING_KEY) !== '0'

let tray: Tray | null = null
let quitting = false

export function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Symbol im Infobereich plus „Schließen = in den Hintergrund“. Erst „Beenden“ im Menü (oder die
 * Einstellung ausschalten) beendet die App wirklich – so laufen Erinnerungen und Timer weiter.
 */
export function setupTray(win: BrowserWindow): void {
  app.on('before-quit', () => {
    quitting = true
  })

  win.on('close', (event) => {
    if (quitting || !trayOnClose()) return
    event.preventDefault()
    win.hide()
    // Nur beim ersten Mal erklären, wohin das Fenster verschwunden ist
    if (kvGet(HINT_KEY) !== '1') {
      kvSet(HINT_KEY, '1')
      toast(win, {
        title: 'Uni-Hub läuft im Hintergrund weiter',
        body: 'Erinnerungen und Timer bleiben aktiv. Über das Symbol im Infobereich öffnest oder beendest du die App.'
      })
    }
  })

  const go = (module: ModuleId) => {
    showWindow(win)
    win.webContents.send('app:navigate', module)
  }

  tray = new Tray(trayIcon())
  tray.setToolTip('Uni-Hub')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Uni-Hub öffnen', click: () => showWindow(win) },
      { type: 'separator' },
      { label: 'Übersicht', click: () => go('home') },
      { label: 'To-Do', click: () => go('todo') },
      { label: 'Lernplaner', click: () => go('study') },
      { label: 'Kalender', click: () => go('calendar') },
      { label: 'Anki', click: () => go('anki') },
      { type: 'separator' },
      { label: 'Beenden', click: () => app.quit() }
    ])
  )
  // Klick: Tages-Popup mit den heutigen Terminen (abschaltbar); Doppelklick öffnet immer das Fenster
  tray.on('click', (_e, bounds) => {
    if (!trayPopupEnabled()) return showWindow(win)
    toggleTodayPopup(bounds, (target) => (target === 'window' ? showWindow(win) : go(target)))
  })
  tray.on('double-click', () => showWindow(win))
}
