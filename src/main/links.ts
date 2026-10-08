import { BrowserWindow, shell } from 'electron'

const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

/**
 * Links in der App-Oberfläche (z. B. GitHub-Verweis in den Einstellungen) öffnen im Standardbrowser,
 * statt ein neues App-Fenster zu erzeugen oder das Hauptfenster wegzunavigieren.
 */
export function openLinksExternally(win: BrowserWindow): void {
  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (event, url) => {
    // Die eigene Oberfläche (Dev-Server bzw. lokale Datei) darf sich neu laden, fremde Webadressen nicht
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!isWebUrl(url) || (devUrl && url.startsWith(devUrl))) return
    event.preventDefault()
    void shell.openExternal(url)
  })
}
