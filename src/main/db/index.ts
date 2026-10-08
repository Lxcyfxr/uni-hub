import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

let db: DatabaseSync

const MIGRATIONS = [
  `CREATE TABLE todos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     due TEXT,
     priority INTEGER NOT NULL DEFAULT 1,
     done INTEGER NOT NULL DEFAULT 0,
     course TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE calendar_sources (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     kind TEXT NOT NULL,
     url TEXT,
     color TEXT NOT NULL DEFAULT '#1677ff',
     last_sync TEXT,
     error TEXT
   );
   CREATE TABLE calendar_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     source_id INTEGER NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
     uid TEXT,
     title TEXT NOT NULL,
     start TEXT NOT NULL,
     end TEXT NOT NULL,
     all_day INTEGER NOT NULL DEFAULT 0,
     location TEXT,
     description TEXT
   );
   CREATE INDEX idx_calendar_events_start ON calendar_events(start);`,
  `CREATE TABLE documents (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     filename TEXT NOT NULL,
     path TEXT NOT NULL UNIQUE,
     ext TEXT NOT NULL,
     size INTEGER NOT NULL,
     folder TEXT,
     tags TEXT NOT NULL DEFAULT '',
     added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     has_text INTEGER NOT NULL DEFAULT 0
   );
   CREATE VIRTUAL TABLE docs_fts USING fts5(title, content, tokenize = 'unicode61 remove_diacritics 2');`,
  `CREATE TABLE study_subjects (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     color TEXT NOT NULL DEFAULT '#1677ff',
     exam_date TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE study_topics (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     subject_id INTEGER NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     done INTEGER NOT NULL DEFAULT 0,
     done_at TEXT,
     position INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX idx_study_topics_subject ON study_topics(subject_id);
   CREATE TABLE study_sessions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     subject_id INTEGER REFERENCES study_subjects(id) ON DELETE SET NULL,
     topic_id INTEGER REFERENCES study_topics(id) ON DELETE SET NULL,
     minutes INTEGER NOT NULL,
     finished_at TEXT NOT NULL
   );`,
  `CREATE TABLE anki_notetypes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     kind TEXT NOT NULL DEFAULT 'standard',
     fields TEXT NOT NULL,
     templates TEXT NOT NULL,
     css TEXT NOT NULL DEFAULT '',
     hash TEXT
   );
   CREATE INDEX idx_anki_notetypes_hash ON anki_notetypes(hash);
   CREATE TABLE anki_decks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE
   );
   CREATE TABLE anki_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     notetype_id INTEGER NOT NULL REFERENCES anki_notetypes(id),
     guid TEXT NOT NULL,
     fields TEXT NOT NULL,
     sort_text TEXT NOT NULL DEFAULT '',
     tags TEXT NOT NULL DEFAULT '',
     media_ns TEXT NOT NULL DEFAULT 'own',
     created_at INTEGER NOT NULL,
     modified_at INTEGER NOT NULL
   );
   CREATE INDEX idx_anki_notes_guid ON anki_notes(guid);
   CREATE TABLE anki_cards (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     note_id INTEGER NOT NULL REFERENCES anki_notes(id) ON DELETE CASCADE,
     deck_id INTEGER NOT NULL REFERENCES anki_decks(id) ON DELETE CASCADE,
     ord INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0,
     state INTEGER NOT NULL DEFAULT 0,
     due INTEGER NOT NULL,
     stability REAL NOT NULL DEFAULT 0,
     difficulty REAL NOT NULL DEFAULT 0,
     elapsed_days INTEGER NOT NULL DEFAULT 0,
     scheduled_days INTEGER NOT NULL DEFAULT 0,
     learning_steps INTEGER NOT NULL DEFAULT 0,
     reps INTEGER NOT NULL DEFAULT 0,
     lapses INTEGER NOT NULL DEFAULT 0,
     last_review INTEGER,
     suspended INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX idx_anki_cards_deck ON anki_cards(deck_id, state, due);
   CREATE INDEX idx_anki_cards_note ON anki_cards(note_id);
   CREATE TABLE anki_revlog (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     card_id INTEGER NOT NULL REFERENCES anki_cards(id) ON DELETE CASCADE,
     rating INTEGER NOT NULL,
     state INTEGER NOT NULL,
     reviewed_at INTEGER NOT NULL,
     scheduled_days INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX idx_anki_revlog_time ON anki_revlog(reviewed_at);`,
  `CREATE TABLE todo_categories (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE,
     color TEXT NOT NULL DEFAULT '#1677ff'
   );
   ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
   ALTER TABLE todos ADD COLUMN notes TEXT;
   ALTER TABLE todos ADD COLUMN completed_at TEXT;
   ALTER TABLE todos ADD COLUMN category_id INTEGER REFERENCES todo_categories(id) ON DELETE SET NULL;
   UPDATE todos SET status = CASE WHEN done = 1 THEN 'done' ELSE 'open' END;
   UPDATE todos SET completed_at = created_at WHERE done = 1;
   INSERT INTO todo_categories (name) SELECT DISTINCT course FROM todos WHERE course IS NOT NULL AND TRIM(course) != '';
   UPDATE todos SET category_id = (SELECT id FROM todo_categories WHERE name = todos.course) WHERE course IS NOT NULL;`
]

let locked = false

/**
 * Schließt die Datenbank endgültig (z. B. vor dem Löschen aller Daten). Danach wirft getDb(), damit Zeitgeber
 * im Hintergrund die Datei nicht sofort neu anlegen.
 */
export function closeDb(): void {
  locked = true
  if (!db) return
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    /* beim Schließen unerheblich */
  }
  db.close()
  db = undefined as unknown as DatabaseSync
}

export function getDb(): DatabaseSync {
  if (locked) throw new Error('Die Datenbank ist geschlossen')
  if (db) return db
  db = new DatabaseSync(join(app.getPath('userData'), 'unihub.db'))
  db.exec('PRAGMA journal_mode = WAL')
  // Mit WAL ist NORMAL sicher gegen Beschädigung und deutlich schneller beim Schreiben (große Importe)
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return db
}

export function kvGet(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function kvSet(key: string, value: string): void {
  getDb().prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function kvDelete(key: string): void {
  getDb().prepare('DELETE FROM kv WHERE key = ?').run(key)
}
