export type ModuleId = 'home' | 'todo' | 'study' | 'calendar' | 'docs' | 'anki' | 'mail' | 'lehre' | 'amboss' | 'moses' | 'settings'

export const WEB_MODULES = {
  mail: { url: 'https://oow.charite.de/owa/', partition: 'persist:outlook' },
  lehre: { url: 'https://lehre.charite.de/', partition: 'persist:lehre' },
  amboss: { url: 'https://next.amboss.com/de', partition: 'persist:amboss' },
  moses: { url: 'https://moses.charite.de/', partition: 'persist:moses' }
} as const

export type WebModuleId = keyof typeof WEB_MODULES

/** Dienste mit Anmeldung, deren Sitzung sich in den Einstellungen widerrufen lässt */
export type SessionId = WebModuleId

export interface Bounds { x: number; y: number; width: number; height: number }

export type TodoStatus = 'open' | 'doing' | 'done'

export interface TodoCategory {
  id: number
  name: string
  color: string
}

export interface Todo {
  id: number
  title: string
  notes: string | null
  /** 'YYYY-MM-DD' */
  due: string | null
  priority: 0 | 1 | 2
  status: TodoStatus
  /** Kurzform für status === 'done' */
  done: boolean
  categoryId: number | null
}

export interface TodoInput {
  title: string
  notes: string | null
  due: string | null
  priority: 0 | 1 | 2
  categoryId: number | null
  /** weglassen = Status bleibt (beim Ändern) bzw. 'open' (beim Anlegen) */
  status?: TodoStatus
}

export interface CalendarSource {
  id: number
  name: string
  kind: 'url' | 'file' | 'local'
  url: string | null
  color: string
  lastSync: string | null
  error: string | null
}

export interface CalendarEvent {
  id: number
  sourceId: number
  title: string
  /** Ganztägig: 'YYYY-MM-DD', sonst ISO-Zeitstempel (UTC) */
  start: string
  /** Ganztägig: 'YYYY-MM-DD' (exklusives Ende), sonst ISO-Zeitstempel */
  end: string
  allDay: boolean
  location: string | null
  description: string | null
  /** Nur eigene (lokale) Termine lassen sich bearbeiten */
  editable: boolean
}

export interface CalendarEventInput {
  id?: number
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  description: string | null
}

export interface DocumentItem {
  id: number
  title: string
  filename: string
  ext: string
  size: number
  folder: string | null
  tags: string[]
  addedAt: string
  /** false = kein durchsuchbarer Text (z. B. gescanntes PDF, Bild) */
  hasText: boolean
}

export interface DocUpdate {
  title: string
  folder: string | null
  tags: string[]
}

export interface DocSearchHit {
  id: number
  /** Treffer-Auszug; Treffer sind mit den Steuerzeichen U+0001 (Anfang) und U+0002 (Ende) markiert */
  snippet: string
}

export type DocPreview =
  | { kind: 'native' }
  | { kind: 'html'; html: string }
  | { kind: 'slides'; slides: string[] }
  | { kind: 'external' }

export interface StudyTopic {
  id: number
  subjectId: number
  title: string
  done: boolean
}

export interface StudySubject {
  id: number
  name: string
  color: string
  /** 'YYYY-MM-DD' */
  examDate: string | null
  topics: StudyTopic[]
  /** insgesamt gelernte Minuten (Pomodoro) */
  minutes: number
}

export interface StudyStats {
  todayMinutes: number
  weekMinutes: number
  /** die letzten 7 Tage (ältester zuerst), Tag als 'YYYY-MM-DD' */
  daily: { date: string; minutes: number }[]
  /** aufeinanderfolgende Lerntage bis heute (ist heute noch nichts gelernt, zählt bis gestern) */
  streak: number
}

export interface AnkiTemplate {
  name: string
  qfmt: string
  afmt: string
}

export interface AnkiNotetype {
  id: number
  name: string
  kind: 'standard' | 'cloze'
  fields: string[]
  templates: AnkiTemplate[]
  css: string
}

