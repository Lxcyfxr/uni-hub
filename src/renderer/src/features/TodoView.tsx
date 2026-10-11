import { useCallback, useEffect, useMemo, useState } from 'react'
import { App as AntApp, Badge, Button, Card, DatePicker, Input, Segmented, Select, Space, Tag, Typography } from 'antd'
import { AppstoreOutlined, BarsOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { Todo, TodoCategory, TodoStatus } from '@shared/ipc'
import { Board } from './todo/Board'
import { CategoryManager } from './todo/CategoryManager'
import { CategorySelect } from './todo/CategorySelect'
import { GroupedList } from './todo/GroupedList'
import { TodoModal } from './todo/TodoModal'
import { cleanErr } from './todo/helpers'
import { TODO } from '../theme/colors'

type View = 'board' | 'list'
/** 'all' = alle, 'none' = ohne Kategorie, sonst Kategorie-ID */
type Filter = 'all' | 'none' | number

export function TodoView() {
  const { message } = AntApp.useApp()
  const [todos, setTodos] = useState<Todo[]>([])
  const [categories, setCategories] = useState<TodoCategory[]>([])
  const [view, setView] = useState<View>('board')
  const [filter, setFilter] = useState<Filter>('all')
  const [editor, setEditor] = useState<{ open: boolean; todo: Todo | null; status: TodoStatus }>({ open: false, todo: null, status: 'open' })
  const [managing, setManaging] = useState(false)

  // Schnell hinzufügen
  const [title, setTitle] = useState('')
  const [quickCategory, setQuickCategory] = useState<number | null>(null)
  const [due, setDue] = useState<Dayjs | null>(null)
  const [priority, setPriority] = useState<0 | 1 | 2>(1)

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([window.uni.todos.list(), window.uni.todos.categories()])
      setTodos(t)
      setCategories(c)
    } catch (e) {
      message.error(cleanErr(e))
    }
  }, [message])

  useEffect(() => {
    load()
    Promise.all([window.uni.ui.get('ui.todoView'), window.uni.ui.get('ui.todoFilter')]).then(([v, f]) => {
      if (v === 'board' || v === 'list') setView(v)
      if (f === 'none') setFilter('none')
      else if (f && /^\d+$/.test(f)) setFilter(Number(f))
    })
  }, [load])

  const changeView = (v: View) => {
    setView(v)
    window.uni.ui.set('ui.todoView', v).catch(() => {})
  }
  const changeFilter = (f: Filter) => {
    setFilter(f)
    window.uni.ui.set('ui.todoFilter', String(f)).catch(() => {})
  }

  // Gelöschte Kategorie kann nicht mehr als Filter aktiv bleiben
  useEffect(() => {
    if (typeof filter === 'number' && categories.length && !categories.some((c) => c.id === filter)) setFilter('all')
  }, [categories, filter])

  const visible = useMemo(
    () => todos.filter((t) => (filter === 'all' ? true : filter === 'none' ? t.categoryId === null : t.categoryId === filter)),
    [todos, filter]
  )

  const stats = useMemo(() => {
    const today = dayjs().startOf('day')
    return {
      open: visible.filter((t) => t.status === 'open').length,
      doing: visible.filter((t) => t.status === 'doing').length,
      done: visible.filter((t) => t.status === 'done').length,
      overdue: visible.filter((t) => !t.done && t.due && dayjs(t.due).isBefore(today)).length
    }
  }, [visible])

  const countFor = (f: Filter) => todos.filter((t) => (f === 'all' ? true : f === 'none' ? t.categoryId === null : t.categoryId === f) && !t.done).length

  const quickAdd = async () => {
    if (!title.trim()) return
    try {
      await window.uni.todos.add({
        title,
        notes: null,
        due: due ? due.format('YYYY-MM-DD') : null,
        priority,
        categoryId: quickCategory ?? (typeof filter === 'number' ? filter : null)
      })
      setTitle('')
      setDue(null)
      setPriority(1)
      load()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  // Sofort anzeigen und im Hintergrund speichern, damit Verschieben flüssig wirkt
  const move = async (id: number, status: TodoStatus) => {
    setTodos((list) => list.map((t) => (t.id === id ? { ...t, status, done: status === 'done' } : t)))
    try {
      await window.uni.todos.setStatus(id, status)
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      load()
    }
  }

  const remove = async (id: number) => {
    try {
      await window.uni.todos.remove(id)
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      load()
    }
  }

  const edit = (todo: Todo) => setEditor({ open: true, todo, status: todo.status })
  const create = (status: TodoStatus = 'open') => setEditor({ open: true, todo: null, status })

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0, marginRight: 'auto' }}>
          To-Do
        </Typography.Title>
        <Segmented<View>
          value={view}
          onChange={changeView}
          options={[
            { value: 'board', label: 'Board', icon: <AppstoreOutlined /> },
            { value: 'list', label: 'Nach Kategorie', icon: <BarsOutlined /> }
          ]}
        />
        <Button icon={<TagsOutlined />} onClick={() => setManaging(true)}>
          Kategorien
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => create()}>
          Neue Aufgabe
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onPressEnter={quickAdd} placeholder="Schnell eine Aufgabe eintragen und Enter drücken …" />
          <CategorySelect value={quickCategory ?? (typeof filter === 'number' ? filter : null)} onChange={setQuickCategory} categories={categories} onCreated={load} width={190} />
          <DatePicker value={due} onChange={setDue} format="DD.MM.YYYY" placeholder="Fällig" style={{ width: 140 }} />
          <Select<0 | 1 | 2>
            value={priority}
            onChange={setPriority}
            style={{ width: 110 }}
            options={[
              { value: 0, label: 'Niedrig' },
              { value: 1, label: 'Normal' },
              { value: 2, label: 'Hoch' }
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={quickAdd} disabled={!title.trim()}>
            Hinzufügen
          </Button>
        </Space.Compact>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Tag.CheckableTag checked={filter === 'all'} onChange={() => changeFilter('all')}>
          Alle ({countFor('all')})
        </Tag.CheckableTag>
        {categories.map((c) => (
          <Tag.CheckableTag key={c.id} checked={filter === c.id} onChange={() => changeFilter(filter === c.id ? 'all' : c.id)}>
            <Badge color={c.color} /> {c.name} ({countFor(c.id)})
          </Tag.CheckableTag>
        ))}
        {todos.some((t) => t.categoryId === null) && categories.length > 0 && (
          <Tag.CheckableTag checked={filter === 'none'} onChange={() => changeFilter(filter === 'none' ? 'all' : 'none')}>
            Ohne Kategorie ({countFor('none')})
          </Tag.CheckableTag>
        )}
        <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
          {stats.open} offen · {stats.doing} in Bearbeitung · {stats.done} erledigt
          {stats.overdue > 0 && <span style={{ color: TODO.overdue }}> · {stats.overdue} überfällig</span>}
        </Typography.Text>
      </div>

      {view === 'board' ? (
        <Board todos={visible} categories={categories} onMove={move} onEdit={edit} onRemove={remove} onAdd={create} />
      ) : (
        <GroupedList todos={visible} categories={categories} onMove={move} onEdit={edit} onRemove={remove} />
      )}

      <TodoModal
        open={editor.open}
        todo={editor.todo}
        categories={categories}
        defaultCategoryId={typeof filter === 'number' ? filter : null}
        defaultStatus={editor.status}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        onSaved={load}
        onCategoriesChanged={load}
      />
      <CategoryManager open={managing} categories={categories} todos={todos} onClose={() => setManaging(false)} onChanged={load} />
    </div>
  )
}
