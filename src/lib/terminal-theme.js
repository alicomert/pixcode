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

export function terminalTheme(mode = 'dark') {
  return mode === 'light'
    ? { ...ansi, background: '#ffffff', foreground: '#1f2328', cursor: '#1f2328', selectionBackground: '#add6ff' }
    : { ...ansi, background: '#101214', foreground: '#e6edf3', cursor: '#e6edf3', selectionBackground: '#264f78' }
}
