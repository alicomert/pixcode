import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from './config.js'
import { httpError } from './util/http.js'
import { registerWorkspace } from './workspace.js'

let active = null
const execFileAsync = promisify(execFile)

function activeFile() {
  return path.join(root(), '.active-project')
}

function externalWorkspaceFile() {
  return path.join(config.dataDir, 'workspace.json')
}

function externalId(workspacePath) {
  return `external:${path.resolve(workspacePath)}`
}

// The first workspace implementation stored only `{ path }`. Keep reading
// that shape while allowing several external roots to be remembered in the
// same workspace. Managed projects remain roots automatically.
function workspaceState() {
  try {
    const value = JSON.parse(fs.readFileSync(externalWorkspaceFile(), 'utf8'))
    const externals = Array.isArray(value?.externals)
      ? value.externals
      : (typeof value?.path === 'string' ? [{ path: value.path }] : [])
    const normalizedExternals = externals
      .map((item) => typeof item === 'string' ? { path: item } : item)
      .filter((item) => typeof item?.path === 'string' && item.path.trim())
      .map((item) => ({ path: path.resolve(item.path) }))
    const active = typeof value?.active === 'string' ? value.active : ''
    // A legacy { path } file did not have an active marker. Preserve its
    // external workspace as the startup choice until the user selects a
    // managed project explicitly.
    return {
      active: active || (value?.path ? externalId(value.path) : ''),
      externals: normalizedExternals
    }
  } catch {
    return { active: '', externals: [] }
  }
}

function persistWorkspaceState(state) {
  let temporary
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    const externals = [...new Map(state.externals.map((item) => [path.resolve(item.path), { path: path.resolve(item.path) }])).values()]
    const destination = externalWorkspaceFile()
    temporary = destination + '.' + process.pid + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify({ active: state.active || '', externals }) + '\n', { mode: 0o600 })
    fs.renameSync(temporary, destination)
  } catch {
    void 0
  } finally {
    if (temporary) {
      try { fs.rmSync(temporary, { force: true }) } catch { void 0 }
    }
  }
}

function readActiveName() {
  try {
    const name = fs.readFileSync(activeFile(), 'utf8').trim()
    return name && /^[\p{L}\p{N}._-]+$/u.test(name) ? name : null
  } catch {
    return null
  }
}

function rememberActive(name) {
  try {
    fs.writeFileSync(activeFile(), `${name}\n`, { mode: 0o600 })
  } catch {
    void 0
  }
  const state = workspaceState()
  state.active = name
  persistWorkspaceState(state)
}

function rememberExternalWorkspace(workspacePath) {
  const resolved = path.resolve(workspacePath)
  const state = workspaceState()
  state.externals = [...state.externals.filter((item) => path.resolve(item.path) !== resolved), { path: resolved }]
  state.active = externalId(resolved)
  persistWorkspaceState(state)
}

function rememberedExternalWorkspace() {
  const state = workspaceState()
  // An explicit managed-project selection must win over remembered external
  // roots. The empty active value is retained for compatibility with the
  // original { path } workspace file format.
  const candidates = []
  if (state.active.startsWith('external:')) candidates.push(state.active.slice('external:'.length))
  if (!state.active || state.active.startsWith('external:')) candidates.push(...state.externals.slice().reverse().map((item) => item.path))
  for (const candidate of candidates) {
    try {
      if (candidate && !managedName(candidate) && fs.statSync(candidate).isDirectory()) return path.resolve(candidate)
    } catch {
      void 0
    }
  }
  return null
}

function root() {
  return path.resolve(config.projectsDir)
}

function managedName(workspacePath) {
  const relative = path.relative(root(), path.resolve(workspacePath))
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep) || relative.includes(path.sep)) return null
  return relative
}

function insideRoot(candidate) {
  const resolved = path.resolve(root(), candidate)
  if (resolved !== root() && !resolved.startsWith(`${root()}${path.sep}`)) throw httpError(403, 'project outside projects directory')
  return resolved
}

