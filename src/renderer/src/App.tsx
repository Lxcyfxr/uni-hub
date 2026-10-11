import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { App as AntApp, Button, Layout, Menu, Result, Spin, theme } from 'antd'
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
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StepForwardOutlined,
  MedicineBoxOutlined,
  SolutionOutlined
} from '@ant-design/icons'
import type { ModuleId } from '@shared/ipc'
import { WebView } from './features/WebView'
import { HomeView } from './features/HomeView'
import { PHASE_LABEL, fmtClock, phaseMs, usePomodoro } from './features/pomodoro'
import { SearchPalette } from './features/SearchPalette'
import { PHASE, ON_DARK } from './theme/colors'

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

/** Dauerhafter Timer über den Einstellungen; eigene Komponente, damit nur sie sekündlich neu rendert. */
function PomodoroDock({ compact, onOpen }: { compact: boolean; onOpen: () => void }) {
  const p = usePomodoro()
  const color = PHASE[p.phase]
  const left = p.status === 'idle' ? phaseMs(p.settings, p.phase) : p.remainingMs
  const light = { color: ON_DARK.text }
  const title = `${PHASE_LABEL[p.phase]}${p.status === 'paused' ? ' (pausiert)' : ''} – zum Lernplaner`
  const playPause =
    p.status === 'running' ? (
      <Button type="text" size="small" icon={<PauseCircleOutlined />} onClick={p.pause} aria-label="Pause" title="Pause" style={light} />
    ) : (
      <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={p.start} aria-label="Start" title="Start" style={light} />
    )
  return (
    <div style={{ padding: compact ? '8px 0' : '8px 16px', textAlign: 'center', borderTop: `1px solid ${ON_DARK.border}`, borderBottom: `1px solid ${ON_DARK.border}` }}>
      <div
        onClick={onOpen}
        title={title}
        style={{ cursor: 'pointer', color: p.status === 'idle' ? ON_DARK.textSecondary : color, fontWeight: 600, fontSize: compact ? 12 : 20, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}
      >
        {fmtClock(left)}
      </div>
      {!compact && <div style={{ fontSize: 11, color: ON_DARK.textMuted }}>{PHASE_LABEL[p.phase]}{p.status === 'paused' ? ' · pausiert' : ''}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 2, flexDirection: compact ? 'column' : 'row', alignItems: 'center' }}>
        {playPause}
        {!compact && (
          <>
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={p.reset} disabled={p.status === 'idle'} aria-label="Zurücksetzen" title="Zurücksetzen" style={p.status === 'idle' ? undefined : light} />
            <Button type="text" size="small" icon={<StepForwardOutlined />} onClick={p.skip} aria-label="Phase überspringen" title="Phase überspringen" style={light} />
          </>
        )}
      </div>
    </div>
  )
}

export function App() {
  const [mod, setMod] = useState<ModuleId>('home')
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { token } = theme.useToken()
  useEffect(() => {
    usePomodoro.getState().load()
  }, [])

  // Strg+K öffnet bzw. schließt die globale Suche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
            style={{ color: ON_DARK.text }}
          />
          {!collapsed && <span style={{ fontSize: 18, fontWeight: 600, color: ON_DARK.solid, whiteSpace: 'nowrap' }}>Uni-Hub</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ padding: collapsed ? '4px 12px 8px' : '4px 16px 8px' }}>
              <Button
                block
                icon={<SearchOutlined />}
                onClick={() => setSearchOpen(true)}
                aria-label="Suchen"
                title="Suchen (Strg+K)"
                style={{ background: ON_DARK.fill, borderColor: 'transparent', color: ON_DARK.textSecondary, justifyContent: collapsed ? 'center' : 'flex-start' }}
              >
                {!collapsed && (
                  <span style={{ display: 'flex', flex: 1, justifyContent: 'space-between' }}>
                    <span>Suchen</span>
                    <span style={{ opacity: 0.6, fontSize: 11 }}>Strg+K</span>
                  </span>
                )}
              </Button>
            </div>
            <Menu theme="dark" mode="inline" selectedKeys={[mod]} items={NAV} onClick={(e) => setMod(e.key as ModuleId)} />
          </div>
          <PomodoroDock compact={collapsed} onOpen={() => setMod('study')} />
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[mod]}
            items={[{ key: 'settings', label: 'Einstellungen', icon: <SettingOutlined /> }]}
            onClick={(e) => setMod(e.key as ModuleId)}
          />
        </div>
      </Layout.Sider>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} go={setMod} />
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
