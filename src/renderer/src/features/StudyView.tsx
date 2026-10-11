import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Tag,
  Tooltip,
  Typography,
  theme
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  StepForwardOutlined
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { PlanBlock, StudyPlan, StudyStats, StudySubject, StudyTopic } from '@shared/ipc'
import { DIFFICULTY_LABEL, EFFORT_LABEL, baseMinutes } from '@shared/studyPlan'
import { PHASE_LABEL, fmtClock, phaseMs, usePomodoro, type Phase } from './pomodoro'
import { PHASE, ON_DARK, DEFAULT_SOURCE_COLOR, SUCCESS } from '../theme/colors'

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const DAY = 'YYYY-MM-DD'
const PHASE_COLOR: Record<Phase, string> = PHASE

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`)
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)

function examLabel(date: string | null): { text: string; color: string } | null {
  if (!date) return null
  const days = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (days < 0) return { text: `Prüfung vor ${-days} T.`, color: 'default' }
  if (days === 0) return { text: 'Prüfung heute', color: 'red' }
  return { text: `Prüfung in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`, color: days <= 7 ? 'red' : days <= 21 ? 'orange' : 'blue' }
}

/* ---------- Pomodoro ---------- */

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = usePomodoro((s) => s.settings)
  const setSettings = usePomodoro((s) => s.setSettings)
  return (
    <Modal title="Pomodoro-Einstellungen" open={open} onCancel={onClose} footer={<Button type="primary" onClick={onClose}>Fertig</Button>}>
      <Form layout="horizontal" labelCol={{ span: 12 }} wrapperCol={{ span: 12 }}>
        <Form.Item label="Fokus-Zeit">
          <InputNumber min={1} max={180} value={settings.work} suffix="min" onChange={(v) => v != null && setSettings({ work: v })} />
        </Form.Item>
        <Form.Item label="Kurze Pause">
          <InputNumber min={1} max={60} value={settings.short} suffix="min" onChange={(v) => v != null && setSettings({ short: v })} />
        </Form.Item>
        <Form.Item label="Lange Pause">
          <InputNumber min={1} max={120} value={settings.long} suffix="min" onChange={(v) => v != null && setSettings({ long: v })} />
        </Form.Item>
        <Form.Item label="Runden bis lange Pause">
          <InputNumber min={2} max={12} value={settings.cycles} onChange={(v) => v != null && setSettings({ cycles: v })} />
        </Form.Item>
        <Form.Item label="Nächste Phase automatisch starten">
          <Switch checked={settings.autoStart} onChange={(v) => setSettings({ autoStart: v })} />
        </Form.Item>
        <Form.Item label="Signalton">
          <Switch checked={settings.sound} onChange={(v) => setSettings({ sound: v })} />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">Änderungen gelten ab der nächsten Phase bzw. sofort, wenn der Timer nicht läuft.</Typography.Text>
    </Modal>
  )
}

function PomodoroCard({ subjects, stats }: { subjects: StudySubject[]; stats: StudyStats }) {
  const p = usePomodoro()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const total = phaseMs(p.settings, p.phase)
  const elapsed = p.status === 'idle' ? 0 : total - p.remainingMs
  const color = PHASE_COLOR[p.phase]
  const doneInCycle = p.phase === 'long' && p.status !== 'running' ? p.settings.cycles : p.cycleCount % p.settings.cycles
  const filled = p.phase === 'long' ? p.settings.cycles : doneInCycle

  const options = useMemo(
    () =>
      subjects.map((s) => ({
        label: s.name,
        options: [
          { value: `s:${s.id}`, label: `${s.name} (allgemein)` },
          ...s.topics.filter((t) => !t.done).map((t) => ({ value: `t:${t.id}`, label: t.title }))
        ]
      })),
    [subjects]
  )

  const targetValue = p.target ? (p.target.topicId ? `t:${p.target.topicId}` : p.target.subjectId ? `s:${p.target.subjectId}` : undefined) : undefined
  const pickTarget = (v: string | undefined) => {
    if (!v) return p.setTarget(null)
    const id = Number(v.slice(2))
    if (v.startsWith('s:')) {
      const s = subjects.find((x) => x.id === id)
      return p.setTarget(s ? { subjectId: s.id, topicId: null, label: s.name } : null)
    }
    for (const s of subjects) {
      const t = s.topics.find((x) => x.id === id)
      if (t) return p.setTarget({ subjectId: s.id, topicId: t.id, label: t.title })
    }
    p.setTarget(null)
  }

  return (
    <Card
      title="Pomodoro"
      extra={<Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" />}
      styles={{ body: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 } }}
    >
      <Segmented
        value={p.phase}
        disabled={p.status === 'running'}
        onChange={(v) => p.setPhase(v as Phase)}
        options={(['work', 'short', 'long'] as Phase[]).map((ph) => ({ value: ph, label: PHASE_LABEL[ph] }))}
      />
      <Progress
        type="circle"
        size={200}
        percent={total ? (elapsed / total) * 100 : 0}
        strokeColor={color}
        format={() => (
          <div>
            <div style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(p.status === 'idle' ? total : p.remainingMs)}</div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>{p.status === 'paused' ? 'pausiert' : PHASE_LABEL[p.phase]}</div>
          </div>
        )}
      />
      <Space>
        {p.status === 'running' ? (
          <Button type="primary" size="large" icon={<PauseCircleOutlined />} onClick={p.pause}>
            Pause
          </Button>
        ) : (
          <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={p.start}>
            {p.status === 'paused' ? 'Weiter' : 'Start'}
          </Button>
        )}
        <Tooltip title="Zurücksetzen (Runde wird nicht gutgeschrieben)">
          <Button size="large" icon={<ReloadOutlined />} onClick={p.reset} disabled={p.status === 'idle'} />
        </Tooltip>
        <Tooltip title="Phase überspringen (angefangene Fokus-Zeit ab 1 min wird gutgeschrieben)">
          <Button size="large" icon={<StepForwardOutlined />} onClick={p.skip} />
        </Tooltip>
      </Space>
      <Space size={6} aria-label={`Runde ${Math.min(filled + 1, p.settings.cycles)} von ${p.settings.cycles}`}>
        {Array.from({ length: p.settings.cycles }, (_, i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < filled ? PHASE_COLOR.work : ON_DARK.dot }} />
        ))}
      </Space>
      <Select
        allowClear
        showSearch
        style={{ width: '100%' }}
        placeholder="Lernen für… (optional)"
        value={targetValue}
        options={options}
        onChange={pickTarget}
        optionFilterProp="label"
      />
      <Space size={24}>
        <Statistic title="Heute" value={fmtMinutes(stats.todayMinutes)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="7 Tage" value={fmtMinutes(stats.weekMinutes)} styles={{ content: { fontSize: 18 } }} />
      </Space>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Card>
  )
}

/* ---------- Prüfungsplan ---------- */

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
/** Anzeige beginnt am Montag; die gespeicherten Werte beginnen am Sonntag */
const slot = (i: number) => (i + 1) % 7

const dayLabel = (date: string) => {
  const d = dayjs(date).startOf('day')
  const diff = d.diff(dayjs().startOf('day'), 'day')
  return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : d.format('dd, DD.MM.')
}

function PlanMinutesModal({ open, minutes, onClose, onSaved }: { open: boolean; minutes: number[]; onClose: () => void; onSaved: () => void }) {
  const { message } = AntApp.useApp()
  const [draft, setDraft] = useState(minutes)
  useEffect(() => {
    if (open) setDraft(minutes)
  }, [open, minutes])

  const save = async () => {
    try {
      await window.uni.study.setPlanMinutes(draft)
      onSaved()
      onClose()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  return (
    <Modal title="Lernzeit pro Wochentag" open={open} onCancel={onClose} onOk={save} okText="Speichern" cancelText="Abbrechen" destroyOnHidden>
      <Typography.Paragraph type="secondary">
        So viel Zeit stehst du dem Plan an jedem Wochentag zur Verfügung. Mit 0 Minuten bleibt ein Tag frei.
      </Typography.Paragraph>
      <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }}>
        {WEEKDAYS.map((name, i) => (
          <Form.Item key={name} label={name} style={{ marginBottom: 8 }}>
            <InputNumber
              min={0}
              max={1440}
              step={15}
              value={draft[slot(i)]}
              suffix="min"
              onChange={(v) => v != null && setDraft((d) => d.map((x, k) => (k === slot(i) ? Math.round(v) : x)))}
            />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  )
}

function PlanCard({ plan, onChanged }: { plan: StudyPlan; onChanged: () => void }) {
  const startFor = usePomodoro((s) => s.startFor)
  const [minutesOpen, setMinutesOpen] = useState(false)
  const today = dayjs().format(DAY)
  const upcoming = useMemo(() => {
    const days = [...new Set(plan.blocks.map((b) => b.date))].filter((d) => d >= today).slice(0, 3)
    return days.map((d) => ({ date: d, blocks: plan.blocks.filter((b) => b.date === d) }))
  }, [plan.blocks, today])

  return (
    <Card
      title="Prüfungsplan"
      style={{ marginBottom: 24 }}
      extra={
        <Button type="text" icon={<SettingOutlined />} onClick={() => setMinutesOpen(true)}>
          Lernzeit
        </Button>
      }
    >
      {plan.subjects.length === 0 ? (
        <Typography.Text type="secondary">
          Trage bei einem Fach den Prüfungstermin ein und lege Umfang und Schwierigkeit der Themen fest. Dann verteilt Uni-Hub die offenen Themen auf deine freien Lerntage und passt den Plan automatisch an, wenn etwas liegen bleibt.
        </Typography.Text>
      ) : (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            {plan.subjects.map((s) => {
              const short = s.missingMinutes > 0
              return (
                <div key={s.subjectId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {s.subject}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {s.openTopics} {s.openTopics === 1 ? 'Thema' : 'Themen'} offen · Rest {fmtMinutes(s.neededMinutes)} · {s.daysLeft} {s.daysLeft === 1 ? 'Tag' : 'Tage'} bis zur Prüfung
                    </Typography.Text>
                  </div>
                  {short ? (
                    <Tooltip title={`Es fehlen ${fmtMinutes(s.missingMinutes)}. Mit etwa ${s.extraPerDay} min mehr pro Tag (Lernzeit anpassen) passt es.`}>
                      <Tag color="red" style={{ margin: 0 }}>Es fehlen {fmtMinutes(s.missingMinutes)}</Tag>
                    </Tooltip>
                  ) : (
                    <Tag color="green" style={{ margin: 0 }}>Im Plan</Tag>
                  )}
                </div>
              )
            })}
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
              {plan.factor
                ? `Dein Tempo: ${plan.factor.value.toLocaleString('de-DE')}× der Schätzung (aus ${plan.factor.samples} erledigten Themen). Der Plan rechnet damit.`
                : 'Nach drei erledigten Themen mit Lernzeit passt sich der Plan an dein Tempo an.'}
            </Typography.Text>
          </div>

          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ALS NÄCHSTES
            </Typography.Text>
            {upcoming.length === 0 ? (
              <div style={{ padding: '8px 0' }}>
                <Typography.Text type="secondary">Nichts mehr zu planen. Alle Themen sind erledigt oder eingeplant.</Typography.Text>
              </div>
            ) : (
              upcoming.map((d) => (
                <div key={d.date} style={{ margin: '6px 0 10px' }}>
                  <Typography.Text strong>{dayLabel(d.date)}</Typography.Text>
                  {d.blocks.map((b) => (
                    <div key={`${b.topicId}-${b.date}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: b.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text ellipsis style={{ display: 'block' }}>
                          {b.title}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {b.subject} · {fmtMinutes(b.minutes)}
                        </Typography.Text>
                      </div>
                      <Tooltip title="Pomodoro für dieses Thema starten">
                        <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={() => startFor({ subjectId: b.subjectId, topicId: b.topicId, label: b.title })} />
                      </Tooltip>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <PlanMinutesModal open={minutesOpen} minutes={plan.weekdayMinutes} onClose={() => setMinutesOpen(false)} onSaved={onChanged} />
    </Card>
  )
}

