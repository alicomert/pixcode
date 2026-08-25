import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './util/http.js'

let active = null

function activeFile() {
  return path.join(root(), '.active-project')
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

export function initializeWorkspace() {
  fs.mkdirSync(root(), { recursive: true, mode: 0o755 })
  if (!config.workspace) {
    const remembered = readActiveName()
    const name = remembered && directoryNames().includes(remembered)
      ? remembered
      : latestProjectName() || nextDefaultName()
    config.workspace = insideRoot(name)
    fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
    rememberActive(name)
  } else {
    config.workspace = path.resolve(config.workspace)
    fs.mkdirSync(config.workspace, { recursive: true, mode: 0o755 })
  }
  active = activeRecord()
  return active
}

export function listProjects() {
  const current = active || activeRecord()
  return directoryNames()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => projectRecord(name, current?.id === name))
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
