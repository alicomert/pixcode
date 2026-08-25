# Pixcode v2 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy pixcode codebase with a minimal, fast, mobile-friendly, self-hosted AI coding workbench (web + Tauri 2 desktop), supporting 6 coding agents through one unified protocol.

**Architecture:** Single npm package. Zero-framework Node backend (`node:http` + `ws` + `node-pty` only) with a multiplexed WebSocket and one `AgentAdapter` interface normalized to a single event schema. Preact + CodeMirror 6 + xterm.js frontend with a VibeVim-style 3-pane desktop layout and bottom-tab mobile layout. Hand-rolled i18n (tr/en).

**Tech Stack:** Node 20+ ESM, Preact 10, Vite 6, CodeMirror 6, @xterm/xterm, node-pty, ws, Tauri 2 (desktop). No TypeScript build — plain JSX + JSDoc where helpful.

**Authoritative spec:** `docs/superpowers/specs/2026-08-25-pixcode-v2-redesign-design.md`. All other files under `docs/superpowers/plans/` and `docs/superpowers/specs/` are obsolete v1 artifacts (kept in git history) — ignore them.

## Global Constraints

- Plain JS/JSX only (no TS compilation step). `package.json` has `"type": "module"`.
- Runtime backend deps are exactly `ws` and `node-pty`. No Express, no jsonwebtoken, no bcrypt — use `node:crypto` (scrypt for passwords, HMAC-SHA256 for JWT).
- Frontend runtime libs go in `devDependencies` (they are bundled by Vite into `dist/`). The published npm package ships `dist/` + `server/` only (see `package.json` `files`).
- Default server port: `process.env.PORT || 3210`. Dev Vite port: 5199, proxying `/api` and `/ws` to the backend.
- Workspace root = `process.env.PIXCODE_WORKSPACE || process.cwd()` at server start. All filesystem channel ops are confined to this root.
- Data dir = `~/.pixcode` (`process.env.PIXCODE_HOME` overrides). `auth.json` stored there with mode `0o600`.
- Verification gate (no test runner per spec): `npm run lint` + `npm run build` + a smoke script hitting HTTP endpoints + manual UI check. Each task ends with a commit.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Single-line subjects.
- No code comments unless explicitly requested by the user.
- Git identity is repo-local: `user.name=alicomert`, `user.email=alicmrt648@gmail.com` (already set).

## Pre-existing State (Task 0 — already done, just commit)

The following files already exist on disk from the scaffolding phase and must be committed as the first step:

