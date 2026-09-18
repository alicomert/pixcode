import fs from 'node:fs'
import path from 'node:path'
import { httpError } from '../util/http.js'
import { workspacePath } from '../workspace.js'
import { accessAlive } from '../auth.js'
import { recordActivity } from '../activity.js'

// Keep dependency trees out of the explorer/search, but expose project files
// including dotfiles, build output and the .git directory like a local editor.
const SKIP = new Set(['.DS_Store'])
const SEARCH_SKIP = new Set(['node_modules', '.git', 'dist', '.cache', '.DS_Store'])

// Live file watching: every connected client subscribes to its workspace and
// gets `fs:changed` pushes when bytes move on disk — another user's session,
// an agent CLI, another PC — so the tree/editor/git views stay current
// without polling. Each watched directory costs one inotify watch, so
// dependency/build trees are skipped to keep usage proportional to the
// source tree, not the package tree.
const WATCH_DEBOUNCE_MS = 120
const WATCH_MAX_FILES = 300
const WATCH_MAX_DEPTH = 24
const WATCH_SKIP = new Set(['node_modules', '.git', '.cache', '.next', '.nuxt', '.turbo', 'coverage', '__pycache__', '.venv', 'venv', 'target'])
const GIT_WATCH_SKIP = new Set(['objects', 'logs', 'hooks', 'info', 'lfs', 'modules', 'worktrees'])

// base(realpath) -> { subscribers: Map<ctx, workspaceArg>, dirs: Map<abs, FSWatcher>, pending: Map<rel,kind>, git, timer, pins }
const watchers = new Map()

// Paths written through the fs ops are recorded with the acting user; the
// watcher flush would log the same disk change a moment later, so the flush
// skips any path an op just attributed.
const opMarks = new Map() // base -> Map<rel, ts>
function markOp(base, ...paths) {
  let marks = opMarks.get(base)
  if (!marks) { marks = new Map(); opMarks.set(base, marks) }
  if (marks.size > 500) marks.clear()
  for (const filePath of paths) marks.set(filePath, Date.now())
}
function opRecently(base, filePath) {
  const ts = opMarks.get(base)?.get(filePath)
  return ts !== undefined && Date.now() - ts < 2000
}

function scheduleFlush(entry) {
  if (entry.timer) return
  entry.timer = setTimeout(() => flushWatch(entry), WATCH_DEBOUNCE_MS)
  entry.timer.unref?.()
}

function flushWatch(entry) {
  entry.timer = null
  const files = [...entry.pending].slice(0, WATCH_MAX_FILES).map(([filePath, kind]) => ({ path: filePath, kind }))
  entry.pending.clear()
  const git = entry.git
  entry.git = false
  if (!files.length && !git) return
  // The activity timeline gets one compact record per flush — the file list
  // itself stays in the fs:changed frame, the log only keeps what it needs.
  // Paths an fs op just wrote are skipped: they already carry the user.
  const external = files.filter((file) => !opRecently(entry.base, file.path))
  if (external.length) recordActivity(entry.base, 'fs', { files: external.slice(0, 8).map((file) => file.path), count: external.length })
  if (git) recordActivity(entry.base, 'git', { op: 'refs' })
  for (const [ctx, workspaceArg] of entry.subscribers) {
    // Revoked accounts stop receiving fs events even with a socket open.
    if (!accessAlive(ctx)) { entry.subscribers.delete(ctx); continue }
    try { ctx.emit('fs', 'changed', { workspace: workspaceArg, files, git }) } catch { entry.subscribers.delete(ctx) }
  }
  if (!entry.subscribers.size && !entry.pins) teardownWatch(entry)
}

function teardownWatch(entry) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  for (const handle of entry.dirs.values()) { try { handle.close() } catch { void 0 } }
  entry.dirs.clear()
  watchers.delete(entry.base)
}

// A deleted/moved directory or an inotify hiccup surfaces as an async 'error'
// on the FSWatcher — unhandled, that throws and kills the process. Every
// handle gets a listener that just drops the dead watch (plus its subtree).
function attachWatcher(entry, abs, listener) {
  const handle = fs.watch(abs, { persistent: false }, listener)
  handle.on('error', () => {
    for (const [watchedAbs, watched] of entry.dirs) {
      if (watchedAbs === abs || watchedAbs.startsWith(`${abs}${path.sep}`)) {
        try { watched.close() } catch { void 0 }
        entry.dirs.delete(watchedAbs)
      }
    }
  })
  entry.dirs.set(abs, handle)
}

