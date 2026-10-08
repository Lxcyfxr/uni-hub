import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { App as AntApp, Button, Layout, Menu, Result, Spin, Tag, theme } from 'antd'
import {
  AppstoreOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  MailOutlined,
  MenuOutlined,
  ScheduleOutlined,
  SettingOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  MedicineBoxOutlined,
  SolutionOutlined
} from '@ant-design/icons'
import type { ModuleId } from '@shared/ipc'
import { WebView } from './features/WebView'
import { HomeView } from './features/HomeView'
import { PHASE_LABEL, fmtClock, usePomodoro } from './features/pomodoro'

// Die Startseite ist sofort da; alle anderen Bereiche werden erst beim ersten Öffnen geladen.
// Das hält den Start schnell, weil schwere Komponenten (Tabellen, Kalender, Editoren) nicht vorab ausgewertet werden.
const TodoView = lazy(() => import('./features/TodoView').then((m) => ({ default: m.TodoView })))
const CalendarView = lazy(() => import('./features/CalendarView').then((m) => ({ default: m.CalendarView })))
const DocsView = lazy(() => import('./features/DocsView').then((m) => ({ default: m.DocsView })))
const AnkiView = lazy(() => import('./features/AnkiView').then((m) => ({ default: m.AnkiView })))
const StudyView = lazy(() => import('./features/StudyView').then((m) => ({ default: m.StudyView })))
const SettingsView = lazy(() => import('./features/SettingsView').then((m) => ({ default: m.SettingsView })))

const NAV: { key: ModuleId; label: string; icon: ReactNode }[] = [
  { key: 'home', label: 'Übersicht', icon: <AppstoreOutlined /> },
  { key: 'todo', label: 'To-Do', icon: <CheckSquareOutlined /> },
  { key: 'study', label: 'Lernplaner', icon: <ScheduleOutlined /> },
  { key: 'calendar', label: 'Kalender', icon: <CalendarOutlined /> },
  { key: 'docs', label: 'Doc-Hub', icon: <FileTextOutlined /> },
  { key: 'anki', label: 'Anki', icon: <BookOutlined /> },
  { key: 'mail', label: 'Exchange', icon: <MailOutlined /> },
  { key: 'lehre', label: 'lehre.charite', icon: <GlobalOutlined /> },
  { key: 'amboss', label: 'AMBOSS', icon: <MedicineBoxOutlined /> },
  { key: 'moses', label: 'MOSES', icon: <SolutionOutlined /> }
]

/** Laufender Timer in der Sidebar; eigene Komponente, damit nur sie sekündlich neu rendert. */
function PomodoroBadge({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  const { status, phase, remainingMs } = usePomodoro()
  if (status === 'idle') return null
  return (
    <div style={{ padding: compact ? '12px 4px' : 16, textAlign: 'center' }}>
      <Tag
        color={phase === 'work' ? 'red' : phase === 'short' ? 'green' : 'blue'}
        icon={<ClockCircleOutlined />}
        style={{ cursor: 'pointer', margin: 0, fontVariantNumeric: 'tabular-nums' }}
        onClick={onClick}
        title={`${PHASE_LABEL[phase]}${status === 'paused' ? ' (pausiert)' : ''} – zum Lernplaner`}
      >
        {fmtClock(remainingMs)}
      </Tag>
    </div>
  )
}

export function App() {
  const [mod, setMod] = useState<ModuleId>('home')
  const [collapsed, setCollapsed] = useState(false)
  const { token } = theme.useToken()
  useEffect(() => {
    usePomodoro.getState().load()
  }, [])

  // Benachrichtigungen (z. B. importiertes Anki-Paket) können zu einem Modul springen lassen
  useEffect(() => window.uni.app.onNavigate(setMod), [])

  const { message } = AntApp.useApp()
  useEffect(
    () => window.uni.docs.onImported((p) => message.success(`„${p.filename}“ im Doc-Hub gespeichert (Ordner ${p.folder})`)),
    [message]
  )

  useEffect(() => {
    window.uni.ui.get('ui.navCollapsed').then((v) => setCollapsed(v === '1'))
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    window.uni.ui.set('ui.navCollapsed', next ? '1' : '0')
  }

  return (
    <Layout style={{ height: '100%' }}>
      <Layout.Sider
        width={220}
        collapsedWidth={64}
        collapsed={collapsed}
        trigger={null}
        theme="dark"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 56, padding: collapsed ? 0 : '0 16px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Menü ausklappen' : 'Menü einklappen'}
            style={{ color: 'rgba(255,255,255,0.85)' }}
          />
          {!collapsed && <span style={{ fontSize: 18, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>Uni-Hub</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Menu theme="dark" mode="inline" selectedKeys={[mod]} items={NAV} onClick={(e) => setMod(e.key as ModuleId)} />
            <PomodoroBadge compact={collapsed} onClick={() => setMod('study')} />
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[mod]}
            items={[{ key: 'settings', label: 'Einstellungen', icon: <SettingOutlined /> }]}
            onClick={(e) => setMod(e.key as ModuleId)}
          />
        </div>
      </Layout.Sider>
      <Layout.Content style={{ minWidth: 0, overflow: 'auto' }}>
        <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '20vh auto' }} />}>
        {mod === 'todo' ? (
          <TodoView />
        ) : mod === 'home' ? (
          <HomeView go={setMod} />
        ) : mod === 'study' ? (
          <StudyView />
        ) : mod === 'docs' ? (
          <DocsView />
        ) : mod === 'anki' ? (
          <AnkiView />
        ) : mod === 'calendar' ? (
          <CalendarView />
        ) : mod === 'settings' ? (
          <SettingsView />
        ) : mod === 'mail' || mod === 'lehre' || mod === 'amboss' || mod === 'moses' ? (
          <WebView id={mod} key={mod} />
        ) : (
          <Result status="info" title={NAV.find((n) => n.key === mod)!.label} subTitle="Folgt in einer späteren Phase." />
        )}
        </Suspense>
      </Layout.Content>
    </Layout>
  )
}
