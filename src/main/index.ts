import { app, BrowserWindow, dialog, Menu, nativeTheme, powerMonitor, session, shell } from 'electron'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initLogging, installCrashHandlers, logsDir } from './log'
import { SECURE_WEB_PREFERENCES, hardenSessions } from './security'
import { loadWindowState, trackWindowState } from './windowState'
import { backupDatabase, backupsDir, lastBackup, runStartupChecks } from './backup'
import { runSelfTest } from './selftest'
import { wipeLocalData } from './wipe'
import { createGuardedHandle } from './ipc'
import * as v from '@shared/validate'
import { mark, trackWindowPerf } from './perf'
import { getDb, kvDelete, kvGet, kvSet } from './db'
import { hideWeb, navWeb, resetPartition, showWeb } from './views'
import * as cal from './calendar/ical'
import * as docs from './docs/library'
import { flushSessionsOnQuit, persistSessionCookies } from './sessions'
import { toast as notifyToast } from './notify'
import { windowIcon } from './icon'
import { lockMainWindow } from './links'
import { getAutostart, setAutostart, startedHidden } from './autostart'
import { setupTray, showWindow } from './tray'
import { readReminderSettings, startReminders } from './reminders'
import * as study from './study/store'
import * as todos from './todos/store'
import * as ankiStore from './anki/store'
import * as ankiSched from './anki/sched'
import * as ankiImport from './anki/import'
import { summarizeImport } from '@shared/format'
import { exportDeck } from './anki/export'
import { addImage, registerMediaHandler, registerMediaScheme } from './anki/media'
import { WEB_MODULES, type AnkiBrowseQuery, type AnkiDownloadEvent, type AnkiNoteInput, type AnkiProgress, type CalendarEventInput, type DocUpdate, type SessionId, type TodoInput, type TodoStatus } from '@shared/ipc'

// Selbsttest (--selftest=<Datei>): arbeitet mit eigenen, temporären Daten, damit weder die echten Nutzerdaten
// noch die Einzelinstanz-Sperre einer laufenden App berührt werden
const SELFTEST_FILE = process.argv.find((a) => a.startsWith('--selftest='))?.slice('--selftest='.length)
if (SELFTEST_FILE) app.setPath('userData', mkdtempSync(join(tmpdir(), 'unihub-selftest-')))

