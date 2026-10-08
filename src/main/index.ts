import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { getDb, kvDelete, kvGet, kvSet } from './db'
import { hideWeb, navWeb, resetPartition, showWeb } from './views'
import * as cal from './calendar/ical'
import * as docs from './docs/library'
import { flushSessionsOnQuit, persistSessionCookies } from './sessions'
import { toast as notifyToast } from './notify'
import { windowIcon } from './icon'
import { openLinksExternally } from './links'
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

// Muss vor app.whenReady() passieren
registerMediaScheme()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    icon: windowIcon(),
    // Beim Windows-Start nur im Infobereich laufen, ohne Fenster
    show: !startedHidden(),
    // Ohne Drosselung laufen Timer (Pomodoro) auch bei minimiertem Fenster pünktlich
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false }
  })
  openLinksExternally(win)
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function registerIpc(win: BrowserWindow): void {
  getDb() // Datenbank öffnen und Migrationen früh ausführen
  ipcMain.handle('web:show', (_e, id, bounds) => showWeb(win, id, bounds))
  ipcMain.handle('web:hide', () => hideWeb())
  ipcMain.handle('web:nav', (_e, action) => navWeb(action))

  ipcMain.handle('todos:list', () => todos.list())
  ipcMain.handle('todos:add', (_e, input: TodoInput) => todos.add(input))
  ipcMain.handle('todos:update', (_e, id: number, input: TodoInput) => todos.update(id, input))
  ipcMain.handle('todos:setStatus', (_e, id: number, status: TodoStatus) => todos.setStatus(id, status))
  ipcMain.handle('todos:remove', (_e, id: number) => todos.remove(id))
  ipcMain.handle('todos:categories', () => todos.categories())
  ipcMain.handle('todos:addCategory', (_e, name: string, color: string) => todos.addCategory(name, color))
  ipcMain.handle('todos:updateCategory', (_e, id: number, name: string, color: string) => todos.updateCategory(id, name, color))
  ipcMain.handle('todos:removeCategory', (_e, id: number) => todos.removeCategory(id))

  ipcMain.handle('calendar:sources', () => cal.listSources())
  ipcMain.handle('calendar:addUrl', (_e, name: string, url: string, color: string) => cal.addUrlSource(name, url, color))
  ipcMain.handle('calendar:importFile', () => cal.importFile(win))
  ipcMain.handle('calendar:removeSource', (_e, id: number) => cal.removeSource(id))
  ipcMain.handle('calendar:sync', (_e, id?: number) => (id ? cal.syncSource(id) : cal.syncAll()))
  ipcMain.handle('calendar:events', (_e, from: string, to: string) => cal.events(from, to))
  ipcMain.handle('calendar:saveEvent', (_e, input: CalendarEventInput) => cal.saveEvent(input))
  ipcMain.handle('calendar:deleteEvent', (_e, id: number) => cal.deleteEvent(id))
  ipcMain.handle('calendar:exportIcs', () => cal.exportIcs(win))

  ipcMain.handle('docs:list', () => docs.list())
  ipcMain.handle('docs:importDialog', (_e, folder: string | null) => docs.importDialog(win, folder))
  ipcMain.handle('docs:importPaths', (_e, paths: string[], folder: string | null) => docs.importPaths(paths, folder))
  ipcMain.handle('docs:update', (_e, id: number, patch: DocUpdate) => docs.update(id, patch))
  ipcMain.handle('docs:remove', (_e, id: number) => docs.remove(id))
  ipcMain.handle('docs:search', (_e, q: string) => docs.search(q))
  ipcMain.handle('docs:preview', (_e, id: number) => docs.preview(id))
  ipcMain.handle('docs:showView', (_e, id: number, bounds) => docs.showView(win, id, bounds))
  ipcMain.handle('docs:hideView', () => hideWeb())
  ipcMain.handle('docs:openExternal', (_e, id: number) => docs.openExternal(id))
  ipcMain.handle('docs:reveal', (_e, id: number) => docs.reveal(id))

  ipcMain.handle('study:list', () => study.list())
  ipcMain.handle('study:stats', () => study.stats())
  ipcMain.handle('study:addSubject', (_e, name: string, color: string, exam: string | null) => study.addSubject(name, color, exam))
  ipcMain.handle('study:updateSubject', (_e, id: number, patch) => study.updateSubject(id, patch))
  ipcMain.handle('study:removeSubject', (_e, id: number) => study.removeSubject(id))
  ipcMain.handle('study:addTopics', (_e, subjectId: number, titles: string[]) => study.addTopics(subjectId, titles))
  ipcMain.handle('study:renameTopic', (_e, id: number, title: string) => study.renameTopic(id, title))
  ipcMain.handle('study:toggleTopic', (_e, id: number) => study.toggleTopic(id))
  ipcMain.handle('study:removeTopic', (_e, id: number) => study.removeTopic(id))
  ipcMain.handle('study:logSession', (_e, s: number | null, t: number | null, minutes: number) => study.logSession(s, t, minutes))

  const sendProgress = (p: AnkiProgress) => {
    if (!win.isDestroyed()) win.webContents.send('anki:progress', p)
  }
  ipcMain.handle('anki:decks', () => ankiSched.decksWithCounts())
  ipcMain.handle('anki:notetypes', () => ankiStore.notetypes())
  ipcMain.handle('anki:createDeck', (_e, name: string) => ankiStore.createDeck(name))
  ipcMain.handle('anki:renameDeck', (_e, id: number, name: string) => ankiStore.renameDeck(id, name))
  ipcMain.handle('anki:deleteDeck', (_e, id: number) => ankiStore.deleteDeck(id))
  ipcMain.handle('anki:getNote', (_e, id: number) => ankiStore.getNote(id))
  ipcMain.handle('anki:saveNote', (_e, input: AnkiNoteInput) => ankiStore.saveNote(input))
  ipcMain.handle('anki:deleteNotes', (_e, ids: number[]) => ankiStore.deleteNotes(ids))
  ipcMain.handle('anki:browse', (_e, q: AnkiBrowseQuery) => ankiStore.browse(q))
  ipcMain.handle('anki:setSuspended', (_e, id: number, s: boolean) => ankiStore.setSuspended(id, s))
  ipcMain.handle('anki:preview', (_e, nt: number, fields: string[], ord: number, ns: string) => ankiSched.preview(nt, fields, ord, ns))
  ipcMain.handle('anki:cardPreview', (_e, id: number) => ankiSched.cardPreview(id))
  ipcMain.handle('anki:next', (_e, deckId: number) => ankiSched.next(deckId))
  ipcMain.handle('anki:answer', (_e, id: number, rating: 1 | 2 | 3 | 4) => ankiSched.answer(id, rating))
  ipcMain.handle('anki:importApkg', (_e, keep: boolean) => ankiImport.importApkgDialog(win, !!keep, sendProgress))
  ipcMain.handle('anki:importText', (_e, deckId: number, header: boolean) => ankiImport.importTextDialog(win, deckId, !!header))
  ipcMain.handle('anki:exportDeck', (_e, deckId: number, withProgress: boolean) => exportDeck(win, deckId, !!withProgress, sendProgress))
  ipcMain.handle('anki:addImage', () => addImage(win))

  ipcMain.handle('sessions:reset', async (_e, id: SessionId) => {
    if (!(id in WEB_MODULES)) throw new Error('Unbekannter Dienst')
    await resetPartition(win, WEB_MODULES[id].partition, id)
  })

  // Benachrichtigung aus der Oberfläche (z. B. Ende einer Pomodoro-Phase)
  const NAVIGABLE = ['home', 'todo', 'study', 'calendar', 'docs', 'anki'] as const
  ipcMain.handle('app:notify', (_e, opts: { title?: unknown; body?: unknown; silent?: unknown; navigate?: unknown }) => {
    const title = String(opts?.title ?? '').slice(0, 120)
    if (!title) throw new Error('Titel fehlt')
    const navigate = NAVIGABLE.find((m) => m === opts.navigate)
    const ok = notifyToast(win, { title, body: String(opts?.body ?? '').slice(0, 300), silent: opts?.silent === true, navigate })
    if (!ok) throw new Error('Benachrichtigungen werden auf diesem System nicht unterstützt')
  })

  ipcMain.handle('app:getAutostart', () => getAutostart())
  ipcMain.handle('app:setAutostart', (_e, enabled: boolean) => setAutostart(enabled === true))

  ipcMain.handle('app:testNotification', () => {
    const lead = readReminderSettings().lead
    const ok = notifyToast(win, {
      title: 'Uni-Hub: Testbenachrichtigung',
      body: lead ? `Termine melden sich ${lead} Minuten vor Beginn.` : 'Termine melden sich zum Beginn.',
      navigate: 'calendar'
    })
    if (!ok) throw new Error('Benachrichtigungen werden auf diesem System nicht unterstützt')
  })

  // Nur UI-Einstellungen; Geheimnisse bleiben im Hauptprozess
  const uiKey = (key: string) => {
    if (!/^ui\.[\w.-]{1,64}$/.test(key)) throw new Error('Ungültiger Schlüssel')
    return key
  }
  ipcMain.handle('ui:get', (_e, key: string) => kvGet(uiKey(key)))
  ipcMain.handle('ui:set', (_e, key: string, value: string) => kvSet(uiKey(key), String(value).slice(0, 10_000)))
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
app.on('second-instance', (_event, argv) => {
  // Ein Autostart-Aufruf, während die App schon läuft, soll kein Fenster aufpoppen lassen
  if (mainWindow && !argv.includes('--hidden')) showWindow(mainWindow)
})

app.whenReady().then(() => {
  if (!gotLock) return
  registerMediaHandler()
  const win = createWindow()
  mainWindow = win
  setupTray(win)
  registerIpc(win)
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
  setInterval(() => cal.syncAll().catch(() => {}), 30 * 60 * 1000)
})

app.on('window-all-closed', () => app.quit())
