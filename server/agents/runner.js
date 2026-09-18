import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import pty from '@homebridge/node-pty-prebuilt-multiarch'
import { getAdapter } from './adapter.js'
import { config } from '../config.js'
import { httpError } from '../util/http.js'
import { enhancedEnv } from '../util/env.js'
import { cliEnvFor } from '../cli-env.js'
import { accessAlive, accessFor, listUsers } from '../auth.js'
import { workspaceCwd, workspaceRoot } from '../workspace.js'
import { recordActivity } from '../activity.js'
import { pinFsWatcher, unpinFsWatcher } from '../channels/fs.channel.js'
import { tailFromHistory, writeHandoff } from '../handoffs.js'
import { notifyWebhook } from '../notify.js'

const execFileAsync = promisify(execFile)

const sessions = new Map()
const CHANGED_FILES_CACHE_MS = 4_000
const changedFilesCache = new Map()

// Presence fan-out is wired by index.js once the WS hub exists; the runner
// announces lifecycle changes and the hub relays them to every client.
let presenceNotifier = null
export function setPresenceNotifier(fn) { presenceNotifier = fn }
function announcePresence() { try { presenceNotifier?.() } catch { void 0 } }

let counter = 0
const MAX_HISTORY_EVENTS = 2_000
const MAX_HISTORY_BYTES = 2 * 1024 * 1024
const STOPPED_SESSION_TTL = 6 * 60 * 60 * 1_000
const AUTO_RESTART_MIN_UPTIME_MS = 10_000
const RESUME_FAST_EXIT_MS = 4_000
const REGISTRY_FILE = path.join(config.dataDir, 'agent-sessions.json')

// Agent PTYs are children of this process, so a service restart kills them
// all. The registry records which sessions were running so the next boot can
// respawn them and reconnecting clients find their tabs alive again.
const persisted = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'))
    counter = Math.max(counter, Number(raw?.counter) || 0)
    return Array.isArray(raw?.sessions) ? raw.sessions : []
  } catch { return [] }
})()

function persistSessions() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify({
      counter,
      sessions: [...sessions.values()].map((session) => ({
        sessionId: session.sessionId,
        agent: session.state.agent,
        workspace: session.workspace,
        cwd: session.state.cwd,
        owner: session.owner,
        index: session.index,
        startedAt: session.startedAt,
        status: session.state.status
      }))
    }), { mode: 0o600 })
  } catch { /* the registry is best-effort; sessions keep working without it */ }
}

// Sessions belong to the account, not the browser tab: a phone, a laptop, and
// a second tab all attach to the same running agents and see the same output.
// Per-user still isolates members from each other.
function ownerKey(ctx) {
  return String(ctx?.principal?.sub || 'owner')
}

// Older builds stored `sub:clientId`; strip the client suffix so sessions
// recorded before per-user ownership still reattach after an upgrade.
function normalizeOwner(owner) {
  return String(owner || 'owner').split(':')[0] || 'owner'
}

function dimensions(cols, rows) {
  return {
    cols: Math.min(Math.max(Number(cols) || 100, 20), 500),
    rows: Math.min(Math.max(Number(rows) || 30, 5), 200)
  }
}

function emit(session, event) {
  if (session.closed) return
  const data = { ...event, sessionId: session.sessionId, agent: session.state.agent, workspace: session.workspace, startedAt: session.startedAt, index: session.index, owner: session.owner, seq: ++session.sequence, ts: Date.now() }
  session.history.push(data)
  session.historyBytes += Buffer.byteLength(data.data || '')
  while (session.history.length > MAX_HISTORY_EVENTS || session.historyBytes > MAX_HISTORY_BYTES) {
    const removed = session.history.shift()
    session.historyBytes -= Buffer.byteLength(removed?.data || '')
  }
  for (const subscriber of session.subscribers) {
    // A revoked account must go quiet even while its socket is still open —
    // drop subscribers whose access died instead of streaming them output.
    if (!accessAlive(subscriber)) { session.subscribers.delete(subscriber); continue }
    try { subscriber.emit('agent', 'session', data) } catch { session.subscribers.delete(subscriber) }
  }
}