export interface AnkiDeck {
  id: number
  /** Vollständiger Name; Unterstapel mit "::" getrennt */
  name: string
  total: number
  newCount: number
  learnCount: number
  dueCount: number
}

export interface AnkiNote {
  id: number
  notetypeId: number
  deckId: number
  fields: string[]
  tags: string[]
  mediaNs: string
}

export interface AnkiNoteInput {
  id?: number
  notetypeId: number
  deckId: number
  fields: string[]
  tags: string[]
}

export interface AnkiBrowseRow {
  cardId: number
  noteId: number
  title: string
  ord: number
  notetype: string
  deck: string
  status: 'new' | 'learning' | 'review' | 'suspended'
  /** ISO-Zeitstempel der Fälligkeit; null bei neuen Karten */
  due: string | null
  tags: string[]
}

export interface AnkiBrowseResult {
  total: number
  rows: AnkiBrowseRow[]
}

export interface AnkiBrowseQuery {
  deckId: number | null
  text: string
  offset: number
  limit: number
}

export interface AnkiImportResult {
  decks: number
  notes: number
  cards: number
  media: number
  skipped: number
}

export interface AnkiStudyCounts {
  new: number
  learn: number
  due: number
}

export interface AnkiStudyCard {
  cardId: number
  noteId: number
  state: 'new' | 'learning' | 'review'
  question: string
  answer: string
  css: string
  /** Beschriftung der Bewertungsknöpfe: 1 Nochmal, 2 Schwer, 3 Gut, 4 Einfach */
  previews: Record<1 | 2 | 3 | 4, string>
}

export interface AnkiStudyNext {
  card: AnkiStudyCard | null
  counts: AnkiStudyCounts
}

export interface AnkiPreview {
  question: string
  answer: string
  css: string
}

export interface AnkiProgress {
  phase: string
  done: number
  total: number
}

export interface AnkiDownloadEvent {
  status: 'downloading' | 'importing' | 'done' | 'error'
  filename: string
  result?: AnkiImportResult
  error?: string
}

export interface AppInfo {
  version: string
  packaged: boolean
  dataDir: string
  logsDir: string
  backupsDir: string
  /** Datum der letzten Sicherung ('YYYY-MM-DD') */
  lastBackup: string | null
}

