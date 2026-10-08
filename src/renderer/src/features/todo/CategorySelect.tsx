import { useState } from 'react'
import { App as AntApp, Badge, Button, Divider, Input, Select, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { TodoCategory } from '@shared/ipc'
import { cleanErr, nextColor } from './helpers'

interface Props {
  value: number | null
  onChange: (id: number | null) => void
  categories: TodoCategory[]
  /** Nach dem Anlegen einer Kategorie die Liste neu laden */
  onCreated: () => Promise<unknown> | void
  width?: number
  placeholder?: string
}

/** Auswahl einer Kategorie mit eingebautem „Neue Kategorie“-Feld. */
export function CategorySelect({ value, onChange, categories, onCreated, width = 200, placeholder = 'Kategorie' }: Props) {
  const { message } = AntApp.useApp()
  const [name, setName] = useState('')

  const create = async () => {
    const n = name.trim()
    if (!n) return
    try {
      const id = await window.uni.todos.addCategory(n, nextColor(categories))
      setName('')
      await onCreated()
      onChange(id)
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  return (
    <Select<number | null>
      allowClear
      showSearch
      style={{ width }}
      placeholder={placeholder}
      value={value ?? undefined}
      onChange={(v) => onChange(v ?? null)}
      filterOption={(input, option) => String(option?.name ?? '').toLowerCase().includes(input.toLowerCase())}
      options={categories.map((c) => ({ value: c.id, name: c.name, label: <Badge color={c.color} text={c.name} /> }))}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <Space.Compact style={{ padding: '0 8px 8px', width: '100%' }}>
            <Input
              placeholder="Neue Kategorie"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') create()
              }}
            />
            <Button icon={<PlusOutlined />} onClick={create} aria-label="Kategorie anlegen" />
          </Space.Compact>
        </>
      )}
    />
  )
}
