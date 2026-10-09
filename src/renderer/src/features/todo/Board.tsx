import { useState } from 'react'
import { Badge, Button, Empty, Popconfirm, Space, Tag, Tooltip, Typography, theme } from 'antd'
import {
  ArrowDownOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  FlagFilled,
  PlayCircleOutlined,
  UndoOutlined
} from '@ant-design/icons'
import type { Todo, TodoCategory, TodoStatus } from '@shared/ipc'
import { STATUSES, STATUS_META, dueInfo, sortTodos } from './helpers'

interface Props {
  todos: Todo[]
  categories: TodoCategory[]
  onMove: (id: number, status: TodoStatus) => void
  onEdit: (todo: Todo) => void
  onRemove: (id: number) => void
  onAdd: (status: TodoStatus) => void
}

const DONE_PREVIEW = 15

function TodoCard({ todo, category, dragging, onDragStart, onDragEnd, onMove, onEdit, onRemove }: {
  todo: Todo
  category: TodoCategory | undefined
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (status: TodoStatus) => void
  onEdit: () => void
  onRemove: () => void
}) {
  const { token } = theme.useToken()
  const due = dueInfo(todo.due, todo.done)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(todo.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      style={{
        cursor: 'grab',
        opacity: dragging ? 0.4 : 1,
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderLeft: `4px solid ${category?.color ?? token.colorBorder}`,
        borderRadius: token.borderRadius,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Typography.Text delete={todo.done} type={todo.done ? 'secondary' : undefined} style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
          {todo.title}
        </Typography.Text>
        {todo.priority === 2 && (
          <Tooltip title="Hohe Priorität">
            <FlagFilled style={{ color: '#ff4d4f', marginTop: 4 }} />
          </Tooltip>
        )}
        {todo.priority === 0 && (
          <Tooltip title="Niedrige Priorität">
            <ArrowDownOutlined style={{ color: token.colorTextTertiary, marginTop: 4 }} />
          </Tooltip>
        )}
      </div>
      {todo.notes && (
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12 }}>
          {todo.notes}
        </Typography.Paragraph>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {category && <Tag color={category.color} variant="filled" style={{ margin: 0 }}>{category.name}</Tag>}
        {due && (
          <Tag color={due.color} icon={<CalendarOutlined />} style={{ margin: 0 }}>
            {due.text}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        <Space size={0} onClick={stop} onMouseDown={stop}>
          {todo.status === 'open' && (
            <Tooltip title="In Bearbeitung nehmen">
              <Button size="small" type="text" icon={<PlayCircleOutlined />} onClick={() => onMove('doing')} />
            </Tooltip>
          )}
          {todo.status === 'doing' && (
            <>
              <Tooltip title="Zurück zu Offen">
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => onMove('open')} />
              </Tooltip>
              <Tooltip title="Als erledigt markieren">
                <Button size="small" type="text" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} onClick={() => onMove('done')} />
              </Tooltip>
            </>
          )}
          {todo.status === 'done' && (
            <Tooltip title="Wieder öffnen">
              <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => onMove('open')} />
            </Tooltip>
          )}
          <Popconfirm title="Aufgabe löschen?" okText="Löschen" cancelText="Abbrechen" okButtonProps={{ danger: true }} onConfirm={onRemove}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Löschen" />
          </Popconfirm>
        </Space>
      </div>
    </div>
  )
}

export function Board({ todos, categories, onMove, onEdit, onRemove, onAdd }: Props) {
  const { token } = theme.useToken()
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<TodoStatus | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const byId = new Map(categories.map((c) => [c.id, c]))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(260px, 1fr))', gap: 16, alignItems: 'start', overflowX: 'auto' }}>
      {STATUSES.map((status) => {
        const meta = STATUS_META[status]
        const all = status === 'done' ? [...todos.filter((t) => t.status === status)].reverse() : sortTodos(todos.filter((t) => t.status === status))
        const items = status === 'done' && !showAllDone ? all.slice(0, DONE_PREVIEW) : all
        const active = over === status && dragId !== null
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (over !== status) setOver(status)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = Number(e.dataTransfer.getData('text/plain'))
              setOver(null)
              setDragId(null)
              if (id) onMove(id, status)
            }}
            style={{
              background: active ? 'rgba(22,119,255,0.08)' : token.colorFillQuaternary,
              border: `1px ${active ? 'dashed' : 'solid'} ${active ? token.colorPrimary : token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              padding: 12,
              minHeight: 240,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'background 0.15s, border-color 0.15s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
              <Badge color={meta.color} />
              <Typography.Text strong style={{ flex: 1 }}>
                {meta.label}
              </Typography.Text>
              <Typography.Text type="secondary">{all.length}</Typography.Text>
              {status !== 'done' && <Button size="small" type="text" onClick={() => onAdd(status)}>+ Neu</Button>}
            </div>
            {items.map((t) => (
              <TodoCard
                key={t.id}
                todo={t}
                category={t.categoryId ? byId.get(t.categoryId) : undefined}
                dragging={dragId === t.id}
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => {
                  setDragId(null)
                  setOver(null)
                }}
                onMove={(s) => onMove(t.id, s)}
                onEdit={() => onEdit(t)}
                onRemove={() => onRemove(t.id)}
              />
            ))}
            {status === 'done' && all.length > DONE_PREVIEW && (
              <Button type="link" size="small" onClick={() => setShowAllDone((v) => !v)}>
                {showAllDone ? 'Weniger anzeigen' : `Alle ${all.length} anzeigen`}
              </Button>
            )}
            {all.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                styles={{ image: { height: 36 } }}
                description={status === 'open' ? 'Nichts offen' : status === 'doing' ? 'Ziehe Aufgaben hierher' : 'Noch nichts erledigt'}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