function nextSessionIndex(ctx, agent, currentWorkspace) {
  const active = [...sessions.values()]
    .filter((item) => item.owner === ownerKey(ctx) && item.workspace === currentWorkspace && item.state.agent === agent && item.state.status === 'running' && !item.closed)
  // Keep labels stable while any live session remains. Closing #1 while #2
  // is open therefore makes the next session #3; once all live sessions are
  // gone, numbering starts over at #1.
  return active.reduce((highest, item) => Math.max(highest, Number(item.index) || 0), 0) + 1
}

async function spawnTerm(session, args) {
  const AdapterClass = getAdapter(session.state.agent)
  const term = pty.spawn(AdapterClass.cli, args, {
    name: 'xterm-256color',
    ...session.size,
    cwd: session.state.cwd,
    env: await enhancedEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor', ...(cliEnvFor(session.owner) || {}) })
  })
  session.term = term
  term.onData((data) => emit(session, { type: 'data', data }))
  term.onExit((exit) => handleExit(session, exit))
}

// A running session pins the workspace fs watcher so the activity log keeps
// recording the agent's file changes even while no client has the tree open.
function pinSessionWorkspace(session) {
  if (session.watcherPinned || !session.workspace) return
  try { pinFsWatcher(session.workspace); session.watcherPinned = true } catch { void 0 }
}
function unpinSessionWorkspace(session) {
  if (!session.watcherPinned) return
  session.watcherPinned = false
  try { unpinFsWatcher(session.workspace) } catch { void 0 }
}

// A stopping session archives a Markdown handoff into the workspace so the
// next session — any CLI, any user — can read what changed and continue.
async function archiveHandoff(session) {
  try {
    const files = await changedFilesFor(session)
    let branch = ''
    try {
      const { stdout } = await execFileAsync('git', ['-C', sessionCwd(session), 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 })
      branch = stdout.trim()
    } catch { branch = '' }
    const name = writeHandoff(session, { files, branch, tail: tailFromHistory(session.history) })
    if (name) {
      recordActivity(session.workspace, 'agent', { action: 'handoff', agent: session.state.agent, index: session.index, files: [`.pixcode/handoffs/${name}`], user: session.ownerName })
      notifyWebhook('agent.handoff', {
        title: `${session.state.agent} #${session.index || 1} wrote a handoff`,
        body: `${files.length} changed file${files.length === 1 ? '' : 's'}${session.ownerName ? ` · ${session.ownerName}` : ''}`,
        workspace: session.workspace
      })
    }
  } catch { /* handoffs are best-effort */ }
}

function handleExit(session, { exitCode, signal }) {
  session.term = null
  // A resume attempt that dies instantly probably used a flag this CLI does
  // not understand — retry once with plain arguments instead of leaving a
  // dead tab behind.
  const resumeFailed = !session.closed && session.resumedAt && Date.now() - session.resumedAt < RESUME_FAST_EXIT_MS && exitCode !== 0
  // A long-running process that dies on a non-zero exit was crashed or killed
  // by an error, not deliberately quit. Give it one automatic restart.
  const crashed = !session.closed && !session.autoRestarted && session.state.status === 'running'
    && !signal && exitCode != null && exitCode !== 0
    && Date.now() - session.startedAt > AUTO_RESTART_MIN_UPTIME_MS
  if (resumeFailed || crashed) {
    if (crashed) session.autoRestarted = true
    session.resumedAt = 0
    respawnSession(session, { resume: false }).catch(() => {
      session.state.status = 'stopped'
      session.closedAt = Date.now()
      unpinSessionWorkspace(session)
      void archiveHandoff(session)
      persistSessions()
    })
    return
  }
  // A deliberately closed tab should not be resurrected in connected
  // clients by the asynchronous PTY exit event.
  if (!session.closed) emit(session, { type: 'done', role: 'system', exitCode, signal })
  session.state.status = 'stopped'
  session.closedAt = Date.now()
  unpinSessionWorkspace(session)
  void archiveHandoff(session)
  recordActivity(session.workspace, 'agent', { action: 'exit', agent: session.state.agent, index: session.index, exitCode, user: session.ownerName })
  notifyWebhook('agent.exit', {
    title: `${session.state.agent} #${session.index || 1} finished`,
    body: `session ended (code ${exitCode ?? '?'})${session.ownerName ? ` · ${session.ownerName}` : ''}`,
    workspace: session.workspace
  })
  persistSessions()
  announcePresence()
  setTimeout(() => {
    const current = sessions.get(session.sessionId)
    if (current && current.state.status !== 'running') {
      sessions.delete(session.sessionId)
      changedFilesCache.delete(session.sessionId)
    }
  }, STOPPED_SESSION_TTL).unref?.()
}

