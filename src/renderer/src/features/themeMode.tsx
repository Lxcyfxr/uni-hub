import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { ConfigProvider, theme } from 'antd'
import deDE from 'antd/locale/de_DE'
import { PALETTES, applyPalette } from '../theme/colors'

export type ThemeMode = 'dark' | 'light'

const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: 'dark', setMode: () => {} })

export const useThemeMode = () => useContext(Ctx)

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // Der Hauptprozess stellt das gespeicherte Design vor dem Start ein; so beginnt die Oberfläche gleich richtig
  const [mode, setModeState] = useState<ThemeMode>(() => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))

  useEffect(() => {
    window.uni.ui.get('ui.theme').then((v) => {
      if (v === 'light' || v === 'dark') setModeState(v)
    })
  }, [])

  useLayoutEffect(() => {
    applyPalette(mode)
    document.body.style.background = PALETTES[mode].bg
  }, [mode])

  const setMode = (m: ThemeMode) => {
    setModeState(m)
    window.uni.ui.set('ui.theme', m)
  }

  const p = PALETTES[mode]

  return (
    <Ctx.Provider value={{ mode, setMode }}>
      <ConfigProvider
        locale={deDE}
        theme={{
          algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: p.primary,
            colorInfo: p.primary,
            colorSuccess: p.success,
            colorWarning: p.warning,
            colorError: p.danger,
            colorLink: p.primary,
            colorBgBase: p.surface,
            colorBgLayout: p.bg,
            colorTextBase: p.text,
            colorBorder: p.border
          },
          components: {
            Layout: { siderBg: p.sidebar, bodyBg: p.bg },
            Menu: { darkItemBg: p.sidebar, darkSubMenuItemBg: p.sidebar, darkItemSelectedBg: p.primary }
          }
        }}
      >
        {children}
      </ConfigProvider>
    </Ctx.Provider>
  )
}
