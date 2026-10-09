// Größenbudget für den Build: schlägt fehl, wenn das Bundle unbemerkt wächst (Aufruf nach "npm run build").
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const kb = (bytes) => Math.round(bytes / 1024)
const assets = 'out/renderer/assets'

if (!existsSync(assets) || !existsSync('out/main/index.js')) {
  console.error('Kein Build gefunden – zuerst "npm run build" ausführen.')
  process.exit(2)
}

const files = readdirSync(assets).map((f) => ({ name: f, size: statSync(join(assets, f)).size }))
const js = files.filter((f) => f.name.endsWith('.js'))
const largest = js.reduce((a, b) => (b.size > a.size ? b : a))

// Grenzen in KB: etwa 15 % über dem Stand nach der Aufteilung in nachgeladene Bereiche
const checks = [
  { name: `Größter Renderer-Block (${largest.name})`, value: kb(largest.size), limit: 2300 },
  { name: 'Renderer gesamt (JS + CSS)', value: kb(files.reduce((s, f) => s + f.size, 0)), limit: 3700 },
  { name: 'Hauptprozess (out/main/index.js)', value: kb(statSync('out/main/index.js').size), limit: 750 }
]

let failed = false
for (const c of checks) {
  const ok = c.value <= c.limit
  if (!ok) failed = true
  console.log(`${ok ? 'OK  ' : 'ZU GROSS'}  ${c.name}: ${c.value} KB (Grenze ${c.limit} KB)`)
}
process.exit(failed ? 1 : 0)