function projectRecord(name, isActive = false) {
  const projectPath = insideRoot(name)
  registerWorkspace(projectPath)
  return {
    id: name,
    name,
    path: projectPath,
    active: isActive
  }
}

function directoryNames() {
  try {
    return fs.readdirSync(root(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function nextDefaultName() {
  const numbers = directoryNames().flatMap((name) => {
    const match = /^pixcode-project-(\d+)$/.exec(name)
    return match ? [Number(match[1])] : []
  })
  return `pixcode-project-${Math.max(0, ...numbers) + 1}`
}

function activeRecord() {
  if (!config.workspace) return null
  const workspacePath = path.resolve(config.workspace)
  const name = managedName(workspacePath)
  if (name) return projectRecord(name, true)
  return externalRecord(workspacePath)
}

function externalRecord(workspacePath) {
  const resolved = path.resolve(workspacePath)
  registerWorkspace(resolved)
  return { id: `external:${resolved}`, name: path.basename(resolved) || resolved, path: resolved, active: true, external: true }
}

function externalRecords() {
  const records = []
  const seen = new Set()
  for (const item of workspaceState().externals) {
    const resolved = path.resolve(item.path)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (managedName(resolved)) continue
    try {
      if (fs.statSync(resolved).isDirectory()) records.push(externalRecord(resolved))
    } catch {
      // A remembered workspace may have been moved or deleted. Keep it out
      // of the picker until it is available again.
      void 0
    }
  }
  return records
}

export function initializeWorkspace() {
  fs.mkdirSync(root(), { recursive: true, mode: 0o755 })
  // Register every workspace that can be selected from the picker before the
  // frontend starts issuing parallel fs/Git requests for a restored tab.
  for (const name of directoryNames()) registerWorkspace(insideRoot(name))
  for (const item of workspaceState().externals) {
    try {
      if (fs.statSync(item.path).isDirectory()) registerWorkspace(item.path)
    } catch {
      void 0
    }
  }
  if (!config.workspace) {
    const external = rememberedExternalWorkspace()
    if (external) {
      config.workspace = external
      rememberExternalWorkspace(external)
    } else {
      const state = workspaceState()
      const names = directoryNames()
      const remembered = [readActiveName(), state.active]
        .find((candidate) => candidate && /^[\p{L}\p{N}._-]+$/u.test(candidate) && names.includes(candidate))
      const name = remembered || names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) || nextDefaultName()
      config.workspace = insideRoot(name)
      fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
      rememberActive(name)
    }
  } else {
    config.workspace = path.resolve(config.workspace)
    fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
    const name = managedName(config.workspace)
    if (name) rememberActive(name)
    else rememberExternalWorkspace(config.workspace)
  }
  const resolvedWorkspace = path.resolve(config.workspace)
  registerWorkspace(resolvedWorkspace)
  const state = workspaceState()
  const explicitlyExternal = state.active.startsWith('external:')
    && path.resolve(state.active.slice('external:'.length)) === resolvedWorkspace
  active = explicitlyExternal || !resolvedWorkspace.startsWith(root() + path.sep)
    ? externalRecord(resolvedWorkspace)
    : activeRecord()
  return active
}

export function listProjects() {
  const current = active || activeRecord()
  const managed = directoryNames()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => projectRecord(name, current?.id === name))
  const externals = externalRecords()
  if (current?.external && !externals.some((item) => item.id === current.id)) externals.unshift(current)
  const projects = [...managed, ...externals].map((item) => ({ ...item, active: item.id === current?.id }))
  if (current) {
    const activeIndex = projects.findIndex((item) => item.id === current.id)
    if (activeIndex > 0) projects.unshift(...projects.splice(activeIndex, 1))
  }
  return projects
}

export function currentProject() {
  return active || activeRecord()
}

export function createProject(name) {
  let projectName = String(name || '').trim()
  if (!projectName) projectName = nextDefaultName()
  if (!/^[\p{L}\p{N}._-]+$/u.test(projectName)) throw httpError(400, 'invalid project name')
  const projectPath = insideRoot(projectName)
  if (fs.existsSync(projectPath)) throw httpError(409, 'project already exists')
  fs.mkdirSync(projectPath, { recursive: true, mode: 0o755 })
  return projectRecord(projectName, false)
}

export function selectProject(id) {
  const requestedId = String(id || '').trim()
  if (requestedId.startsWith('external:')) {
    const record = externalRecords().find((item) => item.id === requestedId)
    if (!record) throw httpError(404, 'workspace not found')
    config.workspace = record.path
    registerWorkspace(config.workspace)
    active = externalRecord(record.path)
    rememberExternalWorkspace(record.path)
    return active
  }
  const projectName = requestedId
  if (!projectName || !/^[\p{L}\p{N}._-]+$/u.test(projectName)) throw httpError(400, 'invalid project')
  const projectPath = insideRoot(projectName)
  if (!fs.existsSync(projectPath) || !fs.lstatSync(projectPath).isDirectory()) throw httpError(404, 'project not found')
  config.workspace = projectPath
  registerWorkspace(config.workspace)
  active = projectRecord(projectName, true)
  rememberActive(projectName)
  return active
}

export function openWorkspace(folderPath) {
  const value = String(folderPath || '').trim()
  if (!value) throw httpError(400, 'folder path required')
  const expanded = value === '~' || value.startsWith(`~${path.sep}`) ? path.join(os.homedir(), value.slice(2)) : value
  const target = path.resolve(expanded)
  let stat
  try { stat = fs.statSync(target) } catch { throw httpError(404, 'folder not found') }
  if (!stat.isDirectory()) throw httpError(400, 'path is not a folder')
  const name = managedName(target)
  if (name) {
    config.workspace = target
    registerWorkspace(config.workspace)
    active = projectRecord(name, true)
    rememberActive(name)
    return active
  }
  config.workspace = target
  registerWorkspace(config.workspace)
  active = externalRecord(target)
  rememberExternalWorkspace(target)
  return active
}

export function browseDirectories(folderPath) {
  const value = String(folderPath || '').trim()
  const expanded = value === '~' || value.startsWith(`~${path.sep}`) ? path.join(os.homedir(), value.slice(2)) : (value || process.cwd())
  const target = path.resolve(expanded)
  let stat
  try { stat = fs.statSync(target) } catch { throw httpError(404, 'folder not found') }
  if (!stat.isDirectory()) throw httpError(400, 'path is not a folder')
  let entries
  try {
    entries = fs.readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
  } catch (error) {
    throw httpError(403, error.message || 'folder cannot be read')
  }
  const parent = path.dirname(target) === target ? null : path.dirname(target)
  return { path: target, parent, entries }
}

export async function cloneProject(url, name) {
  const source = String(url || '').trim()
  if (!/^https?:\/\//i.test(source) && !/^git@[^:]+:[^/]+\/.+/.test(source)) throw httpError(400, 'unsupported repository URL')
  const fallback = source.split('/').at(-1)?.replace(/\.git$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-') || ''
  const projectName = String(name || fallback || '').trim()
  if (!projectName || !/^[\p{L}\p{N}._-]+$/u.test(projectName)) throw httpError(400, 'invalid project name')
  const destination = insideRoot(projectName)
  if (fs.existsSync(destination)) throw httpError(409, 'project already exists')
  try {
    await execFileAsync('git', ['clone', '--', source, destination], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  } catch (error) {
    try { fs.rmSync(destination, { recursive: true, force: true }) } catch { void 0 }
    const detail = `${error.stderr || ''}${error.stdout || ''}`.trim()
    throw httpError(error.killed ? 504 : 400, detail || 'git clone failed')
  }
  return projectRecord(projectName, false)
}
