import { spawn } from 'node:child_process'
import path from 'node:path'
import { config } from '../config.js'
import { getAdapter } from './adapter.js'
import { httpError } from '../util/http.js'

const sessions = new Map()
let counter = 0

function emit(session, event) {
  const data = { ...event, sessionId: session.sessionId, ts: Date.now() }
  session.history.push(data)
  if (session.history.length > 2_000) session.history.shift()
  session.emit('agent', 'session', data)
}

function spawnErrorMessage(error) {
  if (error.code === 'ENOENT') return 'agent cli not found'
  return error.message || 'agent process failed to start'
}

function workspaceCwd(cwd) {
  const resolved = path.resolve(config.workspace, String(cwd || '.'))
  if (resolved !== config.workspace && !resolved.startsWith(`${config.workspace}${path.sep}`)) throw httpError(403, 'cwd outside workspace')
  return resolved
}

function flushLines(session, chunk, final = false) {
  session.state.buffer += chunk
  const lines = session.state.buffer.split(/\r?\n/)
  session.state.buffer = final ? '' : lines.pop()
  for (const line of lines) {
    if (!line) continue
    session.state.lines.push(line)
    try {
      const events = session.adapter.normalizeLine(line, session.state) || []
      for (const event of events) emit(session, event)
    } catch (error) {
      emit(session, { type: 'error', role: 'system', message: error.message })
    }
  }
}

export function startRunner(ctx, { agent, prompt = '', cwd } = {}) {
  const AdapterClass = getAdapter(agent)
  if (!AdapterClass) throw httpError(400, 'unknown agent')
  const sessionId = `s_${++counter}`
  const session = {
    sessionId,
    adapter: new AdapterClass(),
    state: { agent, cwd: workspaceCwd(cwd), buffer: '', lines: [] },
    history: [],
    emit: ctx.emit,
    child: null
  }
  let args
  try {
    args = session.adapter.buildArgs({ prompt })
  } catch (error) {
    throw httpError(400, error.message || 'invalid agent arguments')
  }
  const child = spawn(AdapterClass.cli, args, {
    cwd: session.state.cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  session.child = child
  sessions.set(sessionId, session)
  emit(session, { type: 'status', role: 'system', status: 'started', agent })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => flushLines(session, chunk))
  child.stderr.on('data', (chunk) => emit(session, { type: 'message', role: 'system', text: chunk.toString() }))
  child.once('error', (error) => emit(session, { type: 'error', role: 'system', message: spawnErrorMessage(error) }))
  child.once('exit', (code, signal) => {
    if (session.state.buffer) flushLines(session, '', true)
    emit(session, { type: 'done', role: 'system', exitCode: code, signal })
    session.state.status = 'stopped'
    session.closedAt = Date.now()
    setTimeout(() => sessions.delete(sessionId), 5 * 60 * 1000).unref?.()
  })

  if (prompt && AdapterClass.interactive) child.stdin.write(session.adapter.buildUserFrame(prompt))
  return { sessionId }
}

export function sendToRunner(ctx, sessionId, text) {
  const session = sessions.get(sessionId)
  if (!session || !session.child || session.child.exitCode !== null) throw httpError(404, 'session not found')
  if (!String(text || '').trim()) throw httpError(400, 'text required')
  if (!session.adapter.constructor.interactive) {
    return startRunner(ctx, { agent: session.state.agent, prompt: String(text), cwd: session.state.cwd })
  }
  session.child.stdin.write(session.adapter.buildUserFrame(String(text)))
  emit(session, { type: 'message', role: 'user', text: String(text) })
  return { ok: true }
}

export function stopRunner(_ctx, sessionId) {
  const session = sessions.get(sessionId)
  if (session?.child && session.child.exitCode === null) {
    try { session.child.kill('SIGTERM') } catch { void 0 }
    session.state.status = 'stopped'
  }
  return { ok: true }
}

export function listSessions() {
  return [...sessions.values()].map((session) => ({
    sessionId: session.sessionId,
    agent: session.state.agent,
    status: session.state.status || 'running',
    startedAt: session.history[0]?.ts || Date.now()
  }))
}

export function getHistory(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) throw httpError(404, 'session not found')
  return session.history
}
