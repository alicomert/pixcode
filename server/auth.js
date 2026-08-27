import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, VERSION } from './config.js'
import { sign, verify } from './util/jwt.js'
import { httpError, readBody } from './util/http.js'

const TOKEN_TTL = 24 * 60 * 60 * 1000
let state = null

function authFile() {
  return path.join(config.dataDir, 'auth.json')
}

export function loadAuth() {
  try {
    state = JSON.parse(fs.readFileSync(authFile(), 'utf8'))
  } catch {
    state = null
  }
  if (!state || typeof state !== 'object') state = null
  // v2.0.5 stored only a password. Preserve those installations by assigning
  // the documented default account name on first load.
  if (state && !state.username && state.passwordHash?.salt && state.passwordHash?.hash && state.secret) {
    state.username = 'admin'
    persist()
  }
}

export function setupRequired() {
  return !state?.passwordHash?.salt || !state?.passwordHash?.hash || !state?.secret
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(authFile(), JSON.stringify(state, null, 2), { mode: 0o600 })
  try { fs.chmodSync(authFile(), 0o600) } catch { void 0 }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase()
}

function validUsername(username) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)
}

function verifyPassword(password) {
  if (!state?.passwordHash) return false
  const computed = hashPassword(password, state.passwordHash.salt).hash
  const actualBytes = Buffer.from(state.passwordHash.hash, 'hex')
  const computedBytes = Buffer.from(computed, 'hex')
  return actualBytes.length === computedBytes.length && crypto.timingSafeEqual(actualBytes, computedBytes)
}

export function setup(username, password) {
  if (!setupRequired()) throw httpError(409, 'already set up')
  // Keep the old function shape usable for scripts and older clients.
  if (password === undefined) { password = username; username = 'admin' }
  if (!username) username = 'admin'
  username = normalizeUsername(username)
  if (!validUsername(username)) throw httpError(400, 'username must be 3-32 characters (letters, numbers, ., _, -)')
  if (String(password || '').length < 6) throw httpError(400, 'password too short')
  state = {
    username,
    passwordHash: hashPassword(password),
    secret: crypto.randomBytes(32).toString('hex'),
    keys: []
  }
  persist()
  return login(username, password)
}

export function login(username, password) {
  if (setupRequired()) throw httpError(428, 'setup required')
  // Password-only clients from pre-username releases continue to work.
  if (password === undefined) { password = username; username = state.username || 'admin' }
  if (!username) username = state.username || 'admin'
  username = normalizeUsername(username)
  if (username !== normalizeUsername(state.username || 'admin') || !verifyPassword(password)) throw httpError(401, 'invalid credentials')
  return {
    token: sign({ sub: 'owner', role: 'owner', username }, state.secret, TOKEN_TTL),
    username,
    expiresIn: TOKEN_TTL
  }
}

export function verifyToken(token) {
  return state?.secret ? verify(token, state.secret) : null
}

export function issueApiKey(name) {
  if (setupRequired()) throw httpError(428, 'setup required')
  const key = `px_${crypto.randomBytes(24).toString('base64url')}`
  const record = {
    id: crypto.randomUUID(),
    name: String(name || 'default').slice(0, 64),
    prefix: key.slice(0, 8),
    hash: crypto.createHash('sha256').update(key).digest('hex'),
    created: Date.now()
  }
  state.keys = Array.isArray(state.keys) ? state.keys : []
  state.keys.push(record)
  persist()
  return { id: record.id, key, name: record.name }
}

export function listApiKeys() {
  return (state?.keys || []).map(({ id, name, prefix, created }) => ({ id, name, prefix, created }))
}

export function revokeApiKey(id) {
  if (!state?.keys) return false
  const before = state.keys.length
  state.keys = state.keys.filter((key) => key.id !== id)
  if (state.keys.length !== before) persist()
  return state.keys.length !== before
}

export function checkApiKey(key) {
  if (!state?.keys || !key) return false
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex')
  return state.keys.some((record) => {
    const actualBytes = Buffer.from(record.hash, 'hex')
    const expectedBytes = Buffer.from(hash, 'hex')
    return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes)
  })
}

export function authMiddleware(req) {
  const authorization = req.headers.authorization || ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (bearer?.startsWith('px_')) return checkApiKey(bearer) ? { sub: 'owner', role: 'owner' } : null
  if (bearer) return verifyToken(bearer)
  const apiKey = req.headers['x-api-key']
  return apiKey && checkApiKey(apiKey) ? { sub: 'owner', role: 'owner' } : null
}

export function authRoutes(router) {
  router.get('/api/health', () => ({ ok: true, name: 'pixcode', version: VERSION, setupRequired: setupRequired() }), { auth: false })
  router.post('/api/auth/setup', async (req) => {
    const body = await readBody(req)
    return setup(body.username || 'admin', body.password)
  }, { auth: false })
  router.post('/api/auth/login', async (req) => {
    const body = await readBody(req)
    return login(body.username, body.password)
  }, { auth: false })
  router.get('/api/auth/me', (req) => ({ principal: req.principal }))
  router.post('/api/auth/keys', async (req) => issueApiKey((await readBody(req)).name))
  router.get('/api/auth/keys', () => listApiKeys())
  router.delete('/api/auth/keys/:id', (req) => ({ revoked: revokeApiKey(req.params.id) }))
}
