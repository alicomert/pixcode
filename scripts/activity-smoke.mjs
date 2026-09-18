import WebSocket from 'ws'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sign } from '../server/util/jwt.js'

// Activity channel smoke test: hits a running server on BASE (default :3001)
// with a token minted from $PIXCODE_HOME/auth.json. Verifies that fs/pty
// operations are recorded and pushed to activity watchers.
const BASE = process.env.BASE || 'http://localhost:3001'
const PIXCODE_HOME = process.env.PIXCODE_HOME || join(homedir(), '.pixcode')
const auth = JSON.parse(readFileSync(join(PIXCODE_HOME, 'auth.json'), 'utf8'))
const token = sign(
  { sub: 'owner', role: 'owner', username: auth.username || 'admin' },
  auth.secret,
  5 * 60 * 1000
)

const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?token=${token}`
const sock = new WebSocket(wsUrl)
let seq = 0
const pending = new Map()
const events = []
const results = []
const check = (name, ok) => {
  results.push([name, ok])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
}

function request(ch, op, data = {}) {
  return new Promise((resolve, reject) => {
    const id = `${seq++}`
    pending.set(id, { resolve, reject })
    sock.send(JSON.stringify({ ch, id, op, data }))
    setTimeout(() => reject(new Error(`timeout ${ch}.${op}`)), 8000)
  })
}

sock.on('message', (raw) => {
  const msg = JSON.parse(raw)
  if (msg.id !== undefined && pending.has(String(msg.id))) {
    const { resolve, reject } = pending.get(String(msg.id))
    pending.delete(String(msg.id))
    if (msg.ok === false || msg.error) reject(new Error(msg.error || 'op failed'))
    else resolve(msg)
    return
  }
  if (msg.ch && msg.ev) events.push(msg)
})

await new Promise((resolve) => sock.once('open', resolve))

const wsPath = process.env.SMOKE_WS || '/tmp/px-activity-ws'
mkdirSync(wsPath, { recursive: true })
await request('project', 'open', { path: wsPath })

await request('activity', 'watch', { workspace: wsPath })
check('activity.watch accepted', true)

await request('fs', 'write', { workspace: wsPath, path: 'hello.txt', content: 'hi' })
await new Promise((r) => setTimeout(r, 500))
const fsEvent = events.find((m) => m.ch === 'activity' && m.data?.entry?.kind === 'fs')
check('fs change recorded + pushed', !!fsEvent && !!fsEvent.data.entry.files?.includes('hello.txt'))

const history = await request('activity', 'list', { workspace: wsPath })
check('list returns records', Array.isArray(history.data?.entries) && history.data.entries.some((i) => i.kind === 'fs'))

const pty = await request('pty', 'create', { workspace: wsPath, cols: 80, rows: 24 })
await new Promise((r) => setTimeout(r, 400))
check('pty open recorded', events.some((m) => m.ch === 'activity' && m.data?.entry?.kind === 'pty' && m.data?.entry?.action === 'open'))
const ptyId = pty.data?.id || pty.id
await request('pty', 'kill', { id: ptyId })
await new Promise((r) => setTimeout(r, 600))
check('pty exit recorded', events.some((m) => m.ch === 'activity' && m.data?.entry?.kind === 'pty' && m.data?.entry?.action === 'exit'))

await request('activity', 'unwatch', { workspace: wsPath })
events.length = 0
await request('fs', 'write', { workspace: wsPath, path: 'bye.txt', content: 'x' })
await new Promise((r) => setTimeout(r, 500))
check('unwatch silences events', !events.some((m) => m.ch === 'activity'))

await request('activity', 'unwatch', { workspace: wsPath })
check('unwatch idempotent', true)

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
sock.close()
process.exit(failed.length ? 1 : 0)
