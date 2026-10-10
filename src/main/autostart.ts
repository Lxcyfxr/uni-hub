import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isLinux, isMac } from './platform'

/** Beim Windows-Start wird mit diesem Argument gestartet: Die App läuft dann nur im Infobereich, ohne Fenster. */
const HIDDEN_ARG = '--hidden'

export interface AutostartState {
  /** Nur die installierte App kann sich in den Windows-Autostart eintragen */
  supported: boolean
  enabled: boolean
  /** Eingetragen, aber in Windows (Task-Manager → Autostart) deaktiviert */
  blocked: boolean
}

/** Unter macOS gibt es keine eigenen Startargumente für Anmeldeobjekte; dort zeigt `wasOpenedAtLogin` den Autostart an. */
export const startedHidden = (): boolean => (isMac ? app.getLoginItemSettings().wasOpenedAtLogin : process.argv.includes(HIDDEN_ARG))

/** Linux kennt `setLoginItemSettings` nicht: Der Autostart ist eine .desktop-Datei in ~/.config/autostart. */
const linuxEntry = (): string => join(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config'), 'autostart', 'uni-hub.desktop')

function setLinuxAutostart(enabled: boolean): void {
  const file = linuxEntry()
  if (!enabled) return rmSync(file, { force: true })
  // Bei einem AppImage startet APPIMAGE die App, nicht das entpackte Programm; Sonderzeichen für die Exec-Zeile maskieren
  const exec = (process.env['APPIMAGE'] || process.execPath).replace(/["`$\\]/g, (c) => '\\' + c)
  mkdirSync(join(file, '..'), { recursive: true })
  const lines = ['[Desktop Entry]', 'Type=Application', 'Name=Uni-Hub', `Exec="${exec}" ${HIDDEN_ARG}`, 'Terminal=false', 'X-GNOME-Autostart-enabled=true']
  writeFileSync(file, lines.join('\n') + '\n')
}

/** Liest den Autostart-Eintrag (ohne Prüfung, ob die App installiert ist). */
export function readAutostart(): { enabled: boolean; blocked: boolean } {
  if (isLinux) return { enabled: existsSync(linuxEntry()), blocked: false }
  // Die Argumente müssen übereinstimmen, sonst findet Windows den Eintrag nicht
  const s = isMac ? app.getLoginItemSettings() : app.getLoginItemSettings({ args: [HIDDEN_ARG] })
  return { enabled: s.openAtLogin, blocked: s.openAtLogin && s.executableWillLaunchAtLogin === false }
}

export function applyAutostart(enabled: boolean): void {
  if (isLinux) return setLinuxAutostart(enabled)
  app.setLoginItemSettings(isMac ? { openAtLogin: enabled } : { openAtLogin: enabled, args: [HIDDEN_ARG] })
}

export function getAutostart(): AutostartState {
  return { supported: app.isPackaged, ...readAutostart() }
}

export function setAutostart(enabled: boolean): void {
  // Im Entwicklungsmodus würde Windows sonst electron.exe ohne die App eintragen
  if (!app.isPackaged) throw new Error('Der Autostart ist nur in der installierten App verfügbar')
  applyAutostart(enabled)
}
