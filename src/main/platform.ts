/** Plattformweiche an einer Stelle, damit der Rest des Codes nicht überall `process.platform` prüft. */
export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'
export const isLinux = process.platform === 'linux'
