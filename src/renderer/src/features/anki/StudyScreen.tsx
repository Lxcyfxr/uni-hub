import { useCallback, useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Result, Space, Spin, Tag, Tooltip, Typography, theme } from 'antd'
import { ArrowLeftOutlined, EditOutlined, PauseCircleOutlined } from '@ant-design/icons'
import type { AnkiDeck, AnkiStudyNext } from '@shared/ipc'
import { CardFrame } from './CardFrame'
import { NoteEditor } from './NoteEditor'
import { cleanErr } from './util'

const RATINGS = [
  { value: 1, label: 'Nochmal', key: '1', danger: true },
  { value: 2, label: 'Schwer', key: '2' },
  { value: 3, label: 'Gut', key: '3', primary: true },
  { value: 4, label: 'Einfach', key: '4' }
] as const

export function StudyScreen({ deck, decks, onExit }: { deck: AnkiDeck; decks: AnkiDeck[]; onExit: () => void }) {
  const { message } = AntApp.useApp()
  const { token } = theme.useToken()
  const [data, setData] = useState<AnkiStudyNext | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [reviewed, setReviewed] = useState(0)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    try {
      setData(await window.uni.anki.next(deck.id))
      setShown(false)
    } catch (e) {
      message.error(cleanErr(e))
    }
  }, [deck.id, message])

  useEffect(() => {
    load()
  }, [load])

  const card = data?.card ?? null
  const editorOpen = editingNote !== null

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!card || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        await window.uni.anki.answer(card.cardId, rating)
        setReviewed((n) => n + 1)
        await load()
      } catch (e) {
        message.error(cleanErr(e))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [card, load, message]
  )

  const suspend = async () => {
    if (!card) return
    try {
      await window.uni.anki.setSuspended(card.cardId, true)
      message.info('Karte pausiert – im Kartenbrowser kannst du sie wieder aktivieren')
      await load()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  // Tastatur: Leertaste/Enter zeigt die Antwort bzw. bewertet mit "Gut", 1–4 bewerten direkt
  useEffect(() => {
    if (editorOpen) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (!card) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!shown) setShown(true)
        else rate(3)
      } else if (shown && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, shown, rate, editorOpen])

  const c = data?.counts
  const active = card?.state

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onExit}>
          Stapel
        </Button>
        <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
          {deck.name.replace(/::/g, ' › ')}
        </Typography.Text>
        {c && (
          <Space size={4}>
            <Tag color="blue" style={{ fontWeight: active === 'new' ? 700 : 400, textDecoration: active === 'new' ? 'underline' : undefined }}>
              Neu {c.new}
            </Tag>
            <Tag color="red" style={{ fontWeight: active === 'learning' ? 700 : 400, textDecoration: active === 'learning' ? 'underline' : undefined }}>
              Lernen {c.learn}
            </Tag>
            <Tag color="green" style={{ fontWeight: active === 'review' ? 700 : 400, textDecoration: active === 'review' ? 'underline' : undefined }}>
              Fällig {c.due}
            </Tag>
          </Space>
        )}
        <Tooltip title="Karte bearbeiten">
          <Button icon={<EditOutlined />} disabled={!card} onClick={() => card && setEditingNote(card.noteId)} />
        </Tooltip>
        <Tooltip title="Karte pausieren">
          <Button icon={<PauseCircleOutlined />} disabled={!card} onClick={suspend} />
        </Tooltip>
      </div>

      {!data ? (
        <Spin style={{ margin: 48 }} />
      ) : !card ? (
        <Result
          status="success"
          title="Für heute fertig 🎉"
          subTitle={reviewed ? `${reviewed} Karten in dieser Sitzung wiederholt.` : 'Keine Karten zum Lernen fällig.'}
          extra={
            <Button type="primary" onClick={onExit}>
              Zurück zu den Stapeln
            </Button>
          }
        />
      ) : (
        <>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <CardFrame html={shown ? card.answer : card.question} css={card.css} />
          </div>
          <div style={{ padding: 16, display: 'flex', justifyContent: 'center', gap: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
            {!shown ? (
              <Button type="primary" size="large" style={{ minWidth: 280 }} onClick={() => setShown(true)}>
                Antwort zeigen (Leertaste)
              </Button>
            ) : (
              RATINGS.map((r) => (
                <Button
                  key={r.value}
                  size="large"
                  disabled={busy}
                  danger={'danger' in r}
                  type={'primary' in r ? 'primary' : 'default'}
                  onClick={() => rate(r.value)}
                  style={{ minWidth: 130, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2 }}
                >
                  <span style={{ fontSize: 12, opacity: 0.75 }}>{card.previews[r.value]}</span>
                  <span>
                    {r.label} <span style={{ opacity: 0.5 }}>({r.key})</span>
                  </span>
                </Button>
              ))
            )}
          </div>
        </>
      )}

      <NoteEditor
        open={editorOpen}
        noteId={editingNote}
        defaultDeckId={deck.id}
        decks={decks}
        onClose={() => setEditingNote(null)}
        onSaved={load}
      />
    </div>
  )
}
