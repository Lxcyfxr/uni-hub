import { BrowserWindow, shell, type WebContents } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { isAppUrl, isLoginPopup, isSafeExternalUrl, isWebNavigation } from '@shared/urls'

const schemeOf = (url: string) => {
  try {
    return new URL(url).protocol
  } catch {
    return 'ungültig'
  }
}

/**
 * Übergibt eine Adresse an den Standardbrowser – aber nur https. Webseiten und Dokumente dürfen so nie
 * Windows-Protokollhandler anstoßen (file:, smb:, ms-msdt:, search-ms: …). Protokolliert wird nur das Schema, nie die Adresse.
 */
export function openExternalSafe(url: string): boolean {
  if (!isSafeExternalUrl(url)) {
    console.warn(`[Link] blockiert (Schema ${schemeOf(url)})`)
    return false
  }
  void shell.openExternal(url)
  return true
}

/**
 * Das Hauptfenster (mit Preload-Schnittstelle) darf nur seine eigene Oberfläche zeigen. Alles andere – auch
 * file://-Adressen, etwa nach einem Drag&Drop – wird nicht geladen; https-Ziele öffnen im Standardbrowser.
 */
export function lockMainWindow(win: BrowserWindow): void {
  const wc = win.webContents
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const fileUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href
  wc.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  const guard = (details: { url: string; preventDefault(): void }) => {
    if (isAppUrl(details.url, { devUrl, fileUrl })) return
    details.preventDefault()
    openExternalSafe(details.url)
  }
  wc.on('will-navigate', guard)
  wc.on('will-redirect', guard)
}

/**
 * Eingebettete Webseiten (Dienst-Tabs): Anmelde-Popups dürfen in der App bleiben, alle anderen neuen Fenster öffnen
 * im Standardbrowser. Die Seite selbst darf nie auf file: oder Programm-Schemata navigieren (auch nicht per Weiterleitung).
 */
export function guardServiceView(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isLoginPopup(url)) return { action: 'allow' }
    openExternalSafe(url)
    return { action: 'deny' }
  })
  const guard = (details: { url: string; preventDefault(): void }) => {
    if (isWebNavigation(details.url)) return
    details.preventDefault()
    console.warn(`[Navigation] blockiert (Schema ${schemeOf(details.url)})`)
  }
  wc.on('will-navigate', guard)
  wc.on('will-redirect', guard)
  // Das Anmelde-Popup bekommt dieselben Regeln (auch verschachtelte Popups)
  wc.on('did-create-window', (child) => guardServiceView(child.webContents))
}
