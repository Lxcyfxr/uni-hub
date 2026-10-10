import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, App as AntApp, Badge, Button, Calendar, ColorPicker, DatePicker, Drawer, Empty, Form, Input, List, Modal, Popconfirm, Segmented, Space, Switch, Tag, theme, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, EditOutlined, LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { CalendarEvent, CalendarEventInput, CalendarSource, Todo } from '@shared/ipc'
import { useSearchTarget } from './searchStore'
import { TODO, DEFAULT_SOURCE_COLOR, NOW_LINE, ON_DARK } from '../theme/colors'

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const DAY = 'YYYY-MM-DD'
const TODO_COLOR = TODO.calendar

interface DayItem {
  key: string
  title: string
  color: string
  time: string
  location?: string | null
  isTodo?: boolean
  event?: CalendarEvent
}

/** Alle Tage 'YYYY-MM-DD', die ein Termin berührt (Ende bei Ganztägigen exklusiv). */
function daysOf(e: CalendarEvent): string[] {
  if (e.allDay) {
    const out: string[] = []
    for (let d = dayjs(e.start); d.isBefore(dayjs(e.end), 'day') || out.length === 0; d = d.add(1, 'day')) out.push(d.format(DAY))
    return out
  }
  const out: string[] = []
  const last = dayjs(e.end).isAfter(dayjs(e.start)) ? dayjs(e.end).subtract(1, 'millisecond') : dayjs(e.start)
  for (let d = dayjs(e.start).startOf('day'); !d.isAfter(last, 'day'); d = d.add(1, 'day')) out.push(d.format(DAY))
  return out
}

type ViewMode = 'day' | 'week' | 'month' | 'year'

const HOUR_H = 48
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Seg {
  ev: CalendarEvent
  s: number
  e: number
  col: number
  cols: number
}

/** Termine eines Tages als Minuten-Segmente; überlappende Termine teilen sich Spalten. */
function layoutTimed(day: Dayjs, events: CalendarEvent[]): Seg[] {
  const key = day.format(DAY)
  const d0 = day.startOf('day')
  const raw = events
    .filter((ev) => !ev.allDay && daysOf(ev).includes(key))
    .map((ev) => {
      const s = Math.max(dayjs(ev.start).diff(d0, 'minute'), 0)
      const e = Math.min(dayjs(ev.end).diff(d0, 'minute'), 1440)
      return { ev, s, e: Math.max(e, s + 30) }
    })
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const out: Seg[] = []
  let cluster: { ev: CalendarEvent; s: number; e: number; col: number }[] = []
  let colEnds: number[] = []
  let clusterEnd = 0
  const flush = () => {
    cluster.forEach((c) => out.push({ ...c, cols: colEnds.length }))
    cluster = []
    colEnds = []
    clusterEnd = 0
  }
  for (const r of raw) {
    if (cluster.length && r.s >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= r.s)
    if (col < 0) {
      col = colEnds.length
      colEnds.push(r.e)
    } else colEnds[col] = r.e
    cluster.push({ ...r, col })
    clusterEnd = Math.max(clusterEnd, r.e)
  }
  flush()
  return out
}