async function respawnSession(session, { resume } = {}) {
  let args = null
  if (resume) {
    try { args = session.adapter.buildResumeArgs?.() || null } catch { args = null }
  }
  if (!args) args = session.adapter.buildTerminalArgs({ prompt: '' })
  emit(session, {
    type: 'data',
    data: `\r\n\x1b[2m[pixcode] ${resume ? 'server restarted — resuming this agent session' : 'agent process exited unexpectedly — restarting it'}\x1b[0m\r\n`
  })
  await spawnTerm(session, args)
  session.state.status = 'running'
  session.startedAt = Date.now()
  pinSessionWorkspace(session)
  if (resume) session.resumedAt = Date.now()
  emit(session, { type: 'status', role: 'system', status: 'started', agent: session.state.agent })
  persistSessions()
  announcePresence()
}

// Called once at server startup: sessions recorded as running when the last
// process died are respawned under their original ids so reconnecting
// clients reattach transparently. Stopped records are dropped — the UI's
// auto-close policy only ever applies to non-running sessions.
export async function restoreSessions() {
  for (const record of persisted) {
    if (record.status !== 'running' || sessions.has(record.sessionId)) continue
    const AdapterClass = getAdapter(record.agent)
    if (!AdapterClass) continue
    const session = {
      sessionId: record.sessionId,
      adapter: new AdapterClass(),
      state: { agent: record.agent, cwd: record.cwd || workspaceCwd(record.workspace, ''), status: 'running' },
      workspace: record.workspace || '',
      history: [],
      historyBytes: 0,
      sequence: 0,
      owner: normalizeOwner(record.owner),
      subscribers: new Set(),
      term: null,
      startedAt: record.startedAt || Date.now(),
      index: Number(record.index) || 0,
      size: dimensions(100, 30),
      autoRestarted: false,
      resumedAt: 0
    }
    sessions.set(session.sessionId, session)
    try {
      await respawnSession(session, { resume: true })
    } catch {
      session.state.status = 'stopped'
      session.closedAt = Date.now()
      emit(session, { type: 'data', data: '\r\n\x1b[2m[pixcode] could not restart this agent after a server restart\x1b[0m\r\n' })
      persistSessions()
    }
  }
}