function watchGitTree(entry, abs) {
  if (entry.dirs.has(abs)) return
  try {
    attachWatcher(entry, abs, () => { entry.git = true; scheduleFlush(entry) })
  } catch { return }
  let entries
  try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return }
  for (const child of entries) {
    if (child.isDirectory() && !GIT_WATCH_SKIP.has(child.name)) watchGitTree(entry, path.join(abs, child.name))
  }
}

// .git top-level (HEAD/index/MERGE_HEAD live there) plus the refs subtree —
// enough to flag that a commit, checkout, or pull happened on any side.
function watchGit(entry, base) {
  const gitDir = path.join(base, '.git')
  if (entry.dirs.has(gitDir)) return
  try {
    attachWatcher(entry, gitDir, () => { entry.git = true; scheduleFlush(entry) })
  } catch { return } // not a repo — no git flagging needed
  watchGitTree(entry, path.join(gitDir, 'refs'))
}

function onSourceEvent(entry, dirAbs, dirRel, type, name) {
  const fileName = name == null ? '' : String(name)
  if (!fileName) return
  const rel = dirRel ? `${dirRel}/${fileName}` : fileName
  const abs = path.join(dirAbs, fileName)
  let stat = null
  try { stat = fs.statSync(abs) } catch { /* deleted or a dangling link */ }
  // A repository can be initialized after the watch started — `git init` and
  // clones land here as a brand-new `.git` dir that must start reporting.
  if (rel === '.git') {
    if (stat?.isDirectory()) watchGit(entry, entry.base)
    return
  }
  if (WATCH_SKIP.has(fileName)) return
  if (stat?.isDirectory()) {
    watchSourceTree(entry, abs, rel)
  } else if (type === 'rename' && !stat) {
    // Deleted or moved away — drop any watches still pointing at its subtree.
    for (const [watchedAbs, handle] of entry.dirs) {
      if (watchedAbs === abs || watchedAbs.startsWith(`${abs}${path.sep}`)) {
        try { handle.close() } catch { void 0 }
        entry.dirs.delete(watchedAbs)
      }
    }
  }
  entry.pending.set(rel, type === 'rename' ? 'rename' : 'change')
  scheduleFlush(entry)
}

function watchSourceTree(entry, abs, rel, depth = 0) {
  if (entry.dirs.has(abs) || depth > WATCH_MAX_DEPTH) return
  try {
    attachWatcher(entry, abs, (type, name) => onSourceEvent(entry, abs, rel, type, name))
  } catch { return }
  let entries
  try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return }
  for (const child of entries) {
    if (child.isDirectory() && !WATCH_SKIP.has(child.name)) {
      watchSourceTree(entry, path.join(abs, child.name), rel ? `${rel}/${child.name}` : child.name, depth + 1)
    }
  }
}

function watcherFor(base) {
  let entry = watchers.get(base)
  if (entry) return entry
  entry = { base, subscribers: new Map(), dirs: new Map(), pending: new Map(), git: false, timer: null, pins: 0 }
  watchers.set(base, entry)
  watchSourceTree(entry, base, '')
  watchGit(entry, base)
  return entry
}

// Watcher pins keep a workspace watched without any fs:changed subscriber —
// the activity feed and running agent sessions use them so disk changes are
// still logged while nobody has the file tree open.
function canonicalBase(workspace) {
  const resolved = path.resolve(String(workspace || ''))
  try { return fs.realpathSync(resolved) } catch { return resolved }
}
export function pinFsWatcher(workspace) {
  const entry = watcherFor(canonicalBase(workspace))
  entry.pins += 1
}
export function unpinFsWatcher(workspace) {
  const entry = watchers.get(canonicalBase(workspace))
  if (!entry) return
  entry.pins = Math.max(0, entry.pins - 1)
  if (!entry.pins && !entry.subscribers.size) teardownWatch(entry)
}

function realBase(requestedWorkspace, ctx) {
  const { base } = workspacePath(requestedWorkspace, '.', ctx)
  try { return fs.realpathSync(base) } catch { return base }
}

// One record per mutating op: unlike a bare watcher event this knows the
// acting user, and it keeps logging while no watcher is armed at all.
function logFsOp(ctx, workspace, op, files) {
  try {
    const base = realBase(workspace, ctx)
    markOp(base, ...files)
    recordActivity(base, 'fs', { op, files: files.slice(0, 8), user: ctx?.principal?.username || '' })
  } catch { /* logging must never fail the op */ }
}
async function existingPath(rel, requestedWorkspace, ctx) {
  const { base, resolved: lexical } = workspacePath(requestedWorkspace, rel, ctx)
  const resolved = lexical
  const real = await fs.promises.realpath(resolved)
  if (real !== base && !real.startsWith(`${base}${path.sep}`)) throw httpError(403, 'path outside workspace')
  return real
}

