import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from './config.js'
import { httpError } from './util/http.js'

let active = null
const execFileAsync = promisify(execFile)

function activeFile() {
  return path.join(root(), '.active-project')
}

function externalWorkspaceFile() {
  return path.join(config.dataDir, 'workspace.json')
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
}

function rememberExternalWorkspace(workspacePath) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(externalWorkspaceFile(), JSON.stringify({ path: workspacePath }) + '\n', { mode: 0o600 })
  } catch {
    void 0
  }
}

function rememberedExternalWorkspace() {
  try {
    const value = JSON.parse(fs.readFileSync(externalWorkspaceFile(), 'utf8'))
    const workspacePath = typeof value?.path === 'string' ? path.resolve(value.path) : ''
    if (!workspacePath || !fs.statSync(workspacePath).isDirectory()) return null
    return workspacePath
  } catch {
    return null
  }
}

function root() {
  return path.resolve(config.projectsDir)
}

function insideRoot(candidate) {
  const resolved = path.resolve(root(), candidate)
  if (resolved !== root() && !resolved.startsWith(`${root()}${path.sep}`)) throw httpError(403, 'project outside projects directory')
  return resolved
}

function projectRecord(name, isActive = false) {
  return {
    id: name,
    name,
    path: insideRoot(name),
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

function latestProjectName() {
  return directoryNames()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1) || null
}

function activeRecord() {
  if (!config.workspace) return null
  const relative = path.relative(root(), config.workspace)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.includes(path.sep)) return projectRecord(relative, true)
  return { id: 'workspace', name: path.basename(config.workspace), path: config.workspace, active: true, external: true }
}

function externalRecord(workspacePath) {
  const resolved = path.resolve(workspacePath)
  return { id: `external:${resolved}`, name: path.basename(resolved) || resolved, path: resolved, active: true, external: true }
}

export function initializeWorkspace() {
  fs.mkdirSync(root(), { recursive: true, mode: 0o755 })
  if (!config.workspace) {
    const external = rememberedExternalWorkspace()
    if (external) {
      config.workspace = external
    } else {
      const remembered = readActiveName()
      const name = remembered && directoryNames().includes(remembered)
        ? remembered
        : latestProjectName() || nextDefaultName()
      config.workspace = insideRoot(name)
      fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
      rememberActive(name)
    }
  } else {
    config.workspace = path.resolve(config.workspace)
    fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
  }
  active = config.workspace && !path.resolve(config.workspace).startsWith(`${root()}${path.sep}`)
    ? externalRecord(config.workspace)
    : activeRecord()
  return active
}

export function listProjects() {
  const current = active || activeRecord()
  const projects = directoryNames()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => projectRecord(name, current?.id === name))
  if (current?.external) projects.unshift(current)
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
  const projectName = String(id || '').trim()
  if (!projectName || !/^[\p{L}\p{N}._-]+$/u.test(projectName)) throw httpError(400, 'invalid project')
  const projectPath = insideRoot(projectName)
  if (!fs.existsSync(projectPath) || !fs.lstatSync(projectPath).isDirectory()) throw httpError(404, 'project not found')
  config.workspace = projectPath
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
  config.workspace = target
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
