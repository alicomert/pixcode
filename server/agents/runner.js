import fs from 'node:fs'
import path from 'node:path'
import pty from '@homebridge/node-pty-prebuilt-multiarch'
import { getAdapter } from './adapter.js'
import { config } from '../config.js'
import { httpError } from '../util/http.js'
import { enhancedEnv } from '../util/env.js'
import { workspaceCwd, workspaceRoot } from '../workspace.js'

const sessions = new Map()
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
  const data = { ...event, sessionId: session.sessionId, agent: session.state.agent, workspace: session.workspace, startedAt: session.startedAt, index: session.index, seq: ++session.sequence, ts: Date.now() }
  session.history.push(data)
  session.historyBytes += Buffer.byteLength(data.data || '')
  while (session.history.length > MAX_HISTORY_EVENTS || session.historyBytes > MAX_HISTORY_BYTES) {
    const removed = session.history.shift()
    session.historyBytes -= Buffer.byteLength(removed?.data || '')
  }
  for (const subscriber of session.subscribers) {
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
    env: await enhancedEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })
  session.term = term
  term.onData((data) => emit(session, { type: 'data', data }))
  term.onExit((exit) => handleExit(session, exit))
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
      persistSessions()
    })
    return
  }
  // A deliberately closed tab should not be resurrected in connected
  // clients by the asynchronous PTY exit event.
  if (!session.closed) emit(session, { type: 'done', role: 'system', exitCode, signal })
  session.state.status = 'stopped'
  session.closedAt = Date.now()
  persistSessions()
  setTimeout(() => {
    const current = sessions.get(session.sessionId)
    if (current && current.state.status !== 'running') sessions.delete(session.sessionId)
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
  if (resume) session.resumedAt = Date.now()
  emit(session, { type: 'status', role: 'system', status: 'started', agent: session.state.agent })
  persistSessions()
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
    resumedAt: 0
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
  // Attach PTY listeners before announcing startup so fast CLIs cannot emit
  // their first screen between spawn and the initial status event.
  emit(session, { type: 'status', role: 'system', status: 'started', agent })
  if (prompt) setTimeout(() => { if (session.state.status === 'running') session.term?.write(String(prompt) + '\r') }, 80)
  persistSessions()
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

function getOwnedSession(ctx, sessionId) {
  const session = sessions.get(sessionId)
  if (!session || session.owner !== ownerKey(ctx)) throw httpError(404, 'session not found')
  session.subscribers.add(ctx)
  return session
}

export function inputRunner(ctx, sessionId, data) {
  const session = getOwnedSession(ctx, sessionId)
  if (session.state.status !== 'running' || !session.term) throw httpError(404, 'session not running')
  if (data == null) return { ok: true }
  session.term.write(String(data))
  return { ok: true }
}

export function resizeRunner(ctx, sessionId, cols, rows) {
  const session = getOwnedSession(ctx, sessionId)
  const size = dimensions(cols, rows)
  session.size = size
  if (session.state.status !== 'running' || !session.term) return { ok: true }
  session.term.resize(size.cols, size.rows)
  return { ok: true }
}

export function sendToRunner(ctx, sessionId, text) {
  const session = getOwnedSession(ctx, sessionId)
  if (session.state.status !== 'running' || !session.term) throw httpError(404, 'session not running')
  if (!String(text || '').trim()) throw httpError(400, 'text required')
  session.term.write(String(text) + '\r')
  return { ok: true }
}

export function stopRunner(ctx, sessionId) {
  const session = getOwnedSession(ctx, sessionId)
  if (session.state.status === 'running' && session.term) {
    session.state.status = 'stopped'
    try { session.term.kill() } catch { void 0 }
  }
  return { ok: true }
}

// Closing a tab is stronger than stopping a process: remove the reconnectable
// session and its history so an explicit close cannot reappear after refresh.
export function closeRunner(ctx, sessionId) {
  const session = getOwnedSession(ctx, sessionId)
  session.closed = true
  if (session.state.status === 'running' && session.term) {
    try { session.term.kill() } catch { void 0 }
    session.state.status = 'stopped'
  }
  sessions.delete(sessionId)
  persistSessions()
  return { ok: true }
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
  const session = getOwnedSession(ctx, sessionId)
  return session.history
}
