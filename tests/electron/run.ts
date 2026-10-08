/**
 * Sicherheitstests im echten Electron (Navigation, Popups, Berechtigungen, Absenderprüfung, Medien-Protokoll, Löschen).
 * Start: npm run test:electron   (baut dieses Skript mit esbuild und führt es in Electron aus)
 */
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import http from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import { join } from 'node:path'
import { getDb } from '../../src/main/db'
import { createGuardedHandle } from '../../src/main/ipc'
import { guardServiceView, lockMainWindow } from '../../src/main/links'
import { mediaRoot, registerMediaHandler, registerMediaScheme } from '../../src/main/anki/media'
import { SECURE_WEB_PREFERENCES, applyPermissionPolicy } from '../../src/main/security'
import { exportDeck } from '../../src/main/anki/export'
import { LIMITS, importApkg } from '../../src/main/anki/import'
import * as ankiSched from '../../src/main/anki/sched'
import * as ankiStore from '../../src/main/anki/store'
import { addUrlSource, saveEvent } from '../../src/main/calendar/ical'
import { assertZipSafe } from '../../src/main/docs/extract'
import { wipeLocalData } from '../../src/main/wipe'

// Das Schema muss vor "ready" registriert werden
registerMediaScheme()

// Die Tests öffnen und schließen Fenster: Electron darf dabei nicht von selbst beenden
app.on('window-all-closed', () => {})

interface Result {
  name: string
  ok: boolean
  detail: string
}
const results: Result[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function test(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: (await fn()) || '' })
  } catch (e) {
    results.push({ name, ok: false, detail: String((e as Error)?.message ?? e) })
  }
}

const expect = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg)
}

/** JavaScript ausführen, ohne auf Navigation zu warten (executeJavaScript hängt, wenn die Seite wegnavigiert) */
const run = (wc: Electron.WebContents, code: string) => Promise.race([wc.executeJavaScript(code), sleep(600).then(() => undefined)]).catch(() => undefined)

