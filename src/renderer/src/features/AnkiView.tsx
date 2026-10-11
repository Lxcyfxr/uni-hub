import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tooltip,
  Typography
} from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  PlusOutlined,
  ProfileOutlined,
  UploadOutlined
} from '@ant-design/icons'
import type { AnkiDeck, AnkiImportResult, AnkiProgress } from '@shared/ipc'
import { StudyScreen } from './anki/StudyScreen'
import { BrowseView } from './anki/BrowseView'
import { NoteEditor } from './anki/NoteEditor'
import { cleanErr, plural, summarizeImport } from './anki/util'
import { ANKI, ON_DARK } from '../theme/colors'

type Screen = { kind: 'decks' } | { kind: 'study'; deckId: number } | { kind: 'browse'; deckId: number | null }

const count = (n: number, color: string) => <span style={{ color: n > 0 ? color : ON_DARK.textFaint, fontVariantNumeric: 'tabular-nums' }}>{n}</span>

export function AnkiView() {
  const { message, modal } = AntApp.useApp()
  const [screen, setScreen] = useState<Screen>({ kind: 'decks' })
  const [decks, setDecks] = useState<AnkiDeck[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newPerDay, setNewPerDay] = useState(20)

  const [progress, setProgress] = useState<{ title: string; value: AnkiProgress | null } | null>(null)
  const [nameModal, setNameModal] = useState<{ mode: 'create' | 'rename'; deck?: AnkiDeck } | null>(null)
  const [importModal, setImportModal] = useState<'apkg' | 'text' | null>(null)
  const [exportDeckId, setExportDeckId] = useState<AnkiDeck | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [keepProgress, setKeepProgress] = useState(true)
  const [hasHeader, setHasHeader] = useState(false)
  const [withProgress, setWithProgress] = useState(false)
  const [textDeckId, setTextDeckId] = useState<number | null>(null)
  const [nameValue, setNameValue] = useState('')

  const load = useCallback(async () => {
    try {
      setDecks(await window.uni.anki.decks())
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setLoaded(true)
    }
  }, [message])

  useEffect(() => {
    load()
    window.uni.ui.get('ui.ankiNewPerDay').then((v) => v !== null && Number.isFinite(Number(v)) && setNewPerDay(Number(v)))
  }, [load])

  // Fortschrittsmeldungen des Hauptprozesses (Import/Export)
  useEffect(() => window.uni.anki.onProgress((p) => setProgress((cur) => (cur ? { ...cur, value: p } : cur))), [])

  // Pakete, die automatisch aus der Webansicht importiert wurden
  useEffect(() => window.uni.anki.onDownload((ev) => ev.status === 'done' && load()), [load])

  const rows = useMemo(() => {
    const names = new Set(decks.map((d) => d.name))
    return decks.map((d) => {
      // Nächstliegenden vorhandenen Elternstapel suchen; ohne Eltern bleibt der volle Pfad stehen
      const parts = d.name.split('::')
      let depth = 0
      let label = d.name
      for (let i = parts.length - 1; i > 0; i--) {
        const parent = parts.slice(0, i).join('::')
        if (names.has(parent)) {
          depth = decks.filter((e) => d.name.startsWith(e.name + '::')).length
          label = parts.slice(i).join('::')
          break
        }
      }
      return { ...d, depth, label }
    })
  }, [decks])

  const run = async <T,>(title: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setProgress({ title, value: null })
    try {
      return await fn()
    } catch (e) {
      modal.error({ title: `${title} fehlgeschlagen`, content: cleanErr(e) })
      return undefined
    } finally {
      setProgress(null)
      load()
    }
  }

  const doImportApkg = async () => {
    setImportModal(null)
    const r = await run('Import', () => window.uni.anki.importApkg(keepProgress))
    if (r) message.success({ content: summarizeImport(r), duration: 6 })
  }

  const doImportText = async () => {
    if (textDeckId === null) return
    setImportModal(null)
    const r = await run('Import', () => window.uni.anki.importText(textDeckId, hasHeader))
    if (r) message.success({ content: summarizeImport(r), duration: 6 })
  }

  const doExport = async () => {
    const deck = exportDeckId
    if (!deck) return
    setExportDeckId(null)
    const n = await run('Export', () => window.uni.anki.exportDeck(deck.id, withProgress))
    if (n != null) message.success(`${plural(n, 'Notiz', 'Notizen')} exportiert`)
  }

  const submitName = async () => {
    if (!nameModal) return
    try {
      if (nameModal.mode === 'create') await window.uni.anki.createDeck(nameValue)
      else if (nameModal.deck) await window.uni.anki.renameDeck(nameModal.deck.id, nameValue)
      setNameModal(null)
      load()
    } catch (e) {
      message.error(cleanErr(e))
    }
  }

  const changeNewPerDay = (v: number | null) => {
    if (v === null) return
    setNewPerDay(v)
    window.uni.ui.set('ui.ankiNewPerDay', String(v)).then(load)
  }

  const studyDeck = screen.kind === 'study' ? decks.find((d) => d.id === screen.deckId) : undefined

  if (screen.kind === 'study' && studyDeck) {
    return (
      <StudyScreen
        deck={studyDeck}
        decks={decks}
        onExit={() => {
          setScreen({ kind: 'decks' })
          load()
        }}
      />
    )
  }
  if (screen.kind === 'browse') {
    return <BrowseView decks={decks} initialDeckId={screen.deckId} onExit={() => setScreen({ kind: 'decks' })} onChanged={load} />
  }

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Anki
        </Typography.Title>
        <Space wrap>
          <Button icon={<FolderAddOutlined />} onClick={() => { setNameValue(''); setNameModal({ mode: 'create' }) }}>
            Neuer Stapel
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportModal('apkg')}>
            Importieren (.apkg)
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => { setTextDeckId(decks[0]?.id ?? null); setImportModal('text') }} disabled={decks.length === 0}>
            Text/CSV
          </Button>
          <Button icon={<ProfileOutlined />} onClick={() => setScreen({ kind: 'browse', deckId: null })}>
            Karten
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditorOpen(true)}>
            Karte hinzufügen
          </Button>
        </Space>
      </Space>

      <Table
        size="middle"
        rowKey="id"
        pagination={false}
        loading={!loaded}
        dataSource={rows}
        locale={{
          emptyText: (
            <Empty description="Noch keine Stapel – importiere ein Anki-Paket oder lege einen Stapel an">
              <Space>
                <Button type="primary" icon={<UploadOutlined />} onClick={() => setImportModal('apkg')}>
                  Paket importieren
                </Button>
                <Button icon={<FolderAddOutlined />} onClick={() => { setNameValue(''); setNameModal({ mode: 'create' }) }}>
                  Stapel anlegen
                </Button>
              </Space>
            </Empty>
          )
        }}
        columns={[
          {
            title: 'Stapel',
            render: (_v, d) => (
              <Button type="link" style={{ paddingLeft: d.depth * 20, fontWeight: d.depth === 0 ? 600 : 400 }} onClick={() => setScreen({ kind: 'study', deckId: d.id })}>
                {d.label}
              </Button>
            )
          },
          { title: 'Neu', dataIndex: 'newCount', width: 80, align: 'right', render: (n: number) => count(n, ANKI.new) },
          { title: 'Lernen', dataIndex: 'learnCount', width: 90, align: 'right', render: (n: number) => count(n, ANKI.learn) },
          { title: 'Fällig', dataIndex: 'dueCount', width: 90, align: 'right', render: (n: number) => count(n, ANKI.due) },
          { title: 'Karten', dataIndex: 'total', width: 90, align: 'right', render: (n: number) => <span style={{ opacity: 0.65 }}>{n}</span> },
          {
            title: '',
            width: 300,
            align: 'right',
            render: (_v, d) => (
              <Space size={4}>
                <Button type="primary" size="small" onClick={() => setScreen({ kind: 'study', deckId: d.id })}>
                  Lernen
                </Button>
                <Tooltip title="Karten ansehen">
                  <Button size="small" icon={<ProfileOutlined />} onClick={() => setScreen({ kind: 'browse', deckId: d.id })} />
                </Tooltip>
                <Tooltip title="Exportieren">
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => { setWithProgress(false); setExportDeckId(d) }} />
                </Tooltip>
                <Tooltip title="Umbenennen / verschieben">
                  <Button size="small" icon={<EditOutlined />} onClick={() => { setNameValue(d.name); setNameModal({ mode: 'rename', deck: d }) }} />
                </Tooltip>
                <Popconfirm
                  title={`„${d.name}“ mit Unterstapeln und ${plural(d.total, 'Karte', 'Karten')} löschen?`}
                  okText="Löschen"
                  cancelText="Abbrechen"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try {
                      await window.uni.anki.deleteDeck(d.id)
                      load()
                    } catch (e) {
                      message.error(cleanErr(e))
                    }
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />

      <Space style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">Neue Karten pro Tag:</Typography.Text>
        <InputNumber min={0} max={9999} value={newPerDay} onChange={changeNewPerDay} />
      </Space>

      {/* Stapel anlegen / umbenennen */}
      <Modal
        title={nameModal?.mode === 'create' ? 'Neuer Stapel' : 'Stapel umbenennen'}
        open={!!nameModal}
        onCancel={() => setNameModal(null)}
        onOk={submitName}
        okText={nameModal?.mode === 'create' ? 'Anlegen' : 'Umbenennen'}
        cancelText="Abbrechen"
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="Name" extra="Mit „::“ entstehen Unterstapel, z. B. Medizin::Anatomie">
            <Input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)} onPressEnter={submitName} />
          </Form.Item>
        </Form>
      </Modal>

      {/* .apkg importieren */}
      <Modal title="Anki-Paket importieren" open={importModal === 'apkg'} onCancel={() => setImportModal(null)} onOk={doImportApkg} okText="Datei wählen…" cancelText="Abbrechen">
        <Form layout="vertical">
          <Form.Item label="Lernfortschritt übernehmen" extra="Bereits gelernte Karten behalten ihren Stand (näherungsweise auf den FSRS-Algorithmus umgerechnet). Aus: alle Karten starten als neu.">
            <Switch checked={keepProgress} onChange={setKeepProgress} />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">Unterstützt .apkg und .colpkg, auch das neue Anki-Format. Große Stapel mit vielen Bildern können einige Minuten dauern.</Typography.Text>
      </Modal>

      {/* Text/CSV importieren */}
      <Modal title="Text-/CSV-Datei importieren" open={importModal === 'text'} onCancel={() => setImportModal(null)} onOk={doImportText} okText="Datei wählen…" cancelText="Abbrechen" okButtonProps={{ disabled: textDeckId === null }}>
        <Form layout="vertical">
          <Form.Item label="In Stapel">
            <Select showSearch optionFilterProp="label" value={textDeckId ?? undefined} onChange={setTextDeckId} options={decks.map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item label="Erste Zeile ist eine Überschrift">
            <Switch checked={hasHeader} onChange={setHasHeader} />
          </Form.Item>
        </Form>
        <Alert type="info" showIcon message="Spalte 1 = Vorderseite, Spalte 2 = Rückseite, Spalte 3 = Tags (optional). Trennzeichen Tab, Semikolon oder Komma; Zeilen mit # am Anfang werden ignoriert." />
      </Modal>

      {/* Export */}
      <Modal title={`„${exportDeckId?.name ?? ''}“ exportieren`} open={!!exportDeckId} onCancel={() => setExportDeckId(null)} onOk={doExport} okText="Speichern unter…" cancelText="Abbrechen">
        <Form layout="vertical">
          <Form.Item label="Lernfortschritt mitexportieren" extra="Aus (empfohlen zum Teilen): alle Karten sind im Zielgerät neu. An: Fällige Wiederholungen bleiben erhalten.">
            <Switch checked={withProgress} onChange={setWithProgress} />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">Das Paket enthält Unterstapel und Medien und lässt sich in Anki importieren.</Typography.Text>
      </Modal>

      {/* Fortschritt */}
      <Modal title={progress?.title} open={!!progress} footer={null} closable={false} maskClosable={false} keyboard={false}>
        <Typography.Paragraph>{progress?.value?.phase ?? 'Wird gestartet…'}</Typography.Paragraph>
        <Progress percent={progress?.value && progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0} status="active" />
      </Modal>

      <NoteEditor open={editorOpen} noteId={null} defaultDeckId={null} decks={decks} onClose={() => setEditorOpen(false)} onSaved={load} />
    </div>
  )
}
