import { app, dialog } from 'electron'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { format } from 'util'

const MAX_BYTES = 1_000_000
/** main.log plus zwei rotierte Dateien */
const FILES = 3
const MAX_LINE = 8000

export const logsDir = () => join(app.getPath('userData'), 'logs')
let file = ''

function rotate(): void {
  try {
    if (statSync(file).size < MAX_BYTES) return
  } catch {
    return
  }
  for (let i = FILES - 2; i >= 1; i--) {
    try {
      renameSync(`${file}.${i}`, `${file}.${i + 1}`)
    } catch {
      /* Datei existiert noch nicht */
    }
  }
  try {
    renameSync(file, `${file}.1`)
  } catch {
    rmSync(file, { force: true })
  }
}

function write(level: string, args: unknown[]): void {
  if (!file) return
  try {
    rotate()
    appendFileSync(file, `${new Date().toISOString()} [${level}] ${format(...args).slice(0, MAX_LINE)}\n`)
  } catch {
    /* Protokoll darf die App nie zum Absturz bringen */
  }
}

/** Spiegelt console.* zusätzlich in eine Protokolldatei (userData/logs/main.log). */
export function initLogging(): void {
  try {
    mkdirSync(logsDir(), { recursive: true })
    file = join(logsDir(), 'main.log')
  } catch {
    return
  }
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      write(level, args)
    }
  }
  console.info(`Start: Uni-Hub ${app.getVersion()} · Electron ${process.versions.electron} · Node ${process.versions.node} · ${app.isPackaged ? 'installiert' : 'Entwicklung'}`)
}

/**
 * Fängt Fehler ab, die sonst Electrons Standarddialog zeigen oder die App beenden würden.
 * Der Hauptfenster-Renderer wird nach einem Absturz begrenzt neu geladen.
 */
export function installCrashHandlers(getWindow: () => Electron.BrowserWindow | null): void {
  let shown = false
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err)
    if (shown || !app.isReady()) return
    shown = true
    // Keine internen Details in der Meldung (Pfade, Fehlertexte) – die stehen im Protokoll
    dialog.showErrorBox(
      'Unerwarteter Fehler',
      'Uni-Hub hat einen Fehler abgefangen und läuft weiter. Falls etwas nicht wie erwartet funktioniert, starte die App neu.\n\nEinzelheiten stehen im Protokoll (Einstellungen → Daten & Wartung).'
    )
  })
  process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason))
  app.on('child-process-gone', (_e, d) => console.error('[child-process-gone]', d.type, d.reason, d.exitCode))

  const reloads: number[] = []
  app.on('render-process-gone', (_e, wc, details) => {
    console.error('[render-process-gone]', details.reason, details.exitCode)
    const win = getWindow()
    if (!win || win.isDestroyed() || wc !== win.webContents || details.reason === 'clean-exit') return
    const now = Date.now()
    while (reloads.length && now - reloads[0] > 60_000) reloads.shift()
    if (reloads.length >= 3) return // Absturzschleife nicht endlos neu laden
    reloads.push(now)
    setTimeout(() => !wc.isDestroyed() && wc.reload(), 500)
  })
}
