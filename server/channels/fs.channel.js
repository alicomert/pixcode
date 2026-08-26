import fs from 'node:fs'
import path from 'node:path'
import { httpError } from '../util/http.js'
import { workspacePath } from '../workspace.js'

// Keep dependency trees out of the explorer/search, but expose project files
// including dotfiles, build output and the .git directory like a local editor.
const SKIP = new Set(['.DS_Store'])
const SEARCH_SKIP = new Set(['node_modules', '.git', 'dist', '.cache', '.DS_Store'])
async function existingPath(rel, requestedWorkspace) {
  const { base, resolved: lexical } = workspacePath(requestedWorkspace, rel)
  const resolved = lexical
  const real = await fs.promises.realpath(resolved)
  if (real !== base && !real.startsWith(`${base}${path.sep}`)) throw httpError(403, 'path outside workspace')
  return real
}

async function writablePath(rel, requestedWorkspace) {
  const { base, resolved } = workspacePath(requestedWorkspace, rel)
  try {
    const current = await fs.promises.realpath(resolved)
    if (current !== base && !current.startsWith(`${base}${path.sep}`)) throw httpError(403, 'path outside workspace')
  } catch (error) {
    if (error.status) throw error
    if (error.code !== 'ENOENT') throw error
  }
  let ancestor = path.dirname(resolved)
  while (ancestor !== base) {
    try {
      const real = await fs.promises.realpath(ancestor)
      if (!real.startsWith(`${base}${path.sep}`)) throw httpError(403, 'path outside workspace')
      break
    } catch (error) {
      if (error.status) throw error
      ancestor = path.dirname(ancestor)
    }
  }
  return resolved
}

export const fsChannel = {
  ops: {
    async search(_ctx, { query = '', maxResults = 100, workspace } = {}) {
      const needle = String(query).trim().toLowerCase()
      if (!needle) return []
      const results = []
      const seen = new Map()
      const root = workspacePath(workspace, '.').base
      const limit = Math.min(Math.max(Number(maxResults) || 100, 1), 500)
      const addResult = (result) => {
        const existing = seen.get(result.path)
        if (existing) {
          if (result.reason === 'content' && existing.reason === 'name') Object.assign(existing, result)
          return
        }
        if (results.length < limit) {
          seen.set(result.path, result)
          results.push(result)
        }
      }
      async function walk(directory, relative) {
        if (results.length >= limit) return
        let entries
        try { entries = await fs.promises.readdir(directory, { withFileTypes: true }) } catch { return }
        for (const entry of entries) {
          if (SEARCH_SKIP.has(entry.name)) continue
          const childRelative = relative ? `${relative}/${entry.name}` : entry.name
          const childPath = path.join(directory, entry.name)
          const nameMatch = entry.name.toLowerCase().includes(needle)
          if (nameMatch) addResult({ path: childRelative, type: entry.isDirectory() ? 'dir' : 'file', reason: 'name' })
          if (entry.isDirectory()) {
            await walk(childPath, childRelative)
          } else if (entry.isFile() && results.length < limit) {
            try {
              const stat = await fs.promises.stat(childPath)
              if (stat.size <= 2_000_000) {
                const content = await fs.promises.readFile(childPath)
                if (!content.includes(0)) {
                  const lines = content.toString('utf8').split(/\r?\n/)
                  for (let index = 0; index < lines.length && results.length < limit; index += 1) {
                    if (lines[index].toLowerCase().includes(needle)) {
                      addResult({ path: childRelative, type: 'file', reason: 'content', line: index + 1, preview: lines[index].trim().slice(0, 240) })
                      break
                    }
                  }
                }
              }
            } catch {
              void 0
            }
          }
          if (results.length >= limit) return
        }
      }
      await walk(root, '')
      return results
    },
    async list(_ctx, { path: rel = '.', workspace } = {}) {
      const directory = await existingPath(rel, workspace)
      const entries = await fs.promises.readdir(directory, { withFileTypes: true })
      return entries
        .filter((entry) => !SKIP.has(entry.name))
        .sort((a, b) => {
          const directoryOrder = Number(b.isDirectory()) - Number(a.isDirectory())
          return directoryOrder || a.name.localeCompare(b.name)
        })
        .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
    },

    async read(_ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const file = await existingPath(rel, workspace)
      const stat = await fs.promises.stat(file)
      if (!stat.isFile()) throw httpError(400, 'not a file')
      if (stat.size > 5_000_000) throw httpError(413, 'file too large')
      const content = await fs.promises.readFile(file)
      if (content.includes(0)) throw httpError(415, 'binary file')
      return { content: content.toString('utf8'), size: stat.size }
    },

    async write(_ctx, { path: rel, content, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const file = await writablePath(rel, workspace)
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await fs.promises.writeFile(file, String(content ?? ''), 'utf8')
      return { ok: true }
    },

    async mkdir(_ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      await fs.promises.mkdir(await writablePath(rel, workspace), { recursive: true })
      return { ok: true }
    },

    async rename(_ctx, { from, to, workspace } = {}) {
      if (!from || !to) throw httpError(400, 'from and to required')
      const source = await existingPath(from, workspace)
      if (source === workspacePath(workspace, '.').base) throw httpError(400, 'cannot rename workspace')
      const destination = await writablePath(to, workspace)
      await fs.promises.rename(source, destination)
      return { ok: true }
    },

    async delete(_ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const target = await existingPath(rel, workspace)
      if (target === workspacePath(workspace, '.').base) throw httpError(400, 'cannot delete workspace')
      await fs.promises.rm(target, { recursive: true, force: true })
      return { ok: true }
    }
  }
}
