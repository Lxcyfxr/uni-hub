// Schreibt release/SHA256SUMS.txt mit den Prüfsummen der Installer, damit Empfänger die Datei vor dem Start prüfen können:
//   PowerShell:  (Get-FileHash .\Uni-Hub-Setup-<Version>.exe -Algorithm SHA256).Hash
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, writeFileSync } from 'node:fs'

const dir = 'release'
const installers = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.exe') && f.includes('Setup'))
if (!installers.length) {
  console.error('Kein Installer in release/ gefunden.')
  process.exit(1)
}

const lines = []
for (const name of installers) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    createReadStream(`${dir}/${name}`).on('data', (c) => hash.update(c)).on('end', resolve).on('error', reject)
  })
  lines.push(`${hash.digest('hex')}  ${name}`)
}
writeFileSync(`${dir}/SHA256SUMS.txt`, lines.join('\n') + '\n')
console.log(lines.join('\n'))
