import { app } from 'electron'

/** Beim Windows-Start wird mit diesem Argument gestartet: Die App läuft dann nur im Infobereich, ohne Fenster. */
const HIDDEN_ARG = '--hidden'

export interface AutostartState {
  /** Nur die installierte App kann sich in den Windows-Autostart eintragen */
  supported: boolean
  enabled: boolean
  /** Eingetragen, aber in Windows (Task-Manager → Autostart) deaktiviert */
  blocked: boolean
}

export const startedHidden = (): boolean => process.argv.includes(HIDDEN_ARG)

/** Liest den Windows-Autostart-Eintrag (ohne Prüfung, ob die App installiert ist). */
export function readAutostart(): { enabled: boolean; blocked: boolean } {
  // Die Argumente müssen übereinstimmen, sonst findet Windows den Eintrag nicht
  const s = app.getLoginItemSettings({ args: [HIDDEN_ARG] })
  return { enabled: s.openAtLogin, blocked: s.openAtLogin && s.executableWillLaunchAtLogin === false }
}

export function applyAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
}

export function getAutostart(): AutostartState {
  return { supported: app.isPackaged, ...readAutostart() }
}

export function setAutostart(enabled: boolean): void {
  // Im Entwicklungsmodus würde Windows sonst electron.exe ohne die App eintragen
  if (!app.isPackaged) throw new Error('Der Autostart ist nur in der installierten App verfügbar')
  applyAutostart(enabled)
}
