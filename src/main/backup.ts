import { app, dialog } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb } from './db'

/** So viele tägliche Sicherungen bleiben erhalten */
const KEEP = 7

export const backupsDir = () => join(app.getPath('userData'), 'backups')

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Konsistente Kopie der laufenden Datenbank (VACUUM INTO); höchstens eine pro Tag, außer force. */
export function backupDatabase(force = false): string {
  const dir = backupsDir()
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `unihub-${today()}.db`)
  if (!force && existsSync(target)) return target
  const tmp = `${target}.tmp`
  rmSync(tmp, { force: true })
  getDb().prepare('VACUUM INTO ?').run(tmp)
  rmSync(target, { force: true })
  renameSync(tmp, target)

  const old = readdirSync(dir)
    .filter((f) => /^unihub-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP)
  for (const f of old) rmSync(join(dir, f), { force: true })
  return target
}

export function lastBackup(): string | null {
  try {
    const files = readdirSync(backupsDir()).filter((f) => /^unihub-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
    return files.length ? files[files.length - 1].slice('unihub-'.length, -'.db'.length) : null
  } catch {
    return null
  }
}

/** 'ok' oder die Fehlermeldung von SQLite */
export function integrityCheck(): string {
  const rows = getDb().prepare('PRAGMA quick_check').all() as unknown as Record<string, string>[]
  const msgs = rows.map((r) => Object.values(r)[0])
  return msgs.length === 1 && msgs[0] === 'ok' ? 'ok' : msgs.slice(0, 5).join('; ')
}

/**
 * Beim Start: Datenbank prüfen und – nur wenn sie in Ordnung ist – die Tagessicherung anlegen,
 * damit eine beschädigte Datenbank keine gute Sicherung überschreibt.
 */
export function runStartupChecks(): void {
  try {
    const result = integrityCheck()
    if (result !== 'ok') {
      console.error('[Datenbank] Integritätsprüfung fehlgeschlagen:', result)
      dialog.showErrorBox(
        'Datenbank beschädigt',
        `Die Datenbank von Uni-Hub meldet Fehler:\n${result}\n\nTägliche Sicherungen liegen hier:\n${backupsDir()}\n\nBeende Uni-Hub und kopiere eine Sicherung als unihub.db in den Datenordner zurück.`
      )
      return
    }
    backupDatabase()
  } catch (e) {
    console.error('[Datenbank] Sicherung fehlgeschlagen:', e)
  }
}
