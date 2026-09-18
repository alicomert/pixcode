import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { accessAlive } from './auth.js'

// Per-workspace activity log: a JSONL file under $PIXCODE_HOME/activity that
// records who did what — file changes, terminal and agent lifecycles, git
// operations — so the Activity view can answer "what happened here" without
// a database. Kept small by halving the file once it passes MAX_BYTES.
const MAX_BYTES = 256 * 1024
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

// realpath(workspace) -> Map<ctx, workspaceArg> — same subscription shape as
// the fs watcher: callers report with resolved paths, subscribers keep the
// workspace id their client understands.
const subscribers = new Map()

// Every caller reports with a different workspace form (raw request arg,
// resolved path, realpath); one canonical key keeps records and subscribers
// on the same file even when the workspace sits behind a symlink.
const canonicalPaths = new Map()
function canonicalize(workspace) {
  const key = String(workspace || '')
  let real = canonicalPaths.get(key)
  if (real === undefined) {
    try { real = fs.realpathSync(key) } catch { real = key }
    canonicalPaths.set(key, real)
  }
  return real
}

function fileFor(workspace) {
  const key = crypto.createHash('sha1').update(String(workspace)).digest('hex').slice(0, 16)
  return { dir: path.join(config.dataDir, 'activity'), file: path.join(config.dataDir, 'activity', `${key}.jsonl`) }
}

export function recordActivity(workspace, kind, detail = {}) {
  if (!workspace) return
  workspace = canonicalize(workspace)
  const entry = { ts: Date.now(), kind: String(kind || 'info'), ...detail }
  const { dir, file } = fileFor(workspace)
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 })
    const stat = fs.statSync(file)
    if (stat.size > MAX_BYTES) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      fs.writeFileSync(file, `${lines.slice(-Math.floor(lines.length / 2)).join('\n')}\n`, { mode: 0o600 })
    }
  } catch { /* the log is best-effort; a write failure must not break the op */ }
  const set = subscribers.get(workspace)
  if (!set) return
  for (const [ctx, workspaceArg] of set) {
    // Revoked accounts stop receiving activity even with a socket open.
    if (!accessAlive(ctx)) { set.delete(ctx); continue }
    try { ctx.emit('activity', 'event', { workspace: workspaceArg, entry }) } catch { set.delete(ctx) }
  }
  if (!set.size) subscribers.delete(workspace)
}

export function listActivity(workspace, limit = DEFAULT_LIMIT) {
  const { file } = fileFor(canonicalize(workspace))
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) } catch { return [] }
  const count = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const entries = []
  for (const line of lines.slice(-count)) {
    try { entries.push(JSON.parse(line)) } catch { void 0 }
  }
  return entries.reverse()
}

export function subscribeActivity(workspace, ctx, workspaceArg) {
  workspace = canonicalize(workspace)
  if (!subscribers.has(workspace)) subscribers.set(workspace, new Map())
  subscribers.get(workspace).set(ctx, String(workspaceArg || ''))
}

export function unsubscribeActivity(workspace, ctx) {
  const set = subscribers.get(canonicalize(workspace))
  if (!set) return
  set.delete(ctx)
  if (!set.size) subscribers.delete(workspace)
}

export function detachActivitySubscriber(ctx) {
  for (const [workspace, set] of subscribers) {
    set.delete(ctx)
    if (!set.size) subscribers.delete(workspace)
  }
}
