import { useMemo } from 'react'
import { CARD } from '../../theme/colors'

/**
 * Zeigt Kartenhtml in einer isolierten Sandbox: Skripte aus importierten Stapeln laufen nicht,
 * Bilder/Audio kommen über das App-eigene Protokoll "unihub-media".
 */
export function CardFrame({ html, css, minHeight }: { html: string; css: string; minHeight?: number }) {
  const doc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:${CARD.bg};color:${CARD.text};font-family:"Segoe UI",system-ui,sans-serif}
body{font-size:20px}
.card{min-height:100vh;box-sizing:border-box;padding:24px;text-align:center}
img{max-width:100%;height:auto}
details.hint summary{cursor:pointer;color:${CARD.link}}
${css}
</style></head><body class="night_mode nightMode"><div class="card nightMode">${html}</div></body></html>`,
    [html, css]
  )
  return <iframe title="Karte" sandbox="" srcDoc={doc} style={{ width: '100%', flex: 1, minHeight: minHeight ?? 0, border: 0, display: 'block' }} />
}