export async function startRunner(ctx, { agent, prompt = '', cwd, workspace, cols = 100, rows = 30 } = {}) {
  const AdapterClass = getAdapter(agent)
  if (!AdapterClass) throw httpError(400, 'unknown agent')
  const sessionId = `s_${++counter}`
  const requestedWorkspace = workspaceRoot(workspace, ctx)
  const index = nextSessionIndex(ctx, agent, requestedWorkspace)
  const session = {
    sessionId,
    adapter: new AdapterClass(),
    state: { agent, cwd: workspaceCwd(requestedWorkspace, cwd, ctx), status: 'running' },
    // Capture the workspace at spawn time. Selecting another workspace must
    // never move or terminate an already running agent process.
    workspace: requestedWorkspace,
    history: [],
    historyBytes: 0,
    sequence: 0,
    owner: ownerKey(ctx),
    subscribers: new Set([ctx]),
    term: null,
    startedAt: Date.now(),
    index,
    size: dimensions(cols, rows),
    autoRestarted: false,
    resumedAt: 0,
    ownerName: ctx?.principal?.username || ownerKey(ctx)
  }
  let args
  try {
    args = session.adapter.buildTerminalArgs({ prompt })
  } catch (error) {
    throw httpError(400, error.message || 'invalid agent arguments')
  }
  try {
    await spawnTerm(session, args)
  } catch (error) {
    throw httpError(400, error.code === 'ENOENT' ? 'agent cli not found' : (error.message || 'agent process failed to start'))
  }
  sessions.set(sessionId, session)
  pinSessionWorkspace(session)
  // Attach PTY listeners before announcing startup so fast CLIs cannot emit
  // their first screen between spawn and the initial status event.
  emit(session, { type: 'status', role: 'system', status: 'started', agent })
  if (prompt) setTimeout(() => { if (session.state.status === 'running') session.term?.write(String(prompt) + '\r') }, 80)
  recordActivity(requestedWorkspace, 'agent', { action: 'start', agent, index, user: session.ownerName })
  persistSessions()
  announcePresence()
  return sessionInfo(session)
}

function sessionInfo(session) {
  return {
    sessionId: session.sessionId,
    agent: session.state.agent,
    status: session.state.status,
    startedAt: session.startedAt,
    index: session.index,
    workspace: session.workspace,
    cwd: session.state.cwd,
    pid: session.term?.pid || null
  }
}

function usernamesById() {
  try { return new Map(listUsers().map((user) => [String(user.id), user.username])) } catch { return new Map() }
}

// Read access: the owner, any admin, or a context that explicitly watched the
// session. Write access: the owner or an admin only — a member can watch an
// admin's terminal but can never type into it.
function getSession(ctx, sessionId, { write = false } = {}) {
  const session = sessions.get(sessionId)
  if (!session || session.closed) throw httpError(404, 'session not found')
  // A disabled/deleted owner loses live control too — session ownership is
  // not a bypass around mid-session revocation.
  const access = accessFor(ctx)
  if (!access) throw httpError(401, 'session revoked')
  if (session.owner === ownerKey(ctx)) {
    session.subscribers.add(ctx)
    return session
  }
  if (access.admin) {
    session.subscribers.add(ctx)
    return session
  }
  if (!write && session.subscribers.has(ctx)) return session
  throw httpError(404, 'session not found')
}

export function inputRunner(ctx, sessionId, data) {
  const session = getSession(ctx, sessionId, { write: true })
  if (session.state.status !== 'running' || !session.term) throw httpError(404, 'session not running')
  if (data == null) return { ok: true }
  session.term.write(String(data))
  return { ok: true }
}

export function resizeRunner(ctx, sessionId, cols, rows) {
  const session = sessions.get(sessionId)
  if (!session || session.closed) throw httpError(404, 'session not found')
  if (!accessFor(ctx)) throw httpError(401, 'session revoked')
  // A viewer never resizes the owner's PTY — the watcher's viewport adapts
  // to the session's dimensions, not the other way around.
  if (session.owner !== ownerKey(ctx)) return { ok: true }
  const size = dimensions(cols, rows)
  session.size = size
  if (session.state.status !== 'running' || !session.term) return { ok: true }
  session.term.resize(size.cols, size.rows)
  return { ok: true }
}

export function sendToRunner(ctx, sessionId, text) {
  const session = getSession(ctx, sessionId, { write: true })
  if (session.state.status !== 'running' || !session.term) throw httpError(404, 'session not running')
  if (!String(text || '').trim()) throw httpError(400, 'text required')
  session.term.write(String(text) + '\r')
  return { ok: true }
}