// Muss vor app.whenReady() passieren
initLogging()
hardenSessions()
registerMediaScheme()

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  // Gespeichertes Design schon vor dem ersten Bild anwenden: Titelleiste, Fensterfarbe und Oberfläche passen zusammen
  const theme = kvGet('ui.theme') === 'light' ? 'light' : 'dark'
  nativeTheme.themeSource = theme
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    backgroundColor: theme === 'light' ? '#ffffff' : '#000000',
    icon: windowIcon(),
    // Erst zeigen, wenn das erste Bild fertig ist (siehe unten) – kein leeres Fenster beim Start
    show: false,
    // Ohne Drosselung laufen Timer (Pomodoro) auch bei minimiertem Fenster pünktlich
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      // Entwicklerwerkzeuge nur in der Entwicklung
      devTools: !app.isPackaged
    }
  })
  // maximize() zeigt ein verstecktes Fenster sofort, deshalb erst beim Einblenden anwenden.
  // Beim Windows-Start läuft die App nur im Infobereich; der Zustand greift dann beim ersten Öffnen.
  let revealed = false
  const reveal = () => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    if (startedHidden()) {
      if (state.maximized) win.once('show', () => win.maximize())
    } else if (state.maximized) win.maximize()
    else win.show()
  }
  win.once('ready-to-show', reveal)
  setTimeout(reveal, 5000) // Notausgang, falls die Oberfläche nicht fertig wird
  trackWindowState(win)
  lockMainWindow(win)
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function registerIpc(win: BrowserWindow): void {
  getDb() // Datenbank öffnen und Migrationen früh ausführen
  // Nur die eigene Oberfläche darf die App-Schnittstelle aufrufen – nicht eingebettete Webseiten oder fremde Frames
  const handle = createGuardedHandle(win)
  handle('web:show', (_e, id, bounds) => showWeb(win, v.ownKey(id, WEB_MODULES), v.bounds(bounds)))
  handle('web:hide', () => hideWeb())
  handle('web:nav', (_e, action) => navWeb(v.oneOf(action, ['back', 'forward', 'reload'] as const)))

  handle('todos:list', () => todos.list())
  handle('todos:add', (_e, input: TodoInput) => todos.add(input))
  handle('todos:update', (_e, id: number, input: TodoInput) => todos.update(v.id(id), input))
  handle('todos:setStatus', (_e, id: number, status: TodoStatus) => todos.setStatus(v.id(id), v.oneOf(status, ['open', 'doing', 'done'] as const)))
  handle('todos:remove', (_e, id: number) => todos.remove(v.id(id)))
  handle('todos:categories', () => todos.categories())
  handle('todos:addCategory', (_e, name: string, color: string) => todos.addCategory(v.str(name, 100), v.hexColor(color)))
  handle('todos:updateCategory', (_e, id: number, name: string, color: string) => todos.updateCategory(v.id(id), v.str(name, 100), v.hexColor(color)))
  handle('todos:removeCategory', (_e, id: number) => todos.removeCategory(v.id(id)))

  handle('calendar:sources', () => cal.listSources())
  handle('calendar:addUrl', (_e, name: string, url: string, color: string) => cal.addUrlSource(v.str(name, 200), v.str(url, 2048, 'Adresse'), v.hexColor(color)))
  handle('calendar:importFile', () => cal.importFile(win))
  handle('calendar:removeSource', (_e, id: number) => cal.removeSource(v.id(id)))
  handle('calendar:sync', (_e, id?: number) => (id === undefined || id === null ? cal.syncAll() : cal.syncSource(v.id(id))))
  handle('calendar:events', (_e, from: string, to: string) => cal.events(v.dayOrIso(from), v.dayOrIso(to)))
  handle('calendar:saveEvent', (_e, input: CalendarEventInput) => cal.saveEvent(input))
  handle('calendar:deleteEvent', (_e, id: number) => cal.deleteEvent(v.id(id)))
  handle('calendar:exportIcs', () => cal.exportIcs(win))

  handle('docs:list', () => docs.list())
  handle('docs:importDialog', (_e, folder: string | null) => docs.importDialog(win, v.optStr(folder, 200)))
  handle('docs:importPaths', (_e, paths: string[], folder: string | null) => docs.importPaths(v.paths(paths), v.optStr(folder, 200)))
  handle('docs:update', (_e, id: number, patch: DocUpdate) => docs.update(v.id(id), patch))
  handle('docs:remove', (_e, id: number) => docs.remove(v.id(id)))
  handle('docs:search', (_e, q: string) => docs.search(v.str(q, 200)))
  handle('docs:preview', (_e, id: number) => docs.preview(v.id(id)))
  handle('docs:showView', (_e, id: number, bounds) => docs.showView(win, v.id(id), v.bounds(bounds)))
  handle('docs:hideView', () => hideWeb())
  handle('docs:openInDefaultApp', (_e, id: number) => docs.openInDefaultApp(v.id(id)))
  handle('docs:reveal', (_e, id: number) => docs.reveal(v.id(id)))

  handle('study:list', () => study.list())
  handle('study:stats', () => study.stats())
  handle('study:addSubject', (_e, name: string, color: string, exam: string | null) => study.addSubject(v.str(name, 200), v.hexColor(color), v.optStr(exam, 10)))
  handle('study:updateSubject', (_e, id: number, patch) => study.updateSubject(v.id(id), patch))
  handle('study:removeSubject', (_e, id: number) => study.removeSubject(v.id(id)))
  handle('study:addTopics', (_e, subjectId: number, titles: string[]) => study.addTopics(v.id(subjectId), v.strList(titles, 200, 300)))
  handle('study:renameTopic', (_e, id: number, title: string) => study.renameTopic(v.id(id), v.str(title, 300)))
  handle('study:toggleTopic', (_e, id: number) => study.toggleTopic(v.id(id)))
  handle('study:removeTopic', (_e, id: number) => study.removeTopic(v.id(id)))
  handle('study:logSession', (_e, s: number | null, t: number | null, minutes: number) => study.logSession(v.optId(s), v.optId(t), v.int(minutes, 1, 600, 'Minuten')))

  const sendProgress = (p: AnkiProgress) => {
    if (!win.isDestroyed()) win.webContents.send('anki:progress', p)
  }
  handle('anki:decks', () => ankiSched.decksWithCounts())
  handle('anki:notetypes', () => ankiStore.notetypes())
  handle('anki:createDeck', (_e, name: string) => ankiStore.createDeck(v.str(name, 300)))
  handle('anki:renameDeck', (_e, id: number, name: string) => ankiStore.renameDeck(v.id(id), v.str(name, 300)))
  handle('anki:deleteDeck', (_e, id: number) => ankiStore.deleteDeck(v.id(id)))
  handle('anki:getNote', (_e, id: number) => ankiStore.getNote(v.id(id)))
  handle('anki:saveNote', (_e, input: AnkiNoteInput) => ankiStore.saveNote(input))
  handle('anki:deleteNotes', (_e, ids: number[]) => ankiStore.deleteNotes(v.idList(ids)))
  handle('anki:browse', (_e, q: AnkiBrowseQuery) =>
    ankiStore.browse({ deckId: v.optId(q?.deckId), text: v.str(q?.text ?? '', 200), offset: v.int(q?.offset, 0, 10_000_000), limit: v.int(q?.limit, 1, 200) })
  )
  handle('anki:setSuspended', (_e, id: number, s: boolean) => ankiStore.setSuspended(v.id(id), v.bool(s)))
  handle('anki:preview', (_e, nt: number, fields: string[], ord: number, ns: string) => ankiSched.preview(v.id(nt), v.strList(fields, 50, 200_000), v.int(ord, 0, 1000), v.str(ns, 32)))
  handle('anki:cardPreview', (_e, id: number) => ankiSched.cardPreview(v.id(id)))
  handle('anki:next', (_e, deckId: number) => ankiSched.next(v.id(deckId)))
  handle('anki:answer', (_e, id: number, rating: 1 | 2 | 3 | 4) => ankiSched.answer(v.id(id), v.oneOf(rating, [1, 2, 3, 4] as const)))
  handle('anki:importApkg', (_e, keep: boolean) => ankiImport.importApkgDialog(win, v.bool(keep), sendProgress))
  handle('anki:importText', (_e, deckId: number, header: boolean) => ankiImport.importTextDialog(win, v.id(deckId), v.bool(header)))
  handle('anki:exportDeck', (_e, deckId: number, withProgress: boolean) => exportDeck(win, v.id(deckId), v.bool(withProgress), sendProgress))
  handle('anki:addImage', () => addImage(win))

  handle('sessions:reset', async (_e, id: SessionId) => {
    const service = v.ownKey(id, WEB_MODULES, 'Dienst')
    await resetPartition(win, WEB_MODULES[service].partition, service)
  })

  // Benachrichtigung aus der Oberfläche (z. B. Ende einer Pomodoro-Phase)
  const NAVIGABLE = ['home', 'todo', 'study', 'calendar', 'docs', 'anki'] as const
  handle('app:notify', (_e, opts: { title?: unknown; body?: unknown; silent?: unknown; navigate?: unknown }) => {
    const title = String(opts?.title ?? '').slice(0, 120)
    if (!title) throw new Error('Titel fehlt')
    const navigate = NAVIGABLE.find((m) => m === opts.navigate)
    const ok = notifyToast(win, { title, body: String(opts?.body ?? '').slice(0, 300), silent: opts?.silent === true, navigate })
    if (!ok) throw new Error('Benachrichtigungen werden auf diesem System nicht unterstützt')
  })

  handle('app:getAutostart', () => getAutostart())
  handle('app:setAutostart', (_e, enabled: boolean) => setAutostart(enabled === true))

  handle('app:testNotification', () => {
    const lead = readReminderSettings().lead
    const ok = notifyToast(win, {
      title: 'Uni-Hub: Testbenachrichtigung',
      body: lead ? `Termine melden sich ${lead} Minuten vor Beginn.` : 'Termine melden sich zum Beginn.',
      navigate: 'calendar'
    })
    if (!ok) throw new Error('Benachrichtigungen werden auf diesem System nicht unterstützt')
  })

  // Wartung: Version, Datenordner, Protokolle und Datenbank-Sicherungen
  handle('app:getInfo', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    dataDir: app.getPath('userData'),
    logsDir: logsDir(),
    backupsDir: backupsDir(),
    lastBackup: lastBackup()
  }))
  handle('app:openFolder', async (_e, kind: string) => {
    const dir = kind === 'logs' ? logsDir() : kind === 'backups' ? backupsDir() : kind === 'data' ? app.getPath('userData') : null
    if (!dir) throw new Error('Unbekannter Ordner')
    if (kind !== 'data') mkdirSync(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
  })
  handle('app:backupNow', () => backupDatabase(true))
  // Die Sicherheitsabfrage kommt aus dem Hauptprozess, nicht aus der Oberfläche: Eine kompromittierte Seite kann nicht still alles löschen
  handle('app:wipeData', async () => {
    const answer = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Alle lokalen Daten löschen',
      message: 'Wirklich alle Daten von Uni-Hub auf diesem Computer löschen?',
      detail:
        'Gelöscht werden Aufgaben, Termine, Lernplan, Anki-Karten, importierte Dokumente, alle Sicherungen und die Anmeldungen bei Exchange, lehre.charite, AMBOSS und MOSES. Das lässt sich nicht rückgängig machen. Uni-Hub startet danach neu.',
      buttons: ['Abbrechen', 'Alles löschen'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (answer.response !== 1) return false
    await wipeLocalData({ relaunch: true })
    return true
  })

  // Nur UI-Einstellungen; Geheimnisse bleiben im Hauptprozess
  const uiKey = (key: string) => {
    if (!/^ui\.[\w.-]{1,64}$/.test(key)) throw new Error('Ungültiger Schlüssel')
    return key
  }
  handle('ui:get', (_e, key: string) => kvGet(uiKey(key)))
  handle('ui:set', (_e, key: string, value: string) => {
    kvSet(uiKey(key), String(value).slice(0, 10_000))
    // Titelleiste und native Dialoge folgen dem gewählten Design der Oberfläche
    if (key === 'ui.theme' && (value === 'light' || value === 'dark')) nativeTheme.themeSource = value
  })
}

/** Anki-Pakete aus lehre.charite direkt importieren und per Windows-Benachrichtigung melden. */
function captureAnkiDownloads(win: BrowserWindow): void {
  const toast = (title: string, body: string, silent: boolean) => notifyToast(win, { title, body, silent, navigate: 'anki' })
  const send = (ev: AnkiDownloadEvent) => {
    if (win.isDestroyed()) return
    win.webContents.send('anki:download', ev)
    if (ev.status === 'importing') toast('Anki-Paket wird importiert …', ev.filename, true)
    else if (ev.status === 'done' && ev.result) toast('In Anki importiert', `${ev.filename}\n${summarizeImport(ev.result)}\nKlicken zum Öffnen`, false)
    else if (ev.status === 'error') toast('Anki-Import fehlgeschlagen', `${ev.filename}\n${ev.error ?? ''}`, false)
  }
  ankiImport.captureApkgDownloads(
    session.fromPartition(WEB_MODULES.lehre.partition),
    (p) => !win.isDestroyed() && win.webContents.send('anki:progress', p),
    send
  )
}

// Eindeutige Kennung, unter der Windows die Benachrichtigungen der App einordnet
app.setAppUserModelId('de.unihub.app')

// Nur eine Instanz: Eine zweite Kopie würde dieselbe Datenbank und dieselben Sitzungen öffnen
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
let mainWindow: BrowserWindow | null = null
installCrashHandlers(() => mainWindow)
app.on('second-instance', (_event, argv) => {
  // Ein Autostart-Aufruf, während die App schon läuft, soll kein Fenster aufpoppen lassen
  if (mainWindow && !argv.includes('--hidden')) showWindow(mainWindow)
})

app.whenReady().then(() => {
  if (!gotLock) return
  mark('App bereit')
  if (SELFTEST_FILE) {
    runSelfTest(SELFTEST_FILE).then(
      (ok) => app.exit(ok ? 0 : 1),
      (e) => {
        console.error('[Selbsttest]', e)
        app.exit(2)
      }
    )
    return
  }
  // Ohne Menüleiste (und damit ohne Entwickler-Tastenkürzel) in der installierten App
  if (app.isPackaged) Menu.setApplicationMenu(null)
  registerMediaHandler()
  const win = createWindow()
  trackWindowPerf(win)
  mainWindow = win
  setupTray(win)
  registerIpc(win)
  // Integritätsprüfung und Tagessicherung können bei großen Datenbanken dauern: erst nach dem ersten Bild
  win.once('ready-to-show', () => setTimeout(runStartupChecks, 3000))
  docs.captureDownloads(session.fromPartition(WEB_MODULES.mail.partition), win, 'Exchange')
  docs.captureDownloads(session.fromPartition(WEB_MODULES.lehre.partition), win, 'lehre.charite')
  captureAnkiDownloads(win)
  // Anmeldungen (Exchange, lehre.charite) sollen App-Neustarts überleben
  const loginPartitions = Object.values(WEB_MODULES).map((m) => m.partition)
  loginPartitions.forEach((p) => persistSessionCookies(session.fromPartition(p)))
  flushSessionsOnQuit(loginPartitions)
  startReminders(win)
  // Altlast: gespeicherten Moodle-Token entfernen
  kvDelete('moodle.session')
  cal.syncAll().catch(() => {})
  // Nach Standby sind Kalender-Abos veraltet: sofort aktualisieren statt auf den nächsten Takt zu warten
  powerMonitor.on('resume', () => cal.syncAll().catch(() => {}))
  setInterval(() => cal.syncAll().catch(() => {}), 30 * 60 * 1000)
})

app.on('will-quit', () => {
  // SQLite aktualisiert beim Beenden seine Abfrage-Statistiken (hält Abfragen auf großen Anki-Stapeln schnell)
  try {
    getDb().exec('PRAGMA optimize')
  } catch {
    /* Datenbank nie geöffnet oder schon geschlossen */
  }
})

app.on('window-all-closed', () => app.quit())
