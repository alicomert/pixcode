import { signal } from '@preact/signals'

export const theme = signal(localStorage.getItem('pixcode.theme') || 'dark')
export const mobileTab = signal('files')
export const activeAgent = signal('')
// The backend exposes one active workspace at a time, while the browser can
// keep several workspace tabs open. Keep the selected record in a signal so
// every view can refresh its data without a full page reload.
function readWorkspace() {
  try {
    const value = JSON.parse(localStorage.getItem('pixcode.workspace.active') || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export const workspace = signal(readWorkspace())
export const openFiles = signal([])
export const activeFile = signal('')
export const activeView = signal('explorer')
export const panelOpen = signal(false)
export const sidebarWidth = signal(Number(localStorage.getItem('pixcode.sidebarWidth') || 276))
export const agentWidth = signal(Number(localStorage.getItem('pixcode.agentWidth') || 368))
export const panelHeight = signal(Number(localStorage.getItem('pixcode.panelHeight') || 260))

function workspaceKey(record = workspace.value) {
  return String(record?.id || record?.path || 'default')
}

const EDITOR_STATE_KEY = 'pixcode.workspace.editorState'
const editorByWorkspace = new Map()
try {
  const stored = JSON.parse(localStorage.getItem(EDITOR_STATE_KEY) || '{}')
  for (const [key, value] of Object.entries(stored || {})) {
    if (Array.isArray(value?.openFiles)) editorByWorkspace.set(key, { openFiles: value.openFiles, activeFile: String(value.activeFile || '') })
  }
} catch {
  // A malformed browser cache should never prevent the workbench from booting.
}

function persistEditorState() {
  try {
    const value = Object.fromEntries([...editorByWorkspace.entries()].slice(-24))
    localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(value))
  } catch { void 0 }
}

function rememberEditorState(record = workspace.value) {
  editorByWorkspace.set(workspaceKey(record), {
    openFiles: [...openFiles.value],
    activeFile: activeFile.value
  })
  persistEditorState()
}

export function setWorkspace(record) {
  if (!record || typeof record !== 'object') return
  const previous = workspace.value
  if (previous && workspaceKey(previous) !== workspaceKey(record)) rememberEditorState(previous)
  workspace.value = { ...record }
  const next = editorByWorkspace.get(workspaceKey(record)) || { openFiles: [], activeFile: '' }
  openFiles.value = [...next.openFiles]
  activeFile.value = next.activeFile || ''
  try { localStorage.setItem('pixcode.workspace.active', JSON.stringify(workspace.value)) } catch { void 0 }
}

export function setTheme(value) {
  theme.value = value === 'light' ? 'light' : 'dark'
  localStorage.setItem('pixcode.theme', theme.value)
  document.documentElement.dataset.theme = theme.value
}

export function openFile(filePath) {
  if (!openFiles.value.includes(filePath)) openFiles.value = [...openFiles.value, filePath]
  activeFile.value = filePath
  rememberEditorState()
  mobileTab.value = 'editor'
}

export function closeFile(filePath) {
  const next = openFiles.value.filter((item) => item !== filePath)
  openFiles.value = next
  if (activeFile.value === filePath) activeFile.value = next.at(-1) || ''
  rememberEditorState()
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
