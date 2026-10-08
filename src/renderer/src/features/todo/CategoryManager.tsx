import { useEffect, useState } from 'react'
import { App as AntApp, Button, ColorPicker, Empty, Input, Modal, Popconfirm, Space, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Todo, TodoCategory } from '@shared/ipc'
import { cleanErr, nextColor } from './helpers'

interface Props {
  open: boolean
  categories: TodoCategory[]
  todos: Todo[]
  onClose: () => void
  onChanged: () => Promise<unknown> | void
}

function Row({ cat, count, onChanged }: { cat: TodoCategory; count: number; onChanged: () => Promise<unknown> | void }) {
  const { message } = AntApp.useApp()
  const [name, setName] = useState(cat.name)
  useEffect(() => setName(cat.name), [cat.name])

  const save = async (patch: { name?: string; color?: string }) => {
    const next = { name: (patch.name ?? name).trim(), color: patch.color ?? cat.color }
    if (next.name === cat.name && next.color === cat.color) return
    try {
      await window.uni.todos.updateCategory(cat.id, next.name, next.color)
      await onChanged()
    } catch (e) {
      message.error(cleanErr(e))
      setName(cat.name)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <ColorPicker disabledAlpha value={cat.color} onChangeComplete={(c) => save({ color: c.toHexString() })} />
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save({})} onPressEnter={() => save({})} style={{ flex: 1 }} />
      <Typography.Text type="secondary" style={{ width: 70, textAlign: 'right' }}>
        {count} {count === 1 ? 'Aufgabe' : 'Aufgaben'}
      </Typography.Text>
      <Popconfirm
        title={`Kategorie „${cat.name}“ löschen?`}
        description={count ? 'Die Aufgaben bleiben erhalten und sind danach ohne Kategorie.' : undefined}
        okText="Löschen"
        cancelText="Abbrechen"
        okButtonProps={{ danger: true }}
        onConfirm={async () => {
          try {
            await window.uni.todos.removeCategory(cat.id)
            await onChanged()
          } catch (e) {
            message.error(cleanErr(e))
          }
        }}
      >
        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Kategorie löschen" />
      </Popconfirm>
    </div>
  )
}

export function CategoryManager({ open, categories, todos, onClose, onChanged }: Props) {
  const { message } = AntApp.useApp()
  const [name, setName] = useState('')

  const add = async () => {
    if (!name.trim()) return
    try {
      await window.uni.todos.addCategory(name, nextColor(categories))
      setName('')
      await onChanged()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  return (
    <Modal title="Kategorien verwalten" open={open} onCancel={onClose} footer={<Button type="primary" onClick={onClose}>Fertig</Button>} destroyOnHidden>
      {categories.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Noch keine Kategorien" />
      ) : (
        categories.map((c) => <Row key={c.id} cat={c} count={todos.filter((t) => t.categoryId === c.id).length} onChanged={onChanged} />)
      )}
      <Space.Compact style={{ width: '100%', marginTop: 16 }}>
        <Input placeholder="Neue Kategorie, z. B. Anatomie oder Organisation" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={add} />
        <Button type="primary" icon={<PlusOutlined />} onClick={add}>
          Anlegen
        </Button>
      </Space.Compact>
    </Modal>
  )
}
