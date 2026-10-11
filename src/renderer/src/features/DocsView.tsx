import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, App as AntApp, AutoComplete, Button, Collapse, Empty, Form, Input, List, Modal, Result, Select, Space, Spin, Tag, Tooltip, Typography, theme } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FolderOpenOutlined,
  FormOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UploadOutlined
} from '@ant-design/icons'
import type { DocPreview, DocSearchHit, DocumentItem } from '@shared/ipc'
import { useOverlay, useSearchTarget } from './searchStore'
import { FILE, PAPER, HIGHLIGHT } from '../theme/colors'

const ALL = '__all__'
const NONE = '__none__'

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

const ICONS: Record<string, ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: FILE.pdf }} />,
  docx: <FileWordOutlined style={{ color: FILE.word }} />,
  doc: <FileWordOutlined style={{ color: FILE.word }} />,
  pptx: <FilePptOutlined style={{ color: FILE.ppt }} />,
  ppt: <FilePptOutlined style={{ color: FILE.ppt }} />,
  txt: <FileTextOutlined />,
  md: <FileTextOutlined />
}
const iconFor = (ext: string) => ICONS[ext] ?? (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext) ? <FileImageOutlined style={{ color: FILE.image }} /> : <FileOutlined />)

/** Suchtreffer-Auszug mit den Markern U+0001/U+0002 als <mark> darstellen (ohne HTML-Injektion). */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/)
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {parts.map((p, i) => (p.startsWith('\u0001') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}
    </Typography.Text>
  )
}

interface EditForm {
  title: string
  folder?: string
  tags: string[]
}

