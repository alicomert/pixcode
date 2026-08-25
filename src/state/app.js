import { signal } from '@preact/signals'

export const theme = signal(localStorage.getItem('pixcode.theme') || 'dark')
export const mobileTab = signal('files')
export const activeAgent = signal('')
export const openFiles = signal([])
export const activeFile = signal('')
export const activeView = signal('explorer')
export const gitBranch = signal('main')
export const panelOpen = signal(false)
export const sidebarWidth = signal(Number(localStorage.getItem('pixcode.sidebarWidth') || 276))
export const agentWidth = signal(Number(localStorage.getItem('pixcode.agentWidth') || 368))
export const panelHeight = signal(Number(localStorage.getItem('pixcode.panelHeight') || 260))

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

export function setSidebarWidth(value) {
  const numeric = Number(value)
  sidebarWidth.value = numeric <= 0 ? 0 : Math.min(480, Math.max(220, Math.round(numeric)))
  localStorage.setItem('pixcode.sidebarWidth', String(sidebarWidth.value))
}

export function setAgentWidth(value) {
  agentWidth.value = Math.min(560, Math.max(300, Math.round(value)))
  localStorage.setItem('pixcode.agentWidth', String(agentWidth.value))
}

export function setPanelHeight(value) {
  panelHeight.value = Math.min(520, Math.max(150, Math.round(value)))
  localStorage.setItem('pixcode.panelHeight', String(panelHeight.value))
}

setTheme(theme.value)
