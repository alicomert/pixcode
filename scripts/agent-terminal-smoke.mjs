import WebSocket from 'ws'

const BASE = process.env.BASE || 'http://127.0.0.1:3231'
const password = process.env.PIXCODE_SMOKE_PASSWORD || 'secret123'

async function request(path, options) {
  const response = await fetch(`${BASE}${path}`, options)
  const data = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${data.error || 'request failed'}`)
  return data
}

const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password })
})
const baseWsUrl = BASE.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(login.token)}`

function connect(client = 'agent-smoke-client') {
  const socket = new WebSocket(`${baseWsUrl}&client=${client}`)
  let count = 0
  const pending = new Map()
  socket.on('message', (raw) => {
    const frame = JSON.parse(raw.toString())
    if (!frame.id || !pending.has(frame.id)) return
    const item = pending.get(frame.id)
    pending.delete(frame.id)
    frame.ok ? item.resolve(frame.data) : item.reject(new Error(frame.error || 'request failed'))
  })
  const ready = new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  function call(ch, op, data = {}) {
    const id = `agent_smoke_${++count}`
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ ch, op, id, data })) })
  }
  return { socket, ready, call }
}

const first = connect()
await first.ready
const agents = await first.call('agent', 'agents')
const available = agents.find((agent) => agent.available)
if (!available) throw new Error('no available agent cli')
const one = await first.call('agent', 'start', { agent: available.id, cols: 80, rows: 24 })
const two = await first.call('agent', 'start', { agent: available.id, cols: 80, rows: 24 })
if (one.sessionId === two.sessionId) throw new Error('sessions were not independent')
await new Promise((resolve) => setTimeout(resolve, 800))
first.socket.close()

const second = connect()
await second.ready
const sessions = await second.call('agent', 'sessions')
if (!sessions.some((session) => session.sessionId === one.sessionId) || !sessions.some((session) => session.sessionId === two.sessionId)) throw new Error('sessions did not survive reconnect')
const history = await second.call('agent', 'history', { sessionId: one.sessionId })
if (!history.length) throw new Error('terminal history missing')
await second.call('agent', 'stop', { sessionId: one.sessionId })
await second.call('agent', 'stop', { sessionId: two.sessionId })
second.socket.close()
console.log('AGENT TERMINAL SMOKE OK')