function EditModal({ doc, folders, onClose, onSaved }: { doc: DocumentItem | null; folders: string[]; onClose: () => void; onSaved: () => void }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<EditForm>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (doc) form.setFieldsValue({ title: doc.title, folder: doc.folder ?? undefined, tags: doc.tags })
  }, [doc, form])

  const save = async () => {
    if (!doc) return
    const v = await form.validateFields()
    setBusy(true)
    try {
      await window.uni.docs.update(doc.id, { title: v.title, folder: v.folder?.trim() || null, tags: v.tags ?? [] })
      onSaved()
      onClose()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Dokument bearbeiten" open={!!doc} onCancel={onClose} onOk={save} confirmLoading={busy} okText="Speichern" cancelText="Abbrechen" destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Titel" rules={[{ required: true, whitespace: true, message: 'Titel erforderlich' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="folder" label="Ordner (z. B. Fach oder Modul)">
          <AutoComplete allowClear placeholder="Ordner wählen oder neu eingeben" options={folders.map((f) => ({ value: f }))} filterOption={(input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>
        <Form.Item name="tags" label="Tags">
          <Select mode="tags" tokenSeparators={[',']} placeholder="Tags eingeben" open={false} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** Kleines Notizfenster wie im Editor: einfach tippen, gespeichert wird automatisch. */
function NotesModal({ doc, onClose, onChanged }: { doc: DocumentItem | null; onClose: () => void; onChanged: () => void }) {
  const { message } = AntApp.useApp()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [state, setState] = useState<'saved' | 'dirty' | 'error'>('saved')
  const latest = useRef({ id: 0, text: '', dirty: false })

  const flush = useCallback(async () => {
    const { id, text: t, dirty } = latest.current
    if (!id || !dirty) return
    latest.current.dirty = false
    try {
      await window.uni.docs.setNotes(id, t)
      setState((s) => (latest.current.dirty ? s : 'saved'))
      onChanged()
    } catch (e) {
      latest.current.dirty = true
      setState('error')
      message.error(cleanErr(e))
    }
  }, [message, onChanged])

  useEffect(() => {
    if (!doc) return
    let alive = true
    setLoaded(false)
    setState('saved')
    latest.current = { id: doc.id, text: '', dirty: false }
    window.uni.docs.getNotes(doc.id).then(
      (t) => {
        if (!alive) return
        latest.current.text = t
        setText(t)
        setLoaded(true)
      },
      (e) => message.error(cleanErr(e))
    )
    return () => {
      alive = false
    }
  }, [doc, message])

  // Automatisch speichern, kurz nachdem du aufhörst zu tippen
  useEffect(() => {
    if (state !== 'dirty') return
    const t = setTimeout(() => void flush(), 700)
    return () => clearTimeout(t)
  }, [text, state, flush])

  const change = (value: string) => {
    setText(value)
    latest.current.text = value
    latest.current.dirty = true
    setState('dirty')
  }

  const close = async () => {
    await flush()
    onClose()
  }

  return (
    <Modal
      title={doc ? `Notizen – ${doc.title}` : 'Notizen'}
      open={!!doc}
      onCancel={close}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type={state === 'error' ? 'danger' : 'secondary'}>
            {state === 'saved' ? 'Gespeichert' : state === 'dirty' ? 'Speichert …' : 'Speichern fehlgeschlagen'}
          </Typography.Text>
          <Button type="primary" onClick={close}>
            Schließen
          </Button>
        </Space>
      }
      width={520}
      destroyOnHidden
    >
      <Input.TextArea
        autoFocus
        value={text}
        disabled={!loaded}
        onChange={(e) => change(e.target.value)}
        placeholder="Notizen zu diesem Dokument …"
        maxLength={100_000}
        rows={14}
        style={{ resize: 'vertical', fontFamily: 'Consolas, "Segoe UI", monospace' }}
      />
    </Modal>
  )
}

function Viewer({ doc, suspended }: { doc: DocumentItem; suspended: boolean }) {
  const { token } = theme.useToken()
  const host = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<DocPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPreview(null)
    setError(null)
    let alive = true
    window.uni.docs.preview(doc.id).then(
      (p) => alive && setPreview(p),
      (e) => alive && setError(cleanErr(e))
    )
    return () => {
      alive = false
    }
  }, [doc.id])

  // Natives Viewer-Fenster liegt über dem DOM: bei Dialogen oder anderen Ansichten ausblenden
  const native = preview?.kind === 'native' && !suspended
  useEffect(() => {
    if (!native) return
    const el = host.current
    if (!el) return
    const sync = () => {
      const r = el.getBoundingClientRect()
      window.uni.docs.showView(doc.id, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.uni.docs.hideView()
    }
  }, [native, doc.id])

  if (error) return <Alert type="error" showIcon message={error} style={{ margin: 16 }} />
  if (!preview) return <Spin style={{ margin: 24 }} />

  switch (preview.kind) {
    case 'native':
      return <div ref={host} style={{ flex: 1, background: token.colorBgContainer }} />
    case 'html':
      return (
        <iframe
          title={doc.title}
          sandbox=""
          srcDoc={`<style>body{font-family:Segoe UI,sans-serif;line-height:1.5;padding:24px;max-width:860px;margin:auto;color:${PAPER.text};background:${PAPER.bg}}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid ${PAPER.border};padding:4px 8px}</style>${preview.html}`}
          style={{ flex: 1, border: 0, background: PAPER.bg }}
        />
      )
    case 'slides':
      return (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Vorschau zeigt nur den Folientext. Für Layout und Bilder „Extern öffnen“ nutzen." />
          {preview.slides.length === 0 ? (
            <Empty description="Kein Text gefunden" />
          ) : (
            <Collapse
              defaultActiveKey={['0']}
              items={preview.slides.map((s, i) => ({ key: String(i), label: `Folie ${i + 1}`, children: <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s || '(kein Text)'}</Typography.Paragraph> }))}
            />
          )}
        </div>
      )
    case 'external':
      return (
        <Result
          icon={iconFor(doc.ext)}
          title="Keine Vorschau für dieses Format"
          extra={
            <Button type="primary" icon={<ExportOutlined />} onClick={() => window.uni.docs.openInDefaultApp(doc.id)}>
              Im Standardprogramm öffnen
            </Button>
          }
        />
      )
  }
}

export function DocsView() {
  const { message } = AntApp.useApp()
  const { token } = theme.useToken()
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [folder, setFolder] = useState<string>(ALL)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<DocSearchHit[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<DocumentItem | null>(null)
  const [deleting, setDeleting] = useState<DocumentItem | null>(null)
  const [noting, setNoting] = useState<DocumentItem | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)

  useEffect(() => {
    window.uni.ui.get('ui.docsListCollapsed').then((v) => setListCollapsed(v === '1'))
  }, [])

  const toggleList = () => {
    const next = !listCollapsed
    setListCollapsed(next)
    window.uni.ui.set('ui.docsListCollapsed', next ? '1' : '0')
  }

  const load = useCallback(() => window.uni.docs.list().then(setDocs), [])
  useEffect(() => {
    load()
    return window.uni.docs.onImported(() => void load())
  }, [load])

  // Volltextsuche mit kurzer Verzögerung
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    const t = setTimeout(() => window.uni.docs.search(q).then(setHits, (e) => message.error(cleanErr(e))), 250)
    return () => clearTimeout(t)
  }, [query, message, docs])

  const folders = useMemo(() => [...new Set(docs.map((d) => d.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, 'de')), [docs])
  const hasUnsorted = docs.some((d) => !d.folder)

  const snippets = useMemo(() => new Map((hits ?? []).map((h) => [h.id, h.snippet])), [hits])
  const visible = useMemo(() => {
    let list = docs
    if (hits) list = hits.map((h) => docs.find((d) => d.id === h.id)).filter((d): d is DocumentItem => !!d)
    if (folder === NONE) list = list.filter((d) => !d.folder)
    else if (folder !== ALL) list = list.filter((d) => d.folder === folder)
    return list
  }, [docs, hits, folder])

  const selected = docs.find((d) => d.id === selectedId) ?? null
  // Zielordner für Importe: der gerade gewählte (sofern ein echter Ordner)
  const importTarget = folder !== ALL && folder !== NONE ? folder : null

  const afterImport = (n: number) => {
    if (n > 0) message.success(`${n} ${n === 1 ? 'Dokument' : 'Dokumente'} importiert`)
    else message.info('Keine unterstützten Dateien gefunden')
    return load()
  }

  const doImport = async (fn: () => Promise<number>) => {
    setBusy(true)
    try {
      await afterImport(await fn())
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.uni.docs.pathForFile(f))
      .filter(Boolean)
    if (paths.length) doImport(() => window.uni.docs.importPaths(paths, importTarget))
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await window.uni.docs.remove(deleting.id)
      if (selectedId === deleting.id) setSelectedId(null)
      setDeleting(null)
      load()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  const searching = useOverlay((s) => s.open)
  const suspended = !!editing || !!deleting || !!noting || searching

  // Treffer der globalen Suche: Dokument auswählen und Filter zurücksetzen
  const target = useSearchTarget((s) => s.target)
  const setTarget = useSearchTarget((s) => s.set)
  useEffect(() => {
    if (target?.kind !== 'doc') return
    setQuery('')
    setFolder(ALL)
    setSelectedId(target.id)
    setTarget(null)
  }, [target, setTarget])

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          width: listCollapsed ? 48 : 440,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          outline: dragOver ? `2px dashed ${token.colorPrimary}` : undefined,
          outlineOffset: -4
        }}
      >
        {listCollapsed && (
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <Button type="text" icon={<MenuUnfoldOutlined />} onClick={toggleList} aria-label="Dokumentliste ausklappen" />
          </div>
        )}
        <div style={{ padding: 16, display: listCollapsed ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Button type="text" icon={<MenuFoldOutlined />} onClick={toggleList} aria-label="Dokumentliste einklappen" />
              <Typography.Title level={3} style={{ margin: 0 }}>
                Doc-Hub
              </Typography.Title>
            </Space>
            <Button type="primary" icon={<UploadOutlined />} loading={busy} onClick={() => doImport(() => window.uni.docs.importDialog(importTarget))}>
              Importieren
            </Button>
          </Space>
          <Input.Search allowClear placeholder="Volltextsuche in allen Dokumenten…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select
            value={folder}
            onChange={setFolder}
            options={[
              { value: ALL, label: `Alle Dokumente (${docs.length})` },
              ...folders.map((f) => ({ value: f, label: `${f} (${docs.filter((d) => d.folder === f).length})` })),
              ...(hasUnsorted ? [{ value: NONE, label: `Ohne Ordner (${docs.filter((d) => !d.folder).length})` }] : [])
            ]}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: listCollapsed ? 'none' : undefined }}>
          <List
            dataSource={visible}
            locale={{
              emptyText: query.trim() ? (
                <Empty description="Keine Treffer" />
              ) : (
                <Empty image={<InboxOutlined style={{ fontSize: 48, color: token.colorTextTertiary }} />} description="Dateien hierher ziehen oder importieren (PDF, DOCX, PPTX, Bilder, Text)" />
              )
            }}
            renderItem={(d) => (
              <List.Item
                onClick={() => setSelectedId(d.id)}
                style={{ cursor: 'pointer', padding: '10px 16px', background: d.id === selectedId ? HIGHLIGHT.selected : undefined }}
                extra={
                  <Tooltip title={d.hasNotes ? 'Notizen ansehen' : 'Notiz schreiben'}>
                    <Button
                      type="text"
                      size="small"
                      icon={<FormOutlined style={{ color: d.hasNotes ? token.colorPrimary : token.colorTextTertiary }} />}
                      aria-label="Notizen"
                      onClick={(e) => {
                        e.stopPropagation()
                        setNoting(d)
                      }}
                    />
                  </Tooltip>
                }
              >
                <List.Item.Meta
                  avatar={<span style={{ fontSize: 22 }}>{iconFor(d.ext)}</span>}
                  title={<span>{d.title}</span>}
                  description={
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space size={4} wrap>
                        {d.folder && <Tag color="blue">{d.folder}</Tag>}
                        {d.tags.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {d.ext.toUpperCase()} · {fmtSize(d.size)}
                        </Typography.Text>
                        {!d.hasText && <Typography.Text type="secondary" style={{ fontSize: 12 }}>· nicht durchsuchbar</Typography.Text>}
                      </Space>
                      {snippets.has(d.id) && <Snippet text={snippets.get(d.id)!} />}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <>
            <Space
              style={{ padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, justifyContent: 'space-between', flexShrink: 0 }}
            >
              <Typography.Text strong ellipsis style={{ maxWidth: 360 }}>
                {selected.title}
              </Typography.Text>
              <Space>
                <Button icon={<ExportOutlined />} onClick={() => window.uni.docs.openInDefaultApp(selected.id).catch((e) => message.error(cleanErr(e)))}>
                  Extern öffnen
                </Button>
                <Button icon={<FolderOpenOutlined />} onClick={() => window.uni.docs.reveal(selected.id)} />
                <Button icon={<EditOutlined />} onClick={() => setEditing(selected)} />
                <Button danger icon={<DeleteOutlined />} onClick={() => setDeleting(selected)} />
              </Space>
            </Space>
            <Viewer key={selected.id} doc={selected} suspended={suspended} />
          </>
        ) : (
          <Empty style={{ margin: 'auto' }} description="Dokument auswählen" />
        )}
      </div>

      <NotesModal doc={noting} onClose={() => setNoting(null)} onChanged={load} />
      <EditModal doc={editing} folders={folders} onClose={() => setEditing(null)} onSaved={load} />
      <Modal
        title="Dokument löschen?"
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onOk={confirmDelete}
        okText="Löschen"
        okButtonProps={{ danger: true }}
        cancelText="Abbrechen"
      >
        „{deleting?.title}“ wird aus dem Doc-Hub entfernt und die gespeicherte Kopie gelöscht. Das Original an seinem ursprünglichen Ort bleibt erhalten.
      </Modal>
    </div>
  )
}
