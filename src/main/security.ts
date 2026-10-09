import { app, session, type Session, type WebPreferences } from 'electron'

/**
 * Sicherheitseinstellungen, die für jedes Fenster und jede eingebettete Ansicht ausdrücklich gesetzt werden
 * (auch dort, wo Electron dieselben Werte schon als Standard hat – so bleibt es bei künftigen Änderungen sicher).
 */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  safeDialogs: true,
  navigateOnDragDrop: false
} satisfies WebPreferences

/**
 * Berechtigungen, die Webseiten in den Dienst-Tabs (Exchange, lehre.charite, AMBOSS, MOSES) anfordern dürfen.
 * Alles andere – Kamera, Mikrofon, Standort, Sensoren, Programmstart per Link … – wird abgelehnt.
 */
const ALLOWED = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write'])

export function applyPermissionPolicy(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const ok = ALLOWED.has(permission)
    // Nur der Rechnername ins Protokoll: vollständige Adressen können Tokens oder persönliche Angaben enthalten
    if (!ok) console.warn(`[Berechtigung] abgelehnt: ${permission} (${hostOf(details.requestingUrl)})`)
    callback(ok)
  })
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission))
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return 'unbekannt'
  }
}

/** Vor app.whenReady() aufrufen; erfasst auch später angelegte Partitionen. */
export function hardenSessions(): void {
  app.on('session-created', applyPermissionPolicy)
  app.on('web-contents-created', (_e, wc) => {
    // <webview>-Tags werden nicht verwendet und dürfen nicht eingeschleust werden
    wc.on('will-attach-webview', (event) => event.preventDefault())
    if (app.isPackaged) wc.on('devtools-opened', () => wc.closeDevTools())
  })
  app.whenReady().then(() => applyPermissionPolicy(session.defaultSession))
}
