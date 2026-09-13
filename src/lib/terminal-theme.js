// Shared xterm settings. Explicit ANSI colors keep CLI TUIs colorful even
// when the browser or operating system has an unusual terminal palette.
export const terminalFont = '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", "DejaVu Sans Mono", Consolas, monospace'

const ansi = {
  black: '#1e1e1e',
  red: '#f14c4c',
  green: '#23d18b',
  yellow: '#f5f543',
  blue: '#3b8eea',
  magenta: '#d670d6',
  cyan: '#29b8db',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff'
}

const lightAnsi = {
  ...ansi,
  black: '#111827',
  red: '#b42318',
  green: '#087443',
  yellow: '#8a5a00',
  blue: '#175cd3',
  magenta: '#a43fb5',
  cyan: '#0e7490',
  white: '#374151',
  brightBlack: '#6b7280',
  brightRed: '#b42318',
  brightGreen: '#087443',
  brightYellow: '#8a5a00',
  brightBlue: '#175cd3',
  brightMagenta: '#a43fb5',
  brightCyan: '#0e7490',
  brightWhite: '#111827'
}

export function terminalTheme(mode = 'dark') {
  return mode === 'light'
    ? { ...lightAnsi, background: '#f1f5f9', foreground: '#1f2937', cursor: '#1f2937', selectionBackground: '#b9d8f5' }
    : { ...ansi, background: '#101214', foreground: '#e6edf3', cursor: '#e6edf3', selectionBackground: '#264f78' }
}
