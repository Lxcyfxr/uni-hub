import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

export type IpcListener = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

/**
 * Registriert Schnittstellen-Handler, die nur vom Hauptfenster (und dort nur vom obersten Frame) aufgerufen werden dürfen –
 * nicht von eingebetteten Webseiten, Popups oder fremden Frames, selbst wenn diese irgendwie an den Kanalnamen kämen.
 */
export function createGuardedHandle(win: BrowserWindow) {
  return (channel: string, listener: IpcListener): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== win.webContents || (event.senderFrame && event.senderFrame !== event.sender.mainFrame)) {
        console.warn(`[IPC] ${channel}: Aufruf von unbekanntem Absender abgelehnt`)
        throw new Error('Nicht erlaubter Absender')
      }
      return listener(event, ...args)
    })
  }
}
