import pty from '@homebridge/node-pty-prebuilt-multiarch'
import { getAdapter } from './adapter.js'
import { httpError } from '../util/http.js'
import { workspaceCwd, workspaceRoot } from '../workspace.js'

const sessions = new Map()
let counter = 0
const MAX_HISTORY_EVENTS = 2_000
const MAX_HISTORY_BYTES = 2 * 1024 * 1024
const STOPPED_SESSION_TTL = 6 * 60 * 60 * 1_000

function ownerKey(ctx) {
  return `${String(ctx?.principal?.sub || 'owner')}:${String(ctx?.clientId || 'legacy')}`
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

export function startRunner(ctx, { agent, prompt = '', cwd, workspace, cols = 100, rows = 30 } = {}) {
  const AdapterClass = getAdapter(agent)
  if (!AdapterClass) throw httpError(400, 'unknown agent')
  const sessionId = `s_${++counter}`
  const size = dimensions(cols, rows)
  const requestedWorkspace = workspaceRoot(workspace)
  const index = nextSessionIndex(ctx, agent, requestedWorkspace)
  const session = {
    sessionId,
    adapter: new AdapterClass(),
    state: { agent, cwd: workspaceCwd(requestedWorkspace, cwd), status: 'running' },
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
    index
  }
  let args
  try {
    args = session.adapter.buildTerminalArgs({ prompt })
  } catch (error) {
    throw httpError(400, error.message || 'invalid agent arguments')
  }
  let term
  try {
    term = pty.spawn(AdapterClass.cli, args, {
      name: 'xterm-256color',
      ...size,
      cwd: session.state.cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    })
  } catch (error) {
    throw httpError(400, error.code === 'ENOENT' ? 'agent cli not found' : (error.message || 'agent process failed to start'))
  }
  session.term = term
  sessions.set(sessionId, session)
  term.onData((data) => emit(session, { type: 'data', data }))
  term.onExit(({ exitCode, signal }) => {
    // A deliberately closed tab should not be resurrected in connected
    // clients by the asynchronous PTY exit event.
    if (!session.closed) emit(session, { type: 'done', role: 'system', exitCode, signal })
    session.state.status = 'stopped'
    session.closedAt = Date.now()
    // Keep reconnectable output, but release the native PTY wrapper after exit.
    session.term = null
    setTimeout(() => sessions.delete(sessionId), STOPPED_SESSION_TTL).unref?.()
  })
  // Attach PTY listeners before announcing startup so fast CLIs cannot emit
  // their first screen between spawn and the initial status event.
  emit(session, { type: 'status', role: 'system', status: 'started', agent })
  if (prompt) setTimeout(() => { if (session.state.status === 'running') term.write(String(prompt) + '\r') }, 80)
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
  if (session.state.status !== 'running' || !session.term) return { ok: true }
  const size = dimensions(cols, rows)
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
    try { session.term.kill() } catch { void 0 }
    session.state.status = 'stopped'
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
  return { ok: true }
}

export function detachSubscriber(ctx) {
  for (const session of sessions.values()) {
    session.subscribers.delete(ctx)
  }
}

export function listSessions(ctx, requestedWorkspace) {
  const workspace = requestedWorkspace ? workspaceRoot(requestedWorkspace) : ''
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
