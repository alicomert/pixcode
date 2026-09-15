import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './util/http.js'
import { accessFor } from './auth.js'

const knownWorkspaces = new Set()

export function registerWorkspace(workspacePath) {
  if (!workspacePath) return ''
  const resolved = path.resolve(String(workspacePath))
  knownWorkspaces.add(resolved)
  return resolved
}

// The stable id a workspace root maps to in the project picker and in
// per-user project allowlists: the managed folder name, or `external:path`.
export function projectIdForPath(resolved) {
  const root = path.resolve(config.projectsDir)
  const relative = path.relative(root, resolved)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.includes(path.sep)) return relative
  return `external:${resolved}`
}

// Resolve the workspace carried by a request without mutating the process-wide
// active project. The project picker still updates config.workspace for legacy
// callers, while channel operations can safely finish against the tab that
// created them. When ctx is present the caller's project allowlist applies:
// members may only touch workspaces an admin granted them.
export function workspaceRoot(requested, ctx) {
  const candidate = requested == null || String(requested).trim() === ''
    ? config.workspace
    : String(requested)
  if (!candidate) throw httpError(409, 'workspace is not initialized')
  const resolved = path.resolve(candidate)
  try {
    if (!fs.statSync(resolved).isDirectory()) throw httpError(400, 'workspace is not a folder')
  } catch (error) {
    if (error.status) throw error
    throw httpError(404, 'workspace not found')
  }
  const active = config.workspace ? path.resolve(config.workspace) : ''
  if (resolved !== active && !knownWorkspaces.has(resolved)) throw httpError(403, 'unknown workspace')
  if (ctx) {
    const access = accessFor(ctx)
    if (!access) throw httpError(401, 'session revoked')
    if (access.projects && !access.projects.has(projectIdForPath(resolved))) {
      throw httpError(403, 'project is not assigned to this account')
    }
  }
  return resolved
}

export function workspacePath(requestedWorkspace, relativePath = '.', ctx) {
  const base = workspaceRoot(requestedWorkspace, ctx)
  const value = String(relativePath || '.')
  if (value.includes('\0') || value.includes('\n')) throw httpError(400, 'path is invalid')
  const resolved = path.resolve(base, value)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw httpError(403, 'path outside workspace')
  return { base, relative: value, resolved }
}

export function workspaceCwd(requestedWorkspace, cwd = '.', ctx) {
  return workspacePath(requestedWorkspace, cwd, ctx).resolved
}
