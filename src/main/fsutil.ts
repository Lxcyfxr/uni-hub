import { rename, rm, writeFile } from 'fs/promises'

/**
 * Schreibt erst in eine Nebendatei und benennt sie dann um. Bricht das Schreiben ab (Datenträger voll,
 * App beendet), bleibt eine bereits vorhandene Zieldatei unversehrt und es entsteht keine halbe Datei.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  try {
    await writeFile(tmp, data)
    await rename(tmp, path)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}