export interface UniApi {
  web: {
    show(id: WebModuleId, bounds: Bounds): Promise<void>
    hide(): Promise<void>
    nav(action: 'back' | 'forward' | 'reload'): Promise<void>
  }
  todos: {
    list(): Promise<Todo[]>
    add(input: TodoInput): Promise<void>
    update(id: number, input: TodoInput): Promise<void>
    setStatus(id: number, status: TodoStatus): Promise<void>
    remove(id: number): Promise<void>
    categories(): Promise<TodoCategory[]>
    addCategory(name: string, color: string): Promise<number>
    updateCategory(id: number, name: string, color: string): Promise<void>
    removeCategory(id: number): Promise<void>
  }
  calendar: {
    sources(): Promise<CalendarSource[]>
    addUrl(name: string, url: string, color: string): Promise<void>
    importFile(): Promise<number | null>
    removeSource(id: number): Promise<void>
    sync(id?: number): Promise<void>
    events(fromIso: string, toIso: string): Promise<CalendarEvent[]>
    saveEvent(input: CalendarEventInput): Promise<void>
    deleteEvent(id: number): Promise<void>
    /** Exportiert die eigenen Termine als .ics; null = abgebrochen */
    exportIcs(): Promise<number | null>
  }
  docs: {
    list(): Promise<DocumentItem[]>
    importDialog(folder: string | null): Promise<number>
    importPaths(paths: string[], folder: string | null): Promise<number>
    /** Absoluter Pfad einer per Drag&Drop abgelegten Datei */
    pathForFile(file: File): string
    update(id: number, patch: DocUpdate): Promise<void>
    remove(id: number): Promise<void>
    search(query: string): Promise<DocSearchHit[]>
    preview(id: number): Promise<DocPreview>
    showView(id: number, bounds: Bounds): Promise<void>
    hideView(): Promise<void>
    /** Öffnet die gespeicherte Datei im Standardprogramm von Windows (keine Webadresse) */
    openInDefaultApp(id: number): Promise<void>
    reveal(id: number): Promise<void>
    /** Wird ausgelöst, wenn ein Download aus Exchange/lehre automatisch im Doc-Hub gelandet ist */
    onImported(cb: (p: { filename: string; folder: string }) => void): () => void
  }
  study: {
    list(): Promise<StudySubject[]>
    stats(): Promise<StudyStats>
    addSubject(name: string, color: string, examDate: string | null): Promise<void>
    updateSubject(id: number, patch: { name: string; color: string; examDate: string | null }): Promise<void>
    removeSubject(id: number): Promise<void>
    addTopics(subjectId: number, titles: string[]): Promise<void>
    renameTopic(id: number, title: string): Promise<void>
    toggleTopic(id: number): Promise<void>
    removeTopic(id: number): Promise<void>
    logSession(subjectId: number | null, topicId: number | null, minutes: number): Promise<void>
  }
  sessions: {
    /** Meldet ab und löscht Cookies/Speicher des Dienstes, damit der nächste Login frisch startet */
    reset(id: SessionId): Promise<void>
  }
  /** Einfacher Speicher für UI-Einstellungen (nur Schlüssel mit Präfix "ui.") */
  ui: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  app: {
    /** Das Hauptprozess-Fenster bittet um einen Moduswechsel (z. B. nach einer Benachrichtigung) */
    onNavigate(cb: (module: ModuleId) => void): () => void
    /** Sendet eine Test-Benachrichtigung (prüft, ob Windows sie anzeigt) */
    testNotification(): Promise<void>
    getInfo(): Promise<AppInfo>
    openFolder(kind: 'data' | 'logs' | 'backups'): Promise<void>
    /** Legt sofort eine Sicherung der Datenbank an und liefert den Dateipfad */
    backupNow(): Promise<string>
    /** Fragt nach und löscht dann alle lokalen Daten (Datenbank, Dokumente, Anki, Sicherungen, Anmeldungen) und startet neu; false = abgebrochen */
    wipeData(): Promise<boolean>
    getAutostart(): Promise<{ supported: boolean; enabled: boolean; blocked: boolean }>
    setAutostart(enabled: boolean): Promise<void>
    /** Zeigt eine Windows-Benachrichtigung; ein Klick öffnet optional ein Modul (z. B. 'study') */
    notify(opts: { title: string; body: string; silent?: boolean; navigate?: 'home' | 'todo' | 'study' | 'calendar' | 'docs' | 'anki' }): Promise<void>
  }
  anki: {
    decks(): Promise<AnkiDeck[]>
    notetypes(): Promise<AnkiNotetype[]>
    createDeck(name: string): Promise<number>
    renameDeck(id: number, name: string): Promise<void>
    deleteDeck(id: number): Promise<void>
    getNote(id: number): Promise<AnkiNote>
    saveNote(input: AnkiNoteInput): Promise<number>
    deleteNotes(ids: number[]): Promise<void>
    browse(query: AnkiBrowseQuery): Promise<AnkiBrowseResult>
    setSuspended(cardId: number, suspended: boolean): Promise<void>
    preview(notetypeId: number, fields: string[], ord: number, mediaNs: string): Promise<AnkiPreview>
    cardPreview(cardId: number): Promise<AnkiPreview>
    next(deckId: number): Promise<AnkiStudyNext>
    answer(cardId: number, rating: 1 | 2 | 3 | 4): Promise<void>
    importApkg(keepProgress: boolean): Promise<AnkiImportResult | null>
    importText(deckId: number, hasHeader: boolean): Promise<AnkiImportResult | null>
    exportDeck(deckId: number, withProgress: boolean): Promise<number | null>
    addImage(): Promise<string | null>
    onProgress(cb: (p: AnkiProgress) => void): () => void
    /** .apkg-Downloads aus der Webansicht, die automatisch importiert werden */
    onDownload(cb: (e: AnkiDownloadEvent) => void): () => void
  }
}
