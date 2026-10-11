import { nativeImage, type NativeImage } from 'electron'
import { isMac } from './platform'

/**
 * Das App-Symbol wird zur Laufzeit gezeichnet (blaues, abgerundetes Quadrat mit weißem „U“),
 * damit keine Bilddateien mitgeliefert werden müssen. Kantenglättung per Supersampling.
 */
const BG = [22, 119, 255]
const SAMPLES = 4

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function inBackground(x: number, y: number): boolean {
  const r = 0.2
  const cx = clamp(x, 0.03 + r, 0.97 - r)
  const cy = clamp(y, 0.03 + r, 0.97 - r)
  return x >= 0.03 && x <= 0.97 && y >= 0.03 && y <= 0.97 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** Buchstabe „U“: zwei Balken und ein Halbring unten */
function inLetter(x: number, y: number): boolean {
  const bars = ((x >= 0.28 && x <= 0.4) || (x >= 0.6 && x <= 0.72)) && y >= 0.24 && y <= 0.62
  const d = Math.hypot(x - 0.5, y - 0.62)
  return bars || (y > 0.62 && d <= 0.22 && d >= 0.1)
}

/** BGRA-Pixel (Windows-Reihenfolge) */
function renderBitmap(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)
  const n = SAMPLES * SAMPLES
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0
      let white = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size
          const y = (py + (sy + 0.5) / SAMPLES) / size
          if (!inBackground(x, y)) continue
          if (inLetter(x, y)) white++
          else bg++
        }
      }
      const covered = bg + white
      const o = (py * size + px) * 4
      if (!covered) continue
      for (let c = 0; c < 3; c++) buf[o + 2 - c] = Math.round((255 * white + BG[c] * bg) / covered)
      buf[o + 3] = Math.round((covered / n) * 255)
    }
  }
  return buf
}

const bitmapImage = (size: number, scaleFactor = 1): NativeImage => nativeImage.createFromBitmap(renderBitmap(size), { width: size, height: size, scaleFactor })

/** Nur das „U“ in Schwarz mit Transparenz – macOS färbt solche Template-Bilder passend zur Menüleiste ein */
function renderTemplate(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)
  const n = SAMPLES * SAMPLES
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let on = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (inLetter((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)) on++
        }
      }
      buf[(py * size + px) * 4 + 3] = Math.round((on / n) * 255)
    }
  }
  return buf
}

/** Symbol für den Infobereich (Windows) bzw. die Menüleiste (macOS): 100 % und 200 % Skalierung */
export function trayIcon(): NativeImage {
  const render = isMac ? renderTemplate : renderBitmap
  const size = isMac ? 18 : 16
  const img = nativeImage.createFromBitmap(render(size), { width: size, height: size, scaleFactor: 1 })
  img.addRepresentation({ scaleFactor: 2, width: size * 2, height: size * 2, buffer: render(size * 2) })
  if (isMac) img.setTemplateImage(true)
  return img
}

/** Symbol für Fenster und Taskleiste */
export const windowIcon = (): NativeImage => bitmapImage(256)