export function stopRunner(ctx, sessionId) {
  const session = getSession(ctx, sessionId, { write: true })
  if (session.state.status === 'running' && session.term) {
    session.state.status = 'stopped'
    try { session.term.kill() } catch { void 0 }
  }
  announcePresence()
  return { ok: true }
}

// Closing a tab is stronger than stopping a process: remove the reconnectable
// session and its history so an explicit close cannot reappear after refresh.
export function closeRunner(ctx, sessionId) {
  const session = getSession(ctx, sessionId, { write: true })
  session.closed = true
  if (session.state.status === 'running' && session.term) {
    try { session.term.kill() } catch { void 0 }
    session.state.status = 'stopped'
  }
  sessions.delete(sessionId)
  changedFilesCache.delete(sessionId)
  persistSessions()
  announcePresence()
  return { ok: true }
}

// Live sessions owned by other accounts — the presence strip under the agent
// terminal header. Everyone signed in may see who is working; writing into a
// foreign session still requires admin rights (enforced per op above).
export function listPresence(ctx) {
  const me = ownerKey(ctx)
  const names = usernamesById()
  return [...sessions.values()]
    .filter((session) => !session.closed && session.state.status === 'running' && session.owner !== me)
    .map((session) => ({ ...sessionInfo(session), owner: session.owner, ownerName: names.get(session.owner) || session.owner }))
}

// Watching subscribes this connection to a foreign session's live output and
// unlocks its history read. It grants no write access by itself.
export function watchRunner(ctx, sessionId) {
  const session = sessions.get(sessionId)
  if (!session || session.closed) throw httpError(404, 'session not found')
  session.subscribers.add(ctx)
  const names = usernamesById()
  return { ...sessionInfo(session), owner: session.owner, ownerName: names.get(session.owner) || session.owner }
}

export function unwatchRunner(ctx, sessionId) {
  const session = sessions.get(sessionId)
  if (session && session.owner !== ownerKey(ctx)) session.subscribers.delete(ctx)
  return { ok: true }
}

function sessionCwd(session) {
  const cwd = path.resolve(String(session.state.cwd || session.workspace || '.'))
  const root = path.resolve(String(session.workspace || cwd))
  return cwd === root || cwd.startsWith(root + path.sep) ? cwd : root
}

function parseChangedFiles(output) {
  const files = []
  const entries = output.split('\0').filter(Boolean)
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const status = entry.slice(0, 2).trim() || '?'
    const filePath = entry.slice(3)
    if (!filePath) continue
    files.push({ path: filePath, status })
    // In -z porcelain, renames/copies emit a second entry holding the source
    // path — skip it so it does not surface as a changed file.
    if (/[RC]/.test(status)) index++
  }
  return files.slice(0, 80)
}

async function changedFilesFor(session) {
  const cached = changedFilesCache.get(session.sessionId)
  if (cached && Date.now() - cached.ts < CHANGED_FILES_CACHE_MS) return cached.files
  let files = []
  try {
    const { stdout } = await execFileAsync('git', ['-C', sessionCwd(session), 'status', '--porcelain=v1', '-z', '--untracked-files=normal'], {
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    files = parseChangedFiles(stdout)
  } catch { files = [] }
  changedFilesCache.set(session.sessionId, { ts: Date.now(), files })
  return files
}

export async function listChangedFiles(ctx, sessionId) {
  getSession(ctx, sessionId)
  return changedFilesFor(sessions.get(sessionId))
}

export function detachSubscriber(ctx) {
  for (const session of sessions.values()) {
    session.subscribers.delete(ctx)
  }
}

export function listSessions(ctx, requestedWorkspace) {
  const workspace = requestedWorkspace ? workspaceRoot(requestedWorkspace, ctx) : ''
  const own = [...sessions.values()].filter((session) => session.owner === ownerKey(ctx) && (!workspace || session.workspace === workspace))
  return own.map((session) => {
    session.subscribers.add(ctx)
    return sessionInfo(session)
  })
}

export function getHistory(ctx, sessionId) {
  const session = getSession(ctx, sessionId)
  return session.history
}
