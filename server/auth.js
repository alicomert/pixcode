import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, VERSION } from './config.js'
import { sign, verify } from './util/jwt.js'
import { httpError, readBody } from './util/http.js'

const TOKEN_TTL = 24 * 60 * 60 * 1000
const OWNER_ID = 'owner'
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
  if (state && !Array.isArray(state.users)) {
    state.users = []
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

function checkHash(password, record) {
  if (!record?.salt || !record?.hash) return false
  const computed = hashPassword(password, record.salt).hash
  const actualBytes = Buffer.from(record.hash, 'hex')
  const computedBytes = Buffer.from(computed, 'hex')
  return actualBytes.length === computedBytes.length && crypto.timingSafeEqual(actualBytes, computedBytes)
}

function findUser(idOrName) {
  const needle = normalizeUsername(idOrName)
  return (state?.users || []).find((user) => user.id === idOrName || user.username === needle) || null
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    // null means unrestricted; an array is an allowlist of project/agent ids.
    projects: Array.isArray(user.projects) ? user.projects : null,
    agents: Array.isArray(user.agents) ? user.agents : null,
    disabled: !!user.disabled,
    created: user.created
  }
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
    keys: [],
    users: []
  }
  persist()
  return login(username, password)
}

function grant(payload, username, role) {
  return {
    token: sign(payload, state.secret, TOKEN_TTL),
    username,
    role,
    expiresIn: TOKEN_TTL
  }
}

export function login(username, password) {
  if (setupRequired()) throw httpError(428, 'setup required')
  // Password-only clients from pre-username releases continue to work.
  if (password === undefined) { password = username; username = state.username || 'admin' }
  if (!username) username = state.username || 'admin'
  username = normalizeUsername(username)
  if (username === normalizeUsername(state.username || 'admin') && checkHash(password, state.passwordHash)) {
    return grant({ sub: OWNER_ID, role: 'owner', username }, username, 'admin')
  }
  const user = (state.users || []).find((entry) => entry.username === username)
  if (!user || user.disabled || !checkHash(password, user.passwordHash)) throw httpError(401, 'invalid credentials')
  return grant({ sub: user.id, role: user.role, username: user.username }, user.username, user.role)
}

export function verifyToken(token) {
  return state?.secret ? verify(token, state.secret) : null
}

// Turn a verified JWT payload into the live principal. The user record is
// re-read here (and again per operation via accessFor) so disabling or
// deleting an account revokes access without waiting for token expiry.
export function resolvePrincipal(payload) {
  if (!payload) return null
  if (payload.role === 'owner' || payload.sub === OWNER_ID) {
    return state?.username ? { sub: OWNER_ID, username: state.username, role: 'admin' } : null
  }
  const user = findUser(payload.sub) || findUser(payload.username)
  if (!user || user.disabled) return null
  return { sub: user.id, username: user.username, role: user.role }
}

// Fresh per-operation access view. Returns null when the account is gone or
// disabled so channels can reject mid-session revocation.
export function accessFor(ctx) {
  const principal = ctx?.principal
  if (!principal) return null
  if (principal.sub === OWNER_ID || principal.role === 'owner') {
    return { admin: true, projects: null, agents: null, username: state?.username || 'admin' }
  }
  const user = findUser(principal.sub) || findUser(principal.username)
  if (!user || user.disabled) return null
  const admin = user.role === 'admin'
  return {
    admin,
    projects: admin ? null : (Array.isArray(user.projects) ? new Set(user.projects) : null),
    agents: admin ? null : (Array.isArray(user.agents) ? new Set(user.agents) : null),
    username: user.username
  }
}

export function requireAccess(ctx) {
  const access = accessFor(ctx)
  if (!access) throw httpError(401, 'session revoked')
  return access
}

export function requireAdmin(ctx) {
  const access = requireAccess(ctx)
  if (!access.admin) throw httpError(403, 'admin required')
  return access
}

export function listUsers() {
  const users = (state?.users || []).map(publicUser)
  if (state?.username) {
    users.unshift({
      id: OWNER_ID,
      username: state.username,
      role: 'admin',
      projects: null,
      agents: null,
      disabled: false,
      created: 0,
      owner: true
    })
  }
  return users
}

