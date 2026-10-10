import { useEffect, useRef } from 'react'
import { Button, Space, theme } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons'
import type { WebModuleId } from '@shared/ipc'
import { useOverlay } from './searchStore'

const TOOLBAR_H = 44

export function WebView({ id }: { id: WebModuleId }) {
  const host = useRef<HTMLDivElement>(null)
  const { token } = theme.useToken()
  // Die native Ansicht liegt über dem DOM und weicht der Suchleiste
  const overlay = useOverlay((s) => s.open)

  useEffect(() => {
    if (overlay) return
    const el = host.current!
    const sync = () => {
      const r = el.getBoundingClientRect()
      window.uni.web.show(id, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.uni.web.hide()
    }
  }, [id, overlay])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space
        style={{ height: TOOLBAR_H, padding: '0 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}
      >
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => window.uni.web.nav('back')} />
        <Button type="text" icon={<ArrowRightOutlined />} onClick={() => window.uni.web.nav('forward')} />
        <Button type="text" icon={<ReloadOutlined />} onClick={() => window.uni.web.nav('reload')} />
      </Space>
      <div ref={host} style={{ flex: 1 }} />
    </div>
  )
}
