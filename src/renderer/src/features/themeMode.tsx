import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ConfigProvider, theme } from 'antd'
import deDE from 'antd/locale/de_DE'

export type ThemeMode = 'dark' | 'light'

const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: 'dark', setMode: () => {} })

export const useThemeMode = () => useContext(Ctx)

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    window.uni.ui.get('ui.theme').then((v) => {
      if (v === 'light' || v === 'dark') setModeState(v)
    })
  }, [])

  useEffect(() => {
    document.body.style.background = mode === 'dark' ? '#000' : '#fff'
  }, [mode])

  const setMode = (m: ThemeMode) => {
    setModeState(m)
    window.uni.ui.set('ui.theme', m)
  }

  return (
    <Ctx.Provider value={{ mode, setMode }}>
      <ConfigProvider
        locale={deDE}
        theme={{ algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: '#1677ff' } }}
      >
        {children}
      </ConfigProvider>
    </Ctx.Provider>
  )
}