async function writablePath(rel, requestedWorkspace, ctx) {
  const { base, resolved } = workspacePath(requestedWorkspace, rel, ctx)
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
    async search(ctx, { query = '', maxResults = 100, workspace } = {}) {
      const needle = String(query).trim().toLowerCase()
      if (!needle) return []
      const results = []
      const seen = new Map()
      const root = workspacePath(workspace, '.', ctx).base
      const limit = Math.min(Math.max(Number(maxResults) || 100, 1), 500)
      // A query with no hits would otherwise read every file in the tree —
      // cap the traversal so one search cannot churn the disk indefinitely.
      const MAX_VISITED = 20_000
      let visited = 0
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
        if (results.length >= limit || visited >= MAX_VISITED) return
        let entries
        try { entries = await fs.promises.readdir(directory, { withFileTypes: true }) } catch { return }
        for (const entry of entries) {
          if (SEARCH_SKIP.has(entry.name)) continue
          visited += 1
          if (visited >= MAX_VISITED) return
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
    async list(ctx, { path: rel = '.', workspace } = {}) {
      const directory = await existingPath(rel, workspace, ctx)
      const entries = await fs.promises.readdir(directory, { withFileTypes: true })
      return entries
        .filter((entry) => !SKIP.has(entry.name))
        .sort((a, b) => {
          const directoryOrder = Number(b.isDirectory()) - Number(a.isDirectory())
          return directoryOrder || a.name.localeCompare(b.name)
        })
        .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
    },

    async read(ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const file = await existingPath(rel, workspace, ctx)
      const stat = await fs.promises.stat(file)
      if (!stat.isFile()) throw httpError(400, 'not a file')
      if (stat.size > 5_000_000) throw httpError(413, 'file too large')
      const content = await fs.promises.readFile(file)
      if (content.includes(0)) throw httpError(415, 'binary file')
      return { content: content.toString('utf8'), size: stat.size }
    },

    async write(ctx, { path: rel, content, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const file = await writablePath(rel, workspace, ctx)
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await fs.promises.writeFile(file, String(content ?? ''), 'utf8')
      logFsOp(ctx, workspace, 'write', [rel])
      return { ok: true }
    },

    async mkdir(ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      await fs.promises.mkdir(await writablePath(rel, workspace, ctx), { recursive: true })
      logFsOp(ctx, workspace, 'mkdir', [rel])
      return { ok: true }
    },

    async rename(ctx, { from, to, workspace } = {}) {
      if (!from || !to) throw httpError(400, 'from and to required')
      const source = await existingPath(from, workspace, ctx)
      if (source === workspacePath(workspace, '.', ctx).base) throw httpError(400, 'cannot rename workspace')
      const destination = await writablePath(to, workspace, ctx)
      await fs.promises.rename(source, destination)
      logFsOp(ctx, workspace, 'rename', [from, to])
      return { ok: true }
    },

    async delete(ctx, { path: rel, workspace } = {}) {
      if (!rel) throw httpError(400, 'path required')
      const target = await existingPath(rel, workspace, ctx)
      if (target === workspacePath(workspace, '.', ctx).base) throw httpError(400, 'cannot delete workspace')
      await fs.promises.rm(target, { recursive: true, force: true })
      logFsOp(ctx, workspace, 'delete', [rel])
      return { ok: true }
    },

    // Live view subscription: workspacePath() enforces the caller's project
    // allowlist, so a member can never watch a workspace they cannot open.
    watch(ctx, { workspace } = {}) {
      const entry = watcherFor(realBase(workspace, ctx))
      entry.subscribers.set(ctx, String(workspace || ''))
      return { watching: entry.dirs.size > 0 }
    },

    unwatch(ctx, { workspace } = {}) {
      const entry = watchers.get(realBase(workspace, ctx))
      if (entry) {
        entry.subscribers.delete(ctx)
        if (!entry.subscribers.size && !entry.pins) teardownWatch(entry)
      }
      return { watching: false }
    }
  },

  onClose(ctx) {
    for (const entry of watchers.values()) {
      if (entry.subscribers.delete(ctx) && !entry.subscribers.size && !entry.pins) teardownWatch(entry)
    }
  }
}
