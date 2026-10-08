import { BrowserWindow, app, dialog, shell, type Session } from 'electron'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'fs/promises'
import { basename, extname, join, relative, resolve } from 'path'
import { getDb } from '../db'
import { showFile } from '../views'
import { IMAGE_EXTS, NATIVE_VIEW_EXTS, docxHtml, extOf, extractText, pptxSlides } from './extract'
import type { DocPreview, DocSearchHit, DocUpdate, DocumentItem } from '@shared/ipc'
import type { Bounds } from '@shared/ipc'

const DOCS_ROOT = () => join(app.getPath('userData'), 'docs')
const LIBRARY_DIR = () => join(DOCS_ROOT(), 'library')

/** Dateitypen, die der Hub annimmt (durchsuchbar oder zumindest verwaltbar) */
const IMPORT_EXTS = new Set(['pdf', 'docx', 'pptx', 'doc', 'ppt', 'xls', 'xlsx', 'odt', 'odp', 'rtf', ...NATIVE_VIEW_EXTS])

interface Row {
  id: number
  title: string
  filename: string
  path: string
  ext: string
  size: number
  folder: string | null
  tags: string
  added_at: string
  has_text: number
}

const parseTags = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean)
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.replace(/,/g, ' ').trim()).filter(Boolean))]

const toItem = (r: Row): DocumentItem => ({
  id: r.id,
  title: r.title,
  filename: r.filename,
  ext: r.ext,
  size: r.size,
  folder: r.folder,
  tags: parseTags(r.tags),
  addedAt: r.added_at,
  hasText: !!r.has_text
})

/** Titel, Ordner und Tags zusammen durchsuchbar machen */
const ftsTitle = (title: string, folder: string | null, tags: string) => [title, folder, tags.split(',').join(' ')].filter(Boolean).join(' ')

function row(id: number): Row {
  const r = getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as unknown as Row | undefined
  if (!r) throw new Error('Dokument nicht gefunden')
  return r
}

export function list(): DocumentItem[] {
  return (getDb().prepare('SELECT * FROM documents ORDER BY added_at DESC, id DESC').all() as unknown as Row[]).map(toItem)
}

async function uniqueTarget(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  for (let i = 0; ; i++) {
    const candidate = join(dir, i === 0 ? name : `${stem} (${i})${ext}`)
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
}

/** Legt das Dokument an (oder aktualisiert es, wenn der Pfad schon bekannt ist) und indiziert den Text. */
async function index(path: string, folder: string | null): Promise<number> {
  const db = getDb()
  const st = await stat(path)
  const filename = basename(path)
  const ext = extOf(filename)
  const content = await extractText(path, ext)
  const existing = db.prepare('SELECT * FROM documents WHERE path = ?').get(path) as unknown as Row | undefined

  if (existing) {
    db.prepare('UPDATE documents SET size = ?, has_text = ? WHERE id = ?').run(st.size, content ? 1 : 0, existing.id)
    db.prepare('UPDATE docs_fts SET content = ? WHERE rowid = ?').run(content, existing.id)
    return existing.id
  }
  const title = basename(filename, extname(filename))
  const res = db
    .prepare('INSERT INTO documents (title,filename,path,ext,size,folder,has_text) VALUES (?,?,?,?,?,?,?)')
    .run(title, filename, path, ext, st.size, folder, content ? 1 : 0)
  const id = Number(res.lastInsertRowid)
  db.prepare('INSERT INTO docs_fts (rowid,title,content) VALUES (?,?,?)').run(id, ftsTitle(title, folder, ''), content)
  return id
}

/** Für bereits im App-Ordner liegende Dateien – ohne Kopie. */
export async function registerExisting(path: string, folder: string | null): Promise<void> {
  await index(path, folder)
}

async function importOne(src: string, folder: string | null): Promise<number> {
  const ext = extOf(src)
  if (!IMPORT_EXTS.has(ext)) return 0
  const dir = LIBRARY_DIR()
  await mkdir(dir, { recursive: true })
  const target = await uniqueTarget(dir, basename(src))
  await copyFile(src, target)
  await index(target, folder)
  return 1
}

async function importPath(p: string, folder: string | null, depth = 0): Promise<number> {
  const st = await stat(p)
  if (!st.isDirectory()) return importOne(p, folder)
  if (depth > 5) return 0
  // Ordner werden rekursiv übernommen; oberster Ordnername wird zum Hub-Ordner
  const target = folder ?? basename(p)
  let n = 0
  for (const entry of await readdir(p, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    n += await importPath(join(p, entry.name), target, depth + 1)
  }
  return n
}

export async function importPaths(paths: string[], folder: string | null): Promise<number> {
  let n = 0
  for (const p of paths) {
    try {
      n += await importPath(p, folder?.trim() || null)
    } catch (e) {
      console.warn('Import fehlgeschlagen:', p, e)
    }
  }
  return n
}

/**
 * Leitet Downloads einer Web-Sitzung (Exchange, lehre) in den Doc-Hub um.
 * Dateitypen, die der Hub nicht annimmt, laufen weiter über den normalen Speichern-Dialog.
 */
export function captureDownloads(ses: Session, win: BrowserWindow, folder: string): void {
  ses.on('will-download', (_e, item) => {
    const name = item.getFilename()
    if (!IMPORT_EXTS.has(extOf(name))) return
    void (async () => {
      const dir = await mkdtemp(join(app.getPath('temp'), 'uni-hub-dl-'))
      const tmp = join(dir, basename(name))
      item.setSavePath(tmp)
      item.once('done', async (_ev, state) => {
        try {
          if (state === 'completed' && (await importPaths([tmp], folder)) > 0 && !win.isDestroyed()) {
            win.webContents.send('docs:imported', { filename: name, folder })
          }
        } catch (err) {
          console.warn('Download-Import fehlgeschlagen:', name, err)
        } finally {
          rm(dir, { recursive: true, force: true }).catch(() => {})
        }
      })
    })()
  })
}

export async function importDialog(win: BrowserWindow, folder: string | null): Promise<number> {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Dokumente importieren',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Dokumente', extensions: [...IMPORT_EXTS] },
      { name: 'Alle Dateien', extensions: ['*'] }
    ]
  })
  if (pick.canceled) return 0
  return importPaths(pick.filePaths, folder)
}

