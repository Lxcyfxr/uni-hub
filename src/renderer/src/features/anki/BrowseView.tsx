import { useCallback, useEffect, useState } from 'react'
import { App as AntApp, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { AnkiBrowseResult, AnkiBrowseRow, AnkiDeck } from '@shared/ipc'
import { NoteEditor } from './NoteEditor'
import { cleanErr, plural } from './util'

const PAGE = 50

function StatusTag({ row }: { row: AnkiBrowseRow }) {
  if (row.status === 'suspended') return <Tag>Pausiert</Tag>
  if (row.status === 'new') return <Tag color="blue">Neu</Tag>
  const due = dayjs(row.due)
  const label = row.status === 'learning' ? 'Lernen' : due.isBefore(dayjs().endOf('day')) ? 'Heute fällig' : `fällig ${due.format('DD.MM.YY')}`
  return <Tag color={row.status === 'learning' ? 'red' : due.isBefore(dayjs().endOf('day')) ? 'green' : 'default'}>{label}</Tag>
}

export function BrowseView({ decks, initialDeckId, onExit, onChanged }: { decks: AnkiDeck[]; initialDeckId: number | null; onExit: () => void; onChanged: () => void }) {
  const { message } = AntApp.useApp()
  const [deckId, setDeckId] = useState<number | null>(initialDeckId)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AnkiBrowseResult>({ total: 0, rows: [] })
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AnkiBrowseRow[]>([])
  const [editor, setEditor] = useState<{ open: boolean; noteId: number | null }>({ open: false, noteId: null })

  // Eingabe entprellen
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(text.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [text])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setResult(await window.uni.anki.browse({ deckId, text: query, offset: (page - 1) * PAGE, limit: PAGE }))
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setLoading(false)
    }
  }, [deckId, query, page, message])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => {
    setSelected([])
    load()
    onChanged()
  }

  const remove = async () => {
    try {
      await window.uni.anki.deleteNotes([...new Set(selected.map((r) => r.noteId))])
      refresh()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  const allSuspended = selected.length > 0 && selected.every((r) => r.status === 'suspended')
  const toggleSuspend = async () => {
    try {
      await Promise.all(selected.map((r) => window.uni.anki.setSuspended(r.cardId, !allSuspended)))
      refresh()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onExit}>
            Stapel
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Karten
          </Typography.Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({ open: true, noteId: null })}>
          Karte hinzufügen
        </Button>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: 280 }}
          value={deckId ?? 0}
          onChange={(v) => {
            setDeckId(v === 0 ? null : v)
            setPage(1)
          }}
          options={[{ value: 0, label: 'Alle Stapel' }, ...decks.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Input.Search allowClear placeholder="Suchen in Karten und Tags…" style={{ width: 320 }} value={text} onChange={(e) => setText(e.target.value)} />
        {selected.length > 0 && (
          <>
            <Button icon={allSuspended ? <PlayCircleOutlined /> : <PauseCircleOutlined />} onClick={toggleSuspend}>
              {allSuspended ? 'Fortsetzen' : 'Pausieren'}
            </Button>
            <Popconfirm
              title={`${plural(new Set(selected.map((r) => r.noteId)).size, 'Notiz', 'Notizen')} samt allen Karten löschen?`}
              okText="Löschen"
              cancelText="Abbrechen"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button danger icon={<DeleteOutlined />}>
                Löschen ({selected.length})
              </Button>
            </Popconfirm>
          </>
        )}
      </Space>

      <Table<AnkiBrowseRow>
        size="small"
        rowKey="cardId"
        loading={loading}
        dataSource={result.rows}
        rowSelection={{ selectedRowKeys: selected.map((r) => r.cardId), onChange: (_k, rows) => setSelected(rows) }}
        pagination={{ current: page, pageSize: PAGE, total: result.total, showSizeChanger: false, showTotal: (t) => plural(t, 'Karte', 'Karten'), onChange: setPage }}
        onRow={(row) => ({ onClick: () => setEditor({ open: true, noteId: row.noteId }), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Karte', dataIndex: 'title', ellipsis: true, render: (t: string, r) => (r.ord > 0 ? <>{t} <Typography.Text type="secondary">· Karte {r.ord + 1}</Typography.Text></> : t) },
          { title: 'Typ', dataIndex: 'notetype', width: 180, ellipsis: true },
          { title: 'Stapel', dataIndex: 'deck', width: 220, ellipsis: true },
          { title: 'Status', width: 140, render: (_v, r) => <StatusTag row={r} /> },
          { title: 'Tags', width: 200, render: (_v, r) => r.tags.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>) }
        ]}
      />

      <NoteEditor open={editor.open} noteId={editor.noteId} defaultDeckId={deckId} decks={decks} onClose={() => setEditor({ open: false, noteId: null })} onSaved={refresh} />
    </div>
  )
}