/** Umfang und Schwierigkeit eines Themas: Tag mit Kurzform, Klick öffnet die Auswahl. */
function TopicSize({ topic, factor, onChange }: { topic: StudyTopic; factor: number; onChange: (effort: number, difficulty: number) => void }) {
  const estimate = Math.round((baseMinutes(topic.effort, topic.difficulty) * factor) / 5) * 5
  const content = (
    <Space direction="vertical" size={10}>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Umfang</Typography.Text>
        <div>
          <Segmented
            size="small"
            value={topic.effort}
            onChange={(v) => onChange(Number(v), topic.difficulty)}
            options={[
              { value: 1, label: 'S klein' },
              { value: 2, label: 'M mittel' },
              { value: 3, label: 'L groß' }
            ]}
          />
        </div>
      </div>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Schwierigkeit</Typography.Text>
        <div>
          <Segmented
            size="small"
            value={topic.difficulty}
            onChange={(v) => onChange(topic.effort, Number(v))}
            options={[
              { value: 1, label: 'leicht' },
              { value: 2, label: 'mittel' },
              { value: 3, label: 'schwer' }
            ]}
          />
        </div>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Geschätzter Aufwand: {fmtMinutes(estimate)}
        {topic.loggedMinutes > 0 && ` · davon ${fmtMinutes(topic.loggedMinutes)} gelernt`}
      </Typography.Text>
    </Space>
  )
  return (
    <Popover trigger="click" content={content} title="Aufwand dieses Themas" placement="left">
      <Tag style={{ margin: 0, cursor: 'pointer' }}>
        {EFFORT_LABEL[topic.effort]} · {DIFFICULTY_LABEL[topic.difficulty]}
      </Tag>
    </Popover>
  )
}