function TimeGrid({ days, events, todos, colors, selected, onSelect, onEdit }: {
  days: Dayjs[]
  events: CalendarEvent[]
  todos: Todo[]
  colors: Map<number, string>
  selected: Dayjs
  onSelect: (d: Dayjs) => void
  onEdit: (e: CalendarEvent) => void
}) {
  const { token } = theme.useToken()
  const scrollRef = useRef<HTMLDivElement>(null)
  const line = `1px solid ${token.colorBorderSecondary}`
  const single = days.length === 1
  const firstKey = days[0].format(DAY)

  // Früheste Startzeit (Minuten) der sichtbaren Tage; ohne Termine bleibt es bei 7:00 Uhr
  const earliest = useMemo(() => {
    const starts = days.flatMap((d) => layoutTimed(d, events).map((g) => g.s))
    return starts.length ? Math.min(...starts) : 7 * 60
  }, [days, events])

  // Beim Laden einer Ansicht das früheste Element ganz oben zeigen (Termine um 2:00 Uhr sind selten)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (earliest / 60) * HOUR_H - 6)
  }, [firstKey, single, earliest])

  const colorOf = (e: CalendarEvent) => colors.get(e.sourceId) ?? DEFAULT_SOURCE_COLOR
  const now = dayjs()
  const nowTop = ((now.hour() * 60 + now.minute()) / 60) * HOUR_H

  return (
    <div style={{ border: line, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}>
      {/* Kopfzeile + Ganztägig/To-Do */}
      <div style={{ display: 'flex', borderBottom: line }}>
        <div style={{ width: 52, flexShrink: 0 }} />
        {days.map((d) => {
          const key = d.format(DAY)
          const isToday = d.isSame(now, 'day')
          const chips = [
            ...events.filter((e) => e.allDay && daysOf(e).includes(key)).map((e) => ({ k: `e${e.id}`, title: e.title, color: colorOf(e), ev: e })),
            ...todos.filter((t) => t.due === key && !t.done).map((t) => ({ k: `t${t.id}`, title: t.title, color: TODO_COLOR, ev: undefined as CalendarEvent | undefined }))
          ]
          return (
            <div key={key} style={{ flex: 1, minWidth: 0, borderLeft: line, padding: '4px 4px 6px' }}>
              <div
                onClick={() => onSelect(d)}
                style={{ cursor: 'pointer', textAlign: 'center', fontWeight: d.isSame(selected, 'day') ? 600 : 400, color: isToday ? token.colorPrimary : undefined }}
              >
                {single ? d.format('dddd, DD. MMMM') : d.format('dd DD.')}
              </div>
              {chips.map((c) => (
                <div
                  key={c.k}
                  title={c.title}
                  onClick={() => c.ev && onEdit(c.ev)}
                  style={{ marginTop: 2, padding: '0 6px', fontSize: 12, borderRadius: 4, background: c.color, color: ON_DARK.solid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: c.ev ? 'pointer' : 'default' }}
                >
                  {c.title}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {/* Stundenraster */}
      <div ref={scrollRef} style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 240, overflowY: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', position: 'relative', height: 24 * HOUR_H }}>
          <div style={{ width: 52, flexShrink: 0 }}>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_H, paddingRight: 6, textAlign: 'right', fontSize: 11, color: token.colorTextSecondary }}>
                {h > 0 && `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.format(DAY)} style={{ flex: 1, minWidth: 0, borderLeft: line, position: 'relative' }}>
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_H, borderTop: h > 0 ? line : undefined }} />
              ))}
              {layoutTimed(d, events).map((g) => (
                <div
                  key={g.ev.id}
                  title={`${g.ev.title}${g.ev.location ? ' · ' + g.ev.location : ''}`}
                  onClick={() => onEdit(g.ev)}
                  style={{
                    position: 'absolute',
                    top: (g.s / 60) * HOUR_H,
                    height: Math.max(((g.e - g.s) / 60) * HOUR_H - 2, 14),
                    left: `calc(${(g.col / g.cols) * 100}% + 1px)`,
                    width: `calc(${100 / g.cols}% - 3px)`,
                    background: colorOf(g.ev),
                    color: ON_DARK.solid,
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontSize: 12,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                >
                  <b>{dayjs(g.ev.start).format('HH:mm')}</b> {g.ev.title}
                  {g.ev.location && <div style={{ opacity: 0.85 }}>{g.ev.location}</div>}
                </div>
              ))}
              {d.isSame(now, 'day') && <div style={{ position: 'absolute', left: 0, right: 0, top: nowTop, borderTop: `2px solid ${NOW_LINE}`, pointerEvents: 'none' }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface EventForm {
  title: string
  allDay: boolean
  range: [Dayjs, Dayjs]
  location?: string
  description?: string
}

function EventModal({ open, event, initialDay, onClose, onSaved }: { open: boolean; event: CalendarEvent | null; initialDay: Dayjs; onClose: () => void; onSaved: () => void }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<EventForm>()
  const [busy, setBusy] = useState(false)
  const allDay = Form.useWatch('allDay', form) ?? false

  useEffect(() => {
    if (!open) return
    if (event) {
      form.setFieldsValue({
        title: event.title,
        allDay: event.allDay,
        range: event.allDay ? [dayjs(event.start), dayjs(event.end).subtract(1, 'day')] : [dayjs(event.start), dayjs(event.end)],
        location: event.location ?? '',
        description: event.description ?? ''
      })
    } else {
      const start = initialDay.hour(dayjs().hour() + 1).minute(0).second(0)
      form.setFieldsValue({ title: '', allDay: false, range: [start, start.add(1, 'hour')], location: '', description: '' })
    }
  }, [open, event, initialDay, form])

  const toggleAllDay = (checked: boolean) => {
    const [a, b] = form.getFieldValue('range') as [Dayjs, Dayjs]
    form.setFieldValue('range', checked ? [a.startOf('day'), b.startOf('day')] : [a.hour(9).minute(0), b.hour(10).minute(0)])
  }

  const save = async () => {
    const v = await form.validateFields()
    const [a, b] = v.range
    const input: CalendarEventInput = {
      id: event?.id,
      title: v.title,
      allDay: v.allDay,
      // Ganztägig: Ende exklusiv (iCal-Konvention); sonst UTC-Zeitstempel
      start: v.allDay ? a.format(DAY) : a.toISOString(),
      end: v.allDay ? b.add(1, 'day').format(DAY) : b.toISOString(),
      location: v.location ?? null,
      description: v.description ?? null
    }
    setBusy(true)
    try {
      await window.uni.calendar.saveEvent(input)
      onSaved()
      onClose()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={event ? 'Termin bearbeiten' : 'Neuer Termin'}
      open={open}
      onCancel={onClose}
      onOk={save}
      confirmLoading={busy}
      okText="Speichern"
      cancelText="Abbrechen"
      destroyOnHidden
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          {event && (
            <Popconfirm
              title="Termin löschen?"
              okText="Löschen"
              cancelText="Abbrechen"
              onConfirm={async () => {
                await window.uni.calendar.deleteEvent(event.id)
                onSaved()
                onClose()
              }}
            >
              <Button danger icon={<DeleteOutlined />}>
                Löschen
              </Button>
            </Popconfirm>
          )}
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Titel" rules={[{ required: true, whitespace: true, message: 'Titel erforderlich' }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="allDay" label="Ganztägig" valuePropName="checked">
          <Switch onChange={toggleAllDay} />
        </Form.Item>
        <Form.Item name="range" label={allDay ? 'Zeitraum' : 'Beginn – Ende'} rules={[{ required: true }]}>
          {allDay ? <DatePicker.RangePicker format="DD.MM.YYYY" /> : <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD.MM.YYYY HH:mm" />}
        </Form.Item>
        <Form.Item name="location" label="Ort">
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Notizen">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h ? `${h} Std.` : '', m ? `${m} Min.` : ''].filter(Boolean).join(' ') || '0 Min.'
}

/** Datum und Uhrzeit eines Termins als lesbarer Text (eine oder zwei Zeilen). */
function describeWhen(e: CalendarEvent): { date: string; time: string | null } {
  const long = 'dddd, D. MMMM YYYY'
  if (e.allDay) {
    const first = dayjs(e.start)
    const last = dayjs(e.end).subtract(1, 'day')
    const days = last.diff(first, 'day') + 1
    return { date: days > 1 ? `${first.format(long)} – ${last.format(long)}` : first.format(long), time: days > 1 ? `Ganztägig · ${days} Tage` : 'Ganztägig' }
  }
  const s = dayjs(e.start)
  const en = dayjs(e.end)
  const dur = en.diff(s, 'minute')
  if (s.isSame(en, 'day') || !en.isAfter(s)) {
    return { date: s.format(long), time: en.isAfter(s) ? `${s.format('HH:mm')} – ${en.format('HH:mm')} Uhr · ${fmtDuration(dur)}` : `${s.format('HH:mm')} Uhr` }
  }
  return { date: `${s.format('dd, D. MMM YYYY, HH:mm')} Uhr`, time: `bis ${en.format('dd, D. MMM YYYY, HH:mm')} Uhr · ${fmtDuration(dur)}` }
}

/** Web-Adressen in Beschreibungen (z. B. Zoom-Links) anklickbar machen; Rest bleibt Text. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function EventDetailPanel({ event: openEvent, source, onClose, onEdit }: { event: CalendarEvent | null; source: CalendarSource | undefined; onClose: () => void; onEdit: (e: CalendarEvent) => void }) {
  // Beim Ausblenden den letzten Termin weiter zeigen, damit der Inhalt nicht vor der Animation verschwindet
  const last = useRef(openEvent)
  if (openEvent) last.current = openEvent
  const event = openEvent ?? last.current
  const when = event ? describeWhen(event) : null
  const color = source?.color ?? DEFAULT_SOURCE_COLOR
  const row = (label: string, content: ReactNode) => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
      <Typography.Text type="secondary" style={{ width: 84, flexShrink: 0 }}>
        {label}
      </Typography.Text>
      <div style={{ minWidth: 0, flex: 1 }}>{content}</div>
    </div>
  )
  return (
    <Drawer
      open={!!openEvent}
      onClose={onClose}
      placement="right"
      size={420}
      closable={false}
      title={
        event && (
          <Space size={8} align="start">
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: color, marginTop: 7, flexShrink: 0 }} />
            <span style={{ overflowWrap: 'anywhere' }}>{event.title}</span>
          </Space>
        )
      }
      footer={
        <Space>
          {event?.editable && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit(event)}>
              Bearbeiten
            </Button>
          )}
          <Button onClick={onClose}>Schließen</Button>
        </Space>
      }
    >
      {event && when && (
        <div>
          {row('Wann', (
            <>
              <div>{when.date}</div>
              {when.time && <Typography.Text type="secondary">{when.time}</Typography.Text>}
            </>
          ))}
          {event.location && row('Ort', <span style={{ overflowWrap: 'anywhere' }}>{event.location}</span>)}
          {event.description?.trim() && row('Notizen', <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><Linkified text={event.description} /></div>)}
          {row('Kalender', (
            <Space size={6}>
              <Badge color={color} />
              <span>{source?.name ?? 'Unbekannt'}</span>
              {source && <Tag>{source.kind === 'local' ? 'Eigener Termin' : source.kind === 'url' ? 'Abo' : 'Datei'}</Tag>}
            </Space>
          ))}
        </div>
      )}
    </Drawer>
  )
}

function SourceManager({ sources, onChange }: { sources: CalendarSource[]; onChange: () => void }) {
  const { message } = AntApp.useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState<string>(DEFAULT_SOURCE_COLOR)
  const [form] = Form.useForm<{ name: string; url: string }>()

  const addUrl = async () => {
    const v = await form.validateFields()
    setBusy(true)
    setError(null)
    try {
      await window.uni.calendar.addUrl(v.name ?? '', v.url, color)
      setOpen(false)
      form.resetFields()
      onChange()
    } catch (e) {
      setError(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  const importFile = async () => {
    try {
      const n = await window.uni.calendar.importFile()
      if (n != null) {
        message.success(`${n} Termine importiert`)
        onChange()
      }
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          iCal-Abo
        </Button>
        <Button icon={<UploadOutlined />} onClick={importFile}>
          .ics importieren
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={async () => {
            try {
              const n = await window.uni.calendar.exportIcs()
              if (n != null) message.success(`${n} Termine exportiert`)
            } catch (e) {
              message.error(cleanErr(e))
            }
          }}
        >
          Eigene exportieren
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={async () => {
            await window.uni.calendar.sync()
            onChange()
          }}
        >
          Aktualisieren
        </Button>
      </Space>
      <List
        size="small"
        bordered
        dataSource={sources}
        locale={{ emptyText: <Empty description="Noch keine Kalender" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        renderItem={(s) => (
          <List.Item
            actions={s.kind === 'local' ? [] : [
              <Popconfirm key="del" title="Kalender entfernen?" okText="Entfernen" cancelText="Abbrechen" onConfirm={() => window.uni.calendar.removeSource(s.id).then(onChange)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ]}
          >
            <List.Item.Meta
              title={<Badge color={s.color} text={s.name} />}
              description={
                s.error ? (
                  <Typography.Text type="danger">{s.error}</Typography.Text>
                ) : s.lastSync ? (
                  `${s.kind === 'url' ? 'Abo' : 'Datei'} · ${dayjs(s.lastSync).format('DD.MM. HH:mm')}`
                ) : undefined
              }
            />
          </List.Item>
        )}
      />
      <Modal title="iCal-Abo hinzufügen" open={open} onCancel={() => setOpen(false)} onOk={addUrl} confirmLoading={busy} okText="Hinzufügen" cancelText="Abbrechen">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name">
            <Input placeholder="z. B. Stundenplan" />
          </Form.Item>
          <Form.Item name="url" label="iCal-Adresse" rules={[{ required: true, message: 'Adresse erforderlich' }]}>
            <Input placeholder="https://… oder webcal://…" />
          </Form.Item>
          <Form.Item label="Farbe">
            <ColorPicker disabledAlpha value={color} onChange={(c) => setColor(c.toHexString())} />
          </Form.Item>
        </Form>
        {error && <Alert type="error" showIcon message={error} />}
      </Modal>
    </>
  )
}

export function CalendarView() {
  const [value, setValue] = useState<Dayjs>(dayjs())
  const [selected, setSelected] = useState<Dayjs>(dayjs())
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [editor, setEditor] = useState<{ open: boolean; event: CalendarEvent | null }>({ open: false, event: null })

  const [view, setView] = useState<ViewMode>('month')
  const [manage, setManage] = useState(false)
  const [detail, setDetail] = useState<CalendarEvent | null>(null)
  // Treffer der globalen Suche: zum Tag springen und den Termin öffnen, sobald er geladen ist
  const target = useSearchTarget((st) => st.target)
  const setTarget = useSearchTarget((st) => st.set)
  const [pendingEvent, setPendingEvent] = useState<number | null>(null)
  useEffect(() => {
    if (target?.kind !== 'event') return
    if (target.date) {
      const d = dayjs(target.date)
      setValue(d)
      setSelected(d)
    }
    setPendingEvent(target.id)
    setTarget(null)
  }, [target, setTarget])

  // Sichtbarer Bereich: Tag, Woche, Monat (plus Überhang der Nachbarwochen) oder Jahr
  const range = {
    day: [value.startOf('day'), value.endOf('day')],
    week: [value.startOf('week'), value.endOf('week')],
    month: [value.startOf('month').subtract(7, 'day'), value.endOf('month').add(7, 'day')],
    year: [value.startOf('year'), value.endOf('year')]
  }[view]
  const fromIso = range[0].toISOString()
  const toIso = range[1].toISOString()
  const load = useCallback(async () => {
    const [s, e, t] = await Promise.all([
      window.uni.calendar.sources(),
      window.uni.calendar.events(fromIso, toIso),
      window.uni.todos.list()
    ])
    setSources(s)
    setEvents(e)
    setTodos(t)
  }, [fromIso, toIso])

  const step = (delta: number) => {
    const n = value.add(delta, view)
    setValue(n)
    setSelected(n)
  }
  const goToday = () => {
    setValue(dayjs())
    setSelected(dayjs())
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => value.startOf('week').add(i, 'day'))
  const rangeLabel = {
    day: value.format('dddd, DD. MMMM YYYY'),
    week: `${weekDays[0].format('DD.MM.')} – ${weekDays[6].format('DD.MM.YYYY')}`,
    month: value.format('MMMM YYYY'),
    year: value.format('YYYY')
  }[view]

  useEffect(() => {
    load()
  }, [load])

  const colors = useMemo(() => new Map(sources.map((s) => [s.id, s.color])), [sources])

  useEffect(() => {
    if (pendingEvent === null) return
    const found = events.find((e) => e.id === pendingEvent)
    if (!found) return
    setDetail(found)
    setPendingEvent(null)
  }, [events, pendingEvent])

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    const push = (day: string, item: DayItem) => map.set(day, [...(map.get(day) ?? []), item])
    for (const e of events) {
      const days = daysOf(e)
      days.forEach((d, i) =>
        push(d, {
          key: `e${e.id}-${d}`,
          title: e.title,
          color: colors.get(e.sourceId) ?? DEFAULT_SOURCE_COLOR,
          time: e.allDay ? 'ganztägig' : i === 0 ? dayjs(e.start).format('HH:mm') + (days.length === 1 ? '–' + dayjs(e.end).format('HH:mm') : '') : 'fortlaufend',
          location: e.location,
          event: e
        })
      )
    }
    for (const t of todos) {
      if (t.due && !t.done) push(t.due, { key: `t${t.id}`, title: t.title, color: TODO_COLOR, time: 'To-Do', isTodo: true })
    }
    for (const list of map.values()) list.sort((a, b) => (a.time === 'ganztägig' || a.isTodo ? '' : a.time).localeCompare(b.time === 'ganztägig' || b.isTodo ? '' : b.time))
    return map
  }, [events, todos, colors])

  const dayItems = byDay.get(selected.format(DAY)) ?? []

  const isToday = selected.isSame(dayjs(), 'day')
  const showSide = view === 'month'

  return (
    <div style={{ padding: 24 }}>
      {/* Kopfzeile: links Navigation und Zeitraum, rechts Ansicht und Aktionen */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Space size={8} wrap>
          <Button icon={<LeftOutlined />} onClick={() => step(-1)} aria-label="Zurück" />
          <Button icon={<RightOutlined />} onClick={() => step(1)} aria-label="Weiter" />
          <Button onClick={goToday}>Heute</Button>
          <Typography.Title level={3} style={{ margin: '0 0 0 8px' }}>
            {rangeLabel}
          </Typography.Title>
        </Space>
        <Space size={8} wrap>
          <Segmented<ViewMode>
            value={view}
            onChange={setView}
            options={[
              { label: 'Tag', value: 'day' },
              { label: 'Woche', value: 'week' },
              { label: 'Monat', value: 'month' },
              { label: 'Jahr', value: 'year' }
            ]}
          />
          <Button icon={<SettingOutlined />} onClick={() => setManage(true)}>
            Kalender
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({ open: true, event: null })}>
            Termin
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(view === 'day' || view === 'week') && (
            <TimeGrid
              days={view === 'week' ? weekDays : [value.startOf('day')]}
              events={events}
              todos={todos}
              colors={colors}
              selected={selected}
              onSelect={(d) => {
                setSelected(d)
                setValue(d)
              }}
              onEdit={setDetail}
            />
          )}
          {(view === 'month' || view === 'year') && (
            <Calendar
              value={value}
              mode={view}
              headerRender={() => null}
              // Keine Rollbalken in den Tageszellen: mehr als drei Einträge werden als „+N“ zusammengefasst
              styles={{ itemContent: { overflow: 'hidden' } }}
              onSelect={(d, info) => {
                setSelected(d)
                setValue(d)
                if (info.source === 'month' && view === 'year') setView('month')
              }}
              cellRender={(d, info) => {
                // Zahl bzw. Monatsname zeichnet Antd selbst; originNode würde sie doppelt ausgeben.
                if (info.type === 'month') {
                  const prefix = d.format('YYYY-MM')
                  let n = 0
                  byDay.forEach((list, key) => {
                    if (key.startsWith(prefix)) n += list.length
                  })
                  return n > 0 ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{n} Einträge</Typography.Text> : null
                }
                const items = byDay.get(d.format(DAY)) ?? []
                return (
                  <div>
                    {items.slice(0, 3).map((i) => (
                      <div
                        key={i.key}
                        title={`${i.time} · ${i.title}`}
                        onClick={(ev) => {
                          if (!i.event) return
                          ev.stopPropagation()
                          setSelected(d)
                          setDetail(i.event)
                        }}
                        style={{
                          cursor: i.event ? 'pointer' : 'default',
                          fontSize: 12,
                          lineHeight: '18px',
                          marginBottom: 2,
                          padding: '0 6px',
                          borderRadius: 4,
                          borderLeft: `3px solid ${i.color}`,
                          background: `${i.color}26`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {/^\d\d:\d\d/.test(i.time) && <span style={{ opacity: 0.65, marginRight: 4 }}>{i.time.slice(0, 5)}</span>}
                        {i.title}
                      </div>
                    ))}
                    {items.length > 3 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>+{items.length - 3} weitere</Typography.Text>}
                  </div>
                )
              }}
            />
          )}
        </div>

        {showSide && (
          <div style={{ width: 320, flexShrink: 0, position: 'sticky', top: 24 }}>
            <Space align="baseline" size={8}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {selected.format('dddd, D. MMMM')}
              </Typography.Title>
              {isToday && <Tag color="blue">Heute</Tag>}
            </Space>
            <div style={{ margin: '2px 0 12px' }}>
              <Typography.Text type="secondary">
                {dayItems.length === 0 ? 'Nichts geplant' : `${dayItems.length} ${dayItems.length === 1 ? 'Eintrag' : 'Einträge'}`}
              </Typography.Text>
            </div>
            {dayItems.length === 0 ? (
              <Button block icon={<PlusOutlined />} onClick={() => setEditor({ open: true, event: null })}>
                Termin hinzufügen
              </Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayItems.map((i) => {
                  const clickable = !!i.event
                  return (
                    <div
                      key={i.key}
                      onClick={() => i.event && setDetail(i.event)}
                      style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 6, borderLeft: `4px solid ${i.color}`, background: `${i.color}1f`, cursor: clickable ? 'pointer' : 'default' }}
                    >
                      <div style={{ width: 78, flexShrink: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{i.time}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{i.title}</div>
                        {i.location && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {i.location}
                          </Typography.Text>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {sources.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Kalender
                </Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
                  {sources.map((s) => (
                    <Badge key={s.id} color={s.color} text={<span style={{ fontSize: 12 }}>{s.name}</span>} />
                  ))}
                  <Badge color={TODO_COLOR} text={<span style={{ fontSize: 12 }}>To-Do</span>} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal title="Kalender verwalten" open={manage} onCancel={() => setManage(false)} footer={null} width={560} destroyOnHidden>
        <SourceManager sources={sources} onChange={load} />
      </Modal>
      <EventDetailPanel
        event={detail}
        source={detail ? sources.find((x) => x.id === detail.sourceId) : undefined}
        onClose={() => setDetail(null)}
        onEdit={(e) => {
          setDetail(null)
          setEditor({ open: true, event: e })
        }}
      />
      <EventModal open={editor.open} event={editor.event} initialDay={selected} onClose={() => setEditor({ open: false, event: null })} onSaved={load} />
    </div>
  )
}