export function update(id: number, patch: DocUpdate): void {
  const title = patch.title.trim()
  if (!title) throw new Error('Titel darf nicht leer sein')
  const folder = patch.folder?.trim() || null
  const tags = cleanTags(patch.tags).join(',')
  const db = getDb()
  row(id)
  db.prepare('UPDATE documents SET title = ?, folder = ?, tags = ? WHERE id = ?').run(title, folder, tags, id)
  db.prepare('UPDATE docs_fts SET title = ? WHERE rowid = ?').run(ftsTitle(title, folder, tags), id)
}

export async function remove(id: number): Promise<void> {
  const r = row(id)
  const db = getDb()
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  db.prepare('DELETE FROM docs_fts WHERE rowid = ?').run(id)
  // Nur Dateien im App-Datenordner löschen – nie Originale an anderen Orten
  const rel = relative(DOCS_ROOT(), resolve(r.path))
  if (!rel.startsWith('..') && !rel.includes(':')) await rm(r.path, { force: true })
}

export function search(query: string): DocSearchHit[] {
  const tokens = query.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const match = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ')
  const rows = getDb()
    .prepare(
      `SELECT rowid AS id, snippet(docs_fts, -1, char(1), char(2), '…', 14) AS snippet
       FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT 200`
    )
    .all(match) as unknown as DocSearchHit[]
  return rows.map((r) => ({ id: Number(r.id), snippet: r.snippet }))
}

export async function preview(id: number): Promise<DocPreview> {
  const r = row(id)
  if (NATIVE_VIEW_EXTS.has(r.ext)) return { kind: 'native' }
  if (r.ext === 'docx') return { kind: 'html', html: await docxHtml(r.path) }
  if (r.ext === 'pptx') return { kind: 'slides', slides: pptxSlides(await readFile(r.path)) }
  return { kind: 'external' }
}

export function showView(win: BrowserWindow, id: number, bounds: Bounds): void {
  const r = row(id)
  if (!NATIVE_VIEW_EXTS.has(r.ext) && !IMAGE_EXTS.has(r.ext)) return
  showFile(win, r.path, bounds)
}

export async function openExternal(id: number): Promise<void> {
  const err = await shell.openPath(row(id).path)
  if (err) throw new Error(err)
}

export function reveal(id: number): void {
  shell.showItemInFolder(row(id).path)
}
