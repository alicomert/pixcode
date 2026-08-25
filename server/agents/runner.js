import pty from 'node-pty'
import path from 'node:path'
import { config } from '../config.js'
import { getAdapter } from './adapter.js'
import { httpError } from '../util/http.js'

const sessions = new Map()
let counter = 0

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
  const data = { ...event, sessionId: session.sessionId, agent: session.state.agent, seq: ++session.sequence, ts: Date.now() }
  session.history.push(data)
  while (session.history.length > 4_000) session.history.shift()
  for (const subscriber of session.subscribers) {
    try { subscriber.emit('agent', 'session', data) } catch { session.subscribers.delete(subscriber) }
  }
}

function workspaceCwd(cwd) {
  const resolved = path.resolve(config.workspace, String(cwd || '.'))
  if (resolved !== config.workspace && !resolved.startsWith(`${config.workspace}${path.sep}`)) throw httpError(403, 'cwd outside workspace')
  return resolved
}

export function startRunner(ctx, { agent, prompt = '', cwd, cols = 100, rows = 30 } = {}) {
  const AdapterClass = getAdapter(agent)
  if (!AdapterClass) throw httpError(400, 'unknown agent')
  const sessionId = `s_${++counter}`
  const size = dimensions(cols, rows)
  const index = [...sessions.values()].filter((item) => item.owner === ownerKey(ctx) && item.state.agent === agent).length + 1
  const session = {
    sessionId,
    adapter: new AdapterClass(),
    state: { agent, cwd: workspaceCwd(cwd), status: 'running' },
    history: [],
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
    emit(session, { type: 'done', role: 'system', exitCode, signal })
    session.state.status = 'stopped'
    session.closedAt = Date.now()
    setTimeout(() => sessions.delete(sessionId), 24 * 60 * 60 * 1000).unref?.()
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

export function detachSubscriber(ctx) {
  for (const session of sessions.values()) {
    session.subscribers.delete(ctx)
  }
}

export function listSessions(ctx) {
  const own = [...sessions.values()].filter((session) => session.owner === ownerKey(ctx))
  return own.map((session) => {
    session.subscribers.add(ctx)
    return sessionInfo(session)
  })
}

export function getHistory(ctx, sessionId) {
  const session = getOwnedSession(ctx, sessionId)
  return session.history
}
