import { describe, expect, it } from 'vitest'
import { addDays, baseMinutes, buildPlan, learnedFactor, type PlanSubject, type PlanTopic } from '../src/main/study/plan'

const topic = (id: number, p: Partial<PlanTopic> = {}): PlanTopic => ({ id, title: `T${id}`, done: false, effort: 2, difficulty: 2, loggedMinutes: 0, ...p })
const subject = (id: number, examDate: string | null, topics: PlanTopic[]): PlanSubject => ({ id, name: `F${id}`, color: '#1677ff', examDate, topics })
const flat = (n: number) => Array(7).fill(n)
const TODAY = '2026-10-12'

describe('baseMinutes', () => {
  it('rechnet Umfang und Schwierigkeit zusammen', () => {
    expect(baseMinutes(2, 2)).toBe(120)
    expect(baseMinutes(1, 1)).toBe(45)
    expect(baseMinutes(3, 3)).toBe(360)
  })
})

describe('buildPlan', () => {
  it('plant nichts ohne Prüfungstermin oder mit vergangener Prüfung', () => {
    const plan = buildPlan({ subjects: [subject(1, null, [topic(1)]), subject(2, '2026-10-12', [topic(2)])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.blocks).toEqual([])
    expect(plan.subjects).toEqual([])
  })

  it('verteilt Themen der Reihe nach auf die Tage vor der Prüfung', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1), topic(2), topic(3)])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.blocks.map((b) => [b.date, b.topicId, b.minutes])).toEqual([
      ['2026-10-12', 1, 120],
      ['2026-10-13', 2, 120],
      ['2026-10-14', 3, 120]
    ])
    expect(plan.subjects[0]).toMatchObject({ openTopics: 3, neededMinutes: 360, missingMinutes: 0, extraPerDay: 0 })
  })

  it('teilt ein langes Thema auf mehrere Tage auf', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1, { effort: 3 })])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.blocks.map((b) => [b.date, b.minutes])).toEqual([
      ['2026-10-12', 120],
      ['2026-10-13', 120]
    ])
  })

  it('zieht die heute schon gelernte Zeit von der Tageskapazität ab', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1)])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 90 })
    expect(plan.blocks[0]).toMatchObject({ date: TODAY, minutes: 30 })
    expect(plan.blocks.reduce((n, b) => n + b.minutes, 0)).toBe(120)
  })

  it('rechnet bereits gelernte Zeit am Thema ab', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1, { loggedMinutes: 90 })])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.blocks.reduce((n, b) => n + b.minutes, 0)).toBe(30)
  })

  it('überspringt erledigte Themen', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1, { done: true }), topic(2)])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.blocks.map((b) => b.topicId)).toEqual([2])
  })

  it('meldet, wenn die Zeit nicht reicht, samt Mehrbedarf pro Tag', () => {
    // Prüfung morgen: nur heute ist verfügbar, 120 Minuten für ein 240-Minuten-Thema
    const plan = buildPlan({ subjects: [subject(1, '2026-10-13', [topic(1, { effort: 3 })])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.subjects[0]).toMatchObject({ daysLeft: 1, neededMinutes: 240, availableMinutes: 120, missingMinutes: 120, extraPerDay: 120 })
  })

  it('lässt Fächer mit früherer Prüfung zuerst planen und teilt die Tageszeit', () => {
    const plan = buildPlan({
      subjects: [subject(1, '2026-10-30', [topic(1)]), subject(2, '2026-10-14', [topic(2)])],
      weekdayMinutes: flat(120),
      today: TODAY,
      loggedToday: 0
    })
    const early = plan.blocks.find((b) => b.subjectId === 2)!
    const late = plan.blocks.find((b) => b.subjectId === 1)!
    expect(early.date).toBe(TODAY)
    expect(late.date).toBe('2026-10-13')
  })

  it('plant keine Tage ohne Lernzeit ein', () => {
    // Sonntag (Index 0) ohne Lernzeit; 2026-10-11 ist ein Sonntag
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1)])], weekdayMinutes: [0, 120, 120, 120, 120, 120, 120], today: '2026-10-11', loggedToday: 0 })
    expect(plan.blocks[0].date).toBe('2026-10-12')
  })

  it('verschiebt Reste unter einem Mindestblock nicht in Mini-Blöcke', () => {
    const plan = buildPlan({ subjects: [subject(1, '2026-10-20', [topic(1, { effort: 2 })])], weekdayMinutes: [0, 115, 115, 115, 115, 115, 0], today: TODAY, loggedToday: 0 })
    expect(plan.blocks.every((b) => b.minutes >= 15)).toBe(true)
    expect(plan.blocks.reduce((n, b) => n + b.minutes, 0)).toBe(120)
  })
})

describe('learnedFactor', () => {
  const done = (id: number, logged: number) => topic(id, { done: true, loggedMinutes: logged })
  it('braucht mindestens drei erledigte Themen mit Lernzeit', () => {
    expect(learnedFactor([subject(1, null, [done(1, 120), done(2, 120)])])).toBeNull()
  })
  it('berechnet das Verhältnis aus gelernter und geschätzter Zeit', () => {
    const f = learnedFactor([subject(1, null, [done(1, 180), done(2, 180), done(3, 180)])])
    expect(f).toEqual({ value: 1.5, samples: 3 })
  })
  it('begrenzt extreme Werte', () => {
    expect(learnedFactor([subject(1, null, [done(1, 1000), done(2, 1000), done(3, 1000)])])!.value).toBe(2)
  })
  it('wirkt auf die Planung', () => {
    const slow = [done(1, 180), done(2, 180), done(3, 180)]
    const plan = buildPlan({ subjects: [subject(1, '2026-10-30', [...slow, topic(4)])], weekdayMinutes: flat(120), today: TODAY, loggedToday: 0 })
    expect(plan.factor?.value).toBe(1.5)
    expect(plan.blocks.reduce((n, b) => n + b.minutes, 0)).toBe(180)
  })
})

describe('addDays', () => {
  it('rechnet über Monatsgrenzen', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
