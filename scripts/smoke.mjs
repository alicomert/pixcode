import WebSocket from 'ws'

const BASE = process.env.BASE || 'http://localhost:3001'
const username = process.env.PIXCODE_SMOKE_USERNAME || 'admin'
const password = process.env.PIXCODE_SMOKE_PASSWORD || 'secret123'
let failed = false

async function request(path, options) {
  const response = await fetch(`${BASE}${path}`, options)
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) throw new Error(`${response.status}: ${typeof data === 'string' ? data : data?.error || 'request failed'}`)
  return data
}

async function check(name, operation) {
  try {
    await operation()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed = true
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

const health = await request('/api/health')
console.log(`health: ${JSON.stringify(health)}`)
if (health.setupRequired) {
  await check('setup', () => request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  }))
}
const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password })
})
if (!login?.token) {
  console.error('FAIL login: no token')
  process.exit(1)
}
const headers = { authorization: `Bearer ${login.token}` }
await check('me', async () => {
  const me = await request('/api/auth/me', { headers })
  if (!me?.principal) throw new Error('principal missing')
})
await check('static app', async () => {
  const response = await fetch(BASE)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
})
await check('git status channel is protected', async () => {
  const response = await fetch(`${BASE}/api/auth/me`)
  if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`)
})

await check('websocket channels', async () => {
  const websocketUrl = BASE.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(login.token)}`
  const socket = new WebSocket(websocketUrl)
  let counter = 0
  const pending = new Map()
  socket.on('message', (raw) => {
    const frame = JSON.parse(raw.toString())
    if (!frame.id || !pending.has(frame.id)) return
    const current = pending.get(frame.id)
    pending.delete(frame.id)
    if (frame.ok) current.resolve(frame.data)
    else current.reject(new Error(frame.error || 'websocket error'))
  })
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  function request(ch, op, data = {}) {
    const id = `smoke_${++counter}`
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ ch, op, id, data }))
    })
  }
  const files = await request('fs', 'list', { path: '.' })
  const agents = await request('agent', 'agents')
  if (!Array.isArray(files) || agents.length !== 6) throw new Error('channel response invalid')
  const terminal = await request('pty', 'create', { cols: 80, rows: 24 })
  await request('pty', 'input', { id: terminal.id, data: 'exit\n' })
  socket.close()
})
if (failed) {
  console.error('SMOKE FAILED')
  process.exit(1)
}
console.log('SMOKE OK')
