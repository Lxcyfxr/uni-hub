import { BrowserWindow, Notification } from 'electron'
import type { ModuleId } from '@shared/ipc'

// Benachrichtigungen müssen referenziert bleiben, sonst räumt der Garbage Collector sie samt Klick-Handler weg
const live = new Set<Notification>()

export interface ToastOptions {
  title: string
  body: string
  silent?: boolean
  /** Modul, das bei einem Klick auf die Benachrichtigung geöffnet wird */
  navigate?: ModuleId
}

/** Zeigt eine Windows-Benachrichtigung; false, wenn das System sie nicht unterstützt. */
export function toast(win: BrowserWindow, opts: ToastOptions): boolean {
  if (!Notification.isSupported()) return false
  const n = new Notification({ title: opts.title, body: opts.body, silent: opts.silent ?? false })
  live.add(n)
  n.on('click', () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (opts.navigate) win.webContents.send('app:navigate', opts.navigate)
  })
  n.on('close', () => live.delete(n))
  n.show()
  return true
}
