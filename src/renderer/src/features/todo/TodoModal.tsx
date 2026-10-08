import { useEffect, useState } from 'react'
import { App as AntApp, Button, DatePicker, Form, Input, Modal, Popconfirm, Segmented, Select, Space } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Todo, TodoCategory, TodoStatus } from '@shared/ipc'
import { CategorySelect } from './CategorySelect'
import { STATUSES, STATUS_META, cleanErr } from './helpers'

interface FormValues {
  title: string
  notes: string
  due: Dayjs | null
  priority: 0 | 1 | 2
  status: TodoStatus
}

interface Props {
  open: boolean
  /** null = neue Aufgabe */
  todo: Todo | null
  categories: TodoCategory[]
  defaultCategoryId: number | null
  defaultStatus: TodoStatus
  onClose: () => void
  onSaved: () => void
  onCategoriesChanged: () => Promise<unknown> | void
}

export function TodoModal({ open, todo, categories, defaultCategoryId, defaultStatus, onClose, onSaved, onCategoriesChanged }: Props) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<FormValues>()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      title: todo?.title ?? '',
      notes: todo?.notes ?? '',
      due: todo?.due ? dayjs(todo.due) : null,
      priority: todo?.priority ?? 1,
      status: todo?.status ?? defaultStatus
    })
    setCategoryId(todo ? todo.categoryId : defaultCategoryId)
  }, [open, todo, defaultCategoryId, defaultStatus, form])

  const save = async () => {
    const v = await form.validateFields()
    const input = {
      title: v.title,
      notes: v.notes || null,
      due: v.due ? v.due.format('YYYY-MM-DD') : null,
      priority: v.priority,
      categoryId,
      status: v.status
    }
    setBusy(true)
    try {
      if (todo) await window.uni.todos.update(todo.id, input)
      else await window.uni.todos.add(input)
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
      title={todo ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          {todo && (
            <Popconfirm
              title="Aufgabe löschen?"
              okText="Löschen"
              cancelText="Abbrechen"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                await window.uni.todos.remove(todo.id)
                onSaved()
                onClose()
              }}
            >
              <Button danger icon={<DeleteOutlined />}>
                Löschen
              </Button>
            </Popconfirm>
          )}
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="primary" loading={busy} onClick={save}>
            Speichern
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Titel" rules={[{ required: true, whitespace: true, message: 'Titel erforderlich' }]}>
          <Input autoFocus onPressEnter={save} />
        </Form.Item>
        <Form.Item name="notes" label="Notizen">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Space size={16} align="start" wrap>
          <Form.Item label="Kategorie">
            <CategorySelect value={categoryId} onChange={setCategoryId} categories={categories} onCreated={onCategoriesChanged} width={220} />
          </Form.Item>
          <Form.Item name="due" label="Fällig am">
            <DatePicker format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select style={{ width: 170 }} options={STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
          </Form.Item>
        </Space>
        <Form.Item name="priority" label="Priorität">
          <Segmented
            options={[
              { value: 0, label: 'Niedrig' },
              { value: 1, label: 'Normal' },
              { value: 2, label: 'Hoch' }
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