app.whenReady().then(async () => {
  const userData = mkdtempSync(join(tmpdir(), 'unihub-electron-test-'))
  app.setPath('userData', userData)

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html><body>Testseite</body></html>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`

  // Hinweis: Das Hauptfenster erkennt im Entwicklungsmodus den Vite-Server als „eigene Oberfläche“
  process.env['ELECTRON_RENDERER_URL'] = base

  const opened: string[] = []
  ;(shell as { openExternal: unknown }).openExternal = async (url: string) => {
    opened.push(url)
  }

  const win = (extra: Electron.WebPreferences = {}) => new BrowserWindow({ show: false, webPreferences: { ...SECURE_WEB_PREFERENCES, ...extra } })

  /* ---- Navigation und externe Links ---- */
  await test('Hauptfenster: file:// und fremde Seiten werden nicht geladen', async () => {
    const w = win()
    lockMainWindow(w)
    await w.loadURL(base)
    await run(w.webContents, "location.href = 'file:///C:/Windows/win.ini'")
    await sleep(400)
    expect(w.webContents.getURL() === base, `Fenster steht auf ${w.webContents.getURL()}`)
    await run(w.webContents, "location.href = 'https://example.org/weg'")
    await sleep(400)
    expect(w.webContents.getURL() === base, 'fremde Seite wurde geladen')
    expect(opened.includes('https://example.org/weg'), 'https-Ziel wurde nicht an den Browser übergeben')
    await run(w.webContents, "location.href = '" + base + "unterseite'")
    await sleep(400)
    expect(w.webContents.getURL() === base + 'unterseite', 'eigene Oberfläche muss navigierbar bleiben')
    w.destroy()
  })

  await test('Hauptfenster: window.open öffnet nur https extern (kein smb:, file:, ms-msdt:, javascript:)', async () => {
    opened.length = 0
    const w = win()
    lockMainWindow(w)
    await w.loadURL(base)
    await run(
      w.webContents,
      "for (const u of ['smb://angreifer/x', 'file:///C:/Windows/System32/calc.exe', 'ms-msdt:/id PCWDiagnostic', 'search-ms:query=x', 'http://example.org/unsicher', 'https://charite.de@angreifer.example/', 'https://example.org/ok']) window.open(u); 0"
    )
    await sleep(500)
    expect(JSON.stringify(opened) === JSON.stringify(['https://example.org/ok']), `Geöffnet wurde: ${JSON.stringify(opened)}`)
    expect(BrowserWindow.getAllWindows().filter((x) => x !== w && x.isVisible()).length === 0, 'es darf kein neues Fenster entstehen')
    w.destroy()
  })

  await test('Dienst-Tab: file:// und Programm-Schemata werden blockiert, Webseiten nicht', async () => {
    const w = win()
    guardServiceView(w.webContents)
    await w.loadURL(base)
    await run(w.webContents, "location.href = 'file:///C:/Windows/win.ini'")
    await sleep(400)
    expect(w.webContents.getURL() === base, `Tab steht auf ${w.webContents.getURL()}`)
    await run(w.webContents, "location.href = 'ms-msdt:/id PCWDiagnostic'")
    await sleep(400)
    expect(w.webContents.getURL() === base, 'Programm-Schema wurde verfolgt')
    await run(w.webContents, "location.href = '" + base + "weiter'")
    await sleep(400)
    expect(w.webContents.getURL() === base + 'weiter', 'normale Navigation muss funktionieren')
    w.destroy()
  })

  await test('Dienst-Tab: Fremde Popups gehen extern (nur https), Anmelde-Popups bleiben in der App', async () => {
    opened.length = 0
    const w = win()
    guardServiceView(w.webContents)
    await w.loadURL(base)
    const created: string[] = []
    w.webContents.on('did-create-window', (child, details) => {
      created.push(details.url)
      child.destroy()
    })
    await run(w.webContents, "window.open('https://fremd.example/x'); window.open('smb://x/y'); window.open('file:///C:/x'); 0")
    await sleep(400)
    expect(created.length === 0, `unerwartete Fenster: ${created.join(', ')}`)
    expect(JSON.stringify(opened) === JSON.stringify(['https://fremd.example/x']), `Geöffnet wurde: ${JSON.stringify(opened)}`)
    await run(w.webContents, "window.open('https://login.microsoftonline.com/common'); 0")
    await sleep(600)
    expect(created.length === 1 && created[0].includes('login.microsoftonline.com'), `Anmelde-Popup: ${JSON.stringify(created)}`)
    w.destroy()
  })

  /* ---- Berechtigungen ---- */
  await test('Berechtigungen: Mikrofon und Standort abgelehnt, Benachrichtigungen erlaubt', async () => {
    const ses = session.fromPartition('persist:test-berechtigungen')
    applyPermissionPolicy(ses)
    const w = win({ partition: 'persist:test-berechtigungen' })
    await w.loadURL(base)
    const mic = await w.webContents.executeJavaScript("navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'erlaubt', (e) => e.name)")
    expect(mic === 'NotAllowedError', `Mikrofon: ${mic}`)
    const geo = await w.webContents.executeJavaScript("new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('erlaubt'), (e) => r('Code ' + e.code)))")
    expect(geo === 'Code 1', `Standort: ${geo}`)
    const note = await w.webContents.executeJavaScript('Notification.requestPermission()')
    expect(note === 'granted', `Benachrichtigungen: ${note}`)
    w.destroy()
    return `Mikrofon ${mic}, Standort ${geo}, Benachrichtigungen ${note}`
  })

  /* ---- Schnittstelle: nur das Hauptfenster darf aufrufen ---- */
  await test('IPC: Aufrufe anderer Fenster werden abgelehnt', async () => {
    const preload = join(userData, 'preload.js')
    writeFileSync(preload, "const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('t', { call: (c, ...a) => ipcRenderer.invoke(c, ...a) })")
    const main = win({ preload })
    const other = win({ preload })
    await Promise.all([main.loadURL(base), other.loadURL(base)])
    createGuardedHandle(main)('test:echo', (_e, x) => x)
    const fromMain = await main.webContents.executeJavaScript("t.call('test:echo', 42)")
    expect(fromMain === 42, `Hauptfenster: ${fromMain}`)
    const fromOther = await other.webContents.executeJavaScript("t.call('test:echo', 42).then(() => 'angenommen', (e) => String(e.message))")
    expect(String(fromOther).includes('Nicht erlaubter Absender'), `anderes Fenster: ${fromOther}`)
    ipcMain.removeHandler('test:echo')
    main.destroy()
    other.destroy()
  })

  /* ---- Eigenes Protokoll: keine Pfadtricks ---- */
  await test('unihub-media: nur Dateien aus dem Medienordner, kein Path Traversal', async () => {
    registerMediaHandler()
    mkdirSync(join(mediaRoot(), 'own'), { recursive: true })
    writeFileSync(join(mediaRoot(), 'own', 'ok.txt'), 'bild')
    writeFileSync(join(userData, 'geheim.txt'), 'GEHEIM')
    writeFileSync(join(mediaRoot(), 'geheim2.txt'), 'GEHEIM2')
    const w = win()
    await w.loadURL(base)
    const status = (u: string) => w.webContents.executeJavaScript(`fetch(${JSON.stringify(u)}).then((r) => r.status, () => 'Fehler')`)
    expect((await status('unihub-media://own/ok.txt')) === 200, 'gültige Datei muss geladen werden')
    const attacks = [
      'unihub-media://own/..%2Fgeheim2.txt',
      'unihub-media://own/%2E%2E%2F%2E%2E%2Fgeheim.txt',
      'unihub-media://own/..%5Cgeheim2.txt',
      'unihub-media://own/sub%2Fok.txt',
      'unihub-media://own/C%3A%5CWindows%5Cwin.ini',
      'unihub-media://%2E%2E/geheim2.txt',
      'unihub-media://own/'
    ]
    for (const u of attacks) {
      const s = await status(u)
      expect(s !== 200, `Angriff erfolgreich: ${u} -> ${s}`)
    }
    w.destroy()
    return `${attacks.length} Angriffsmuster abgewiesen`
  })

  /* ---- Anki-Import: Normalfall und Schutz vor manipulierten Paketen ---- */
  const noProgress = () => {}
  const pkg = join(userData, 'rundreise.apkg')
  await test('Anki: Export und erneuter Import bringen Karten und Medien zurück (Regression der Importlogik)', async () => {
    mkdirSync(join(mediaRoot(), 'own'), { recursive: true })
    writeFileSync(join(mediaRoot(), 'own', 'bild.png'), Buffer.alloc(5000, 7))
    const deck = ankiStore.createDeck('Test::Rundreise')
    const nt = ankiStore.notetypes().find((n) => n.name === 'Einfach')!
    ankiStore.saveNote({ notetypeId: nt.id, deckId: deck, fields: ['Frage <img src="bild.png">', 'Antwort'], tags: ['a'] })
    ankiStore.saveNote({ notetypeId: nt.id, deckId: deck, fields: ['Zweite', 'Karte'], tags: [] })
    ;(dialog as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: pkg })
    const exported = await exportDeck(null as never, deck, false, noProgress)
    expect(exported === 2, `exportiert: ${exported}`)
    ankiStore.deleteDeck(deck)
    const r = await importApkg(pkg, false, noProgress)
    expect(r.notes === 2 && r.cards === 2 && r.media === 1, `Import: ${JSON.stringify(r)}`)
    return JSON.stringify(r)
  })

  await test('Anki: Zip-Bombe (winzig gepackt, riesig entpackt) wird abgelehnt', async () => {
    const saved = { ...LIMITS }
    try {
      LIMITS.collection = 1_000_000
      // zstd: 8 MB Nullen -> wenige KB; das Paket selbst ist klein, entpackt wäre es über der Grenze
      const zstdBomb = join(userData, 'bombe-zstd.apkg')
      writeFileSync(zstdBomb, zipSync({ 'collection.anki21b': new Uint8Array(zstdCompressSync(Buffer.alloc(8_000_000))) }, { level: 0 }))
      let msg = ''
      await importApkg(zstdBomb, false, noProgress).catch((e) => (msg = String(e.message)))
      expect(/zu gro/.test(msg), `zstd-Bombe nicht abgelehnt: "${msg}"`)
      // Deflate: der Eintrag meldet seine entpackte Größe schon im Zip-Verzeichnis
      const deflateBomb = join(userData, 'bombe-deflate.apkg')
      writeFileSync(deflateBomb, zipSync({ 'collection.anki2': new Uint8Array(Buffer.alloc(8_000_000)) }))
      msg = ''
      await importApkg(deflateBomb, false, noProgress).catch((e) => (msg = String(e.message)))
      expect(/zu gro/.test(msg), `Deflate-Bombe nicht abgelehnt: "${msg}"`)
      return 'beide Arten abgelehnt'
    } finally {
      Object.assign(LIMITS, saved)
    }
  })

  await test('Anki: Überschreiten der Mediengrenze bricht ab und hinterlässt keinen halben Import', async () => {
    const saved = { ...LIMITS }
    try {
      const before = (getDb().prepare('SELECT COUNT(*) AS n FROM anki_notes').get() as { n: number }).n
      // Gleiche Notizen nochmal importieren würde als Duplikat übersprungen; deshalb zuerst die Notizen entfernen
      ankiStore.deleteDeck(ankiStore.createDeck('Platzhalter'))
      getDb().exec('DELETE FROM anki_notes')
      LIMITS.mediaTotal = 1000 // das Beispielbild ist 5000 Byte groß
      let msg = ''
      await importApkg(pkg, false, noProgress).catch((e) => (msg = String(e.message)))
      expect(/zu gro/.test(msg), `Mediengrenze nicht erkannt: "${msg}"`)
      const after = (getDb().prepare('SELECT COUNT(*) AS n FROM anki_notes').get() as { n: number }).n
      expect(after === 0, `${after} Notizen vom abgebrochenen Import übrig (vorher ${before})`)
      return 'Import vollständig zurückgerollt'
    } finally {
      Object.assign(LIMITS, saved)
    }
  })

  await test('Anki: Lernwarteschlange liefert neue Karten, beantwortete Karten werden eingeplant', async () => {
    const deck = ankiStore.createDeck('Test::Lernen')
    const nt = ankiStore.notetypes().find((n) => n.name === 'Einfach')!
    for (const t of ['Eins', 'Zwei']) ankiStore.saveNote({ notetypeId: nt.id, deckId: deck, fields: [t, 'x'], tags: [] })
    const first = ankiSched.next(deck)
    expect(first.card?.state === 'new' && first.counts.new === 2, `erste Karte: ${JSON.stringify({ s: first.card?.state, c: first.counts })}`)
    expect(first.card!.previews[1] === '1 Min' && first.card!.previews[3] === '10 Min', `Intervalle: ${JSON.stringify(first.card!.previews)}`)
    ankiSched.answer(first.card!.cardId, 3)
    const second = ankiSched.next(deck)
    expect(second.card && second.card.cardId !== first.card!.cardId, 'zweite Karte muss eine andere sein')
    ankiSched.answer(second.card!.cardId, 4)
    for (const bad of [0, 5, 3.5, '3' as unknown as number]) {
      let threw = false
      try {
        ankiSched.answer(first.card!.cardId, bad as 1)
      } catch {
        threw = true
      }
      expect(threw, `Bewertung ${bad} akzeptiert`)
    }
    return 'Reihenfolge und Bewertungen ok'
  })

  await test('Dokumente: Office-Datei mit riesigem Inhalt (Zip-Bombe) wird vor dem Lesen abgelehnt', async () => {
    const bomb = zipSync({ 'word/document.xml': new Uint8Array(Buffer.alloc(5_000_000)) })
    let rejected = false
    try {
      assertZipSafe(bomb, 1_000_000)
    } catch {
      rejected = true
    }
    expect(rejected, 'Grenze wirkt nicht')
    assertZipSafe(zipSync({ 'a.xml': strToU8('<x/>') })) // normale Dateien bleiben erlaubt
  })

  await test('Kalender: nur HTTPS-Abos; ungültige Termin-Eingaben werden abgelehnt', async () => {
    let msg = ''
    await addUrlSource('x', 'http://127.0.0.1:1/cal.ics', '#1677ff').catch((e) => (msg = String(e.message)))
    expect(/HTTPS/.test(msg), `http wurde nicht abgelehnt: "${msg}"`)
    msg = ''
    await addUrlSource('x', 'file:///C:/Windows/win.ini', '#1677ff').catch((e) => (msg = String(e.message)))
    expect(/HTTPS/.test(msg), `file: wurde nicht abgelehnt: "${msg}"`)
    for (const bad of [{ start: '3.11.2026', end: '2026-11-04' }, { start: '2026-11-03', end: "2026-11-04'; DROP TABLE todos;--" }, { start: '2026-11-05', end: '2026-11-04' }]) {
      let threw = false
      try {
        saveEvent({ title: 'x', allDay: true, location: null, description: null, ...bad })
      } catch {
        threw = true
      }
      expect(threw, `Termin akzeptiert: ${JSON.stringify(bad)}`)
    }
    saveEvent({ title: 'Gültig', allDay: true, start: '2026-11-03', end: '2026-11-04', location: null, description: null })
  })

  /* ---- Alle lokalen Daten löschen ---- */
  await test('Daten löschen: Datenbank, Dokumente, Anki, Sicherungen und Anmeldungen sind weg', async () => {
    getDb().prepare("INSERT INTO todos (title, status) VALUES ('Geheimes To-Do', 'open')").run()
    for (const dir of ['docs/library', 'anki/media/own', 'backups']) mkdirSync(join(userData, dir), { recursive: true })
    writeFileSync(join(userData, 'docs/library/a.pdf'), 'x')
    writeFileSync(join(userData, 'anki/media/own/b.png'), 'x')
    writeFileSync(join(userData, 'backups/unihub-2026-01-01.db'), 'x')
    const outlook = session.fromPartition('persist:outlook')
    await outlook.cookies.set({ url: 'https://oow.charite.de/', name: 'sid', value: 'geheim', expirationDate: Math.floor(Date.now() / 1000) + 3600, secure: true })
    expect((await outlook.cookies.get({ name: 'sid' })).length === 1, 'Test-Cookie wurde nicht gesetzt')

    const r = await wipeLocalData({ relaunch: false })
    expect(r.failed.length === 0, `nicht gelöscht: ${r.failed.join(', ')}`)
    for (const f of ['unihub.db', 'docs', 'anki', 'backups']) expect(!existsSync(join(userData, f)), `${f} existiert noch`)
    expect((await outlook.cookies.get({ name: 'sid' })).length === 0, 'Anmelde-Cookie existiert noch')
    let locked = false
    try {
      getDb()
    } catch {
      locked = true
    }
    expect(locked, 'Datenbank wurde neu angelegt statt gesperrt')
    expect(!existsSync(join(userData, 'unihub.db')), 'unihub.db wurde nach dem Löschen neu angelegt')
  })

  server.close()
  const failed = results.filter((r) => !r.ok)
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`)
  console.log(failed.length ? `\n${failed.length} von ${results.length} Tests fehlgeschlagen` : `\nAlle ${results.length} Tests bestanden`)
  app.exit(failed.length ? 1 : 0)
})
