import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Empty, Input, Modal, Spin, Typography, theme } from 'antd'
import type { InputRef } from 'antd'
import { BookOutlined, CalendarOutlined, CheckSquareOutlined, FileTextOutlined, ScheduleOutlined, SearchOutlined } from '@ant-design/icons'
import type { ModuleId, SearchKind, SearchResult } from '@shared/ipc'
import { useOverlay, useSearchTarget } from './searchStore'

const GROUPS: Record<SearchKind, { label: string; icon: ReactNode }> = {
  todo: { label: 'Aufgaben', icon: <CheckSquareOutlined /> },
  event: { label: 'Termine', icon: <CalendarOutlined /> },
  subject: { label: 'Lernplan', icon: <ScheduleOutlined /> },
  topic: { label: 'Lernplan', icon: <ScheduleOutlined /> },
  card: { label: 'Karteikarten', icon: <BookOutlined /> },
  doc: { label: 'Dokumente', icon: <FileTextOutlined /> }
}

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Globale Suche (Strg+K): ein Eingabefeld für Aufgaben, Termine, Lernplan, Karten und Dokumente. */
export function SearchPalette({ open, onClose, go }: { open: boolean; onClose: () => void; go: (m: ModuleId) => void }) {
  const { token } = theme.useToken()
  const setOverlay = useOverlay((s) => s.setOpen)
  const setTarget = useSearchTarget((s) => s.set)
  const input = useRef<InputRef>(null)
  const list = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  // Native Ansichten ausblenden, solange die Suche offen ist
  useEffect(() => {
    setOverlay(open)
    if (open) {
      setQuery('')
      setResults([])
      setError(null)
      setActive(0)
    }
    return () => setOverlay(false)
  }, [open, setOverlay])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    let alive = true
    const t = setTimeout(() => {
      window.uni.search.global(q).then(
        (r) => {
          if (!alive) return
          setResults(r)
          setActive(0)
          setError(null)
          setLoading(false)
        },
        (e) => {
          if (!alive) return
          setError(cleanErr(e))
          setLoading(false)
        }
      )
    }, 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, open])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (r: SearchResult) => {
    setTarget({ kind: r.kind, id: r.id, date: r.date })
    onClose()
    go(r.module)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      pick(results[active])
    }
  }

  let lastGroup = ''
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      style={{ top: 80 }}
      destroyOnHidden
      afterOpenChange={(o) => o && input.current?.focus()}
      styles={{ body: { padding: 0 } }}
    >
      <Input
        ref={input}
        autoFocus
        size="large"
        variant="borderless"
        prefix={<SearchOutlined />}
        suffix={loading ? <Spin size="small" /> : undefined}
        placeholder="Aufgaben, Termine, Lernplan, Karten und Dokumente durchsuchen …"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={200}
        style={{ padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, borderRadius: 0 }}
      />
      <div ref={list} style={{ maxHeight: 420, overflowY: 'auto', padding: '4px 0' }}>
        {error ? (
          <Typography.Text type="danger" style={{ display: 'block', padding: 16 }}>
            {error}
          </Typography.Text>
        ) : !query.trim() ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: 16 }}>
            Tippe los. Mit ↑ ↓ wählst du, mit Enter öffnest du, mit Esc schließt du.
          </Typography.Text>
        ) : results.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Keine Treffer" style={{ margin: '16px 0' }} />
        ) : (
          results.map((r, i) => {
            const group = GROUPS[r.kind]
            const header = group.label !== lastGroup
            lastGroup = group.label
            return (
              <div key={`${r.kind}-${r.id}`}>
                {header && (
                  <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 16px 2px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {group.label}
                  </Typography.Text>
                )}
                <div
                  data-idx={i}
                  onClick={() => pick(r)}
                  onMouseMove={() => active !== i && setActive(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', background: i === active ? token.colorPrimaryBg : undefined }}
                >
                  <span style={{ color: token.colorTextSecondary }}>{group.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    {r.subtitle && (
                      <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
                        {r.subtitle}
                      </Typography.Text>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
