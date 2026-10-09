import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntApp, Button, Form, Input, Modal, Segmented, Select, Space, Typography } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { PictureOutlined } from '@ant-design/icons'
import { clozeNumbers } from '@shared/anki-render'
import type { AnkiDeck, AnkiNotetype, AnkiPreview } from '@shared/ipc'
import { CardFrame } from './CardFrame'
import { cleanErr } from './util'

const LAST_KEY = 'ui.ankiLastNote'

interface Props {
  open: boolean
  /** null = neue Karte */
  noteId: number | null
  defaultDeckId: number | null
  decks: AnkiDeck[]
  onClose: () => void
  onSaved: () => void
}

export function NoteEditor({ open, noteId, defaultDeckId, decks, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp()
  const [notetypes, setNotetypes] = useState<AnkiNotetype[]>([])
  const [deckId, setDeckId] = useState<number | null>(null)
  const [notetypeId, setNotetypeId] = useState<number | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [mediaNs, setMediaNs] = useState('own')
  const [focused, setFocused] = useState(0)
  const [previewOrd, setPreviewOrd] = useState(0)
  const [preview, setPreview] = useState<AnkiPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstField = useRef<TextAreaRef>(null)

  const nt = notetypes.find((n) => n.id === notetypeId) ?? null
  const editing = noteId !== null

  // Laden beim Öffnen
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const types = await window.uni.anki.notetypes()
      if (!alive) return
      setNotetypes(types)
      setPreview(null)
      setPreviewOrd(0)
      if (noteId !== null) {
        const note = await window.uni.anki.getNote(noteId)
        if (!alive) return
        setDeckId(note.deckId)
        setNotetypeId(note.notetypeId)
        setFields(note.fields)
        setTags(note.tags)
        setMediaNs(note.mediaNs)
        return
      }
      let last: { deckId?: number; notetypeId?: number } = {}
      try {
        last = JSON.parse((await window.uni.ui.get(LAST_KEY)) ?? '{}')
      } catch {
        /* keine gespeicherte Auswahl */
      }
      const deck = [defaultDeckId, last.deckId].find((id) => id != null && decks.some((d) => d.id === id)) ?? decks[0]?.id ?? null
      const type = types.find((t) => t.id === last.notetypeId) ?? types[0]
      setDeckId(deck as number | null)
      setNotetypeId(type?.id ?? null)
      setFields((type?.fields ?? []).map(() => ''))
      setTags([])
      setMediaNs('own')
    })().catch((e) => message.error(cleanErr(e)))
    return () => {
      alive = false
    }
    // decks absichtlich nicht als Abhängigkeit: Auswahl soll beim Öffnen einmal bestimmt werden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId, defaultDeckId])

  const changeType = (id: number) => {
    const next = notetypes.find((n) => n.id === id)
    if (!next) return
    setNotetypeId(id)
    setFields((old) => next.fields.map((_, i) => old[i] ?? ''))
    setPreviewOrd(0)
  }

  // Auswählbare Karten für die Vorschau
  const ords = useMemo(() => {
    if (!nt) return [0]
    if (nt.kind === 'cloze') {
      const n = clozeNumbers(fields)
      return n.length ? n.map((x) => x - 1) : [0]
    }
    return nt.templates.map((_, i) => i)
  }, [nt, fields])
  const ord = ords.includes(previewOrd) ? previewOrd : ords[0]

  // Vorschau mit kurzer Verzögerung
  useEffect(() => {
    if (!open || notetypeId === null) return
    const t = setTimeout(() => {
      window.uni.anki.preview(notetypeId, fields, ord, mediaNs).then(
        (p) => {
          setPreview(p)
          setPreviewError(null)
        },
        (e) => setPreviewError(cleanErr(e))
      )
    }, 300)
    return () => clearTimeout(t)
  }, [open, notetypeId, fields, ord, mediaNs])

  const setField = (i: number, value: string) => setFields((f) => f.map((v, j) => (j === i ? value : v)))

  const addImage = async () => {
    try {
      const name = await window.uni.anki.addImage()
      if (name) setField(focused, `${fields[focused] ?? ''}<img src="${name}">`)
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  const save = async (keepOpen: boolean) => {
    if (deckId === null || notetypeId === null) return
    setBusy(true)
    try {
      await window.uni.anki.saveNote({ id: noteId ?? undefined, notetypeId, deckId, fields, tags })
      window.uni.ui.set(LAST_KEY, JSON.stringify({ deckId, notetypeId })).catch(() => {})
      onSaved()
      if (keepOpen) {
        message.success('Karte hinzugefügt')
        setFields((f) => f.map(() => ''))
        setPreview(null)
        setTimeout(() => firstField.current?.focus(), 0)
      } else onClose()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Karte bearbeiten' : 'Karte hinzufügen'}
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Abbrechen</Button>
          {!editing && (
            <Button loading={busy} disabled={deckId === null} onClick={() => save(true)}>
              Hinzufügen & weiter
            </Button>
          )}
          <Button type="primary" loading={busy} disabled={deckId === null} onClick={() => save(false)}>
            {editing ? 'Speichern' : 'Hinzufügen & schließen'}
          </Button>
        </Space>
      }
    >
      {decks.length === 0 ? (
        <Alert type="warning" showIcon message="Lege zuerst einen Stapel an, in den die Karte kommen soll." />
      ) : (
        <Form layout="vertical">
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item label="Stapel" style={{ flex: 1, minWidth: 240 }}>
              <Select
                showSearch
                optionFilterProp="label"
                value={deckId ?? undefined}
                onChange={setDeckId}
                options={decks.map((d) => ({ value: d.id, label: d.name }))}
                style={{ width: 300 }}
              />
            </Form.Item>
            <Form.Item label="Kartentyp">
              <Select
                value={notetypeId ?? undefined}
                onChange={changeType}
                disabled={editing}
                options={notetypes.map((n) => ({ value: n.id, label: n.name }))}
                style={{ width: 260 }}
              />
            </Form.Item>
          </Space>

          {nt?.kind === 'cloze' && (
            <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
              Lücken schreibst du als <code>{'{{c1::Antwort}}'}</code> oder mit Hinweis <code>{'{{c1::Antwort::Hinweis}}'}</code>. Jede Nummer ergibt eine eigene Karte.
            </Typography.Paragraph>
          )}

          {nt?.fields.map((name, i) => (
            <Form.Item
              key={name}
              label={
                <Space>
                  {name}
                  {i === focused && (
                    <Button size="small" type="link" icon={<PictureOutlined />} onClick={addImage}>
                      Bild einfügen
                    </Button>
                  )}
                </Space>
              }
            >
              <Input.TextArea
                ref={i === 0 ? firstField : undefined}
                value={fields[i] ?? ''}
                autoSize={{ minRows: 2, maxRows: 8 }}
                onFocus={() => setFocused(i)}
                onChange={(e) => setField(i, e.target.value)}
              />
            </Form.Item>
          ))}

          <Form.Item label="Tags">
            <Select mode="tags" tokenSeparators={[' ', ',']} value={tags} onChange={setTags} open={false} placeholder="Tags eingeben, mit Enter bestätigen" />
          </Form.Item>

          <Form.Item
            label={
              <Space>
                Vorschau
                {ords.length > 1 && (
                  <Segmented
                    size="small"
                    value={ord}
                    onChange={(v) => setPreviewOrd(Number(v))}
                    options={ords.map((o) => ({ value: o, label: nt?.kind === 'cloze' ? `Lücke ${o + 1}` : (nt?.templates[o]?.name ?? `Karte ${o + 1}`) }))}
                  />
                )}
              </Space>
            }
          >
            {previewError ? (
              <Alert type="error" showIcon message={previewError} />
            ) : preview ? (
              <div style={{ display: 'flex', gap: 8, height: 170 }}>
                <div style={{ flex: 1, display: 'flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                  <CardFrame html={preview.question} css={preview.css} />
                </div>
                <div style={{ flex: 1, display: 'flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                  <CardFrame html={preview.answer} css={preview.css} />
                </div>
              </div>
            ) : (
              <Typography.Text type="secondary">Wird geladen…</Typography.Text>
            )}
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
