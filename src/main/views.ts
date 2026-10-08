import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { pathToFileURL } from 'url'
import { WEB_MODULES, type Bounds, type WebModuleId } from '@shared/ipc'

const views = new Map<WebModuleId, WebContentsView>()
let active: WebContentsView | null = null

const LOGIN_HOSTS = ['login.microsoftonline.com', 'charite.de', 'amboss.com', 'accounts.google.com', 'appleid.apple.com']

/** Nur https und genau diese Domains (inkl. Subdomains) – nicht jede Adresse, die den Namen irgendwo enthält. */
function isLoginHost(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && LOGIN_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

function create(win: BrowserWindow, id: WebModuleId): WebContentsView {
  const view = new WebContentsView({
    webPreferences: { partition: WEB_MODULES[id].partition, sandbox: true, contextIsolation: true }
  })
  view.webContents.setWindowOpenHandler(({ url }) => {
    // Login-Popups (Microsoft/Shibboleth, AMBOSS inkl. Google/Apple-Anmeldung) in-app erlauben, alles andere extern
    if (isLoginHost(url)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
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
    docView = new WebContentsView({ webPreferences: { partition: 'doc-viewer', sandbox: true, contextIsolation: true } })
    const wc = docView.webContents
    // Der Viewer darf nie wegnavigieren (z. B. durch Drag&Drop oder Links im Dokument)
    wc.on('will-navigate', (e, url) => {
      if (url !== docUrl) e.preventDefault()
    })
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url)
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
