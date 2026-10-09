import { createRoot } from 'react-dom/client'
import { App as AntApp } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import './index.css'
import { App } from './App'
import { ThemeModeProvider } from './features/themeMode'

dayjs.locale('de')

// Dateien, die neben einer Drop-Zone landen, dürfen das Fenster nicht wegnavigieren
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <ThemeModeProvider>
    <AntApp style={{ height: '100%' }}>
      <App />
    </AntApp>
  </ThemeModeProvider>
)
