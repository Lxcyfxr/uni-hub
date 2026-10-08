import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Badge, Button, Calendar, ColorPicker, DatePicker, Empty, Form, Input, List, Modal, Popconfirm, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { CalendarEvent, CalendarEventInput, CalendarSource, Todo } from '@shared/ipc'

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const DAY = 'YYYY-MM-DD'
const TODO_COLOR = '#fa8c16'

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

function SourceManager({ sources, onChange }: { sources: CalendarSource[]; onChange: () => void }) {
  const { message } = AntApp.useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState('#1677ff')
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
            <ColorPicker value={color} onChange={(c) => setColor(c.toHexString())} />
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

  const monthKey = value.format('YYYY-MM')
  const load = useCallback(async () => {
    // Sichtbarer Bereich: Monat plus Überhang der Nachbarwochen
    const from = dayjs(monthKey).startOf('month').subtract(7, 'day')
    const to = dayjs(monthKey).endOf('month').add(7, 'day')
    const [s, e, t] = await Promise.all([
      window.uni.calendar.sources(),
      window.uni.calendar.events(from.toISOString(), to.toISOString()),
      window.uni.todos.list()
    ])
    setSources(s)
    setEvents(e)
    setTodos(t)
  }, [monthKey])

  useEffect(() => {
    load()
  }, [load])

  const colors = useMemo(() => new Map(sources.map((s) => [s.id, s.color])), [sources])

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    const push = (day: string, item: DayItem) => map.set(day, [...(map.get(day) ?? []), item])
    for (const e of events) {
      const days = daysOf(e)
      days.forEach((d, i) =>
        push(d, {
          key: `e${e.id}-${d}`,
          title: e.title,
          color: colors.get(e.sourceId) ?? '#1677ff',
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

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Title level={3}>Kalender</Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({ open: true, event: null })}>
            Termin
          </Button>
        </Space>
        <Calendar
          value={value}
          onPanelChange={setValue}
          onSelect={(d, info) => {
            setSelected(d)
            if (info.source === 'date') setValue(d)
          }}
          cellRender={(d, info) => {
            if (info.type !== 'date') return info.originNode
            const items = byDay.get(d.format(DAY)) ?? []
            return (
              <div>
                {info.originNode}
                {items.slice(0, 3).map((i) => (
                  <div key={i.key} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Badge color={i.color} text={i.title} />
                  </div>
                ))}
                {items.length > 3 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>+{items.length - 3} weitere</Typography.Text>}
              </div>
            )
          }}
        />
      </div>
      <div style={{ width: 340, flexShrink: 0 }}>
        <Typography.Title level={4}>{selected.format('dddd, DD. MMMM')}</Typography.Title>
        <List
          size="small"
          bordered
          style={{ marginBottom: 24 }}
          dataSource={dayItems}
          locale={{ emptyText: <Empty description="Keine Termine" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          renderItem={(i) => (
            <List.Item
              style={i.event?.editable ? { cursor: 'pointer' } : undefined}
              onClick={() => i.event?.editable && setEditor({ open: true, event: i.event })}
            >
              <List.Item.Meta
                title={<Badge color={i.color} text={i.title} />}
                description={
                  <Space size={4} wrap>
                    <Tag>{i.time}</Tag>
                    {i.location && <Typography.Text type="secondary">{i.location}</Typography.Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
        <Typography.Title level={5}>Kalender</Typography.Title>
        <SourceManager sources={sources} onChange={load} />
      </div>
      <EventModal open={editor.open} event={editor.event} initialDay={selected} onClose={() => setEditor({ open: false, event: null })} onSaved={load} />
    </div>
  )
}
