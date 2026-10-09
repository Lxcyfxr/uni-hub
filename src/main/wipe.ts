import { app, session } from 'electron'
import { rm } from 'fs/promises'
import { join } from 'path'
import { closeDb } from './db'
import { releaseDocView } from './views'
import { WEB_MODULES } from '@shared/ipc'

/** Datenbank, importierte Dokumente, Anki-Karten samt Medien und Sicherungen (das Protokoll enthält keine Nutzerdaten) */
const USER_DATA = ['unihub.db', 'unihub.db-wal', 'unihub.db-shm', 'docs', 'anki', 'backups']

export interface WipeResult {
  removed: string[]
  failed: string[]
}

/**
 * Löscht alle lokalen Nutzerdaten (DSGVO: Löschen). Reihenfolge: erst Anmeldungen und Browserdaten der Dienste,
 * dann die Datenbank schließen und sperren, dann Dateien. Danach optional Neustart.
 */
export async function wipeLocalData(opts: { relaunch: boolean }): Promise<WipeResult> {
  releaseDocView()
  const partitions = [...Object.values(WEB_MODULES).map((m) => m.partition), 'doc-viewer']
  for (const name of partitions) {
    const ses = session.fromPartition(name)
    await ses.clearStorageData()
    await ses.clearCache()
    await ses.clearAuthCache()
  }
  await session.defaultSession.clearStorageData()

  // Ab hier gesperrt: Zeitgeber im Hintergrund (Erinnerungen, Kalender-Sync) dürfen die Datenbank nicht neu anlegen
  closeDb()
  // Windows gibt Dateien der Dokumentansicht erst kurz nach dem Loslassen frei
  await new Promise((resolve) => setTimeout(resolve, 300))

  const root = app.getPath('userData')
  const result: WipeResult = { removed: [], failed: [] }
  for (const name of USER_DATA) {
    try {
      await rm(join(root, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      result.removed.push(name)
    } catch (e) {
      console.error(`[Löschen] ${name} konnte nicht entfernt werden:`, e)
      result.failed.push(name)
    }
  }
  console.info(`[Löschen] fertig: ${result.removed.length} entfernt, ${result.failed.length} fehlgeschlagen`)
  if (opts.relaunch) {
    app.relaunch()
    app.exit(0)
  }
  return result
}
