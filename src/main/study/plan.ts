import type { PlanBlock, StudyPlan, SubjectPlan } from '@shared/ipc'
import { baseMinutes } from '@shared/studyPlan'

export { baseMinutes }

/** Standard-Lernzeit je Wochentag in Minuten, Sonntag zuerst */
export const DEFAULT_WEEKDAY_MINUTES = [60, 120, 120, 120, 120, 120, 90]

/** Kleinster sinnvoller Lernblock; kürzere Reste werden auf den nächsten Tag geschoben */
const MIN_BLOCK = 15
const STEP = 5
/** So viele abgeschlossene Themen mit Lernzeit braucht es, bevor die App die Schätzung an dich anpasst */
const MIN_SAMPLES = 3
const FACTOR_RANGE: [number, number] = [0.5, 2]

export interface PlanTopic {
  id: number
  title: string
  done: boolean
  effort: number
  difficulty: number
  /** bisher auf dieses Thema gebuchte Lernminuten */
  loggedMinutes: number
}

export interface PlanSubject {
  id: number
  name: string
  color: string
  examDate: string | null
  topics: PlanTopic[]
}

export interface PlanInput {
  subjects: PlanSubject[]
  /** Lernminuten je Wochentag, Sonntag zuerst (7 Werte) */
  weekdayMinutes: number[]
  /** heute als 'YYYY-MM-DD' */
  today: string
  /** heute schon gelernte Minuten (alle Fächer) */
  loggedToday: number
}

const roundUp = (n: number, step = STEP) => Math.ceil(n / step) * step

export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const dayOfWeek = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Wie schnell du im Vergleich zur Schätzung lernst: Durchschnitt aus gebuchter Lernzeit und Schätzung bei erledigten Themen.
 * Erst ab drei Themen mit Lernzeit, damit einzelne Ausreißer nichts verzerren.
 */
export function learnedFactor(subjects: PlanSubject[]): { value: number; samples: number } | null {
  const ratios: number[] = []
  for (const s of subjects)
    for (const t of s.topics)
      if (t.done && t.loggedMinutes >= 10) ratios.push(t.loggedMinutes / baseMinutes(t.effort, t.difficulty))
  if (ratios.length < MIN_SAMPLES) return null
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const value = Math.min(FACTOR_RANGE[1], Math.max(FACTOR_RANGE[0], mean))
  return { value: Math.round(value * 100) / 100, samples: ratios.length }
}

/** Planungshorizont je Fach in Tagen (ca. zwei Jahre) */
const MAX_HORIZON_DAYS = 730

/**
 * Verteilt die offenen Themen aller Fächer auf die Tage bis zur jeweiligen Prüfung.
 * Fächer mit früherer Prüfung kommen zuerst an die Reihe; die Tageskapazität teilen sich alle Fächer.
 * Themen ohne Prüfungstermin werden nicht eingeplant.
 */
export function buildPlan(input: PlanInput): StudyPlan {
  const learned = learnedFactor(input.subjects)
  const factor = learned?.value ?? 1
  const capacity = new Map<string, number>()
  const free = (day: string): number => {
    if (!capacity.has(day)) {
      const base = Math.max(0, input.weekdayMinutes[dayOfWeek(day)] ?? 0)
      capacity.set(day, day === input.today ? Math.max(0, base - input.loggedToday) : base)
    }
    return capacity.get(day)!
  }

  const blocks: PlanBlock[] = []
  const subjects: SubjectPlan[] = []
  const planned = input.subjects
    .filter((s) => s.examDate && s.examDate > input.today)
    .sort((a, b) => a.examDate!.localeCompare(b.examDate!) || a.id - b.id)

  for (const s of planned) {
    const lastDay = addDays(s.examDate!, -1)
    const days: string[] = []
    // Ein sehr weit entferntes Prüfungsdatum soll die Planung nicht ausufern lassen: höchstens MAX_HORIZON_DAYS Tage
    for (let d = input.today; d <= lastDay && days.length < MAX_HORIZON_DAYS; d = addDays(d, 1)) days.push(d)

    const open = s.topics.filter((t) => !t.done)
    const needs = open.map((t) => ({
      t,
      // angefangene Themen: bereits gelernte Zeit abziehen, aber ein Rest von mindestens einem Block bleibt
      left: Math.max(MIN_BLOCK, roundUp(baseMinutes(t.effort, t.difficulty) * factor) - t.loggedMinutes)
    }))
    const totalNeed = needs.reduce((n, x) => n + x.left, 0)
    const availableBefore = days.reduce((n, d) => n + free(d), 0)

    let missing = 0
    for (const n of needs) {
      for (const day of days) {
        if (n.left <= 0) break
        const room = free(day)
        if (room < MIN_BLOCK && room < n.left) continue
        let take = Math.min(n.left, room)
        // keine kleinen Reste hinterlassen, die als eigener Block ungünstig wären
        if (n.left - take > 0 && n.left - take < MIN_BLOCK) take = Math.max(MIN_BLOCK, take - (MIN_BLOCK - (n.left - take)))
        take = Math.min(take, room)
        if (take <= 0) continue
        capacity.set(day, room - take)
        n.left -= take
        blocks.push({ date: day, subjectId: s.id, subject: s.name, color: s.color, topicId: n.t.id, title: n.t.title, minutes: take })
      }
      missing += Math.max(0, n.left)
    }

    subjects.push({
      subjectId: s.id,
      subject: s.name,
      color: s.color,
      examDate: s.examDate!,
      daysLeft: days.length,
      openTopics: open.length,
      neededMinutes: totalNeed,
      availableMinutes: availableBefore,
      missingMinutes: missing,
      extraPerDay: missing > 0 ? roundUp(missing / Math.max(1, days.length)) : 0
    })
  }

  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.subjectId - b.subjectId)
  return { blocks, subjects, factor: learned, weekdayMinutes: input.weekdayMinutes }
}