/* ---------- Fächer & Themen ---------- */

interface SubjectForm {
  name: string
  color: string
  exam: Dayjs | null
}

function SubjectModal({ open, subject, onClose, onSaved }: { open: boolean; subject: StudySubject | null; onClose: () => void; onSaved: () => void }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<SubjectForm>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({ name: subject?.name ?? '', color: subject?.color ?? DEFAULT_SOURCE_COLOR, exam: subject?.examDate ? dayjs(subject.examDate) : null })
  }, [open, subject, form])

  const save = async () => {
    const v = await form.validateFields()
    const color = typeof v.color === 'string' ? v.color : (v.color as { toHexString(): string }).toHexString()
    const exam = v.exam ? v.exam.format(DAY) : null
    setBusy(true)
    try {
      if (subject) await window.uni.study.updateSubject(subject.id, { name: v.name, color, examDate: exam })
      else await window.uni.study.addSubject(v.name, color, exam)
      onSaved()
      onClose()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={subject ? 'Fach bearbeiten' : 'Neues Fach'} open={open} onCancel={onClose} onOk={save} confirmLoading={busy} okText="Speichern" cancelText="Abbrechen" destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name erforderlich' }]}>
          <Input autoFocus placeholder="z. B. Anatomie" />
        </Form.Item>
        <Form.Item name="color" label="Farbe">
          <ColorPicker disabledAlpha />
        </Form.Item>
        <Form.Item name="exam" label="Prüfungstermin (optional)">
          <DatePicker format="DD.MM.YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function SubjectCard({
  subject,
  blocks,
  factor,
  onChange,
  onEdit
}: {
  subject: StudySubject
  blocks: PlanBlock[]
  factor: number
  onChange: () => void
  onEdit: () => void
}) {
  const { message } = AntApp.useApp()
  const startFor = usePomodoro((s) => s.startFor)
  const [draft, setDraft] = useState('')
  const [local, setLocal] = useState(subject.topics)

  useEffect(() => setLocal(subject.topics), [subject.topics])

  const done = local.filter((t) => t.done).length
  const percent = pct(done, local.length)
  const exam = examLabel(subject.examDate)

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      onChange()
    }
  }

  const toggle = (id: number) => {
    // sofort anzeigen, damit der Balken ohne Verzögerung vorrückt
    setLocal((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    run(() => window.uni.study.toggleTopic(id))
  }

  const add = () => {
    const titles = draft.split('\n').map((t) => t.trim()).filter(Boolean)
    if (!titles.length) return
    setDraft('')
    run(() => window.uni.study.addTopics(subject.id, titles))
  }

  return (
    <Card
      title={
        <Space>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: subject.color, display: 'inline-block' }} />
          {subject.name}
        </Space>
      }
      extra={
        <Space size={0}>
          {exam && <Tag color={exam.color}>{exam.text}</Tag>}
          <Button type="text" icon={<EditOutlined />} onClick={onEdit} aria-label="Fach bearbeiten" />
          <Popconfirm title="Fach samt Themen löschen?" okText="Löschen" cancelText="Abbrechen" okButtonProps={{ danger: true }} onConfirm={() => run(() => window.uni.study.removeSubject(subject.id))}>
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Fach löschen" />
          </Popconfirm>
        </Space>
      }
    >
      <Progress percent={percent} strokeColor={subject.color} status={percent === 100 ? 'success' : 'active'} />
      <Typography.Text type="secondary">
        {done} von {local.length} {local.length === 1 ? 'Thema' : 'Themen'} erledigt{subject.minutes > 0 && ` · ${fmtMinutes(subject.minutes)} gelernt`}
      </Typography.Text>

      <div style={{ margin: '12px 0' }}>
        {local.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Noch keine Themen" />}
        {local.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <Checkbox checked={t.done} onChange={() => toggle(t.id)} />
            <Typography.Text
              style={{ flex: 1, minWidth: 0 }}
              delete={t.done}
              type={t.done ? 'secondary' : undefined}
              editable={{ onChange: (v) => v.trim() && v !== t.title && run(() => window.uni.study.renameTopic(t.id, v)), triggerType: ['text'], tooltip: 'Zum Umbenennen klicken' }}
            >
              {t.title}
            </Typography.Text>
            {!t.done && blocks.some((b) => b.topicId === t.id) && (
              <Tooltip title="Geplanter Lerntag laut Prüfungsplan">
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {dayLabel(blocks.find((b) => b.topicId === t.id)!.date)}
                </Typography.Text>
              </Tooltip>
            )}
            {!t.done && <TopicSize topic={t} factor={factor} onChange={(effort, difficulty) => run(() => window.uni.study.setTopicSize(t.id, effort, difficulty))} />}
            {!t.done && (
              <Tooltip title="Pomodoro für dieses Thema starten">
                <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={() => startFor({ subjectId: subject.id, topicId: t.id, label: t.title })} />
              </Tooltip>
            )}
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Thema löschen" onClick={() => run(() => window.uni.study.removeTopic(t.id))} />
          </div>
        ))}
      </div>

      <Input.TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={(e) => {
          if (e.shiftKey) return
          e.preventDefault()
          add()
        }}
        autoSize={{ minRows: 1, maxRows: 5 }}
        placeholder="Thema hinzufügen – Enter bestätigt, Umschalt+Enter für mehrere Zeilen"
      />
    </Card>
  )
}

