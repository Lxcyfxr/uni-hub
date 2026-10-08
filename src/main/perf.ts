import { app, type BrowserWindow } from 'electron'

// Prozessstart (nicht erst App-Start), damit auch das Laden des Hauptbündels mitgezählt wird
const t0 = process.getCreationTime() ?? Date.now()

export const sinceStart = () => Math.round(Date.now() - t0)

/** Schreibt eine Zeitmarke ins Protokoll (zum Vergleichen von Startzeiten zwischen Versionen). */
export function mark(what: string): void {
  console.info(`[perf] ${what}: ${sinceStart()} ms`)
}

/** Protokolliert, wann das Fenster bereit ist, wann das erste Bild erscheint und wie viel Speicher die Prozesse belegen. */
export function trackWindowPerf(win: BrowserWindow): void {
  win.once('ready-to-show', () => mark('Fenster bereit'))
  win.webContents.once('did-finish-load', () => mark('Oberfläche geladen'))
  setTimeout(async () => {
    if (win.isDestroyed()) return
    try {
      const paint = await win.webContents.executeJavaScript("JSON.stringify(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]))")
      console.info(`[perf] Renderer-Paint (ms seit Navigation): ${paint}`)
    } catch {
      /* Fenster schon weg */
    }
    const metrics = app.getAppMetrics()
    const total = metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024
    const parts = metrics.map((p) => `${p.type}:${Math.round(p.memory.workingSetSize / 1024)}`).join(' ')
    console.info(`[perf] Speicher: ${Math.round(total)} MB in ${metrics.length} Prozessen (${parts})`)
  }, 8000)
}
