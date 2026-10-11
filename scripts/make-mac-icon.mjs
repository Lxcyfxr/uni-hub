// Zeichnet das App-Symbol (blaues Quadrat mit weißem „U“, wie src/main/icon.ts) als 1024-px-PNG für den Mac-Build:
//   node scripts/make-mac-icon.mjs   →   build/icon-1024.png
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SIZE = 1024
const SAMPLES = 3
const BG = [22, 119, 255]
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const inBackground = (x, y) => {
  const r = 0.2
  const cx = clamp(x, 0.03 + r, 0.97 - r)
  const cy = clamp(y, 0.03 + r, 0.97 - r)
  return x >= 0.03 && x <= 0.97 && y >= 0.03 && y <= 0.97 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inLetter = (x, y) => {
  const bars = ((x >= 0.28 && x <= 0.4) || (x >= 0.6 && x <= 0.72)) && y >= 0.24 && y <= 0.62
  const d = Math.hypot(x - 0.5, y - 0.62)
  return bars || (y > 0.62 && d <= 0.22 && d >= 0.1)
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0 // Filter: keiner
  for (let px = 0; px < SIZE; px++) {
    let bg = 0
    let white = 0
    for (let sy = 0; sy < SAMPLES; sy++)
      for (let sx = 0; sx < SAMPLES; sx++) {
        const x = (px + (sx + 0.5) / SAMPLES) / SIZE
        const y = (py + (sy + 0.5) / SAMPLES) / SIZE
        if (!inBackground(x, y)) continue
        if (inLetter(x, y)) white++
        else bg++
      }
    const covered = bg + white
    if (!covered) continue
    const o = py * (SIZE * 4 + 1) + 1 + px * 4
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round((255 * white + BG[c] * bg) / covered)
    raw[o + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // Bit pro Kanal
ihdr[9] = 6 // RGBA
writeFileSync(
  'build/icon-1024.png',
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
)
console.log('build/icon-1024.png geschrieben')
