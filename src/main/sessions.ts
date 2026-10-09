import { app, session, type Cookie, type Session } from 'electron'

/** So lange bleibt eine Anmeldung in der App gespeichert, sofern der Server die Sitzung nicht früher beendet. */
const LIFETIME_SECONDS = 30 * 24 * 60 * 60

/**
 * Chromium verwirft Cookies ohne Ablaufdatum ("Sitzungs-Cookies") beim Beenden. Viele Logins
 * (Microsoft, Shibboleth/SSO) nutzen genau solche Cookies – man müsste sich nach jedem Neustart neu anmelden.
 * Deshalb wird jedes Sitzungs-Cookie dieser Partition mit einem Ablaufdatum neu gesetzt.
 * Das Setzen löst erneut "changed" aus; da das Cookie dann ein Ablaufdatum hat, endet die Kette dort.
 */
export function persistSessionCookies(ses: Session): void {
  ses.cookies.on('changed', (_event, cookie: Cookie, _cause, removed) => {
    if (removed || !cookie.session || !cookie.domain) return
    const host = cookie.domain.replace(/^\./, '')
    ses.cookies
      .set({
        url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`,
        name: cookie.name,
        value: cookie.value,
        // Host-Cookies dürfen kein Domain-Attribut bekommen, sonst würden sie auf Unterdomänen ausgeweitet
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        path: cookie.path ?? '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: Math.floor(Date.now() / 1000) + LIFETIME_SECONDS
      })
      .catch((err) => console.warn(`Cookie ${cookie.name} konnte nicht dauerhaft gespeichert werden:`, err))
  })
}

/** Cookies und Speicher der Partitionen beim Beenden sicher auf die Platte schreiben. */
export function flushSessionsOnQuit(partitions: string[]): void {
  let flushed = false
  app.on('before-quit', (event) => {
    if (flushed) return
    flushed = true
    event.preventDefault()
    const done = () => app.quit()
    // Falls das Schreiben hängt, trotzdem beenden
    const timeout = setTimeout(done, 3000)
    Promise.all(
      partitions.map(async (p) => {
        const ses = session.fromPartition(p)
        ses.flushStorageData()
        await ses.cookies.flushStore()
      })
    )
      .catch((err) => console.warn('Sitzungen konnten nicht gesichert werden:', err))
      .finally(() => {
        clearTimeout(timeout)
        done()
      })
  })
}