export function createUser({ username, password, role = 'member', projects = null, agents = null } = {}) {
  if (setupRequired()) throw httpError(428, 'setup required')
  username = normalizeUsername(username)
  if (!validUsername(username)) throw httpError(400, 'username must be 3-32 characters (letters, numbers, ., _, -)')
  if (String(password || '').length < 6) throw httpError(400, 'password too short')
  if (!['admin', 'member'].includes(role)) throw httpError(400, 'role must be admin or member')
  if (username === normalizeUsername(state.username) || findUser(username)) throw httpError(409, 'username taken')
  const user = {
    id: `u_${crypto.randomBytes(9).toString('base64url')}`,
    username,
    passwordHash: hashPassword(password),
    role,
    projects: normalizeAllowlist(projects),
    agents: normalizeAllowlist(agents),
    disabled: false,
    created: Date.now()
  }
  state.users.push(user)
  persist()
  return publicUser(user)
}

function normalizeAllowlist(value) {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const list = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  return list
}

export function updateUser(id, patch = {}) {
  const user = findUser(id)
  if (!user) throw httpError(404, 'user not found')
  if (patch.username !== undefined) {
    const username = normalizeUsername(patch.username)
    if (!validUsername(username)) throw httpError(400, 'username must be 3-32 characters (letters, numbers, ., _, -)')
    if (username !== user.username && (username === normalizeUsername(state.username) || findUser(username))) throw httpError(409, 'username taken')
    user.username = username
  }
  if (patch.password) {
    if (String(patch.password).length < 6) throw httpError(400, 'password too short')
    user.passwordHash = hashPassword(patch.password)
  }
  if (patch.role !== undefined) {
    if (!['admin', 'member'].includes(patch.role)) throw httpError(400, 'role must be admin or member')
    if (patch.role !== 'admin' && countAdmins() <= 1 && user.role === 'admin') throw httpError(400, 'last admin cannot be demoted')
    user.role = patch.role
  }
  if (patch.projects !== undefined) user.projects = normalizeAllowlist(patch.projects)
  if (patch.agents !== undefined) user.agents = normalizeAllowlist(patch.agents)
  if (patch.disabled !== undefined) {
    if (patch.disabled && countAdmins() <= 1 && user.role === 'admin' && !user.disabled) throw httpError(400, 'last admin cannot be disabled')
    user.disabled = !!patch.disabled
  }
  persist()
  return publicUser(user)
}

export function removeUser(id) {
  const user = findUser(id)
  if (!user) return false
  if (user.role === 'admin' && countAdmins() <= 1) throw httpError(400, 'last admin cannot be removed')
  state.users = state.users.filter((entry) => entry.id !== user.id)
  persist()
  return true
}

function countAdmins() {
  return 1 + (state?.users || []).filter((user) => user.role === 'admin' && !user.disabled).length
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
  if (bearer?.startsWith('px_')) return checkApiKey(bearer) ? { sub: OWNER_ID, role: 'admin' } : null
  if (bearer) return resolvePrincipal(verifyToken(bearer))
  const apiKey = req.headers['x-api-key']
  return apiKey && checkApiKey(apiKey) ? { sub: OWNER_ID, role: 'admin' } : null
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
  router.post('/api/auth/keys', async (req) => {
    requireAdmin({ principal: req.principal })
    return issueApiKey((await readBody(req)).name)
  })
  router.get('/api/auth/keys', (req) => {
    requireAdmin({ principal: req.principal })
    return listApiKeys()
  })
  router.delete('/api/auth/keys/:id', (req) => {
    requireAdmin({ principal: req.principal })
    return { revoked: revokeApiKey(req.params.id) }
  })
  router.get('/api/auth/users', (req) => {
    requireAdmin({ principal: req.principal })
    return listUsers()
  })
  router.post('/api/auth/users', async (req) => {
    requireAdmin({ principal: req.principal })
    return createUser(await readBody(req))
  })
  router.put('/api/auth/users/:id', async (req) => {
    requireAdmin({ principal: req.principal })
    return updateUser(req.params.id, await readBody(req))
  })
  router.delete('/api/auth/users/:id', (req) => {
    requireAdmin({ principal: req.principal })
    return { removed: removeUser(req.params.id) }
  })
}
