import { Badge, Button, Card, Checkbox, Dropdown, Empty, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, CalendarOutlined, DeleteOutlined, EditOutlined, FlagFilled } from '@ant-design/icons'
import type { Todo, TodoCategory, TodoStatus } from '@shared/ipc'
import { STATUSES, STATUS_META, dueInfo, sortTodos } from './helpers'
import { TODO, ON_DARK } from '../../theme/colors'

interface Props {
  todos: Todo[]
  categories: TodoCategory[]
  onMove: (id: number, status: TodoStatus) => void
  onEdit: (todo: Todo) => void
  onRemove: (id: number) => void
}

function Row({ todo, onMove, onEdit, onRemove }: { todo: Todo; onMove: Props['onMove']; onEdit: Props['onEdit']; onRemove: Props['onRemove'] }) {
  const due = dueInfo(todo.due, todo.done)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: `1px solid ${ON_DARK.borderSoft}` }}>
      <Checkbox checked={todo.done} onChange={() => onMove(todo.id, todo.done ? 'open' : 'done')} />
      <Typography.Text
        delete={todo.done}
        type={todo.done ? 'secondary' : undefined}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        onClick={() => onEdit(todo)}
      >
        {todo.title}
      </Typography.Text>
      {todo.priority === 2 && <FlagFilled style={{ color: TODO.priorityHigh }} />}
      {todo.priority === 0 && <ArrowDownOutlined style={{ opacity: 0.45 }} />}
      {due && (
        <Tag color={due.color} icon={<CalendarOutlined />} style={{ margin: 0 }}>
          {due.text}
        </Tag>
      )}
      <Dropdown
        trigger={['click']}
        menu={{
          items: STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label })),
          selectedKeys: [todo.status],
          onClick: (e) => onMove(todo.id, e.key as TodoStatus)
        }}
      >
        <Tag color={STATUS_META[todo.status].color} style={{ margin: 0, cursor: 'pointer', minWidth: 112, textAlign: 'center' }}>
          {STATUS_META[todo.status].label}
        </Tag>
      </Dropdown>
      <Space size={0}>
        <Tooltip title="Bearbeiten">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(todo)} />
        </Tooltip>
        <Popconfirm title="Aufgabe löschen?" okText="Löschen" cancelText="Abbrechen" okButtonProps={{ danger: true }} onConfirm={() => onRemove(todo.id)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Löschen" />
        </Popconfirm>
      </Space>
    </div>
  )
}

/** Aufgaben nach Kategorie gruppiert. */
export function GroupedList({ todos, categories, onMove, onEdit, onRemove }: Props) {
  const groups: { key: string; name: string; color?: string; items: Todo[] }[] = [
    ...categories.map((c) => ({ key: String(c.id), name: c.name, color: c.color, items: sortTodos(todos.filter((t) => t.categoryId === c.id)) })),
    { key: 'none', name: 'Ohne Kategorie', items: sortTodos(todos.filter((t) => t.categoryId === null)) }
  ].filter((g) => g.items.length > 0)

  if (!groups.length) return <Empty description="Keine Aufgaben" />

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {groups.map((g) => {
        const open = g.items.filter((t) => !t.done).length
        return (
          <Card
            key={g.key}
            size="small"
            title={<Badge color={g.color ?? TODO.fallbackGroup} text={<Typography.Text strong>{g.name}</Typography.Text>} />}
            extra={<Typography.Text type="secondary">{open} offen · {g.items.length - open} erledigt</Typography.Text>}
          >
            {g.items.map((t) => (
              <Row key={t.id} todo={t} onMove={onMove} onEdit={onEdit} onRemove={onRemove} />
            ))}
          </Card>
        )
      })}
    </Space>
  )
}