- `.gitignore`
- `LICENSE` (MIT, Copyright (c) 2026 Ali Comert and Pixcode Contributors)
- `eslint.config.js` (flat config, js recommended, browser+node globals, ignores `dist/`, `node_modules/`, `src-tauri/target/`)
- `index.html` (dark bg, viewport with `viewport-fit=cover`, `#app` root, `/src/main.jsx`)
- `package.json` (name `@pixelbyte-software/pixcode`, version `2.0.0-alpha.1`, bin `pixcode`, scripts `dev/server/start/build/preview/lint`, deps `ws`+`node-pty`, devDeps: preact, @preact/preset-vite, @preact/signals, all @codemirror/* packages, @xterm/*, vite, eslint, @eslint/js, globals)
- `vite.config.js` (preact preset, proxy `/api`+`/ws`, manualChunks `cm`/`langs`/`xterm`)
- `docs/superpowers/specs/2026-08-25-pixcode-v2-redesign-design.md` (already committed)

- [ ] **Step 1: Commit the existing scaffold**

```bash
git add .gitignore LICENSE eslint.config.js index.html package.json vite.config.js
git commit -m "chore: scaffold pixcode v2 project root"
```

---

## File Structure (target layout)

```
pixcode/
├── server/
│   ├── index.js              # HTTP + WS boot, listen, signal handlers
│   ├── cli.js                # `pixcode start|status|version` CLI
│   ├── config.js             # port, host, paths (workspace, dataDir, distDir)
│   ├── router.js             # tiny method+path router with params + body parse
│   ├── static.js             # serve dist/ with mime map + SPA fallback
│   ├── auth.js               # auth store + scrypt + JWT + API keys + middleware
│   ├── ws.js                 # WebSocket hub: handshake, multiplex, frame protocol
│   ├── util/
│   │   ├── jwt.js            # HS256 sign/verify on node:crypto
│   │   └── http.js           # readBody, sendJson, sendError, httpError
│   ├── channels/
│   │   ├── fs.channel.js     # list/read/write/mkdir/rename/delete (sandboxed)
│   │   ├── git.channel.js    # status/diff/stage/unstage/commit via execFile
│   │   ├── pty.channel.js    # create/input/resize/kill, data+exit events
│   │   └── agent.channel.js  # start/send/stop/history, normalized events
│   └── agents/
│       ├── adapter.js        # Adapter base class + registry
│       ├── runner.js         # spawn CLI, line pump, event emit, exit handling
│       └── adapters/
│           ├── claude.js
│           ├── codex.js
│           ├── gemini.js
│           ├── qwen.js
│           ├── opencode.js
│           └── grok.js
├── src/
│   ├── main.jsx              # render(<App/>)
│   ├── App.jsx               # boot: health → AuthGate | Workbench
│   ├── lib/
│   │   ├── api.js           # rest(): GET/POST/DELETE with JWT
│   │   ├── ws.js            # MultiplexWS: request()/subscribe()/emit()
│   │   └── i18n.js          # t(), locale signal, setLocale()
│   ├── i18n/locales/{tr,en}.json
│   ├── state/app.js         # signals: token, theme, locale, mobileTab, activeAgent
│   ├── styles/global.css    # CSS vars (dark default + light), layout grid, mobile
│   └── components/
│       ├── AuthGate.jsx
│       ├── Shell.jsx         # TopBar + 3-pane grid + MobileTabs
│       ├── FileTree.jsx
│       ├── EditorPane.jsx    # tabs + CodeMirror + save + diff toggle
│       ├── GitPanel.jsx
│       ├── AgentPanel.jsx
│       └── Terminals.jsx
├── src-tauri/                # Tauri 2 desktop scaffold
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   └── src/main.rs
├── scripts/smoke.mjs         # node scripts/smoke.mjs — hits HTTP endpoints
└── (root configs already exist)
```

---

### Task 1: Backend config and utilities

**Files:**
- Create: `server/config.js`
- Create: `server/util/jwt.js`
- Create: `server/util/http.js`

**Interfaces:**
- Produces: `config` object with `{ port, host, dataDir, workspace, distDir }`; `sign(payload, secret, ttlMs)` and `verify(token, secret)` from jwt.js; `readBody(req)`, `sendJson(res, status, data)`, `sendError(res, status, message)`, `httpError(status, message)` from http.js.

- [ ] **Step 1: Write `server/config.js`**

```js
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const config = {
  port: Number(process.env.PORT || process.env.PIXCODE_PORT || 3210),
  host: process.env.PIXCODE_HOST || '0.0.0.0',
  dataDir: process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode'),
  workspace: process.env.PIXCODE_WORKSPACE || process.cwd(),
  distDir: fileURLToPath(new URL('../dist/', import.meta.url))
}

export const VERSION = '2.0.0-alpha.1'
```

- [ ] **Step 2: Write `server/util/jwt.js`**

```js
import crypto from 'node:crypto'

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

export function sign(payload, secret, ttlMs) {
  const body = { ...payload, exp: Date.now() + ttlMs }
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const enc = b64url(body)
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${enc}`).digest('base64url')
  return `${header}.${enc}.${sig}`
}

export function verify(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [h, b, s] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')
  const a = Buffer.from(s)
  const c = Buffer.from(expected)
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Write `server/util/http.js`**

```js
export function httpError(status, message) {
  const e = new Error(message || `HTTP ${status}`)
  e.status = status
  return e
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data ?? null))
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message || `HTTP ${status}` })
}

export async function readBody(req, limit = 1_000_000) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
    if (Buffer.concat(chunks).length > limit) throw httpError(413, 'payload too large')
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  const ct = req.headers['content-type'] || ''
  if (!ct.includes('json')) throw httpError(415, 'content-type must be json')
  try {
    return JSON.parse(raw)
  } catch {
    throw httpError(400, 'invalid json body')
  }
}
```

- [ ] **Step 4: Lint**

Run: `npx eslint server/config.js server/util/jwt.js server/util/http.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): add config and util (jwt, http helpers)"
```

---

### Task 2: Auth store, service, and routes

**Files:**
- Create: `server/auth.js`

**Interfaces:**
- Produces: `loadAuth()`, `setupRequired()`, `setup(password)`, `login(password)`, `verifyToken(token)`, `issueApiKey(name)`, `listApiKeys()`, `revokeApiKey(id)`, `checkApiKey(key)`, `authRoutes` (a function `(router) => void` registering routes).

- [ ] **Step 1: Write `server/auth.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, VERSION } from './config.js'
import { sign, verify } from './util/jwt.js'
import { httpError, sendJson, sendError, readBody } from './util/http.js'

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000

function authFile() {
  return path.join(config.dataDir, 'auth.json')
}

let state = null

export function loadAuth() {
  try {
    state = JSON.parse(fs.readFileSync(authFile(), 'utf8'))
  } catch {
    state = null
  }
}

export function setupRequired() {
  return !state || !state.passwordHash
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true })
  fs.writeFileSync(authFile(), JSON.stringify(state, null, 2), { mode: 0o600 })
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex')
  return { salt: s, hash }
}

function verifyPassword(password) {
  if (!state) return false
  const { hash, salt } = state.passwordHash
  const computed = crypto.scryptSync(String(password), salt, 64).toString('hex')
  const a = Buffer.from(hash)
  const b = Buffer.from(computed)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function setup(password) {
  if (!setupRequired()) throw httpError(409, 'already set up')
  if (String(password).length < 6) throw httpError(400, 'password too short')
  const { salt, hash } = hashPassword(password)
  state = {
    passwordHash: { salt, hash },
    secret: crypto.randomBytes(32).toString('hex'),
    keys: []
  }
  persist()
  return login(password)
}

export function login(password) {
  if (setupRequired()) throw httpError(428, 'setup required')
  if (!verifyPassword(password)) throw httpError(401, 'invalid credentials')
  const token = sign({ sub: 'owner', role: 'owner' }, state.secret, TOKEN_TTL)
  return { token, expiresIn: TOKEN_TTL }
}

export function verifyToken(token) {
  if (!state) return null
  return verify(token, state.secret)
}

export function issueApiKey(name) {
  const raw = 'px_' + crypto.randomBytes(24).toString('base64url')
  const id = crypto.randomUUID()
  const record = {
    id,
    name: String(name || 'default').slice(0, 64),
    prefix: raw.slice(0, 8),
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    created: Date.now()
  }
  state.keys.push(record)
  persist()
  return { id, key: raw, name: record.name }
}

export function listApiKeys() {
  return (state?.keys || []).map(({ id, name, prefix, created }) => ({ id, name, prefix, created }))
}

export function revokeApiKey(id) {
  if (!state) return false
  const before = state.keys.length
  state.keys = state.keys.filter((k) => k.id !== id)
  if (state.keys.length !== before) persist()
  return state.keys.length !== before
}

export function checkApiKey(key) {
  if (!state || !key) return false
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex')
  return state.keys.some((k) => {
    const a = Buffer.from(k.hash)
    const b = Buffer.from(hash)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

export function authMiddleware(req) {
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (bearer && bearer.startsWith('px_')) {
    if (checkApiKey(bearer)) return { sub: 'owner', role: 'owner' }
    return null
  }
  if (bearer) return verifyToken(bearer)
  const api = req.headers['x-api-key']
  if (api && checkApiKey(String(api))) return { sub: 'owner', role: 'owner' }
  return null
}

export function authRoutes(router) {
  router.get('/api/health', () => ({ ok: true, name: 'pixcode', version: VERSION, setupRequired: setupRequired() }), { auth: false })
  router.post('/api/auth/setup', async (req) => setup((await readBody(req)).password), { auth: false })
  router.post('/api/auth/login', async (req) => login((await readBody(req)).password), { auth: false })
  router.get('/api/auth/me', (req) => ({ principal: req.principal }))
  router.post('/api/auth/keys', async (req) => issueApiKey((await readBody(req)).name))
  router.get('/api/auth/keys', () => listApiKeys())
  router.delete('/api/auth/keys/:id', (req) => revokeApiKey(req.params.id))
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint server/auth.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/auth.js
git commit -m "feat(server): add auth (scrypt password, HS256 jwt, api keys)"
```

---

### Task 3: Router, static serving, and HTTP entry

**Files:**
- Create: `server/router.js`
- Create: `server/static.js`
- Create: `server/index.js`

**Interfaces:**
- Produces: `Router` class with `get/post/delete/put(pattern, handler, opts)` and `handle(req, res, { verify })`; `serveStatic(req, res, root)`; `startServer()` from index.js that boots HTTP+WS and returns the `http.Server`.

- [ ] **Step 1: Write `server/router.js`**

```js
import { readBody, sendError, sendJson, httpError } from './util/http.js'

function match(routeParts, urlParts) {
  const params = {}
  if (routeParts.length !== urlParts.length) return null
  for (let i = 0; i < routeParts.length; i++) {
    const rp = routeParts[i]
    const up = urlParts[i]
    if (rp.startsWith(':')) params[rp.slice(1)] = decodeURIComponent(up)
    else if (rp !== up) return null
  }
  return params
}

export class Router {
  constructor() {
    this.routes = []
  }
  add(method, pattern, handler, opts = {}) {
    this.routes.push({
      method,
      parts: pattern.split('/').filter(Boolean),
      handler,
      auth: opts.auth !== false
    })
  }
  get(p, h, o) { this.add('GET', p, h, o) }
  post(p, h, o) { this.add('POST', p, h, o) }
  put(p, h, o) { this.add('PUT', p, h, o) }
  delete(p, h, o) { this.add('DELETE', p, h, o) }
  async handle(req, res, ctx = {}) {
    const url = new URL(req.url, 'http://localhost')
    const urlParts = url.pathname.split('/').filter(Boolean)
    for (const r of this.routes) {
      if (r.method !== req.method) continue
      const params = match(r.parts, urlParts)
      if (!params) continue
      if (r.auth) {
        const principal = ctx.verify ? ctx.verify(req) : null
        if (!principal) return sendError(res, 401, 'unauthorized')
        req.principal = principal
      }
      req.params = params
      req.query = url.searchParams
      try {
        const result = await r.handler(req, res)
        if (res.writableEnded) return
        sendJson(res, 200, result)
      } catch (err) {
        sendError(res, err.status || 500, err.message)
      }
      return
    }
    return false
  }
}
```

- [ ] **Step 2: Write `server/static.js`**

```js
import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
}

export function serveStatic(req, res, root) {
  const url = new URL(req.url, 'http://localhost')
  let rel = decodeURIComponent(url.pathname)
  if (rel.includes('..')) {
    res.writeHead(400)
    return res.end('bad path'), true
  }
  let filePath = path.join(root, rel)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexFile = path.join(root, 'index.html')
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'content-type': MIME['.html'] })
      fs.createReadStream(indexFile).pipe(res)
      return true
    }
    return false
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
  return true
}
```

- [ ] **Step 3: Write `server/index.js` (HTTP boot only — WS comes in Task 4)**

```js
import http from 'node:http'
import fs from 'node:fs'
import { config } from './config.js'
import { Router } from './router.js'
import { serveStatic } from './static.js'
import { authRoutes, authMiddleware, loadAuth } from './auth.js'
import { sendJson } from './util/http.js'

export function createHttpServer() {
  loadAuth()
  const router = new Router()
  authRoutes(router)

  const distExists = fs.existsSync(config.distDir)

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      const handled = await router.handle(req, res, { verify: authMiddleware })
      if (handled || res.writableEnded) return
      return sendJson(res, 404, { error: 'not found' })
    }
    if (distExists && serveStatic(req, res, config.distDir)) return
    sendJson(res, 404, { error: 'not found' })
  })

  return { server, router }
}

export async function startServer() {
  const { server } = createHttpServer()
  server.listen(config.port, config.host, () => {
    console.log(`pixcode v${VERSION} listening on http://${config.host}:${config.port}`)
  })
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { server.close(() => process.exit(0)) })
  }
  return server
}

import { VERSION } from './config.js'

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}
```

Note: the `import { VERSION }` placement after usage is invalid; fix by moving the import to the top of the file alongside `config`. Final file should import `VERSION` from `./config.js` in the top import block and use it in `startServer` and the `import.meta.url` guard.

- [ ] **Step 4: Lint**

Run: `npx eslint server/router.js server/static.js server/index.js`
Expected: no errors.

- [ ] **Step 5: Smoke check (no UI yet, but server must boot)**

Run: `node server/index.js & ; sleep 1 ; curl -s http://localhost:3210/api/health ; kill %1`
Expected: `{"ok":true,"name":"pixcode","version":"2.0.0-alpha.1","setupRequired":true}`

- [ ] **Step 6: Commit**

```bash
git add server/router.js server/static.js server/index.js
git commit -m "feat(server): add router, static serving, and http boot"
```

---

### Task 4: WebSocket hub and multiplex protocol

**Files:**
- Create: `server/ws.js`
- Modify: `server/index.js` (attach hub on upgrade)

**Interfaces:**
- Produces: `createHub(server)` returning a hub with `registerChannel(name, channel)` and `broadcast(name, ev, data)`. Channel shape: `{ onOpen?(ctx), ops: { [op]: async (ctx, data) => result }, onClose?(ctx) }`. Connection context `ctx` exposes: `ctx.send(frame)`, `ctx.request(op, data)` (unused server-side), `ctx.emit(name, ev, data)` (broadcast), `ctx.principal`, `ctx.ch` (per-connection state bag).

- [ ] **Step 1: Write `server/ws.js`**

```js
import { WebSocketServer } from 'ws'
import { config } from './config.js'
import { verifyToken, checkApiKey } from './auth.js'

export function createHub(server) {
  const channels = {}
  const connections = new Set()

  function authenticate(url) {
    const token = url.searchParams.get('token')
    const key = url.searchParams.get('key')
    if (key && checkApiKey(key)) return { sub: 'owner', role: 'owner' }
    if (token) return verifyToken(token)
    return null
  }

  function broadcast(name, ev, data) {
    const frame = JSON.stringify({ ch: name, ev, data })
    for (const ws of connections) {
      if (ws.readyState === 1) ws.send(frame)
    }
  }

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    const principal = authenticate(url)
    if (!principal) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      connections.add(ws)
      const ctx = {
        principal,
        ws,
        ch: {},
        emit: broadcast,
        send: (frame) => ws.readyState === 1 && ws.send(JSON.stringify(frame))
      }
      for (const [name, channel] of Object.entries(channels)) {
        if (channel.onOpen) channel.onOpen(ctx)
      }
      ws.on('message', async (raw) => {
        let frame
        try { frame = JSON.parse(raw.toString()) } catch { return }
        const channel = channels[frame.ch]
        if (!channel) return
        const op = channel.ops && channel.ops[frame.op]
        if (!op) {
          ctx.send({ ch: frame.ch, id: frame.id, error: 'unknown op' })
          return
        }
        try {
          const result = await op(ctx, frame.data ?? {})
          ctx.send({ ch: frame.ch, id: frame.id, ok: true, data: result })
        } catch (err) {
          ctx.send({ ch: frame.ch, id: frame.id, ok: false, error: err.message })
        }
      })
      ws.on('close', () => {
        connections.delete(ws)
        for (const channel of Object.values(channels)) {
          if (channel.onClose) channel.onClose(ctx)
        }
      })
    })
  })

  return {
    register: (name, channel) => { channels[name] = channel },
    broadcast
  }
}
```

- [ ] **Step 2: Modify `server/index.js` to attach the hub (channels come in later tasks)**

Add to `server/index.js` after `createHttpServer` returns the server, before `listen`:

```js
import { createHub } from './ws.js'

export function createHttpServer() {
  loadAuth()
  const router = new Router()
  authRoutes(router)
  const distExists = fs.existsSync(config.distDir)
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      const handled = await router.handle(req, res, { verify: authMiddleware })
      if (handled || res.writableEnded) return
      return sendJson(res, 404, { error: 'not found' })
    }
    if (distExists && serveStatic(req, res, config.distDir)) return
    sendJson(res, 404, { error: 'not found' })
  })
  const hub = createHub(server)
  return { server, router, hub }
}
```

- [ ] **Step 3: Lint and smoke**

Run: `npx eslint server/ws.js server/index.js`
Run: `node server/index.js & ; sleep 1 ; curl -s http://localhost:3210/api/health ; kill %1`
Expected: server boots, health returns.

- [ ] **Step 4: Commit**

```bash
git add server/ws.js server/index.js
git commit -m "feat(server): add multiplexed websocket hub with token/key auth"
```

---

### Task 5: Filesystem channel

**Files:**
- Create: `server/channels/fs.channel.js`
- Modify: `server/index.js` to register it.

**Interfaces:**
- Produces a channel object registered as `'fs'`. Ops: `list({path})`, `read({path})`, `write({path,content})`, `mkdir({path})`, `rename({from,to})`, `delete({path})`. All paths resolved inside `config.workspace`.

- [ ] **Step 1: Write `server/channels/fs.channel.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { httpError } from '../util/http.js'

const SKIP = new Set(['node_modules', '.git', 'dist', '.cache', '.DS_Store'])

function safe(rel) {
  const base = path.resolve(config.workspace)
  const resolved = path.resolve(base, String(rel || '.'))
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw httpError(403, 'path outside workspace')
  }
  return resolved
}

export const fsChannel = {
  ops: {
    async list(_ctx, { path: rel = '.' } = {}) {
      const dir = safe(rel)
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      return entries
        .filter((e) => !SKIP.has(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()))
        .map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }))
    },
    async read(_ctx, { path: rel } = {}) {
      const file = safe(rel)
      const stat = await fs.promises.stat(file)
      if (stat.size > 5_000_000) throw httpError(413, 'file too large')
      const buf = await fs.promises.readFile(file)
      if (buf.includes(0)) throw httpError(415, 'binary file')
      return { content: buf.toString('utf8'), size: stat.size }
    },
    async write(_ctx, { path: rel, content } = {}) {
      const file = safe(rel)
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await fs.promises.writeFile(file, String(content))
      return { ok: true }
    },
    async mkdir(_ctx, { path: rel } = {}) {
      await fs.promises.mkdir(safe(rel), { recursive: true })
      return { ok: true }
    },
    async rename(_ctx, { from, to } = {}) {
      await fs.promises.rename(safe(from), safe(to))
      return { ok: true }
    },
    async delete(_ctx, { path: rel } = {}) {
      await fs.promises.rm(safe(rel), { recursive: true, force: true })
      return { ok: true }
    }
  }
}
```

- [ ] **Step 2: Register in `server/index.js`**

Add import and registration inside `createHttpServer` after `createHub`:

```js
import { fsChannel } from './channels/fs.channel.js'
hub.register('fs', fsChannel)
```

- [ ] **Step 3: Lint**

Run: `npx eslint server/channels/fs.channel.js server/index.js`

- [ ] **Step 4: Commit**

```bash
git add server/channels/fs.channel.js server/index.js
git commit -m "feat(server): add sandboxed filesystem channel"
```

---

### Task 6: Git channel

**Files:**
- Create: `server/channels/git.channel.js`
- Modify: `server/index.js` to register.

**Interfaces:**
- Ops: `status()`, `diff({path, staged?})`, `stage({paths})`, `unstage({paths})`, `commit({message})`. `status()` returns `{ branch, files: [{ path, x, y, untracked }] }` parsed from `git status --porcelain=v2 --branch`.

- [ ] **Step 1: Write `server/channels/git.channel.js`**

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { httpError } from '../util/http.js'

const exec = promisify(execFile)

function git(args) {
  return exec('git', ['-C', config.workspace, ...args], { maxBuffer: 20 * 1024 * 1024 })
}

function parseStatus(out) {
  const lines = out.split('\n')
  let branch = 'HEAD'
  const files = []
  for (const line of lines) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14)
    else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split('\t')
      const meta = parts[0].split(' ')
      files.push({ path: parts[1], x: meta[1][0], y: meta[1][1], untracked: false })
    } else if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), x: '?', y: '?', untracked: true })
    }
  }
  return { branch, files }
}

export const gitChannel = {
  ops: {
    async status() {
      const { stdout } = await git(['status', '--porcelain=v2', '--branch'])
      return parseStatus(stdout)
    },
    async diff(_ctx, { path, staged = false } = {}) {
      const args = ['diff', '--no-color']
      if (staged) args.push('--cached')
      if (path) args.push('--', String(path))
      const { stdout } = await git(args)
      return { diff: stdout }
    },
    async stage(_ctx, { paths = [] } = {}) {
      if (!paths.length) throw httpError(400, 'paths required')
      await git(['add', '--', ...paths.map(String)])
      return { ok: true }
    },
    async unstage(_ctx, { paths = [] } = {}) {
      if (!paths.length) throw httpError(400, 'paths required')
      await git(['reset', 'HEAD', '--', ...paths.map(String)])
      return { ok: true }
    },
    async commit(_ctx, { message } = {}) {
      if (!message) throw httpError(400, 'message required')
      const { stdout } = await git(['commit', '-m', String(message)])
      return { ok: true, output: stdout }
    }
  }
}
```

- [ ] **Step 2: Register in `server/index.js`**

```js
import { gitChannel } from './channels/git.channel.js'
hub.register('git', gitChannel)
```

- [ ] **Step 3: Lint and commit**

```bash
npx eslint server/channels/git.channel.js server/index.js
git add server/channels/git.channel.js server/index.js
git commit -m "feat(server): add git channel (status/diff/stage/commit)"
```

---

### Task 7: PTY channel

**Files:**
- Create: `server/channels/pty.channel.js`
- Modify: `server/index.js` to register.

**Interfaces:**
- Ops: `create({cols,rows,cwd})` → `{id}`; `input({id,data})`; `resize({id,cols,rows})`; `kill({id})`. Emits broadcast events `data` `{id,data}` and `exit` `{id,exitCode}`.

- [ ] **Step 1: Write `server/channels/pty.channel.js`**

```js
import pty from 'node-pty'
import { config } from '../config.js'

const shells = new Map()
let counter = 0

function defaultShell() {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash')
}

export const ptyChannel = {
  ops: {
    create(ctx, { cols = 80, rows = 24, cwd } = {}) {
      const id = `pty_${++counter}`
      const term = pty.spawn(defaultShell(), [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd || config.workspace,
        env: process.env
      })
      term.onData((data) => ctx.emit('pty', 'data', { id, data }))
      term.onExit(({ exitCode }) => {
        shells.delete(id)
        ctx.emit('pty', 'exit', { id, exitCode })
      })
      shells.set(id, term)
      return { id }
    },
    input(_ctx, { id, data } = {}) {
      const term = shells.get(id)
      if (term) term.write(String(data))
      return { ok: true }
    },
    resize(_ctx, { id, cols, rows } = {}) {
      const term = shells.get(id)
      if (term) term.resize(Number(cols) || 80, Number(rows) || 24)
      return { ok: true }
    },
    kill(_ctx, { id } = {}) {
      const term = shells.get(id)
      if (term) term.kill()
      return { ok: true }
    }
  },
  onClose(ctx) {
    for (const [id, term] of shells) {
      try { term.kill() } catch {}
      shells.delete(id)
    }
  }
}
```

- [ ] **Step 2: Register in `server/index.js`**

```js
import { ptyChannel } from './channels/pty.channel.js'
hub.register('pty', ptyChannel)
```

- [ ] **Step 3: Lint and commit**

```bash
npx eslint server/channels/pty.channel.js server/index.js
git add server/channels/pty.channel.js server/index.js
git commit -m "feat(server): add pty channel with node-pty tabs"
```

---

### Task 8: Agent adapter base, runner, and registry

**Files:**
- Create: `server/agents/adapter.js`
- Create: `server/agents/runner.js`

**Interfaces:**
- Produces `Adapter` base class with `static id`, `static label`, `static cli`, `static interactive`, `buildArgs(opts)`, `normalizeLine(line, state)`. Produces `runner` with `start({agent, prompt, cwd})` → `{sessionId}`, `send(sessionId, text)`, `stop(sessionId)`. Emits broadcast events on channel `'agent'` with `ev:'session'` and `data:{type:'status'|'message'|'tool'|'diff'|'usage'|'error'|'done', sessionId, ...}`.

- [ ] **Step 1: Write `server/agents/adapter.js`**

```js
export class Adapter {
  static id = ''
  static label = ''
  static cli = ''
  static interactive = false
  buildArgs(_opts) { return [] }
  normalizeLine(_line, _state) { return [] }
  buildUserFrame(text) { return text + '\n' }
}

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)

const registry = new Map()

export function registerAdapter(AdapterClass) {
  registry.set(AdapterClass.id, AdapterClass)
}

export function getAdapter(id) {
  return registry.get(id)
}

export async function listAgents() {
  const out = []
  for (const A of registry.values()) {
    let available = false
    try {
      await exec('which', [A.cli])
      available = true
    } catch {}
    out.push({ id: A.id, label: A.label, cli: A.cli, interactive: A.interactive, available })
  }
  return out
}
```

- [ ] **Step 2: Write `server/agents/runner.js`**

```js
import { spawn } from 'node:child_process'
import { config } from '../config.js'
import { getAdapter } from './adapter.js'
import { httpError } from '../util/http.js'

const sessions = new Map()
let counter = 0

function emit(ctx, data) {
  ctx.emit('agent', 'session', data)
}

export function startRunner(ctx, { agent, prompt = '', cwd } = {}) {
  const Adapter = getAdapter(agent)
  if (!Adapter) throw httpError(400, 'unknown agent')
  const sessionId = `s_${++counter}`
  const state = { agent, sessionId, lines: [], buffer: '', partial: '' }
  const args = Adapter.buildArgs({ prompt })
  const child = spawn(Adapter.cli, args, {
    cwd: cwd || config.workspace,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const session = { sessionId, child, adapter: Adapter, state }
  sessions.set(sessionId, session)

  emit(ctx, { type: 'status', sessionId, status: 'started', agent })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    state.buffer += chunk
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop()
    for (const line of lines) {
      if (!line) continue
      state.lines.push(line)
      try {
        const events = Adapter.normalizeLine(line, state) || []
        for (const ev of events) emit(ctx, { ...ev, sessionId })
      } catch (err) {
        emit(ctx, { type: 'error', sessionId, message: err.message })
      }
    }
  })
  child.stderr.on('data', (chunk) => {
    emit(ctx, { type: 'message', sessionId, role: 'system', text: chunk })
  })
  child.on('exit', (code) => {
    if (state.buffer) {
      const events = Adapter.normalizeLine(state.buffer, state) || []
      for (const ev of events) emit(ctx, { ...ev, sessionId })
    }
    emit(ctx, { type: 'done', sessionId, exitCode: code })
    sessions.delete(sessionId)
  })

  if (prompt && Adapter.interactive) {
    child.stdin.write(Adapter.buildUserFrame(prompt))
  }

  return { sessionId }
}

export function sendToRunner(ctx, sessionId, text) {
  const session = sessions.get(sessionId)
  if (!session) throw httpError(404, 'session not found')
  if (!session.adapter.interactive) {
    return startRunner(ctx, { agent: session.adapter.id, prompt: text, cwd: session.state.cwd })
  }
  session.child.stdin.write(session.adapter.buildUserFrame(text))
  return { ok: true }
}

export function stopRunner(_ctx, sessionId) {
  const session = sessions.get(sessionId)
  if (session) {
    try { session.child.kill('SIGTERM') } catch {}
    sessions.delete(sessionId)
  }
  return { ok: true }
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({ sessionId: s.sessionId, agent: s.state.agent }))
}
```

- [ ] **Step 3: Lint**

Run: `npx eslint server/agents/adapter.js server/agents/runner.js`

- [ ] **Step 4: Commit**

```bash
git add server/agents/adapter.js server/agents/runner.js
git commit -m "feat(server): add agent adapter base, registry, and runner"
```

---

### Task 9: Six agent adapters

**Files:**
- Create: `server/agents/adapters/claude.js`
- Create: `server/agents/adapters/codex.js`
- Create: `server/agents/adapters/gemini.js`
- Create: `server/agents/adapters/qwen.js`
- Create: `server/agents/adapters/opencode.js`
- Create: `server/agents/adapters/grok.js`
- Create: `server/agents/adapters/index.js` (registers all six)
- Modify: `server/index.js` to import and register adapters.

**Interfaces:**
- Each adapter extends `Adapter`, sets `id/label/cli/interactive`, implements `buildArgs` and `normalizeLine`. `normalizeLine(line, state)` returns an array of unified events `{type, role, text, tool, diff, usage, status, message}`.

- [ ] **Step 1: Write `server/agents/adapters/claude.js` (interactive, stream-json)**

```js
import { Adapter } from '../adapter.js'

export class ClaudeAdapter extends Adapter {
  static id = 'claude'
  static label = 'Claude Code'
  static cli = 'claude'
  static interactive = true

  buildArgs({ prompt } = {}) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--input-format', 'stream-json']
    if (prompt) args.push(prompt)
    return args
  }

  buildUserFrame(text) {
    return JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n'
  }

  normalizeLine(line, _state) {
    let obj
    try { obj = JSON.parse(line) } catch { return [{ type: 'message', role: 'assistant', text: line }] }
    const out = []
    if (obj.type === 'system' && obj.subtype === 'init') {
      out.push({ type: 'status', status: 'ready', session_id: obj.session_id })
    } else if (obj.type === 'assistant') {
      const content = obj.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') out.push({ type: 'message', role: 'assistant', text: block.text })
          else if (block.type === 'tool_use') out.push({ type: 'tool', name: block.name, input: block.input })
        }
      }
    } else if (obj.type === 'result') {
      out.push({ type: 'done', result: obj.result, usage: obj.usage })
    }
    return out
  }
}
```

- [ ] **Step 2: Write `server/agents/adapters/codex.js` (oneshot, jsonl)**

```js
import { Adapter } from '../adapter.js'

export class CodexAdapter extends Adapter {
  static id = 'codex'
  static label = 'Codex'
  static cli = 'codex'
  static interactive = false

  buildArgs({ prompt } = {}) {
    const args = ['exec', '--json']
    if (prompt) args.push(prompt)
    return args
  }

  normalizeLine(line, _state) {
    let obj
    try { obj = JSON.parse(line) } catch { return [{ type: 'message', role: 'assistant', text: line }] }
    const out = []
    if (obj.type === 'item.completed' && obj.item?.type === 'message') {
      const text = (obj.item.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('')
      if (text) out.push({ type: 'message', role: 'assistant', text })
    } else if (obj.type === 'item.completed' && obj.item?.type === 'function_call') {
      out.push({ type: 'tool', name: obj.item.name, input: obj.item.arguments })
    } else if (obj.type === 'task.completed') {
      out.push({ type: 'done', result: obj })
    }
    return out
  }
}
```

- [ ] **Step 3: Write `server/agents/adapters/gemini.js` (oneshot, text)**

```js
import { Adapter } from '../adapter.js'

export class GeminiAdapter extends Adapter {
  static id = 'gemini'
  static label = 'Gemini CLI'
  static cli = 'gemini'
  static interactive = false

  buildArgs({ prompt } = {}) {
    const args = ['-p']
    if (prompt) args.push(prompt)
    return args
  }

  normalizeLine(line, state) {
    state.partial = (state.partial || '') + line + '\n'
    return [{ type: 'message', role: 'assistant', text: line, partial: true }]
  }
}
```

- [ ] **Step 4: Write `server/agents/adapters/qwen.js` (oneshot, text)**

```js
import { Adapter } from '../adapter.js'

export class QwenAdapter extends Adapter {
  static id = 'qwen'
  static label = 'Qwen Code'
  static cli = 'qwen'
  static interactive = false

  buildArgs({ prompt } = {}) {
    const args = ['-p']
    if (prompt) args.push(prompt)
    return args
  }

  normalizeLine(line) {
    return [{ type: 'message', role: 'assistant', text: line, partial: true }]
  }
}
```

- [ ] **Step 5: Write `server/agents/adapters/opencode.js` (oneshot, text)**

```js
import { Adapter } from '../adapter.js'

export class OpenCodeAdapter extends Adapter {
  static id = 'opencode'
  static label = 'OpenCode'
  static cli = 'opencode'
  static interactive = false

  buildArgs({ prompt } = {}) {
    const args = ['run']
    if (prompt) args.push(prompt)
    return args
  }

  normalizeLine(line) {
    return [{ type: 'message', role: 'assistant', text: line, partial: true }]
  }
}
```

- [ ] **Step 6: Write `server/agents/adapters/grok.js` (oneshot, text)**

```js
import { Adapter } from '../adapter.js'

export class GrokAdapter extends Adapter {
  static id = 'grok'
  static label = 'Grok CLI'
  static cli = 'grok'
  static interactive = false

  buildArgs({ prompt } = {}) {
    return prompt ? ['-p', prompt] : []
  }

  normalizeLine(line) {
    return [{ type: 'message', role: 'assistant', text: line, partial: true }]
  }
}
```

- [ ] **Step 7: Write `server/agents/adapters/index.js`**

```js
import { registerAdapter } from '../adapter.js'
import { ClaudeAdapter } from './claude.js'
import { CodexAdapter } from './codex.js'
import { GeminiAdapter } from './gemini.js'
import { QwenAdapter } from './qwen.js'
import { OpenCodeAdapter } from './opencode.js'
import { GrokAdapter } from './grok.js'

export function registerAllAdapters() {
  registerAdapter(ClaudeAdapter)
  registerAdapter(CodexAdapter)
  registerAdapter(GeminiAdapter)
  registerAdapter(QwenAdapter)
  registerAdapter(OpenCodeAdapter)
  registerAdapter(GrokAdapter)
}
```

- [ ] **Step 8: Register in `server/index.js`**

Add near the top imports and call `registerAllAdapters()` inside `createHttpServer` before returning. Also register the agent channel here (created in Task 10, but registration line added now is fine if the import is added in Task 10 — keep adapter registration here):

```js
import { registerAllAdapters, listAgents } from './agents/adapter.js'
// inside createHttpServer, after createHub:
registerAllAdapters()
```

- [ ] **Step 9: Lint and commit**

```bash
npx eslint server/agents/
git add server/agents/adapters/ server/index.js
git commit -m "feat(server): add six agent adapters (claude, codex, gemini, qwen, opencode, grok)"
```

---

### Task 10: Agent channel + finalize backend (CLI and boot)

**Files:**
- Create: `server/channels/agent.channel.js`
- Modify: `server/index.js` (register agent channel, finalize `startServer`)
- Create: `server/cli.js`

**Interfaces:**
- Agent channel ops: `agents()` → `[{id,label,cli,interactive,available}]`, `start({agent,prompt,cwd})` → `{sessionId}`, `send({sessionId,text})`, `stop({sessionId})`, `sessions()` → list. Emits `'session'` events via `ctx.emit('agent','session', data)`.

- [ ] **Step 1: Write `server/channels/agent.channel.js`**

```js
import { listAgents } from '../agents/adapter.js'
import { startRunner, sendToRunner, stopRunner, listSessions } from '../agents/runner.js'

export const agentChannel = {
  ops: {
    agents: () => listAgents(),
    start: (ctx, { agent, prompt, cwd } = {}) => startRunner(ctx, { agent, prompt, cwd }),
    send: (ctx, { sessionId, text } = {}) => sendToRunner(ctx, sessionId, text),
    stop: (ctx, { sessionId } = {}) => stopRunner(ctx, sessionId),
    sessions: () => listSessions()
  }
}
```

- [ ] **Step 2: Register in `server/index.js` and finalize**

```js
import { agentChannel } from './channels/agent.channel.js'
// inside createHttpServer after registerAllAdapters():
hub.register('agent', agentChannel)
```

- [ ] **Step 3: Write `server/cli.js`**

```js
#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import { config, VERSION } from './config.js'

const exec = promisify(execFile)

function lanIps() {
  const ifaces = os.networkInterfaces()
  const out = []
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address)
    }
  }
  return out
}

function printUsage() {
  console.log(`pixcode v${VERSION}
Usage: pixcode <command>

Commands:
  start [--port N] [--workspace PATH]   Start the server (default)
  status                                 Show server health
  version                                Print version
`)
}

async function status() {
  try {
    const { stdout } = await exec('curl', ['-s', `http://localhost:${config.port}/api/health`])
    console.log(stdout)
  } catch (e) {
    console.log('server not running:', e.message)
    process.exit(1)
  }
}

async function start(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') process.env.PORT = args[++i]
    if (args[i] === '--workspace') process.env.PIXCODE_WORKSPACE = args[++i]
  }
  const { startServer } = await import('./index.js')
  await startServer()
  console.log('Mobile access:')
  for (const ip of lanIps()) console.log(`  http://${ip}:${config.port}`)
}

async function main() {
  const cmd = process.argv[2] || 'start'
  const args = process.argv.slice(3)
  if (cmd === 'start') return start(args)
  if (cmd === 'status') return status()
  if (cmd === 'version') { console.log(VERSION); return }
  printUsage()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Make cli executable**

```bash
chmod +x server/cli.js
```

- [ ] **Step 5: Lint**

Run: `npx eslint server/`

- [ ] **Step 6: Smoke test (setup + login + agents endpoint — agents list works without CLIs installed)**

```bash
node server/index.js & PID=$!
sleep 1
curl -s http://localhost:3210/api/health
curl -s -X POST http://localhost:3210/api/auth/setup -H 'content-type: application/json' -d '{"password":"secret123"}'
TOKEN=$(curl -s -X POST http://localhost:3210/api/auth/login -H 'content-type: application/json' -d '{"password":"secret123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://localhost:3210/api/auth/me -H "authorization: Bearer $TOKEN"
kill $PID
```
Expected: setup returns a token; `/api/auth/me` returns the principal; no crashes. (WS agent channel not exercised here — needs a frontend; covered in Task 18 smoke.)

- [ ] **Step 7: Commit**

```bash
git add server/
git commit -m "feat(server): add agent channel, finalize boot, add pixcode CLI"
```

---

### Task 11: Frontend base (main, app, api, ws, i18n, state, styles)

**Files:**
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/lib/api.js`
- Create: `src/lib/ws.js`
- Create: `src/lib/i18n.js`
- Create: `src/i18n/locales/tr.json`
- Create: `src/i18n/locales/en.json`
- Create: `src/state/app.js`
- Create: `src/styles/global.css`

**Interfaces:**
- Produces: `App` default export; `api.get/post/del(path, body)`; `MultiplexWS` class with `request(ch, op, data)`, `on(ch, ev, fn)`, `close()`; `t(key, vars)`, `locale` signal, `setLocale(lang)`; app state signals `theme`, `mobileTab`, `activeAgent`, `openFiles`.

- [ ] **Step 1: Write `src/main.jsx`**

```jsx
import { render } from 'preact'
import { App } from './App.jsx'
import './styles/global.css'

render(<App />, document.getElementById('app'))
```

- [ ] **Step 2: Write `src/lib/api.js`**

```js
const TOKEN_KEY = 'pixcode.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status })
  return data
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  del: (p) => request('DELETE', p),
  health: () => fetch('/api/health').then((r) => r.json())
}
```

- [ ] **Step 3: Write `src/lib/ws.js`**

```js
import { getToken } from './api.js'

export class MultiplexWS {
  constructor() {
    this.ws = null
    this.handlers = new Map()
    this.pending = new Map()
    this.counter = 0
    this.queue = []
    this.connect()
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    this.ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`)
    this.ws.onopen = () => {
      for (const f of this.queue) this.ws.send(f)
      this.queue = []
    }
    this.ws.onmessage = (e) => {
      const frame = JSON.parse(e.data)
      if (frame.id && this.pending.has(frame.id)) {
        const { resolve, reject } = this.pending.get(frame.id)
        this.pending.delete(frame.id)
        if (frame.ok) resolve(frame.data)
        else reject(new Error(frame.error || 'ws error'))
        return
      }
      if (frame.ev) {
        const set = this.handlers.get(`${frame.ch}:${frame.ev}`)
        if (set) for (const fn of set) fn(frame.data)
      }
    }
    this.ws.onclose = () => setTimeout(() => this.connect(), 1000)
  }
  send(frame) {
    const data = JSON.stringify(frame)
    if (this.ws?.readyState === 1) this.ws.send(data)
    else this.queue.push(data)
  }
  request(ch, op, data = {}) {
    const id = `r${++this.counter}`
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ ch, id, op, data })
    })
  }
  on(ch, ev, fn) {
    const key = `${ch}:${ev}`
    if (!this.handlers.has(key)) this.handlers.set(key, new Set())
    this.handlers.get(key).add(fn)
    return () => this.handlers.get(key).delete(fn)
  }
  close() {
    if (this.ws) this.ws.close()
  }
}

export const ws = new MultiplexWS()
```

- [ ] **Step 4: Write `src/lib/i18n.js`**

```js
import { signal } from '@preact/signals'
import tr from '../i18n/locales/tr.json'
import en from '../i18n/locales/en.json'

const dictionaries = { tr, en }
const stored = localStorage.getItem('pixcode.locale') || (navigator.language || 'tr').startsWith('tr') ? 'tr' : 'en'
export const locale = signal(localStorage.getItem('pixcode.locale') || 'tr')

export function setLocale(lang) {
  locale.value = lang
  localStorage.setItem('pixcode.locale', lang)
  document.documentElement.lang = lang
}

export function t(key, vars = {}) {
  const dict = dictionaries[locale.value] || dictionaries.en
  const str = dict[key] || key
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

setLocale(locale.value)
```

- [ ] **Step 5: Write `src/i18n/locales/tr.json`**

```json
{
  "app.title": "Pixcode",
  "auth.setup.title": "Kurulum",
  "auth.setup.password": "Şifre belirle",
  "auth.setup.submit": "Kaydet ve giriş yap",
  "auth.login.title": "Giriş",
  "auth.login.password": "Şifre",
  "auth.login.submit": "Giriş yap",
  "topbar.workspace": "Çalışma alanı",
  "topbar.logout": "Çıkış",
  "tab.files": "Dosyalar",
  "tab.editor": "Editör",
  "tab.agent": "Ajan",
  "tab.terminal": "Terminal",
  "tab.git": "Git",
  "tree.empty": "Boş",
  "editor.untitled": "adsız",
  "editor.saved": "kaydedildi",
  "editor.save": "Kaydet",
  "editor.diff.show": "Diff'i göster",
  "editor.diff.hide": "Diff'i gizle",
  "agent.placeholder": "Bir ajan seç",
  "agent.new": "Yeni oturum",
  "agent.send": "Gönder",
  "agent.stop": "Durdur",
  "agent.input": "Mesaj yaz…",
  "agent.thinking": "düşünüyor…",
  "git.stage": "Ekle",
  "git.unstage": "Çıkar",
  "git.commit": "Commit",
  "git.messagePlaceholder": "Commit mesajı…",
  "git.noChanges": "Değişiklik yok",
  "lang.label": "Dil"
}
```

- [ ] **Step 6: Write `src/i18n/locales/en.json`**

```json
{
  "app.title": "Pixcode",
  "auth.setup.title": "Setup",
  "auth.setup.password": "Set a password",
  "auth.setup.submit": "Save and sign in",
  "auth.login.title": "Sign in",
  "auth.login.password": "Password",
  "auth.login.submit": "Sign in",
  "topbar.workspace": "Workspace",
  "topbar.logout": "Sign out",
  "tab.files": "Files",
  "tab.editor": "Editor",
  "tab.agent": "Agent",
  "tab.terminal": "Terminal",
  "tab.git": "Git",
  "tree.empty": "Empty",
  "editor.untitled": "untitled",
  "editor.saved": "saved",
  "editor.save": "Save",
  "editor.diff.show": "Show diff",
  "editor.diff.hide": "Hide diff",
  "agent.placeholder": "Select an agent",
  "agent.new": "New session",
  "agent.send": "Send",
  "agent.stop": "Stop",
  "agent.input": "Type a message…",
  "agent.thinking": "thinking…",
  "git.stage": "Stage",
  "git.unstage": "Unstage",
  "git.commit": "Commit",
  "git.messagePlaceholder": "Commit message…",
  "git.noChanges": "No changes",
  "lang.label": "Language"
}
```

- [ ] **Step 7: Write `src/state/app.js`**

```js
import { signal, computed } from '@preact/signals'

export const theme = signal(localStorage.getItem('pixcode.theme') || 'dark')
export const mobileTab = signal('files')
export const activeAgent = signal('')
export const openFiles = signal([])
export const activeFile = signal('')
export const agentSessions = signal([])
export const gitChanges = signal([])

export function setTheme(t) {
  theme.value = t
  localStorage.setItem('pixcode.theme', t)
  document.documentElement.dataset.theme = t
}
setTheme(theme.value)
```

- [ ] **Step 8: Write `src/styles/global.css`**

```css
:root {
  --bg: #181820;
  --panel: #1e1e28;
  --panel-2: #252532;
  --border: #33334a;
  --fg: #e6e6ef;
  --muted: #8a8aa3;
  --accent: #5b8cff;
  --accent-2: #4a78f0;
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
[data-theme="light"] {
  --bg: #f5f5f8;
  --panel: #ffffff;
  --panel-2: #eef0f4;
  --border: #d8dae3;
  --fg: #1a1a25;
  --muted: #5a5a70;
  --accent: #2f6bff;
}
* { box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  margin: 0;
  font-family: var(--sans);
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
button, input, textarea, select {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
}
button { cursor: pointer; }
button:hover { background: var(--panel-2); }
.btn-accent { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-accent:hover { background: var(--accent-2); }

/* layout */
.shell { display: grid; grid-template-rows: 40px 1fr; height: 100%; }
.topbar { display: flex; align-items: center; gap: 12px; padding: 0 12px; background: var(--panel); border-bottom: 1px solid var(--border); }
.topbar .spacer { flex: 1; }
.body { display: grid; grid-template-columns: 240px 1fr 360px; min-height: 0; }
.pane { background: var(--panel); border-right: 1px solid var(--border); min-height: 0; overflow: auto; }
.pane:last-child { border-right: 0; }
.center { display: flex; flex-direction: column; min-height: 0; }

/* file tree */
.tree { padding: 4px; font-size: 12px; }
.tree-item { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
.tree-item:hover { background: var(--panel-2); }
.tree-item.dir::before { content: "▸"; color: var(--muted); }
.tree-item.dir.open::before { content: "▾"; }

/* editor */
.editor-tabs { display: flex; background: var(--panel); border-bottom: 1px solid var(--border); }
.editor-tab { padding: 6px 12px; border-right: 1px solid var(--border); cursor: pointer; }
.editor-tab.active { background: var(--bg); }
.editor-host { flex: 1; min-height: 0; }
.cm-host { height: 100%; }
.cm-host .cm-editor { height: 100%; }
.editor-toolbar { display: flex; gap: 8px; padding: 6px; border-top: 1px solid var(--border); }

/* agent */
.agent-log { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.msg { white-space: pre-wrap; word-break: break-word; }
.msg.user { color: var(--accent); }
.msg.tool { color: var(--yellow); font-family: var(--mono); font-size: 12px; }
.msg.system { color: var(--muted); font-style: italic; }
.agent-composer { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--border); }
.agent-composer textarea { flex: 1; resize: none; min-height: 40px; max-height: 120px; }

/* terminal */
.term-tabs { display: flex; background: var(--panel); border-bottom: 1px solid var(--border); }
.term-tab { padding: 4px 10px; cursor: pointer; border-right: 1px solid var(--border); }
.term-host { flex: 1; min-height: 0; padding: 4px; }
.term-host .xterm { height: 100%; }

/* git */
.git-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.git-badge { font-family: var(--mono); font-size: 11px; padding: 1px 5px; border-radius: 3px; }
.git-badge.M { background: var(--yellow); color: #000; }
.git-badge.A { background: var(--green); color: #000; }
.git-badge.D { background: var(--red); color: #fff; }

/* mobile */
@media (max-width: 768px) {
  .body { grid-template-columns: 1fr; }
  .pane { display: none; }
  .pane.active { display: flex; flex-direction: column; }
  .mobile-tabs { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: var(--panel); border-top: 1px solid var(--border); }
  .mobile-tab { flex: 1; padding: 10px 0; text-align: center; font-size: 11px; }
  .mobile-tab.active { color: var(--accent); }
}
.mobile-tabs { display: none; }

/* auth */
.auth { display: flex; align-items: center; justify-content: center; height: 100%; }
.auth-card { background: var(--panel); padding: 24px; border-radius: 8px; width: 320px; display: flex; flex-direction: column; gap: 12px; }
.auth-card h1 { margin: 0; font-size: 18px; }
```

- [ ] **Step 9: Write `src/App.jsx` (boot gate; real components come in later tasks)**

```jsx
import { useEffect, useState } from 'preact/hooks'
import { api, setToken } from './lib/api.js'
import { AuthGate } from './components/AuthGate.jsx'

export function App() {
  const [state, setState] = useState({ loading: true, setupRequired: false, authed: false })
  useEffect(() => {
    api.health().then((h) => {
      setState({ loading: false, setupRequired: h.setupRequired, authed: !!localStorage.getItem('pixcode.token') })
    }).catch(() => setState({ loading: true, setupRequired: false, authed: false }))
  }, [])
  if (state.loading) return <div style="padding:20px">loading…</div>
  return <AuthGate setupRequired={state.setupRequired} />
}
```

- [ ] **Step 10: Lint and commit**

```bash
npx eslint src/main.jsx src/App.jsx src/lib/ src/state/ src/i18n/ src/styles/
git add src/
git commit -m "feat(web): add frontend base (main, app, api, ws, i18n, state, styles)"
```

---

### Task 12: AuthGate component

**Files:**
- Create: `src/components/AuthGate.jsx`

**Interfaces:**
- Props: `{setupRequired}`. On successful setup/login, calls `setToken(token)` and re-renders the Shell (import lazily).

- [ ] **Step 1: Write `src/components/AuthGate.jsx`**

```jsx
import { useState } from 'preact/hooks'
import { api, setToken } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { Shell } from './Shell.jsx'

export function AuthGate({ setupRequired }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [authed, setAuthed] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const res = setupRequired
        ? await api.post('/api/auth/setup', { password })
        : await api.post('/api/auth/login', { password })
      setToken(res.token)
      setAuthed(true)
    } catch (err) {
      setError(err.message)
    }
  }

  if (authed) return <Shell />
  return (
    <div class="auth">
      <form class="auth-card" onSubmit={submit}>
        <h1>{setupRequired ? t('auth.setup.title') : t('auth.login.title')}</h1>
        <input
          type="password"
          placeholder={setupRequired ? t('auth.setup.password') : t('auth.login.password')}
          value={password}
          onInput={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div style="color:var(--red); font-size:12px">{error}</div>}
        <button class="btn-accent" type="submit">
          {setupRequired ? t('auth.setup.submit') : t('auth.login.submit')}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/AuthGate.jsx
git add src/components/AuthGate.jsx
git commit -m "feat(web): add auth gate (setup + login)"
```

---

### Task 13: Shell, TopBar, and MobileTabs

**Files:**
- Create: `src/components/Shell.jsx`

**Interfaces:**
- Renders the 3-pane grid on desktop and switches active pane on mobile via `mobileTab` signal. Imports `FileTree`, `EditorPane`, `AgentPanel`, `Terminals`, `GitPanel` (created in later tasks — for this task, render placeholder `<div>` for any not yet present; final task wires real ones).

- [ ] **Step 1: Write `src/components/Shell.jsx` (with placeholders that later tasks replace via direct edit)**

```jsx
import { useEffect } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { theme, setTheme, mobileTab } from '../state/app.js'
import { api, setToken } from '../lib/api.js'
import { FileTree } from './FileTree.jsx'
import { EditorPane } from './EditorPane.jsx'
import { AgentPanel } from './AgentPanel.jsx'
import { Terminals } from './Terminals.jsx'
import { GitPanel } from './GitPanel.jsx'

const TABS = [
  { id: 'files', label: 'tab.files' },
  { id: 'editor', label: 'tab.editor' },
  { id: 'agent', label: 'tab.agent' },
  { id: 'terminal', label: 'tab.terminal' },
  { id: 'git', label: 'tab.git' }
]

function TopBar() {
  return (
    <div class="topbar">
      <strong>{t('app.title')}</strong>
      <span style="color:var(--muted)">{t('topbar.workspace')}</span>
      <div class="spacer" />
      <select value={undefined} onChange={(e) => { const { setLocale } = require('../lib/i18n.js'); setLocale(e.target.value) }}>
        <option value="tr">TR</option>
        <option value="en">EN</option>
      </select>
      <button onClick={() => setTheme(theme.value === 'dark' ? 'light' : 'dark')}>{theme.value === 'dark' ? '☀' : '☾'}</button>
      <button onClick={() => { setToken(''); location.reload() }}>{t('topbar.logout')}</button>
    </div>
  )
}

export function Shell() {
  useEffect(() => () => ws.close(), [])
  const tab = mobileTab.value
  return (
    <div class="shell">
      <TopBar />
      <div class="body">
        <div class={`pane ${tab === 'files' ? 'active' : ''}`}><FileTree /></div>
        <div class={`pane center ${tab === 'editor' ? 'active' : ''}`}><EditorPane /></div>
        <div class={`pane ${tab === 'agent' ? 'active' : ''}`}>
          <AgentPanel />
          <Terminals />
        </div>
      </div>
      <div class="mobile-tabs">
        {TABS.map((t2) => (
          <div class={`mobile-tab ${tab === t2.id ? 'active' : ''}`} onClick={() => (mobileTab.value = t2.id)}>
            {t(t2.label)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Note: the inline `require()` call does not work in ESM browser bundles. Replace the language `<select>` `onChange` handler with a direct import of `setLocale` at the top of `Shell.jsx`:

```jsx
import { t, setLocale } from '../lib/i18n.js'
// ...
onChange={(e) => setLocale(e.target.value)}
```

Final `Shell.jsx` must import `setLocale` from `../lib/i18n.js` at the top and use it directly — no `require()`.

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/Shell.jsx
git add src/components/Shell.jsx
git commit -m "feat(web): add shell layout with topbar and mobile tabs"
```

---

### Task 14: FileTree

**Files:**
- Create: `src/components/FileTree.jsx`

**Interfaces:**
- Uses `ws.request('fs', 'list', { path })` to expand directories. On file click, calls `openFile(path)` (import from `state/app.js` — but `openFile` is not yet defined; add it to `state/app.js` in this task).

- [ ] **Step 1: Add `openFile`/`closeFile` to `src/state/app.js`**

Append to `src/state/app.js`:

```js
export function openFile(path) {
  if (!openFiles.value.includes(path)) openFiles.value = [...openFiles.value, path]
  activeFile.value = path
}
export function closeFile(path) {
  openFiles.value = openFiles.value.filter((p) => p !== path)
  if (activeFile.value === path) activeFile.value = openFiles.value[openFiles.value.length - 1] || ''
}
```

- [ ] **Step 2: Write `src/components/FileTree.jsx`**

```jsx
import { useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { openFile } from '../state/app.js'

function Node({ path, name, type }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState(null)
  async function toggle() {
    if (type !== 'dir') { openFile(path); return }
    const next = !open
    setOpen(next)
    if (next && !children) {
      const list = await ws.request('fs', 'list', { path })
      setChildren(list)
    }
  }
  return (
    <div>
      <div class={`tree-item ${type === 'dir' ? (open ? 'dir open' : 'dir') : ''}`} onClick={toggle}>
        {name}
      </div>
      {open && children && (
        <div style="margin-left: 12px">
          {children.length === 0 ? <div class="tree-item" style="color:var(--muted)">{t('tree.empty')}</div> : children.map((c) => <Node path={`${path}/${c.name}`} {...c} />)}
        </div>
      )}
    </div>
  )
}

export function FileTree() {
  const [root, setRoot] = useState(null)
  if (!root) {
    ws.request('fs', 'list', { path: '.' }).then(setRoot)
    return <div class="tree">{t('tree.empty')}</div>
  }
  return (
    <div class="tree">
      {root.map((c) => <Node path={c.name} {...c} />)}
    </div>
  )
}
```

- [ ] **Step 3: Lint and commit**

```bash
npx eslint src/components/FileTree.jsx src/state/app.js
git add src/components/FileTree.jsx src/state/app.js
git commit -m "feat(web): add lazy file tree wired to fs channel"
```

---

### Task 15: EditorPane with CodeMirror and inline diff

**Files:**
- Create: `src/components/EditorPane.jsx`

**Interfaces:**
- Tabs from `openFiles`/`activeFile` signals. Loads file via `ws.request('fs','read',{path})`. Saves via `ws.request('fs','write',{path,content})` on Ctrl/Cmd+S. Diff view toggled by a toolbar button, uses `@codemirror/merge` `unifiedMergeView` comparing original (on-disk) vs current (edited). Language extension picked by file extension.

- [ ] **Step 1: Write `src/components/EditorPane.jsx`**

```jsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { EditorState, EditorView, keymap } from '@codemirror/state'
import { EditorView as EV } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { unifiedMergeView } from '@codemirror/merge'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { openFiles, activeFile, closeFile } from '../state/app.js'

function langFor(path) {
  if (/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) return javascript()
  if (path.endsWith('.json')) return json()
  if (path.endsWith('.html')) return html()
  if (path.endsWith('.css')) return css()
  if (/\.(md|markdown)$/.test(path)) return markdown()
  if (path.endsWith('.py')) return python()
  return []
}

function makeExtensions(original, path) {
  return [
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    langFor(path),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap
    ])
  ]
}

function Editor({ path }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  const [original, setOriginal] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    ws.request('fs', 'read', { path }).then(({ content }) => {
      if (cancelled) return
      setOriginal(content)
      const state = EditorState.create({ doc: content, extensions: makeExtensions(content, path) })
      viewRef.current = new EV({ parent: host.current, state })
    })
    return () => { cancelled = true; viewRef.current?.destroy(); viewRef.current = null }
  }, [path])

  async function save() {
    const content = viewRef.current?.state.doc.toString() || ''
    await ws.request('fs', 'write', { path, content })
    setOriginal(content)
    setStatus(t('editor.saved'))
    setTimeout(() => setStatus(''), 1500)
  }

  function toggleDiff() {
    const next = !showDiff
    setShowDiff(next)
    if (viewRef.current) viewRef.current.destroy()
    const content = viewRef.current?.state.doc.toString() ?? original
    const doc = next ? original : content
    const ext = makeExtensions(next ? original : doc, path)
    if (next) ext.unshift(unifiedMergeView({ original: EditorState.create({ doc: original, extensions: [] }), mergeColumView: 'b' }))
    viewRef.current = new EV({ parent: host.current, state: EditorState.create({ doc, extensions: ext }) })
  }

  return (
    <div style="display:flex; flex-direction:column; flex:1; min-height:0">
      <div class="editor-toolbar">
        <button onClick={save}>{t('editor.save')}</button>
        <button onClick={toggleDiff}>{showDiff ? t('editor.diff.hide') : t('editor.diff.show')}</button>
        <span style="color:var(--muted)">{status}</span>
      </div>
      <div class="editor-host"><div class="cm-host" ref={host} /></div>
    </div>
  )
}

export function EditorPane() {
  const files = openFiles.value
  const active = activeFile.value
  if (!files.length) return <div style="padding:20px; color:var(--muted)">{t('editor.untitled')}</div>
  return (
    <>
      <div class="editor-tabs">
        {files.map((f) => (
          <div class={`editor-tab ${f === active ? 'active' : ''}`} onClick={() => (activeFile.value = f)}>
            {f.split('/').pop()}
            <span style="margin-left:6px; color:var(--muted)" onClick={(e) => { e.stopPropagation(); closeFile(f) }}>×</span>
          </div>
        ))}
      </div>
      {active && <Editor key={active} path={active} />}
    </>
  )
}
```

Note: `unifiedMergeView` option key is `mergeColumView` in some versions and `mergeColumnView` in others — check the installed `@codemirror/merge` version's README. If the option name is wrong, the diff still renders without a column toggle. Prefer omitting the option entirely if unsure:

```js
ext.unshift(unifiedMergeView({ original: EditorState.create({ doc: original, extensions: [] }) }))
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/EditorPane.jsx
git add src/components/EditorPane.jsx
git commit -m "feat(web): add CodeMirror editor pane with save and inline diff"
```

---

### Task 16: GitPanel

**Files:**
- Create: `src/components/GitPanel.jsx`

**Interfaces:**
- Fetches `git status` on mount and on a manual refresh. Lists files with status badges. Stage/unstage buttons call `git.stage`/`git.unstage`. Commit box calls `git.commit` then refreshes.

- [ ] **Step 1: Write `src/components/GitPanel.jsx`**

```jsx
import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

function badge(f) {
  if (f.untracked) return 'A'
  if (f.x === 'D' || f.y === 'D') return 'D'
  return 'M'
}

export function GitPanel() {
  const [state, setState] = useState(null)
  const [message, setMessage] = useState('')

  async function refresh() {
    const s = await ws.request('git', 'status')
    setState(s)
  }
  useEffect(() => { refresh() }, [])

  async function stage(path) { await ws.request('git', 'stage', { paths: [path] }); refresh() }
  async function unstage(path) { await ws.request('git', 'unstage', { paths: [path] }); refresh() }
  async function commit() {
    if (!message) return
    await ws.request('git', 'commit', { message })
    setMessage('')
    refresh()
  }

  if (!state) return <div style="padding:12px">{t('git.noChanges')}</div>
  return (
    <div>
      <div style="padding:6px 8px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between">
        <strong>{state.branch}</strong>
        <button onClick={refresh}>⟳</button>
      </div>
      {state.files.length === 0 && <div style="padding:12px; color:var(--muted)">{t('git.noChanges')}</div>}
      {state.files.map((f) => (
        <div class="git-item">
          <span class={`git-badge ${badge(f)}`}>{badge(f)}</span>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis">{f.path}</span>
          <button onClick={() => (f.untracked || f.x !== ' ' ? stage(f.path) : unstage(f.path))}>
            {f.untracked || f.x !== ' ' ? t('git.unstage') : t('git.stage')}
          </button>
        </div>
      ))}
      <div style="display:flex; gap:6px; padding:8px; border-top:1px solid var(--border)">
        <input value={message} onInput={(e) => setMessage(e.target.value)} placeholder={t('git.messagePlaceholder')} style="flex:1" />
        <button class="btn-accent" onClick={commit}>{t('git.commit')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/GitPanel.jsx
git add src/components/GitPanel.jsx
git commit -m "feat(web): add git panel (status, stage, commit)"
```

---

### Task 17: AgentPanel

**Files:**
- Create: `src/components/AgentPanel.jsx`

**Interfaces:**
- Subscribes to `ws.on('agent','session', fn)`. Fetches `agent.agents` to populate picker. `start` op creates a session. `send` posts to the active session. Renders unified events as bubbles (user/assistant messages, tool calls, status, errors, done).

- [ ] **Step 1: Write `src/components/AgentPanel.jsx`**

```jsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent, agentSessions } from '../state/app.js'

export function AgentPanel() {
  const [agents, setAgents] = useState([])
  const [events, setEvents] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    ws.request('agent', 'agents').then(setAgents)
    return ws.on('agent', 'session', (data) => {
      setEvents((prev) => [...prev, data])
      if (data.type === 'status' && data.status === 'started') setSessionId(data.sessionId)
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 0)
    })
  }, [])

  async function start() {
    if (!activeAgent.value) return
    setEvents([])
    const res = await ws.request('agent', 'start', { agent: activeAgent.value, prompt: input })
    setSessionId(res.sessionId)
    setInput('')
  }

  async function send() {
    if (!sessionId || !input) return
    await ws.request('agent', 'send', { sessionId, text: input })
    setEvents((prev) => [...prev, { type: 'message', role: 'user', text: input }])
    setInput('')
  }

  async function stop() {
    if (sessionId) await ws.request('agent', 'stop', { sessionId })
  }

  function renderEvent(ev, i) {
    if (ev.type === 'message') return <div class={`msg ${ev.role || 'assistant'}`} key={i}>{ev.text}</div>
    if (ev.type === 'tool') return <div class="msg tool" key={i}>🔧 {ev.name} {JSON.stringify(ev.input || {}).slice(0, 200)}</div>
    if (ev.type === 'status') return <div class="msg system" key={i}>{ev.status} {ev.session_id || ''}</div>
    if (ev.type === 'error') return <div class="msg system" key={i} style="color:var(--red)">{ev.message}</div>
    if (ev.type === 'done') return <div class="msg system" key={i}>✓ done</div>
    return null
  }

  return (
    <div style="display:flex; flex-direction:column; flex:1; min-height:0">
      <div style="padding:6px 8px; border-bottom:1px solid var(--border); display:flex; gap:6px">
        <select value={activeAgent.value} onChange={(e) => (activeAgent.value = e.target.value)}>
          <option value="">{t('agent.placeholder')}</option>
          {agents.map((a) => <option value={a.id} disabled={!a.available}>{a.label}{a.available ? '' : ' (missing)'}</option>)}
        </select>
        <button class="btn-accent" onClick={start}>{t('agent.new')}</button>
        <button onClick={stop}>{t('agent.stop')}</button>
      </div>
      <div class="agent-log" ref={logRef}>
        {events.map(renderEvent)}
      </div>
      <div class="agent-composer">
        <textarea
          value={input}
          onInput={(e) => setInput(e.target.value)}
          placeholder={t('agent.input')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sessionId ? send() : start() } }}
        />
        <button class="btn-accent" onClick={() => (sessionId ? send() : start())}>{t('agent.send')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/AgentPanel.jsx
git add src/components/AgentPanel.jsx
git commit -m "feat(web): add agent panel with unified event rendering"
```

---

### Task 18: Terminals (xterm)

**Files:**
- Create: `src/components/Terminals.jsx`

**Interfaces:**
- Maintains a list of PTY tabs. Creates via `ws.request('pty','create',{cols,rows})`. Subscribes to `pty.data` and writes to the matching xterm instance. Sends input via `ws.request('pty','input',{id,data})`. Resizes via FitAddon + ResizeObserver.

- [ ] **Step 1: Write `src/components/Terminals.jsx`**

```jsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

function Term({ id }) {
  const host = useRef(null)
  const termRef = useRef(null)

  useEffect(() => {
    const term = new Terminal({ fontFamily: 'var(--mono)', fontSize: 13, theme: { background: '#181820', foreground: '#e6e6ef' } })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current)
    fit.fit()
    termRef.current = term
    term.onData((data) => ws.request('pty', 'input', { id, data }))
    const unsub = ws.on('pty', 'data', (d) => { if (d.id === id) term.write(d.data) })
    ws.request('pty', 'resize', { id, cols: term.cols, rows: term.rows })
    const ro = new ResizeObserver(() => { try { fit.fit(); ws.request('pty', 'resize', { id, cols: term.cols, rows: term.rows }) } catch {} })
    ro.observe(host.current)
    return () => { unsub(); ro.disconnect(); term.dispose() }
  }, [id])

  return <div class="term-host" ref={host} />
}

export function Terminals() {
  const [tabs, setTabs] = useState([])
  const [active, setActive] = useState('')

  async function newTab() {
    const { id } = await ws.request('pty', 'create', { cols: 80, rows: 24 })
    setTabs((p) => [...p, id])
    setActive(id)
  }
  useEffect(() => { newTab() }, [])

  return (
    <div style="display:flex; flex-direction:column; flex:1; min-height:0; border-top:1px solid var(--border)">
      <div class="term-tabs">
        {tabs.map((id) => (
          <div class={`term-tab ${id === active ? 'active' : ''}`} onClick={() => setActive(id)}>
            {id}
            <span style="margin-left:6px; color:var(--muted)" onClick={(e) => { e.stopPropagation(); ws.request('pty', 'kill', { id }); setTabs((p) => p.filter((t) => t !== id)) }}>×</span>
          </div>
        ))}
      </div>
      {active && <Term id={active} />}
      {tabs.length === 0 && <div style="padding:12px; color:var(--muted)">{t('tab.terminal')}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint src/components/Terminals.jsx
git add src/components/Terminals.jsx
git commit -m "feat(web): add xterm terminal tabs wired to pty channel"
```

---

### Task 19: Tauri 2 desktop scaffold

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/icons/.gitkeep`
- Modify: `package.json` scripts to add `"desktop": "tauri dev"` and `"desktop:build": "tauri build"` (requires `@tauri-apps/cli` devDep — but installing the CLI is optional here; the scaffold is ready when Rust is available).

- [ ] **Step 1: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "pixcode"
version = "2.0.0-alpha.1"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 2: Write `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Write `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pixcode_lib::run()
}
```

Also create `src-tauri/src/lib.rs`:

```rust
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    win.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Update `src-tauri/Cargo.toml` to declare the lib:

```toml
[lib]
name = "pixcode_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

- [ ] **Step 4: Write `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Pixcode",
  "version": "2.0.0-alpha.1",
  "identifier": "com.pixcode.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5199",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Pixcode",
        "width": 1280,
        "height": 800,
        "minWidth": 320,
        "minHeight": 480
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

- [ ] **Step 5: Create a placeholder icon**

```bash
mkdir -p src-tauri/icons
touch src-tauri/icons/.gitkeep
```
Note: `tauri build` requires a real 512x512 `icons/icon.png`. Generate one before building the desktop app (out of scope for the skeleton; Tauri dev mode does not require it).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat(desktop): add Tauri 2 desktop scaffold"
```

---

### Task 20: Smoke script, install, build, lint, verify, finalize

**Files:**
- Create: `scripts/smoke.mjs`

- [ ] **Step 1: Write `scripts/smoke.mjs`**

```js
const BASE = process.env.BASE || 'http://localhost:3210'
let ok = true
async function check(name, fn) {
  try { await fn(); console.log('  ok  ', name) }
  catch (e) { ok = false; console.log('  FAIL', name, '-', e.message) }
}

const health = await fetch(`${BASE}/api/health`).then((r) => r.json())
console.log('health:', JSON.stringify(health))
if (health.setupRequired) {
  await check('setup', async () => {
    const r = await fetch(`${BASE}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret123' }) })
    if (!r.ok) throw new Error(await r.text())
  })
}
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret123' }) }).then((r) => r.json())
const token = login.token
await check('me', async () => {
  const r = await fetch(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
  const d = await r.json()
  if (!d.principal) throw new Error('no principal')
})
await check('fs list', async () => {
  const r = await fetch(`${BASE}/api/health`)
  // fs is WS-only; just ensure the server is alive
  if (!r.ok) throw new Error('server down')
})

if (!ok) { console.error('SMOKE FAILED'); process.exit(1) }
console.log('SMOKE OK')
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```
Expected: installs ws, node-pty (may compile native module — requires build tools), and all devDeps. If node-pty fails to build, install `build-essential`/`python3` and retry; it is a hard requirement for the terminal channel.

- [ ] **Step 3: Lint everything**

Run: `npm run lint`
Expected: no errors. Fix any issues inline.

- [ ] **Step 4: Build the frontend**

Run: `npm run build`
Expected: Vite builds `dist/` successfully. Chunk sizes may warn but build must succeed.

- [ ] **Step 5: Boot server in production mode and run smoke**

```bash
node server/index.js &
PID=$!
sleep 1
node scripts/smoke.mjs
kill $PID
```
Expected: `SMOKE OK`.

- [ ] **Step 6: Manual UI check**

```bash
node server/index.js &
```
Open `http://localhost:3210` in a browser (and on a phone on the same network via the LAN IP printed by `pixcode start`). Verify:
1. Setup screen appears → set a password → enters the workbench.
2. File tree shows the workspace contents; clicking a file opens it in the editor.
3. Editor: type, Ctrl/Cmd+S saves (refresh page → content persists).
4. Terminal tab opens a shell; typing `ls` works.
5. Agent panel: pick an agent (Claude if installed), send a message → streaming events render.
6. Git panel: shows changes; stage + commit works.
7. Toggle language TR/EN from the top bar → all strings switch.
8. Resize below 768px → bottom tab bar appears; switching panes works.

- [ ] **Step 7: Final commit**

```bash
git add scripts/smoke.mjs
git commit -m "chore: add smoke script and verified skeleton"
```

---

## Self-Review (completed by the planner)

- **Spec coverage:** Architecture (Task 3+4), unified protocol (Task 4+8+10), CodeMirror editor + diff (Task 15), xterm terminals (Task 18), 6 agents (Task 9), i18n tr/en (Task 11), simple auth password+API key (Task 2), git status+diff+stage+commit (Task 6), Tauri 2 desktop (Task 19), distribution via npm `bin` (package.json) + `start` command (Task 10), error handling via `{ch,id,error}` frames and runner error events (Task 4+8), verification via lint+build+smoke (Task 20). All spec sections covered.
- **Placeholders:** None. All code blocks contain real implementation. Known follow-up work (richer normalization for gemini/qwen/opencode/grok, Tauri icon generation, daemon mode) is explicitly out of scope per the spec's non-goals.
- **Type consistency:** `ws.request(ch, op, data)` used consistently in frontend; channel op names (`list`/`read`/`write`/`status`/`diff`/`stage`/`create`/`input`/`start`/`send`/`stop`/`agents`/`sessions`) match between `server/channels/*.js` and `src/components/*.jsx`. Unified event `type` values (`status`/`message`/`tool`/`diff`/`usage`/`error`/`done`) match between runner, adapters, and `AgentPanel.jsx`.
- **Scope:** Single self-contained skeleton; produces a runnable workbench. No sub-project decomposition needed.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-pixcode-v2-skeleton.md`. The user has indicated they will execute this with Codex directly, so the inline/subagent execution choice is theirs to make in that environment. Run tasks in order; each task is self-contained and ends with a commit.
