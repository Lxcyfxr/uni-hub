import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Statische Wächter: Sicherheitsregeln, die sich im Quelltext prüfen lassen und bei jeder Änderung gelten sollen. */

function sources(dir: string): { file: string; text: string }[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => {
      const file = join(e.parentPath, e.name).replace(/\\/g, '/')
      return { file, text: readFileSync(file, 'utf8') }
    })
}

const main = sources('src/main')
const renderer = sources('src/renderer/src')
const all = [...main, ...renderer, ...sources('src/preload'), ...sources('src/shared')]

describe('Quelltext-Regeln', () => {
  it('shell.openExternal wird nur im geprüften Link-Modul verwendet', () => {
    const users = main.filter((s) => /shell\.openExternal\(/.test(s.text)).map((s) => s.file)
    expect(users).toEqual(['src/main/links.ts'])
  })

  it('keine Befehlsausführung im Programm (child_process, exec, spawn)', () => {
    const hits = all.filter((s) => /child_process|\bexecSync\(|\bspawn(Sync)?\(|\bexecFile(Sync)?\(/.test(s.text)).map((s) => s.file)
    expect(hits).toEqual([])
  })

  it('keine gefährlichen HTML- oder Code-Muster in der Oberfläche', () => {
    const pattern = /dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write\(|\beval\(|new Function\(/
    expect(renderer.filter((s) => pattern.test(s.text)).map((s) => s.file)).toEqual([])
  })

  it('keine abgeschwächten Sicherheitseinstellungen', () => {
    const pattern =
      /webSecurity:\s*false|nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|allowRunningInsecureContent:\s*true|webviewTag:\s*true|enableRemoteModule|experimentalFeatures:\s*true|ignore-certificate-errors|disable-web-security|no-sandbox|remote-debugging-port|certificate-error|\bsendSync\(/
    expect(all.filter((s) => pattern.test(s.text)).map((s) => s.file)).toEqual([])
  })

  it('SQL nur mit Platzhaltern: keine Textbausteine aus Variablen in prepare()/exec()', () => {
    // erlaubt sind IN-Listen aus Platzhaltern ("?,?,?"), die feste Schema-Version und die festen Bausteine in sched.ts (PICK)
    const offenders: string[] = []
    for (const s of main) {
      for (const m of s.text.matchAll(/\.(prepare|exec)\(\s*`([^`]*)`/g)) {
        for (const expr of m[2].matchAll(/\$\{([^}]*)\}/g)) {
          const e = expr[1].trim()
          const harmless = /^(marks|placeholders|cond|order|v \+ 1|chunk\.map\(\(\) => '\?'\)\.join\(','\)|ids\.map\(\(\) => '\?'\)\.join\(','\)|from|where\.length[^}]*|where\.join[^}]*)$/.test(e) || /^\w+\.map\(\(\) => '\?'\)\.join\(','\)$/.test(e)
          if (!harmless) offenders.push(`${s.file}: \${${e}}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('Preload und Schnittstellenkanäle', () => {
  const preload = readFileSync('src/preload/index.ts', 'utf8')
  const mainIndex = readFileSync('src/main/index.ts', 'utf8')

  it('legt nur das schmale Objekt "uni" in die Seite, nie ipcRenderer oder require', () => {
    const exposed = [...preload.matchAll(/exposeInMainWorld\(\s*'([^']+)'\s*,\s*([^)]+)\)/g)]
    expect(exposed.map((m) => m[1])).toEqual(['uni'])
    expect(exposed[0][2].trim()).toBe('api')
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/)
  })

  it('verwendet ausschließlich feste Kanalnamen (keine frei wählbaren Kanäle)', () => {
    const calls = [...preload.matchAll(/(?:invoke|ipcRenderer\.on|removeListener)\(\s*([^,)]+)/g)].map((m) => m[1].trim())
    expect(calls.length).toBeGreaterThan(50)
    expect(calls.filter((c) => !/^'[a-zA-Z]+:[a-zA-Z]+'$/.test(c) && c !== 'channel' && !/^[a-z]+Handler$/.test(c) && c !== 'handler')).toEqual([])
    expect(preload).not.toMatch(/invoke\(\s*(?!')/)
  })

  it('jeder aufrufbare Kanal hat genau einen Handler im Hauptprozess und umgekehrt', () => {
    const invoked = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1])
    const handled = [...mainIndex.matchAll(/\bhandle\('([^']+)'/g)].map((m) => m[1])
    expect(new Set(invoked).size).toBe(invoked.length) // keine doppelten Aufrufe desselben Kanals
    expect(new Set(handled).size).toBe(handled.length) // keine doppelten Handler
    expect([...invoked].sort()).toEqual([...handled].sort())
  })

  it('Ereigniskanäle zur Oberfläche werden im Hauptprozess auch wirklich gesendet', () => {
    const listened = [...preload.matchAll(/ipcRenderer\.on\('([^']+)'/g)].map((m) => m[1])
    const sentIn = [...main.map((s) => s.text)].join('\n')
    for (const channel of listened) expect(sentIn, channel).toContain(`.send('${channel}'`)
  })
})
