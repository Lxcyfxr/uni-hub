import { app } from 'electron'
import { openExternalSafe } from './links'

const ISSUES_URL = 'https://github.com/Lxcyfxr/uni-hub/issues/new'
const MAX_TITLE = 200
const MAX_BODY = 6000
/** GitHub und Browser vertragen Adressen nur bis etwa 8000 Zeichen */
const MAX_URL = 7500

/** Technische Angaben ohne persönliche Daten (keine Pfade, keine Inhalte). */
export function diagnostics(): string {
  return [
    `Uni-Hub: ${app.getVersion()}${app.isPackaged ? '' : ' (Entwicklung)'}`,
    `Windows: ${process.getSystemVersion()} (${process.arch})`,
    `Electron: ${process.versions.electron}, Chromium ${process.versions.chrome}`
  ].join('\n')
}

/** Adresse eines vorausgefüllten GitHub-Issues; wirft bei ungültigen oder zu langen Eingaben. */
export function buildIssueUrl(title: unknown, body: unknown): string {
  if (typeof title !== 'string' || typeof body !== 'string') throw new Error('Ungültige Eingabe')
  const t = title.trim()
  if (!t) throw new Error('Bitte gib einen Titel ein')
  if (t.length > MAX_TITLE) throw new Error(`Der Titel ist zu lang (höchstens ${MAX_TITLE} Zeichen)`)
  if (body.length > MAX_BODY) throw new Error(`Die Beschreibung ist zu lang (höchstens ${MAX_BODY} Zeichen)`)
  const url = `${ISSUES_URL}?title=${encodeURIComponent(t)}&body=${encodeURIComponent(body)}`
  if (url.length > MAX_URL) throw new Error('Der Text ist zu lang für die Weiterleitung. Bitte kürze die Beschreibung.')
  return url
}

/** Öffnet GitHub im Standardbrowser mit dem vorbereiteten Issue; abgeschickt wird erst dort vom Nutzer. */
export function openIssue(title: unknown, body: unknown): void {
  if (!openExternalSafe(buildIssueUrl(title, body))) throw new Error('Der Link konnte nicht geöffnet werden')
}
