import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, Card, Checkbox, Empty, Progress, Space, Spin, Tag, Tooltip, Typography, theme } from 'antd'
import {
  BookOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FireOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RightOutlined
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { AnkiDeck, CalendarEvent, CalendarSource, ModuleId, StudyStats, StudySubject, Todo, TodoCategory } from '@shared/ipc'
import { fmtClock, PHASE_LABEL, phaseMs, usePomodoro } from './pomodoro'
import { C, PHASE, ANKI, ON_DARK, HIGHLIGHT, PROGRESS_RING, BRAND, tint } from '../theme/colors'

const DAY = 'YYYY-MM-DD'
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

interface Data {
  events: CalendarEvent[]
  sources: CalendarSource[]
  todos: Todo[]
  categories: TodoCategory[]
  subjects: StudySubject[]
  stats: StudyStats
  decks: AnkiDeck[]
}

function occursOn(e: CalendarEvent, day: Dayjs): boolean {
  if (e.allDay) return e.start <= day.format(DAY) && e.end > day.format(DAY)
  const s = dayjs(e.start)
  const end = dayjs(e.end)
  const from = day.startOf('day')
  const to = day.endOf('day')
  return s.isBefore(to) && (end.isAfter(from) || (end.isSame(s) && !s.isBefore(from)))
}

function timeLabel(e: CalendarEvent, day: Dayjs): string {
  if (e.allDay) return 'ganztägig'
  const s = dayjs(e.start)
  const end = dayjs(e.end)
  const startsBefore = s.isBefore(day.startOf('day'))
  const endsAfter = end.isAfter(day.endOf('day'))
  if (startsBefore && endsAfter) return 'ganztägig'
  if (startsBefore) return `bis ${end.format('HH:mm')}`
  if (endsAfter || end.isSame(s)) return s.format('HH:mm')
  return `${s.format('HH:mm')}–${end.format('HH:mm')}`
}

const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.allDay ? a.title.localeCompare(b.title, 'de') : a.start.localeCompare(b.start)

/* ---------- Bausteine ---------- */

function Panel({ title, icon, extra, onMore, children }: { title: string; icon?: ReactNode; extra?: ReactNode; onMore?: () => void; children: ReactNode }) {
  return (
    <Card
      size="small"
      title={
        <Space>
          {icon}
          {title}
        </Space>
      }
      extra={
        <Space size={4}>
          {extra}
          {onMore && <Button type="text" size="small" icon={<RightOutlined />} onClick={onMore} aria-label={`${title} öffnen`} />}
        </Space>
      }
    >
      {children}
    </Card>
  )
}

function Kpi({ icon, color, label, value, sub, onClick }: { icon: ReactNode; color: string; label: string; value: ReactNode; sub?: ReactNode; onClick: () => void }) {
  const { token } = theme.useToken()
  return (
    <Card hoverable size="small" onClick={onClick} styles={{ body: { display: 'flex', gap: 14, alignItems: 'center' } }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: token.borderRadiusLG,
          background: tint(color, 15),
          color,
          fontSize: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
        <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
        {sub && (
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
            {sub}
          </Typography.Text>
        )}
      </div>
    </Card>
  )
}

/* ---------- Heute ---------- */

function TodayCard({ now, data, go, onDone }: { now: Dayjs; data: Data; go: (m: ModuleId) => void; onDone: (id: number) => void }) {
  const { token } = theme.useToken()
  const colors = new Map(data.sources.map((s) => [s.id, s.color]))
  const catColor = new Map(data.categories.map((c) => [c.id, c.color]))
  const events = data.events.filter((e) => occursOn(e, now)).sort(byTime)
  const nextId = events.find((e) => !e.allDay && dayjs(e.start).isAfter(now))?.id
  const today = now.format(DAY)
  const tasks = data.todos.filter((t) => !t.done && t.due && t.due <= today)

  return (
    <Panel title="Heute" icon={<CalendarOutlined />} onMore={() => go('calendar')} extra={<Typography.Text type="secondary">{now.format('dddd, D. MMMM')}</Typography.Text>}>
      {events.length === 0 && tasks.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Heute stehen keine Termine oder fälligen Aufgaben an" />
      ) : (
        <>
          {events.map((e) => {
            const s = dayjs(e.start)
            const end = dayjs(e.end)
            const running = !e.allDay && !s.isAfter(now) && end.isAfter(now)
            const past = !e.allDay && !end.isAfter(now) && !running
            return (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: token.borderRadius,
                  borderLeft: `4px solid ${colors.get(e.sourceId) ?? token.colorPrimary}`,
                  background: running ? HIGHLIGHT.running : token.colorFillQuaternary,
                  opacity: past ? 0.5 : 1
                }}
              >
                <Typography.Text type="secondary" style={{ width: 96, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {timeLabel(e, now)}
                </Typography.Text>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Text strong ellipsis style={{ display: 'block' }}>
                    {e.title}
                  </Typography.Text>
                  {e.location && (
                    <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
                      <EnvironmentOutlined /> {e.location}
                    </Typography.Text>
                  )}
                </div>
                {running && <Tag color="blue" style={{ alignSelf: 'center', margin: 0 }}>Jetzt</Tag>}
                {e.id === nextId && <Tag color="green" style={{ alignSelf: 'center', margin: 0 }}>Als Nächstes</Tag>}
              </div>
            )
          })}

          {tasks.length > 0 && (
            <>
              <Typography.Text type="secondary" style={{ display: 'block', margin: '12px 0 4px', fontSize: 12 }}>
                FÄLLIGE AUFGABEN
              </Typography.Text>
              {tasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px' }}>
                  <Checkbox onChange={() => onDone(t.id)} />
                  <Badge color={t.categoryId ? catColor.get(t.categoryId) : undefined} />
                  <Typography.Text ellipsis style={{ flex: 1 }}>
                    {t.title}
                  </Typography.Text>
                  {t.due! < today && <Tag color="red" style={{ margin: 0 }}>überfällig</Tag>}
                  {t.status === 'doing' && <Tag color="blue" style={{ margin: 0 }}>in Bearbeitung</Tag>}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  )
}

function UpcomingCard({ now, data, go }: { now: Dayjs; data: Data; go: (m: ModuleId) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => now.add(i + 1, 'day'))
    .map((day) => ({
      day,
      events: data.events.filter((e) => occursOn(e, day)).sort(byTime),
      tasks: data.todos.filter((t) => !t.done && t.due === day.format(DAY))
    }))
    .filter((d) => d.events.length + d.tasks.length > 0)
    .slice(0, 5)

  return (
    <Panel title="Demnächst" icon={<ClockCircleOutlined />} onMore={() => go('calendar')} extra={<Typography.Text type="secondary">nächste 7 Tage</Typography.Text>}>
      {days.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nichts in den nächsten 7 Tagen" />
      ) : (
        days.map(({ day, events, tasks }) => {
          const items: { key: string; label: string; time: string; task: boolean }[] = [
            ...events.map((e) => ({ key: `e${e.id}`, label: e.title, time: timeLabel(e, day), task: false })),
            ...tasks.map((t) => ({ key: `t${t.id}`, label: t.title, time: 'Aufgabe', task: true }))
          ]
          return (
            <div key={day.format(DAY)} style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
              <div style={{ width: 96, flexShrink: 0 }}>
                <Typography.Text strong>{day.diff(now.startOf('day'), 'day') === 1 ? 'Morgen' : day.format('dd, DD.MM.')}</Typography.Text>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {items.slice(0, 3).map((i) => (
                  <div key={i.key} style={{ display: 'flex', gap: 8 }}>
                    <Typography.Text type="secondary" style={{ width: 84, flexShrink: 0, fontSize: 12, lineHeight: '22px' }}>
                      {i.task ? <CheckSquareOutlined /> : null} {i.time}
                    </Typography.Text>
                    <Typography.Text ellipsis>{i.label}</Typography.Text>
                  </div>
                ))}
                {items.length > 3 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>+ {items.length - 3} weitere</Typography.Text>}
              </div>
            </div>
          )
        })
      )}
    </Panel>
  )
}

/* ---------- Lernen ---------- */

function WeekBars({ daily }: { daily: StudyStats['daily'] }) {
  const { token } = theme.useToken()
  const max = Math.max(30, ...daily.map((d) => d.minutes))
  const today = dayjs().format(DAY)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 76 }}>
      {daily.map((d) => {
        const h = d.minutes ? Math.max(4, Math.round((d.minutes / max) * 52)) : 2
        return (
          <Tooltip key={d.date} title={`${dayjs(d.date).format('dddd, DD.MM.')}: ${d.minutes ? fmtMin(d.minutes) : 'nichts gelernt'}`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', maxWidth: 28, height: h, borderRadius: 4, background: d.date === today ? token.colorPrimary : d.minutes ? HIGHLIGHT.bar : token.colorFillSecondary }} />
              <Typography.Text type={d.date === today ? undefined : 'secondary'} style={{ fontSize: 11 }}>
                {dayjs(d.date).format('dd')}
              </Typography.Text>
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}

function LearningCard({ now, data, go }: { now: Dayjs; data: Data; go: (m: ModuleId) => void }) {
  const topics = data.subjects.flatMap((s) => s.topics)
  const done = topics.filter((t) => t.done).length
  const percent = topics.length ? Math.round((done / topics.length) * 100) : 0
  const exams = data.subjects
    .filter((s) => s.examDate && s.examDate >= now.format(DAY))
    .sort((a, b) => a.examDate!.localeCompare(b.examDate!))
    .slice(0, 3)

  return (
    <Panel title="Lernfortschritt" icon={<BookOutlined />} onMore={() => go('study')}>
      {data.subjects.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Lege im Lernplaner Fächer und Themen an">
          <Button type="primary" onClick={() => go('study')}>
            Zum Lernplaner
          </Button>
        </Empty>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 12 }}>
            <Progress type="circle" size={96} percent={percent} strokeColor={PROGRESS_RING} />
            <div>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {done} von {topics.length} Themen
              </Typography.Text>
              <div>
                <Typography.Text type="secondary">in {plural(data.subjects.length, 'Fach', 'Fächern')} erledigt</Typography.Text>
              </div>
              {exams.map((s) => {
                const days = dayjs(s.examDate!).diff(now.startOf('day'), 'day')
                return (
                  <Tag key={s.id} color={days <= 7 ? 'red' : days <= 21 ? 'orange' : 'blue'} style={{ marginTop: 6 }}>
                    {s.name}: {days === 0 ? 'heute' : `in ${plural(days, 'Tag', 'Tagen')}`}
                  </Tag>
                )
              })}
            </div>
          </div>
          {data.subjects.map((s) => {
            const d = s.topics.filter((t) => t.done).length
            return (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <Typography.Text ellipsis>
                    <Badge color={s.color} /> {s.name}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {d}/{s.topics.length}
                  </Typography.Text>
                </div>
                <Progress percent={s.topics.length ? Math.round((d / s.topics.length) * 100) : 0} strokeColor={s.color} size="small" showInfo={false} />
              </div>
            )
          })}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            LERNZEIT DIESE WOCHE · {fmtMin(data.stats.weekMinutes)}
          </Typography.Text>
          {data.stats.streak > 0 && (
            <Tag icon={<FireOutlined />} color="orange" style={{ margin: 0 }}>
              {plural(data.stats.streak, 'Tag', 'Tage')} in Folge
            </Tag>
          )}
        </Space>
        <WeekBars daily={data.stats.daily} />
      </div>
    </Panel>
  )
}

function FocusCard({ go }: { go: (m: ModuleId) => void }) {
  const p = usePomodoro()
  const color = PHASE[p.phase]
  const total = phaseMs(p.settings, p.phase)
  const left = p.status === 'idle' ? total : p.remainingMs
  return (
    <Panel title="Fokus-Timer" icon={<ClockCircleOutlined />} onMore={() => go('study')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Progress type="circle" size={72} percent={p.status === 'idle' ? 0 : ((total - left) / total) * 100} strokeColor={color} format={() => ''} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtClock(left)}</div>
          <Typography.Text type="secondary" ellipsis style={{ display: 'block' }}>
            {PHASE_LABEL[p.phase]}
            {p.status === 'paused' ? ' · pausiert' : ''}
            {p.target ? ` · ${p.target.label}` : ''}
          </Typography.Text>
        </div>
        {p.status === 'running' ? (
          <Button type="primary" icon={<PauseCircleOutlined />} onClick={p.pause}>
            Pause
          </Button>
        ) : (
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={p.start}>
            {p.status === 'paused' ? 'Weiter' : 'Start'}
          </Button>
        )}
      </div>
    </Panel>
  )
}

function AnkiCard({ decks, go }: { decks: AnkiDeck[]; go: (m: ModuleId) => void }) {
  // Nur oberste Stapel summieren, sonst würden Unterstapel doppelt zählen
  const roots = decks.filter((d) => !decks.some((o) => o.id !== d.id && d.name.startsWith(o.name + '::')))
  const sum = (k: 'newCount' | 'learnCount' | 'dueCount') => roots.reduce((n, d) => n + d[k], 0)
  const open = sum('newCount') + sum('learnCount') + sum('dueCount')
  return (
    <Panel title="Anki" icon={<BookOutlined />} onMore={() => go('anki')}>
      {decks.length === 0 ? (
        <Typography.Text type="secondary">Noch keine Stapel – importiere ein Anki-Paket.</Typography.Text>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
            {[
              { label: 'Neu', value: sum('newCount'), color: ANKI.new },
              { label: 'Lernen', value: sum('learnCount'), color: ANKI.learn },
              { label: 'Fällig', value: sum('dueCount'), color: ANKI.due }
            ].map((c) => (
              <div key={c.label}>
                <div style={{ fontSize: 26, fontWeight: 600, color: c.value ? c.color : ON_DARK.textFaint, lineHeight: 1.1 }}>{c.value}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {c.label}
                </Typography.Text>
              </div>
            ))}
          </div>
          <Button type="primary" disabled={open === 0} onClick={() => go('anki')}>
            {open ? 'Jetzt lernen' : 'Für heute fertig'}
          </Button>
        </>
      )}
    </Panel>
  )
}

/* ---------- Seite ---------- */

export function HomeView({ go }: { go: (m: ModuleId) => void }) {
  const [now, setNow] = useState(dayjs())
  const [data, setData] = useState<Data | null>(null)
  const sessionsVersion = usePomodoro((s) => s.sessionsVersion)

  const load = useCallback(async () => {
    const start = dayjs().startOf('day')
    const [events, sources, todos, categories, subjects, stats, decks] = await Promise.all([
      window.uni.calendar.events(start.toISOString(), start.add(8, 'day').toISOString()),
      window.uni.calendar.sources(),
      window.uni.todos.list(),
      window.uni.todos.categories(),
      window.uni.study.list(),
      window.uni.study.stats(),
      window.uni.anki.decks()
    ])
    setData({ events, sources, todos, categories, subjects, stats, decks })
    setNow(dayjs())
  }, [])

  useEffect(() => {
    load().catch((e) => console.warn('Übersicht konnte nicht geladen werden', e))
  }, [load, sessionsVersion])

  // Uhrzeit minütlich nachziehen, Daten alle 5 Minuten und beim Zurückkehren ins Fenster auffrischen
  useEffect(() => {
    const tick = setInterval(() => setNow(dayjs()), 30_000)
    const refresh = setInterval(() => load().catch(() => {}), 5 * 60_000)
    const onVisible = () => {
      if (!document.hidden) load().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      clearInterval(refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const complete = async (id: number) => {
    await window.uni.todos.setStatus(id, 'done')
    load().catch(() => {})
  }

  const summary = useMemo(() => {
    if (!data) return null
    const today = now.format(DAY)
    const events = data.events.filter((e) => occursOn(e, now)).sort(byTime)
    const upcoming = events.find((e) => !e.allDay && dayjs(e.start).isAfter(now))
    const due = data.todos.filter((t) => !t.done && t.due && t.due <= today)
    const roots = data.decks.filter((d) => !data.decks.some((o) => o.id !== d.id && d.name.startsWith(o.name + '::')))
    return {
      events,
      upcoming,
      due,
      overdue: due.filter((t) => t.due! < today).length,
      doing: data.todos.filter((t) => t.status === 'doing').length,
      ankiOpen: roots.reduce((n, d) => n + d.newCount + d.learnCount + d.dueCount, 0)
    }
  }, [data, now])

  if (!data || !summary) return <Spin style={{ margin: 48 }} />

  const hour = now.hour()
  const greeting = hour < 5 ? 'Hallo' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {greeting}
        </Typography.Title>
        <Typography.Text type="secondary">{now.format('dddd, D. MMMM YYYY')}</Typography.Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Kpi
          icon={<CalendarOutlined />}
          color={BRAND}
          label="Termine heute"
          value={summary.events.length}
          sub={summary.upcoming ? `Als Nächstes ${dayjs(summary.upcoming.start).format('HH:mm')} · ${summary.upcoming.title}` : summary.events.length ? 'Keine weiteren heute' : 'Nichts geplant'}
          onClick={() => go('calendar')}
        />
        <Kpi
          icon={<CheckSquareOutlined />}
          color={C.orange}
          label="Aufgaben fällig"
          value={summary.due.length}
          sub={`${summary.overdue ? `${summary.overdue} überfällig · ` : ''}${summary.doing} in Bearbeitung`}
          onClick={() => go('todo')}
        />
        <Kpi
          icon={<ClockCircleOutlined />}
          color={C.magenta}
          label="Gelernt heute"
          value={fmtMin(data.stats.todayMinutes)}
          sub={`Woche: ${fmtMin(data.stats.weekMinutes)}${data.stats.streak ? ` · Serie ${data.stats.streak}` : ''}`}
          onClick={() => go('study')}
        />
        <Kpi
          icon={<BookOutlined />}
          color={C.green}
          label="Anki-Karten offen"
          value={summary.ankiOpen}
          sub={data.decks.length ? 'Neu, Lernen und Fällig' : 'Noch keine Stapel'}
          onClick={() => go('anki')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <TodayCard now={now} data={data} go={go} onDone={complete} />
          <UpcomingCard now={now} data={data} go={go} />
        </Space>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <LearningCard now={now} data={data} go={go} />
          <FocusCard go={go} />
          <AnkiCard decks={data.decks} go={go} />
        </Space>
      </div>
    </div>
  )
}
