import { readFile } from 'fs/promises'
import { basename, dirname, join, sep } from 'path'
import { strFromU8, unzipSync } from 'fflate'
import mammoth from 'mammoth'

/** Größere Dateien werden zwar verwaltet, aber nicht ausgelesen (Speicherbedarf beim Entpacken/Parsen) */
export const MAX_EXTRACT_BYTES = 300_000_000

/** Obergrenze für indizierten Text je Dokument (Zeichen) */
const MAX_CHARS = 2_000_000
const MAX_PDF_PAGES = 1000

export const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'csv'])
export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])
/** Formate, die im Hub durchsucht oder angezeigt werden können */
export const NATIVE_VIEW_EXTS = new Set(['pdf', ...TEXT_EXTS, ...IMAGE_EXTS])

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

export function extOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i < 0 ? '' : file.slice(i + 1).toLowerCase()
}

/** Zeichen- und Schrifttabellen, die pdf.js für nicht eingebettete Schriften (z. B. CJK) braucht */
function pdfAssetOptions(): { cMapUrl: string; cMapPacked: boolean; standardFontDataUrl: string } {
  // .../pdfjs-dist/legacy/build/pdf.mjs -> .../pdfjs-dist
  const root = dirname(dirname(dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'))))
  // pdf.js verlangt Schrägstriche und einen abschließenden "/", auch unter Windows
  const dir = (name: string) => join(root, name).split(sep).join('/') + '/'
  return { cMapUrl: dir('cmaps'), cMapPacked: true, standardFontDataUrl: dir('standard_fonts') }
}

/** Gibt anderen Aufgaben im Hauptprozess (Fenster, Timer, Erinnerungen) Gelegenheit zu laufen. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))

async function pdfText(buf: Buffer): Promise<string> {
  // pdfjs ist ESM; dynamischer Import hält es aus dem CJS-Main-Bundle heraus
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0, ...pdfAssetOptions() })
  const doc = await task.promise
  try {
    const pages: string[] = []
    const n = Math.min(doc.numPages, MAX_PDF_PAGES)
    for (let i = 1; i <= n; i++) {
      // pdf.js rechnet im Hauptprozess: bei langen Dokumenten regelmäßig abgeben, sonst friert die App ein
      if (i % 5 === 0) await yieldToEventLoop()
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      pages.push(tc.items.map((it: any) => it.str ?? '').join(' '))
      page.cleanup()
    }
    return pages.join('\n')
  } finally {
    await task.destroy()
  }
}

/**
 * DOCX/PPTX sind Zip-Dateien. Das Verzeichnis wird gelesen, ohne zu entpacken; unplausibel große oder viele Teile
 * (Zip-Bombe) werden abgelehnt, bevor mammoth sie in den Speicher lädt.
 */
export function assertZipSafe(buf: Uint8Array, maxTotal = 500_000_000, maxEntries = 20_000): void {
  let total = 0
  let count = 0
  unzipSync(buf, {
    filter: (f) => {
      total += f.originalSize
      count++
      return false
    }
  })
  if (total > maxTotal || count > maxEntries) throw new Error('Die Datei enthält unplausibel viele oder große Teile und wird nicht gelesen')
}

export function pptxSlides(buf: Buffer): string[] {
  // Einzelne Folien-XML über 20 MB werden ignoriert (normal sind wenige KB)
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) && f.originalSize <= 20_000_000 })
  return Object.keys(files)
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
    .map((name) => {
      const xml = strFromU8(files[name])
      return xml
        .split('</a:p>')
        .map((para) => [...para.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
        .filter((l) => l.trim())
        .join('\n')
    })
}

export async function docxHtml(file: string): Promise<string> {
  assertZipSafe(await readFile(file))
  return (await mammoth.convertToHtml({ path: file })).value
}

/** Volltext für den Suchindex; leer, wenn das Format keinen Text hergibt. */
export async function extractText(file: string, ext: string): Promise<string> {
  try {
    let text = ''
    if (ext === 'pdf') text = await pdfText(await readFile(file))
    else if (ext === 'docx') {
      assertZipSafe(await readFile(file))
      text = (await mammoth.extractRawText({ path: file })).value
    }
    else if (ext === 'pptx') text = pptxSlides(await readFile(file)).join('\n')
    else if (TEXT_EXTS.has(ext)) text = await readFile(file, 'utf8')
    return text.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS)
  } catch (e) {
    console.warn(`Textextraktion fehlgeschlagen (${basename(file)}):`, e)
    return ''
  }
}
