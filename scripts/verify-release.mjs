// Prüft den fertigen Build (release/win-unpacked) auf die Sicherheitsvorgaben: Electron-Fuses, Paketinhalt, CSP.
// Aufruf nach "npm run pack" bzw. "npm run dist":  npm run verify:release
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses'

const require = createRequire(import.meta.url)
// Im Programmcode stehen die Fuses als Zeichen '0' (aus) und '1' (an)
const FuseState = { DISABLE: 48, ENABLE: 49 }
const asar = require('@electron/asar')

const exe = 'release/win-unpacked/Uni-Hub.exe'
const archive = 'release/win-unpacked/resources/app.asar'
if (!existsSync(exe) || !existsSync(archive)) {
  console.error('Kein Build gefunden – zuerst "npm run pack" oder "npm run dist" ausführen.')
  process.exit(2)
}

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${name}${detail ? ` – ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

// 1) Electron-Fuses
const wire = await getCurrentFuseWire(exe)
const expected = [
  ['RunAsNode', FuseV1Options.RunAsNode, FuseState.DISABLE],
  ['EnableNodeOptionsEnvironmentVariable', FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  ['EnableNodeCliInspectArguments', FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  ['EnableEmbeddedAsarIntegrityValidation', FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  ['OnlyLoadAppFromAsar', FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  ['EnableCookieEncryption', FuseV1Options.EnableCookieEncryption, FuseState.ENABLE]
]
for (const [name, key, state] of expected) check(`Fuse ${name} = ${state === FuseState.ENABLE ? 'an' : 'aus'}`, wire[key] === state)

// 2) Paketinhalt
const files = asar.listPackage(archive).map((f) => f.replace(/\\/g, '/'))
check('App-Code vorhanden (Main, Preload, Oberfläche)', ['/out/main/index.js', '/out/preload/index.js', '/out/renderer/index.html'].every((f) => files.includes(f)))
check('Keine Quellkarten (.map) im Paket', !files.some((f) => f.endsWith('.map')))
check('Keine Test-, Skript- oder Konfigurationsdateien im Paket', !files.some((f) => /^\/(tests|scripts|src|\.github)\//.test(f) || /\/(vitest|electron\.vite)\.config/.test(f)))
check('Keine .env-Dateien im Paket', !files.some((f) => /(^|\/)\.env/.test(f)))
check('Keine nativen Zusatzmodule (@napi-rs) im Paket', !files.some((f) => f.includes('/node_modules/@napi-rs/')))

// 3) Sicherheitsrichtlinie der gebauten Oberfläche (im Speicher gelesen, nichts wird entpackt)
const html = asar.extractFile(archive, join('out', 'renderer', 'index.html')).toString('utf8')
const csp = (html.match(/Content-Security-Policy"\s+content="([^"]+)"/) ?? [])[1] ?? ''
check('CSP im gebauten HTML vorhanden', csp.length > 0)
check("CSP: default-src 'self'", /default-src 'self'/.test(csp))
check("CSP: kein 'unsafe-eval'", !csp.includes('unsafe-eval'))
check("CSP: object-src, base-uri, form-action auf 'none'", ["object-src 'none'", "base-uri 'none'", "form-action 'none'"].every((d) => csp.includes(d)))
check('CSP: keine Fremdquellen (http:, https:, *)', !/(https?:|\s\*)/.test(csp))

console.log(failures.length ? `\n${failures.length} Prüfung(en) fehlgeschlagen` : '\nBuild erfüllt alle Sicherheitsvorgaben')
process.exit(failures.length ? 1 : 0)
