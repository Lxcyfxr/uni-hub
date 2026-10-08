import { BrowserWindow, WebContentsView, session } from 'electron'
import { guardServiceView, openExternalSafe } from './links'
import { SECURE_WEB_PREFERENCES } from './security'
import { pathToFileURL } from 'url'
import { WEB_MODULES, type Bounds, type WebModuleId } from '@shared/ipc'

const views = new Map<WebModuleId, WebContentsView>()
let active: WebContentsView | null = null

function create(win: BrowserWindow, id: WebModuleId): WebContentsView {
  const view = new WebContentsView({ webPreferences: { ...SECURE_WEB_PREFERENCES, partition: WEB_MODULES[id].partition } })
  // Login-Popups (Microsoft/Shibboleth, AMBOSS inkl. Google/Apple-Anmeldung) bleiben in der App, alles andere
  // geht nur über https in den Standardbrowser; fremde Schemata werden nie geladen
  guardServiceView(view.webContents)
  view.webContents.loadURL(WEB_MODULES[id].url)
  views.set(id, view)
  win.contentView.addChildView(view)
  return view
}

export function showWeb(win: BrowserWindow, id: WebModuleId, bounds: Bounds): void {
  if (active) active.setVisible(false)
  const view = views.get(id) ?? create(win, id)
  view.setBounds(bounds)
  view.setVisible(true)
  active = view
}

/** Schließt die Ansicht und löscht Cookies, Storage und Cache der Partition. */
export async function resetPartition(win: BrowserWindow, partition: string, id?: WebModuleId): Promise<void> {
  const view = id ? views.get(id) : undefined
  if (view) {
    if (active === view) active = null
    views.delete(id!)
    win.contentView.removeChildView(view)
    view.webContents.close()
  }
  const ses = session.fromPartition(partition)
  await ses.clearStorageData()
  await ses.clearCache()
  await ses.clearAuthCache()
}

let docView: WebContentsView | null = null
let docUrl = ''

/** Zeigt eine lokale Datei (PDF, Bild, Text) mit dem eingebauten Chromium-Viewer. */
export function showFile(win: BrowserWindow, filePath: string, bounds: Bounds): void {
  if (!docView) {
    docView = new WebContentsView({ webPreferences: { ...SECURE_WEB_PREFERENCES, partition: 'doc-viewer' } })
    const wc = docView.webContents
    // Der Viewer darf nie wegnavigieren (z. B. durch Drag&Drop oder Links im Dokument)
    const stay = (details: { url: string; preventDefault(): void }) => {
      if (details.url !== docUrl) details.preventDefault()
    }
    wc.on('will-navigate', stay)
    wc.on('will-redirect', stay)
    wc.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url)
      return { action: 'deny' }
    })
    win.contentView.addChildView(docView)
  }
  if (active && active !== docView) active.setVisible(false)
  const url = pathToFileURL(filePath).href
  if (url !== docUrl) {
    docUrl = url
    docView.webContents.loadURL(url)
  }
  docView.setBounds(bounds)
  docView.setVisible(true)
  active = docView
}

/** Lässt die Dokumentansicht ihre Datei loslassen (Windows sperrt geöffnete Dateien gegen das Löschen). */
export function releaseDocView(): void {
  if (!docView) return
  docUrl = ''
  void docView.webContents.loadURL('about:blank')
}

export function hideWeb(): void {
  active?.setVisible(false)
  active = null
}

export function navWeb(action: 'back' | 'forward' | 'reload'): void {
  const wc = active?.webContents
  if (!wc) return
  if (action === 'back') wc.navigationHistory.goBack()
  else if (action === 'forward') wc.navigationHistory.goForward()
  else wc.reload()
}
