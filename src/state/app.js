import { signal } from '@preact/signals'

export const theme = signal(localStorage.getItem('pixcode.theme') || 'dark')
export const mobileTab = signal('files')
export const activeAgent = signal('')
export const openFiles = signal([])
export const activeFile = signal('')

export function setTheme(value) {
  theme.value = value === 'light' ? 'light' : 'dark'
  localStorage.setItem('pixcode.theme', theme.value)
  document.documentElement.dataset.theme = theme.value
}

export function openFile(filePath) {
  if (!openFiles.value.includes(filePath)) openFiles.value = [...openFiles.value, filePath]
  activeFile.value = filePath
  mobileTab.value = 'editor'
}

export function closeFile(filePath) {
  const next = openFiles.value.filter((item) => item !== filePath)
  openFiles.value = next
  if (activeFile.value === filePath) activeFile.value = next.at(-1) || ''
}

setTheme(theme.value)
