// Baut tests/electron/run.ts mit esbuild und führt es in Electron aus (echte Fenster, Sitzungen und Protokolle).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') // liefert den Pfad zur electron.exe

mkdirSync('out-test', { recursive: true })
await build({
  entryPoints: ['tests/electron/run.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'out-test/run.cjs',
  // Wie im echten Build: diese Pakete bleiben extern und werden zur Laufzeit aus node_modules geladen
  external: ['electron', 'pdfjs-dist', 'mammoth', 'yauzl', 'ts-fsrs'],
  tsconfig: 'tsconfig.json',
  logLevel: 'warning'
})

const result = spawnSync(electron, ['out-test/run.cjs'], { stdio: 'inherit', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' } })
process.exit(result.status ?? 1)
