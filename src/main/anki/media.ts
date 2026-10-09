import { BrowserWindow, app, dialog, net, protocol } from 'electron'
import { copyFile, mkdir, stat } from 'fs/promises'
import { basename, join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'

export const mediaRoot = () => join(app.getPath('userData'), 'anki', 'media')

/** Muss vor app.whenReady() aufgerufen werden. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'unihub-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
  ])
}

export const safeFileName = (name: string) => basename(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200) || 'datei'

async function exists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

/** Pfad einer Mediendatei; fällt auf den Ordner "own" (eigene Bilder) zurück. */
export async function resolveMedia(ns: string, name: string): Promise<string | null> {
  if (!/^[a-z0-9]{1,32}$/.test(ns) || safeFileName(name) !== name) return null
  for (const dir of [ns, 'own']) {
    const base = resolve(mediaRoot(), dir)
    const file = resolve(base, name)
    if (file.startsWith(base + sep) && (await exists(file))) return file
  }
  return null
}

export function registerMediaHandler(): void {
  protocol.handle('unihub-media', async (req) => {
    const url = new URL(req.url)
    let name: string
    try {
      name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const file = await resolveMedia(url.hostname, name)
    if (!file) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).href)
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'access-control-allow-origin': '*' }
    })
  })
}

/** Bild auswählen und in den Ordner für eigene Medien kopieren; liefert den Dateinamen. */
export async function addImage(win: BrowserWindow): Promise<string | null> {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Bild einfügen',
    properties: ['openFile'],
    filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  })
  if (pick.canceled || !pick.filePaths[0]) return null
  const dir = join(mediaRoot(), 'own')
  await mkdir(dir, { recursive: true })
  const name = `${Date.now().toString(36)}-${safeFileName(pick.filePaths[0])}`.replace(/\s+/g, '_')
  await copyFile(pick.filePaths[0], join(dir, name))
  return name
}
