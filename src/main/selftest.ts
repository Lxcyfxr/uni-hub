import { app, BrowserWindow, safeStorage } from 'electron'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { zstdCompressSync, zstdDecompressSync } from 'zlib'
import { strToU8, zipSync } from 'fflate'
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs'
import { getDb } from './db'
import { backupDatabase, integrityCheck } from './backup'
import { parseIcs } from './calendar/ical'
import { docxHtml, extractText, pptxSlides } from './docs/extract'
import { resolveMedia } from './anki/media'
import { SECURE_WEB_PREFERENCES } from './security'
import { isSafeExternalUrl } from '@shared/urls'
import { renderCard } from '@shared/anki-render'

interface Result {
  name: string
  ok: boolean
  detail: string
}

const need = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg)
}

function samplePdf(text: string): Buffer {
  const objs: string[] = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ]
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
  objs[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

const sampleDocx = () =>
  Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Musculus biceps brachii</w:t></w:r></w:p></w:body></w:document>')
    })
  )

const samplePptx = () =>
  Buffer.from(
    zipSync({
      'ppt/slides/slide1.xml': strToU8('<p:sld><a:p><a:r><a:t>Titelfolie</a:t></a:r></a:p></p:sld>'),
      'ppt/slides/slide2.xml': strToU8('<p:sld><a:p><a:r><a:t>Zweite Folie</a:t></a:r></a:p></p:sld>')
    })
  )

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//selftest//DE
BEGIN:VEVENT
UID:a1
SUMMARY:Vorlesung
DTSTART;TZID=Europe/Berlin:20261012T080000
DTEND;TZID=Europe/Berlin:20261012T094500
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:a2
SUMMARY:Feiertag
DTSTART;VALUE=DATE:20261103
DTEND;VALUE=DATE:20261104
END:VEVENT
END:VCALENDAR`

const CHECKS: { name: string; run: (dir: string) => Promise<string> | string }[] = [
  {
    name: 'Datenbank, Migrationen und Volltextsuche (FTS5)',
    run: () => {
      const db = getDb()
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as { name: string }[]).map((t) => t.name)
      for (const t of ['todos', 'todo_categories', 'calendar_events', 'documents', 'docs_fts', 'study_sessions', 'anki_cards']) need(tables.includes(t), `Tabelle ${t} fehlt`)
      db.prepare('INSERT INTO docs_fts (rowid,title,content) VALUES (1,?,?)').run('Test', 'Herzinsuffizienz Therapie')
      const hit = db.prepare("SELECT rowid FROM docs_fts WHERE docs_fts MATCH '\"herzinsuff\"*'").get()
      need(hit, 'FTS5-Suche liefert nichts')
      db.prepare('DELETE FROM docs_fts WHERE rowid = 1').run()
      const v = (db.prepare('PRAGMA user_version').get() as unknown as { user_version: number }).user_version
      return `Schema-Version ${v}, ${tables.length} Tabellen`
    }
  },
  {
    name: 'Integritätsprüfung und Sicherung (VACUUM INTO)',
    run: () => {
      need(integrityCheck() === 'ok', 'Integritätsprüfung nicht ok')
      return `Sicherung: ${backupDatabase(true)}`
    }
  },
  {
    name: 'PDF-Text auslesen (pdf.js, ESM aus dem Paket)',
    run: async (dir) => {
      const f = join(dir, 't.pdf')
      writeFileSync(f, samplePdf('Herzinsuffizienz Therapie'))
      const text = await extractText(f, 'pdf')
      need(text.includes('Herzinsuffizienz'), `Unerwarteter Text: "${text}"`)
      return text
    }
  },
  {
    name: 'DOCX lesen (mammoth)',
    run: async (dir) => {
      const f = join(dir, 't.docx')
      writeFileSync(f, sampleDocx())
      need((await extractText(f, 'docx')).includes('Musculus'), 'Text fehlt')
      need((await docxHtml(f)).includes('<p>'), 'HTML fehlt')
      return 'Text und HTML ok'
    }
  },
  {
    name: 'PPTX lesen (fflate)',
    run: async (dir) => {
      const f = join(dir, 't.pptx')
      const buf = samplePptx()
      writeFileSync(f, buf)
      const slides = pptxSlides(buf)
      need(slides.length === 2 && slides[1] === 'Zweite Folie', 'Folien falsch')
      need((await extractText(f, 'pptx')).includes('Titelfolie'), 'Text fehlt')
      return `${slides.length} Folien`
    }
  },
  {
    name: 'iCal lesen inkl. Wiederholungen (node-ical)',
    run: () => {
      const events = parseIcs(ICS)
      const lecture = events.filter((e) => e.title === 'Vorlesung')
      need(lecture.length === 3, `${lecture.length} statt 3 Vorlesungen`)
      const holiday = events.find((e) => e.title === 'Feiertag')
      need(holiday?.allDay && holiday.start === '2026-11-03', `Ganztägig falsch: ${holiday?.start}`)
      return `${events.length} Termine`
    }
  },
  {
    name: 'Lernalgorithmus (ts-fsrs)',
    run: () => {
      const rec = fsrs(generatorParameters({ enable_fuzz: false })).repeat(createEmptyCard(new Date()), new Date())
      need(rec[Rating.Easy].card.scheduled_days > 0, 'Kein Intervall')
      return `Easy → ${rec[Rating.Easy].card.scheduled_days} Tage`
    }
  },
  {
    name: 'Karten rendern (Lückentext)',
    run: () => {
      const r = renderCard({ kind: 'cloze', fields: ['Text'], css: '', templates: [{ name: 'c', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }] }, ['Der {{c1::Bizeps}} beugt'], 0)
      need(r.question.includes('[...]') && r.answer.includes('Bizeps'), 'Rendering falsch')
      return r.question
    }
  },
  {
    name: 'zstd (neues Anki-Format)',
    run: () => {
      const back = zstdDecompressSync(zstdCompressSync(Buffer.from('Anki')))
      need(back.toString() === 'Anki', 'Round-Trip fehlgeschlagen')
      return 'ok'
    }
  },
  {
    name: 'Sicherheit: Fenster sind ausdrücklich gehärtet (Isolation, Sandbox, kein Node, keine Webview)',
    run: async () => {
      // Die Einstellungen selbst ...
      const p = SECURE_WEB_PREFERENCES
      need(p.contextIsolation === true && p.sandbox === true, 'Isolation/Sandbox fehlen')
      need(p.nodeIntegration === false && p.nodeIntegrationInWorker === false && p.nodeIntegrationInSubFrames === false, 'Node-Integration nicht aus')
      need(p.webSecurity === true && p.allowRunningInsecureContent === false && p.experimentalFeatures === false, 'Web-Sicherheit geschwächt')
      need(p.webviewTag === false, 'webview-Tag erlaubt')
      // ... und ihre Wirkung in einem echten Fenster: kein require/process, kein funktionierender <webview>
      const win = new BrowserWindow({ show: false, webPreferences: { ...SECURE_WEB_PREFERENCES } })
      try {
        await win.loadURL('about:blank')
        const seen = JSON.parse(
          await win.webContents.executeJavaScript(
            "JSON.stringify({ require: typeof require, process: typeof process, webview: typeof document.createElement('webview').getWebContentsId })"
          )
        ) as Record<string, string>
        need(seen.require === 'undefined' && seen.process === 'undefined', `Node im Fenster sichtbar: ${JSON.stringify(seen)}`)
        need(seen.webview === 'undefined', '<webview> funktioniert')
        return JSON.stringify(seen)
      } finally {
        win.destroy()
      }
    }
  },
  {
    name: 'Sicherheit: Medien-Protokoll und externe Links weisen Pfad- und Schematricks ab',
    run: async () => {
      for (const bad of ['..\\..\\x', '../x', 'a/b', 'C:\\Windows\\win.ini', '']) need((await resolveMedia('own', bad)) === null, `Pfadtrick akzeptiert: ${bad}`)
      for (const ns of ['..', 'a/b', 'OWN', '']) need((await resolveMedia(ns, 'x.png')) === null, `Namensraum akzeptiert: ${ns}`)
      for (const bad of ['file:///C:/x', 'smb://x/y', 'ms-msdt:x', 'http://x.de', 'https://u:p@x.de']) need(!isSafeExternalUrl(bad), `Link akzeptiert: ${bad}`)
      need(isSafeExternalUrl('https://example.org/'), 'https wurde abgelehnt')
      return 'ok'
    }
  },
  {
    name: 'Sicherheit: Gebaute Oberfläche hat eine strenge CSP (kein unsafe-eval, keine Fremdquellen)',
    run: () => {
      // Installiert liegt die Oberfläche im Archiv; in der Entwicklung unter out/
      const html = readFileSync(join(app.getAppPath(), 'out', 'renderer', 'index.html'), 'utf8')
      const csp = (html.match(/Content-Security-Policy"\s+content="([^"]+)"/) ?? [])[1] ?? ''
      need(csp.includes("default-src 'self'"), 'default-src fehlt')
      need(!csp.includes('unsafe-eval'), "'unsafe-eval' erlaubt")
      need(!/(https?:|\s\*)/.test(csp), 'Fremdquellen in der CSP')
      return csp
    }
  },
  {
    name: 'Windows-Verschlüsselung für Sitzungen (DPAPI)',
    run: () => {
      need(safeStorage.isEncryptionAvailable(), 'safeStorage nicht verfügbar')
      return 'verfügbar'
    }
  }
]

/** Läuft ohne Fenster und schreibt das Ergebnis als JSON; true = alle Prüfungen bestanden. */
export async function runSelfTest(outFile: string): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'unihub-selftest-files-'))
  const results: Result[] = []
  for (const c of CHECKS) {
    try {
      results.push({ name: c.name, ok: true, detail: await c.run(dir) })
    } catch (e) {
      results.push({ name: c.name, ok: false, detail: String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ') })
    }
  }
  const ok = results.every((r) => r.ok)
  writeFileSync(
    outFile,
    JSON.stringify(
      { ok, version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, node: process.versions.node, results },
      null,
      2
    )
  )
  return ok
}
