import { readFile } from 'fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import mammoth from 'mammoth'

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

async function pdfText(buf: Buffer): Promise<string> {
  // pdfjs ist ESM; dynamischer Import hält es aus dem CJS-Main-Bundle heraus
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 })
  const doc = await task.promise
  try {
    const pages: string[] = []
    const n = Math.min(doc.numPages, MAX_PDF_PAGES)
    for (let i = 1; i <= n; i++) {
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

export function pptxSlides(buf: Buffer): string[] {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) })
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
  return (await mammoth.convertToHtml({ path: file })).value
}

/** Volltext für den Suchindex; leer, wenn das Format keinen Text hergibt. */
export async function extractText(file: string, ext: string): Promise<string> {
  try {
    let text = ''
    if (ext === 'pdf') text = await pdfText(await readFile(file))
    else if (ext === 'docx') text = (await mammoth.extractRawText({ path: file })).value
    else if (ext === 'pptx') text = pptxSlides(await readFile(file)).join('\n')
    else if (TEXT_EXTS.has(ext)) text = await readFile(file, 'utf8')
    return text.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS)
  } catch (e) {
    console.warn(`Textextraktion fehlgeschlagen (${file}):`, e)
    return ''
  }
}
