import { useEffect, useState } from 'react'
import { App, Button, Card, Checkbox, Divider, Input, List, Modal, Popconfirm, Segmented, Select, Space, Switch, Typography } from 'antd'
import { BellOutlined, DatabaseOutlined, DeleteOutlined, DisconnectOutlined, FolderOpenOutlined, FileTextOutlined, GithubOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { AppInfo, SessionId } from '@shared/ipc'
import ownLicense from '../../../../LICENSE?raw'
import { useThemeMode, type ThemeMode } from './themeMode'
import { NEUTRAL_FILL } from '../theme/colors'

const SERVICES: { id: SessionId; name: string; hint: string }[] = [
  { id: 'mail', name: 'Exchange', hint: 'Outlook Web (oow.charite.de)' },
  { id: 'lehre', name: 'lehre.charite', hint: 'lehre.charite.de' },
  { id: 'amboss', name: 'AMBOSS', hint: 'next.amboss.com' },
  { id: 'moses', name: 'MOSES', hint: 'moses.charite.de' }
]

const REMINDER_KEY = 'ui.calReminder'
const LEADS = [
  { value: 0, label: 'Zum Beginn' },
  { value: 5, label: '5 Minuten vorher' },
  { value: 10, label: '10 Minuten vorher' },
  { value: 15, label: '15 Minuten vorher' },
  { value: 30, label: '30 Minuten vorher' },
  { value: 60, label: '1 Stunde vorher' }
]

const DEADLINE_KEY = 'ui.deadlines'
const DEADLINE_LEADS = [
  { value: 0, label: 'Nur heute und überfällig' },
  { value: 1, label: 'Ab 1 Tag vorher' },
  { value: 2, label: 'Ab 2 Tagen vorher' },
  { value: 3, label: 'Ab 3 Tagen vorher' },
  { value: 7, label: 'Ab 1 Woche vorher' }
]
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00 Uhr` }))
const BREAK_KEY = 'ui.breakReminder'
const BREAK_INTERVALS = [
  { value: 30, label: 'Nach 30 Minuten' },
  { value: 45, label: 'Nach 45 Minuten' },
  { value: 60, label: 'Nach 1 Stunde' },
  { value: 90, label: 'Nach 90 Minuten' },
  { value: 120, label: 'Nach 2 Stunden' }
]

/** Gespeicherte Einstellung (JSON im Schlüssel-Wert-Speicher) mit Standardwerten laden und ändern. */
function useStoredSetting<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const { message } = App.useApp()
  const [value, setValue] = useState<T>(defaults)
  useEffect(() => {
    window.uni.ui.get(key).then((raw) => {
      try {
        setValue({ ...defaults, ...(JSON.parse(raw ?? '{}') as Partial<T>) })
      } catch {
        /* Standardwerte */
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const update = (patch: Partial<T>) => {
    const next = { ...value, ...patch }
    setValue(next)
    window.uni.ui.set(key, JSON.stringify(next)).catch((e) => message.error(String((e as Error).message ?? e)))
  }
  return [value, update]
}

function DeadlineAndBreakReminders() {
  const [dl, setDl] = useStoredSetting(DEADLINE_KEY, { enabled: true, lead: 1, hour: 8 })
  const [br, setBr] = useStoredSetting(BREAK_KEY, { enabled: true, interval: 90 })
  return (
    <>
      <Divider style={{ margin: 0 }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Text strong>Fristen</Typography.Text>
          <div>
            <Typography.Text type="secondary">Einmal täglich eine Meldung zu Aufgaben mit Fälligkeitsdatum, zum Beispiel Abgaben und Anmeldefristen.</Typography.Text>
          </div>
        </div>
        <Switch checked={dl.enabled} onChange={(v) => setDl({ enabled: v })} />
      </Space>
      <Space wrap>
        <Select style={{ width: 220 }} disabled={!dl.enabled} value={dl.lead} options={DEADLINE_LEADS} onChange={(v) => setDl({ lead: v })} />
        <Select style={{ width: 130 }} disabled={!dl.enabled} value={dl.hour} options={HOURS} onChange={(v) => setDl({ hour: v })} />
      </Space>
      <Divider style={{ margin: 0 }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Text strong>Lernpause</Typography.Text>
          <div>
            <Typography.Text type="secondary">Erinnert dich an eine Pause, wenn du länger am Stück in Uni-Hub arbeitest. Eine Unterbrechung von 5 Minuten setzt den Zähler zurück.</Typography.Text>
          </div>
        </div>
        <Switch checked={br.enabled} onChange={(v) => setBr({ enabled: v })} />
      </Space>
      <Select style={{ width: 220 }} disabled={!br.enabled} value={br.interval} options={BREAK_INTERVALS} onChange={(v) => setBr({ interval: v })} />
    </>
  )
}

function Reminders() {
  const { message } = App.useApp()
  const [enabled, setEnabled] = useState(true)
  const [lead, setLead] = useState(10)

  useEffect(() => {
    window.uni.ui.get(REMINDER_KEY).then((raw) => {
      try {
        const v = JSON.parse(raw ?? '{}') as { enabled?: boolean; lead?: number }
        setEnabled(v.enabled !== false)
        if (LEADS.some((l) => l.value === v.lead)) setLead(v.lead as number)
      } catch {
        /* Standardwerte */
      }
    })
  }, [])

  const save = (next: { enabled: boolean; lead: number }) => {
    setEnabled(next.enabled)
    setLead(next.lead)
    window.uni.ui.set(REMINDER_KEY, JSON.stringify(next)).catch((e) => message.error(String((e as Error).message ?? e)))
  }

  return (
    <Card title="Benachrichtigungen" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>Terminerinnerungen</Typography.Text>
            <div>
              <Typography.Text type="secondary">Windows-Benachrichtigung vor Terminen mit Uhrzeit (Kalender-Abos und eigene Termine).</Typography.Text>
            </div>
          </div>
          <Switch checked={enabled} onChange={(v) => save({ enabled: v, lead })} />
        </Space>
        <Space wrap>
          <Select style={{ width: 200 }} disabled={!enabled} value={lead} options={LEADS} onChange={(v) => save({ enabled, lead: v })} />
          <Button
            icon={<BellOutlined />}
            onClick={() =>
              window.uni.app.testNotification().then(
                () => message.info('Testbenachrichtigung gesendet'),
                (e) => message.error(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
              )
            }
          >
            Test senden
          </Button>
        </Space>
        <DeadlineAndBreakReminders />
        <Typography.Text type="secondary">
          Erinnerungen kommen nur, solange Uni-Hub läuft. Siehst du keine Benachrichtigung, prüfe in Windows „Nicht stören“ bzw. den Fokus-Assistenten.
        </Typography.Text>
      </Space>
    </Card>
  )
}

const ISSUE_PLACEHOLDER = 'Was ist passiert? Was hast du erwartet? Wie lässt sich das Problem nachstellen?'

function ReportIssue() {
  const { message } = App.useApp()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [withInfo, setWithInfo] = useState(true)
  const [info, setInfo] = useState('')

  useEffect(() => {
    window.uni.app.diagnostics().then(setInfo).catch(() => {})
  }, [])

  const body = [text.trim(), withInfo && info ? `---\n${info}` : ''].filter(Boolean).join('\n\n')

  const open = () =>
    window.uni.app.reportIssue(title, body).then(
      () => message.info('GitHub wurde im Browser geöffnet. Dort kannst du die Meldung prüfen und absenden.'),
      (e) => message.error(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )

  return (
    <Card title="Problem melden" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          Beschreibe kurz, was nicht funktioniert oder was du dir wünschst. Ein Klick öffnet GitHub im Browser mit deinem Text als neuem Issue.
          Abgeschickt wird erst dort, mit einem kostenlosen GitHub-Konto. Issues sind öffentlich sichtbar: schreibe daher keine persönlichen Daten,
          Passwörter oder Inhalte aus deinen Terminen und Dokumenten hinein.
        </Typography.Text>
        <Input placeholder="Titel" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input.TextArea rows={5} maxLength={4000} placeholder={ISSUE_PLACEHOLDER} value={text} onChange={(e) => setText(e.target.value)} />
        <Checkbox checked={withInfo} onChange={(e) => setWithInfo(e.target.checked)}>
          Technische Angaben anhängen (Versionen von Uni-Hub und Windows, keine persönlichen Daten)
        </Checkbox>
        {withInfo && info && (
          <pre style={{ margin: 0, padding: 8, fontSize: 12, borderRadius: 6, background: NEUTRAL_FILL, whiteSpace: 'pre-wrap' }}>{info}</pre>
        )}
        <Button type="primary" icon={<GithubOutlined />} disabled={!title.trim()} onClick={open}>
          Auf GitHub melden
        </Button>
      </Space>
    </Card>
  )
}

const TRAY_KEY = 'ui.trayOnClose'
const POPUP_KEY = 'ui.trayPopup'

function Background() {
  const { message } = App.useApp()
  const [onClose, setOnClose] = useState(true)
  const [popup, setPopup] = useState(true)
  const [auto, setAuto] = useState<{ supported: boolean; enabled: boolean; blocked: boolean } | null>(null)
  useEffect(() => {
    window.uni.ui.get(TRAY_KEY).then((v) => setOnClose(v !== '0'))
    window.uni.ui.get(POPUP_KEY).then((v) => setPopup(v !== '0'))
    window.uni.app.getAutostart().then(setAuto).catch(() => {})
  }, [])

  const changeAutostart = async (enabled: boolean) => {
    try {
      await window.uni.app.setAutostart(enabled)
      setAuto(await window.uni.app.getAutostart())
    } catch (e) {
      message.error(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <Card title="Hintergrund" style={{ marginBottom: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <div>
          <Typography.Text strong>Beim Schließen im Infobereich weiterlaufen</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              Das Fenster verschwindet, Uni-Hub läuft weiter: Terminerinnerungen und der Pomodoro-Timer bleiben aktiv. Über das Symbol im Infobereich
              (neben der Uhr) öffnest oder beendest du die App. Ausgeschaltet beendet das Schließen des Fensters die App.
            </Typography.Text>
          </div>
        </div>
        <Switch
          checked={onClose}
          onChange={(v) => {
            setOnClose(v)
            window.uni.ui.set(TRAY_KEY, v ? '1' : '0').catch(() => {})
          }}
        />
      </Space>
      <Divider style={{ margin: '16px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <div>
          <Typography.Text strong>Heutige Termine am Symbol anzeigen</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              Ein Klick auf das Symbol im Infobereich zeigt die Termine und fälligen Aufgaben von heute. Ein Doppelklick öffnet das Fenster. Ausgeschaltet öffnet
              schon ein Klick das Fenster.
            </Typography.Text>
          </div>
        </div>
        <Switch
          checked={popup}
          onChange={(v) => {
            setPopup(v)
            window.uni.ui.set(POPUP_KEY, v ? '1' : '0').catch(() => {})
          }}
        />
      </Space>
      <Divider style={{ margin: '16px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <div>
          <Typography.Text strong>Mit Windows starten</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              Uni-Hub startet beim Anmelden in Windows im Hintergrund (nur Symbol im Infobereich, kein Fenster), damit Erinnerungen und Timer ohne manuellen Start
              funktionieren.
            </Typography.Text>
          </div>
          {auto && !auto.supported && (
            <Typography.Text type="warning" style={{ display: 'block', marginTop: 4 }}>
              Nur in der installierten App verfügbar, nicht im Entwicklungsmodus.
            </Typography.Text>
          )}
          {auto?.blocked && (
            <Typography.Text type="warning" style={{ display: 'block', marginTop: 4 }}>
              In Windows (Task-Manager → Autostart) ist Uni-Hub deaktiviert. Aktiviere es dort, damit der Start funktioniert.
            </Typography.Text>
          )}
        </div>
        <Switch checked={auto?.enabled ?? false} disabled={!auto?.supported} onChange={changeAutostart} />
      </Space>
    </Card>
  )
}

const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function Maintenance() {
  const { message } = App.useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => window.uni.app.getInfo().then(setInfo).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  const open = (kind: 'data' | 'logs' | 'backups') =>
    window.uni.app.openFolder(kind).catch((e) => message.error(cleanErr(e)))

  const backup = async () => {
    setBusy(true)
    try {
      await window.uni.app.backupNow()
      message.success('Sicherung angelegt')
      load()
    } catch (e) {
      message.error(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Daten & Wartung" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          Version {info?.version ?? '…'}
          {info && !info.packaged && ' (Entwicklung)'}
        </Typography.Text>
        <Typography.Text type="secondary">
          Aufgaben, Termine, Lernplan, Anki-Karten und Dokumente liegen lokal in einer Datenbank. Uni-Hub sichert sie beim Start einmal täglich
          und behält die letzten 7 Sicherungen
          {info?.lastBackup ? ` (zuletzt: ${info.lastBackup.split('-').reverse().join('.')})` : ''}. Zum Wiederherstellen Uni-Hub beenden und die Sicherung als{' '}
          <code>unihub.db</code> in den Datenordner kopieren.
        </Typography.Text>
        <Space wrap>
          <Button icon={<DatabaseOutlined />} loading={busy} onClick={backup}>
            Jetzt sichern
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => open('backups')}>
            Sicherungen
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => open('data')}>
            Datenordner
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => open('logs')}>
            Protokoll
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => window.uni.app.wipeData().catch((e) => message.error(cleanErr(e)))}
          >
            Alle Daten löschen …
          </Button>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Bei Problemen hilft das Protokoll (<code>main.log</code>) – es enthält keine Passwörter.
        </Typography.Text>
      </Space>
    </Card>
  )
}

const AUTHOR = 'Lxcyfxr'
const GITHUB_URL = 'https://github.com/Lxcyfxr'

const SEPARATOR = `

${'—'.repeat(40)}

`

/** Lizenztexte der gebündelten Pakete – erst beim Öffnen nachgeladen, damit sie den Start nicht bremsen */
function LicensesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [thirdParty, setThirdParty] = useState<string | null>(null)
  useEffect(() => {
    if (open && thirdParty === null) import('../../../../THIRD-PARTY-LICENSES.md?raw').then((m) => setThirdParty(m.default))
  }, [open, thirdParty])
  return (
    <Modal title="Lizenzen" open={open} onCancel={onClose} footer={null} width={760}>
      <pre style={{ maxHeight: '65vh', overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
        {[
          ownLicense,
          'Uni-Hub nutzt Open-Source-Software (React, Ant Design, Electron/Chromium u. a.). Electron und Chromium bringen ihre Lizenzen im Installationsordner mit (LICENSE.electron.txt, LICENSES.chromium.html).',
          thirdParty ?? 'Lade …'
        ].join(SEPARATOR)}
      </pre>
    </Modal>
  )
}

function About() {
  const [licensesOpen, setLicensesOpen] = useState(false)
  return (
    <Card title="Über Uni-Hub" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text>
          Made by <Typography.Text strong>{AUTHOR}</Typography.Text>
        </Typography.Text>
        <Typography.Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GithubOutlined /> github.com/{AUTHOR}
        </Typography.Link>
        <Space>
          <Typography.Text type="secondary">Lizenz: MIT</Typography.Text>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => setLicensesOpen(true)}>
            Open-Source-Lizenzen
          </Button>
        </Space>
        <LicensesModal open={licensesOpen} onClose={() => setLicensesOpen(false)} />
        <div>
          <Typography.Text strong style={{ fontSize: 12 }}>
            HAFTUNGSAUSSCHLUSS
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            Uni-Hub ist ein privates, inoffizielles Projekt. Es steht in keiner Verbindung zur Charité – Universitätsmedizin Berlin, zu Moodle,
            Microsoft, AMBOSS, Anki oder anderen genannten Diensten; alle Namen und Marken gehören ihren jeweiligen Inhabern. Die Software wird
            „wie besehen“ und ohne jegliche Gewähr bereitgestellt. {AUTHOR} übernimmt keine Verantwortung und keine Haftung für Schäden,
            Datenverluste, verpasste Termine, Fristen oder Erinnerungen, fehlerhafte oder unvollständige Inhalte, gesperrte Konten oder Verstöße
            gegen Nutzungsbedingungen von Drittdiensten. Die Nutzung erfolgt auf eigene Gefahr. Bitte sichere wichtige Daten (z. B. Anki-Stapel
            per Export) selbst. Zugangsdaten und Sitzungen werden ausschließlich lokal auf deinem Gerät gespeichert.
          </Typography.Paragraph>
        </div>
      </Space>
    </Card>
  )
}

export function SettingsView() {
  const [busy, setBusy] = useState<SessionId | null>(null)
  const { mode, setMode } = useThemeMode()
  const { message } = App.useApp()

  const reset = async (id: SessionId, name: string) => {
    setBusy(id)
    try {
      await window.uni.sessions.reset(id)
      message.success(`${name}: Sitzung widerrufen`)
    } catch (e) {
      message.error(`${name}: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Typography.Title level={3}>Einstellungen</Typography.Title>
      <Card title="Darstellung" style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as ThemeMode)}
          options={[
            { value: 'light', label: 'Hell', icon: <SunOutlined /> },
            { value: 'dark', label: 'Dunkel', icon: <MoonOutlined /> }
          ]}
        />
      </Card>
      <Reminders />
      <Background />
      <ReportIssue />
      <Card title="Sitzungen widerrufen">
        <Typography.Paragraph type="secondary">
          Löscht Cookies, gespeicherte Anmeldedaten und Cache des Dienstes. Hilfreich, wenn eine Anmeldung hängen bleibt. Danach
          musst du dich beim Dienst neu anmelden.
        </Typography.Paragraph>
        <List
          dataSource={SERVICES}
          renderItem={(s) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="reset"
                  title={`${s.name}-Sitzung widerrufen?`}
                  okText="Widerrufen"
                  cancelText="Abbrechen"
                  onConfirm={() => reset(s.id, s.name)}
                >
                  <Button danger icon={<DisconnectOutlined />} loading={busy === s.id}>
                    Widerrufen
                  </Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta title={s.name} description={s.hint} />
            </List.Item>
          )}
        />
      </Card>
      <div style={{ height: 16 }} />
      <Maintenance />
      <About />
    </div>
  )
}
