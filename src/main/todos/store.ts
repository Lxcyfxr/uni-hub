import { getDb } from '../db'
import type { Todo, TodoCategory, TodoInput, TodoStatus } from '@shared/ipc'

interface TodoRow {
  id: number
  title: string
  notes: string | null
  due: string | null
  priority: number
  status: string
  category_id: number | null
}

const STATUSES: TodoStatus[] = ['open', 'doing', 'done']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function list(): Todo[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, notes, due, priority, status, category_id FROM todos
       ORDER BY due IS NULL, due, priority DESC, id`
    )
    .all() as unknown as TodoRow[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    due: r.due,
    priority: (r.priority === 0 || r.priority === 2 ? r.priority : 1) as 0 | 1 | 2,
    status: (STATUSES.includes(r.status as TodoStatus) ? r.status : 'open') as TodoStatus,
    done: r.status === 'done',
    categoryId: r.category_id
  }))
}

function checked(input: TodoInput) {
  const title = input.title.trim()
  if (!title) throw new Error('Bitte einen Titel eingeben')
  if (input.due && !DAY_RE.test(input.due)) throw new Error('Ungültiges Datum')
  if (![0, 1, 2].includes(input.priority)) throw new Error('Ungültige Priorität')
  if (input.status && !STATUSES.includes(input.status)) throw new Error('Ungültiger Status')
  if (input.categoryId !== null && !getDb().prepare('SELECT 1 FROM todo_categories WHERE id = ?').get(input.categoryId)) {
    throw new Error('Kategorie nicht gefunden')
  }
  return { title, notes: input.notes?.trim() || null, due: input.due || null }
}

const doneAt = (status: TodoStatus) => (status === 'done' ? new Date().toISOString() : null)

export function add(input: TodoInput): void {
  const v = checked(input)
  const status = input.status ?? 'open'
  getDb()
    .prepare('INSERT INTO todos (title,notes,due,priority,done,status,completed_at,category_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(v.title, v.notes, v.due, input.priority, status === 'done' ? 1 : 0, status, doneAt(status), input.categoryId)
}

export function update(id: number, input: TodoInput): void {
  const v = checked(input)
  const db = getDb()
  const res = db
    .prepare('UPDATE todos SET title = ?, notes = ?, due = ?, priority = ?, category_id = ? WHERE id = ?')
    .run(v.title, v.notes, v.due, input.priority, input.categoryId, id)
  if (!res.changes) throw new Error('Aufgabe nicht gefunden')
  if (input.status) setStatus(id, input.status)
}

export function setStatus(id: number, status: TodoStatus): void {
  if (!STATUSES.includes(status)) throw new Error('Ungültiger Status')
  // completed_at nur beim Wechsel nach "erledigt" neu setzen, damit Sortierung/Anzeige stabil bleibt
  getDb()
    .prepare(
      `UPDATE todos SET status = ?, done = ?,
         completed_at = CASE WHEN ? = 'done' THEN COALESCE(CASE WHEN status = 'done' THEN completed_at END, ?) ELSE NULL END
       WHERE id = ?`
    )
    .run(status, status === 'done' ? 1 : 0, status, new Date().toISOString(), id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM todos WHERE id = ?').run(id)
}

/* ---------- Kategorien ---------- */

export function categories(): TodoCategory[] {
  return getDb().prepare('SELECT id, name, color FROM todo_categories ORDER BY name COLLATE NOCASE').all() as unknown as TodoCategory[]
}

function checkedCategory(name: string, color: string): { name: string; color: string } {
  const n = name.trim().replace(/\s+/g, ' ')
  if (!n) throw new Error('Bitte einen Namen eingeben')
  if (!COLOR_RE.test(color)) throw new Error('Ungültige Farbe')
  return { name: n, color }
}

function uniqueName(name: string, exceptId: number | null): void {
  const hit = getDb().prepare('SELECT id FROM todo_categories WHERE name = ? COLLATE NOCASE').get(name) as unknown as { id: number } | undefined
  if (hit && hit.id !== exceptId) throw new Error('Eine Kategorie mit diesem Namen existiert bereits')
}

export function addCategory(name: string, color: string): number {
  const v = checkedCategory(name, color)
  uniqueName(v.name, null)
  return Number(getDb().prepare('INSERT INTO todo_categories (name,color) VALUES (?,?)').run(v.name, v.color).lastInsertRowid)
}

export function updateCategory(id: number, name: string, color: string): void {
  const v = checkedCategory(name, color)
  uniqueName(v.name, id)
  getDb().prepare('UPDATE todo_categories SET name = ?, color = ? WHERE id = ?').run(v.name, v.color, id)
}

/** Aufgaben der Kategorie bleiben erhalten und sind danach „ohne Kategorie“. */
export function removeCategory(id: number): void {
  getDb().prepare('DELETE FROM todo_categories WHERE id = ?').run(id)
}
