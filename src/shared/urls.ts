/**
 * Adressprüfungen für Navigation und das Öffnen externer Programme.
 * Reine Funktionen ohne Electron-Abhängigkeit, damit sie sich testen lassen.
 */

/**
 * Nur https darf an den Standardbrowser übergeben werden. Alles andere (file:, smb:, ms-msdt:, javascript: …)
 * würde über Windows-Protokollhandler Programme oder Netzwerkfreigaben anstoßen.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.length > 0 && !u.username && !u.password
  } catch {
    return false
  }
}

/** Seiten, die ein Dienst-Tab im Browser-Verlauf besuchen darf (kein file:, keine Programmaufrufe). */
export function isWebNavigation(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === 'https:' || p === 'http:'
  } catch {
    return false
  }
}

/** Domains, deren Anmelde-Popups (Single Sign-on) in der App bleiben dürfen. */
export const LOGIN_HOSTS = ['login.microsoftonline.com', 'charite.de', 'amboss.com', 'accounts.google.com', 'appleid.apple.com']

export function isLoginPopup(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && LOGIN_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

/**
 * Ist das die eigene Oberfläche? Entwicklung: der Vite-Server; installiert: genau die gebündelte index.html.
 * Fragment (#) und Query dürfen abweichen, der Pfad nicht.
 */
export function isAppUrl(url: string, opts: { devUrl?: string; fileUrl: string }): boolean {
  try {
    const u = new URL(url)
    if (opts.devUrl) {
      const dev = new URL(opts.devUrl)
      return u.origin === dev.origin
    }
    const app = new URL(opts.fileUrl)
    return u.protocol === 'file:' && decodeURIComponent(u.pathname).toLowerCase() === decodeURIComponent(app.pathname).toLowerCase()
  } catch {
    return false
  }
}
