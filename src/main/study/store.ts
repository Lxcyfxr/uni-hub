import { getDb } from '../db'
import type { StudyStats, StudySubject, StudyTopic } from '@shared/ipc'

interface SubjectRow {
  id: number
  name: string
  color: string
  exam_date: string | null
  minutes: number
}
interface TopicRow {
  id: number
  subject_id: number
  title: string
  done: number
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function checkSubject(name: string, color: string, exam: string | null): { name: string; color: string; exam: string | null } {
  const n = name.trim()
  if (!n) throw new Error('Bitte einen Namen eingeben')
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Ungültige Farbe')
  if (exam && !DAY_RE.test(exam)) throw new Error('Ungültiges Prüfungsdatum')
  return { name: n, color, exam: exam || null }
}

export function list(): StudySubject[] {
  const db = getDb()
  const subjects = db
    .prepare(
      `SELECT s.id, s.name, s.color, s.exam_date,
              COALESCE((SELECT SUM(minutes) FROM study_sessions WHERE subject_id = s.id), 0) AS minutes
       FROM study_subjects s ORDER BY s.id`
    )
    .all() as unknown as SubjectRow[]
  const topics = db.prepare('SELECT id, subject_id, title, done FROM study_topics ORDER BY position, id').all() as unknown as TopicRow[]
  const bySubject = new Map<number, StudyTopic[]>()
  for (const t of topics) {
    const arr = bySubject.get(t.subject_id) ?? []
    arr.push({ id: t.id, subjectId: t.subject_id, title: t.title, done: !!t.done })
    bySubject.set(t.subject_id, arr)
  }
  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    examDate: s.exam_date,
    topics: bySubject.get(s.id) ?? [],
    minutes: Number(s.minutes)
  }))
}

export function stats(): StudyStats {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(finished_at, 'localtime') = date('now', 'localtime') THEN minutes END), 0) AS today,
         COALESCE(SUM(CASE WHEN date(finished_at, 'localtime') >= date('now', 'localtime', '-6 days') THEN minutes END), 0) AS week
       FROM study_sessions`
    )
    .get() as unknown as { today: number; week: number }
  const perDay = new Map<string, number>()
  const days = getDb()
    .prepare(
      `SELECT date(finished_at, 'localtime') AS d, SUM(minutes) AS m FROM study_sessions
       WHERE date(finished_at, 'localtime') >= date('now', 'localtime', '-400 days') GROUP BY d`
    )
    .all() as unknown as { d: string; m: number }[]
  for (const r of days) perDay.set(r.d, Number(r.m))

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const back = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return key(d)
  }
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = back(6 - i)
    return { date, minutes: perDay.get(date) ?? 0 }
  })
  let streak = 0
  for (let i = perDay.has(back(0)) ? 0 : 1; perDay.has(back(i)); i++) streak++
  return { todayMinutes: Number(row.today), weekMinutes: Number(row.week), daily, streak }
}

export function addSubject(name: string, color: string, exam: string | null): void {
  const v = checkSubject(name, color, exam)
  getDb().prepare('INSERT INTO study_subjects (name,color,exam_date) VALUES (?,?,?)').run(v.name, v.color, v.exam)
}

export function updateSubject(id: number, patch: { name: string; color: string; examDate: string | null }): void {
  const v = checkSubject(patch.name, patch.color, patch.examDate)
  getDb().prepare('UPDATE study_subjects SET name = ?, color = ?, exam_date = ? WHERE id = ?').run(v.name, v.color, v.exam, id)
}

export function removeSubject(id: number): void {
  getDb().prepare('DELETE FROM study_subjects WHERE id = ?').run(id)
}

export function addTopics(subjectId: number, titles: string[]): void {
  const clean = titles.map((t) => t.trim()).filter(Boolean)
  if (!clean.length) return
  const db = getDb()
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM study_topics WHERE subject_id = ?').get(subjectId) as unknown as { m: number }
  const ins = db.prepare('INSERT INTO study_topics (subject_id,title,position) VALUES (?,?,?)')
  db.exec('BEGIN')
  try {
    clean.forEach((t, i) => ins.run(subjectId, t, Number(max.m) + i + 1))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function renameTopic(id: number, title: string): void {
  const t = title.trim()
  if (!t) throw new Error('Thema darf nicht leer sein')
  getDb().prepare('UPDATE study_topics SET title = ? WHERE id = ?').run(t, id)
}

export function toggleTopic(id: number): void {
  getDb()
    .prepare("UPDATE study_topics SET done = 1 - done, done_at = CASE WHEN done = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE id = ?")
    .run(id)
}

export function removeTopic(id: number): void {
  getDb().prepare('DELETE FROM study_topics WHERE id = ?').run(id)
}

export function logSession(subjectId: number | null, topicId: number | null, minutes: number): void {
  const m = Math.round(minutes)
  if (!Number.isFinite(m) || m < 1 || m > 600) return
  getDb().prepare('INSERT INTO study_sessions (subject_id,topic_id,minutes,finished_at) VALUES (?,?,?,?)').run(subjectId, topicId, m, new Date().toISOString())
}