export function StudyView() {
  const { token } = theme.useToken()
  const sessionsVersion = usePomodoro((s) => s.sessionsVersion)
  const [subjects, setSubjects] = useState<StudySubject[]>([])
  const [stats, setStats] = useState<StudyStats>({ todayMinutes: 0, weekMinutes: 0, daily: [], streak: 0 })
  const [loaded, setLoaded] = useState(false)
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [modal, setModal] = useState<{ open: boolean; subject: StudySubject | null }>({ open: false, subject: null })

  const load = useCallback(async () => {
    const [s, st, pl] = await Promise.all([window.uni.study.list(), window.uni.study.stats(), window.uni.study.plan()])
    setSubjects(s)
    setStats(st)
    setPlan(pl)
    setLoaded(true)
  }, [])

  // Neu laden, wenn der Timer eine Runde gutgeschrieben hat
  useEffect(() => {
    load()
  }, [load, sessionsVersion])

  const totals = useMemo(() => {
    const all = subjects.flatMap((s) => s.topics)
    return { done: all.filter((t) => t.done).length, total: all.length }
  }, [subjects])
  const overall = pct(totals.done, totals.total)

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Lernplaner
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, subject: null })}>
          Fach
        </Button>
      </Space>

      <Card style={{ marginBottom: 24 }}>
        <Typography.Text type="secondary">Gesamtfortschritt</Typography.Text>
        <Progress
          percent={overall}
          size={['100%', 18]}
          strokeColor={{ from: token.colorPrimary, to: SUCCESS }}
          status={overall === 100 ? 'success' : 'active'}
        />
        <Typography.Text type="secondary">
          {totals.done} von {totals.total} Themen in {subjects.length} {subjects.length === 1 ? 'Fach' : 'Fächern'} erledigt
        </Typography.Text>
      </Card>

      {plan && <PlanCard plan={plan} onChanged={load} />}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
          {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} blocks={plan?.blocks.filter((b) => b.subjectId === s.id) ?? []} factor={plan?.factor?.value ?? 1} onChange={load} onEdit={() => setModal({ open: true, subject: s })} />
          ))}
          {loaded && subjects.length === 0 && (
            <Card style={{ gridColumn: '1 / -1' }}>
              <Empty description="Lege dein erstes Fach an und trage die Lernthemen ein">
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, subject: null })}>
                  Fach anlegen
                </Button>
              </Empty>
            </Card>
          )}
        </div>
        <div style={{ flex: '0 0 340px', position: 'sticky', top: 0 }}>
          <PomodoroCard subjects={subjects} stats={stats} />
        </div>
      </div>

      <SubjectModal open={modal.open} subject={modal.subject} onClose={() => setModal({ open: false, subject: null })} onSaved={load} />
    </div>
  )
}
