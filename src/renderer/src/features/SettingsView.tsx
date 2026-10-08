import { useEffect, useState } from 'react'
import { App, Button, Card, Divider, List, Popconfirm, Segmented, Select, Space, Switch, Typography } from 'antd'
import { BellOutlined, DisconnectOutlined, GithubOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { SessionId } from '@shared/ipc'
import { useThemeMode, type ThemeMode } from './themeMode'

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
        <Typography.Text type="secondary">
          Erinnerungen kommen nur, solange Uni-Hub läuft. Siehst du keine Benachrichtigung, prüfe in Windows „Nicht stören“ bzw. den Fokus-Assistenten.
        </Typography.Text>
      </Space>
    </Card>
  )
}

const TRAY_KEY = 'ui.trayOnClose'

function Background() {
  const { message } = App.useApp()
  const [onClose, setOnClose] = useState(true)
  const [auto, setAuto] = useState<{ supported: boolean; enabled: boolean; blocked: boolean } | null>(null)
  useEffect(() => {
    window.uni.ui.get(TRAY_KEY).then((v) => setOnClose(v !== '0'))
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

const AUTHOR = 'Lxcyfxr'
const GITHUB_URL = 'https://github.com/Lxcyfxr'

function About() {
  return (
    <Card title="Über Uni-Hub" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text>
          Made by <Typography.Text strong>{AUTHOR}</Typography.Text>
        </Typography.Text>
        <Typography.Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GithubOutlined /> github.com/{AUTHOR}
        </Typography.Link>
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
      <About />
    </div>
  )
}
