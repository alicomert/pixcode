import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './util/http.js'
import { saveGitAccount } from './git-account.js'

// GitHub OAuth device flow — the "sign in with GitHub" path. Pixcode asks
// GitHub for a short user code, the user approves it in their browser, and
// the resulting token lands in the per-account store. No PAT handling.
//
// The device flow needs a public OAuth App client_id (like the `gh` CLI
// embeds its own). Resolution order: PIXCODE_GITHUB_CLIENT_ID env, then the
// admin-managed value in git-oauth.json (written 0600, readable shape only
// exposes whether one is set).
const OAUTH_FILE = path.join(config.dataDir, 'git-oauth.json')
const SCOPES = 'repo workflow read:user user:email'

const GITHUB_HEADERS = { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'pixcode' }

function readConfig() {
  try { return JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')) } catch { return {} }
}

function writeConfig(record) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(OAUTH_FILE, JSON.stringify(record), { mode: 0o600 })
  } catch {
    throw httpError(500, 'could not save oauth config')
  }
}

export function githubClientId() {
  const env = String(process.env.PIXCODE_GITHUB_CLIENT_ID || '').trim()
  if (env) return env
  return String(readConfig().clientId || '').trim()
}

export function setGithubClientId(value) {
  const clientId = String(value || '').trim()
  // GitHub OAuth client ids are hex strings; a loose sanity check catches
  // pasted secrets (which must never be stored here) and typos.
  if (clientId && !/^[a-zA-Z0-9]{8,40}$/.test(clientId)) throw httpError(400, 'invalid client id')
  writeConfig({ ...readConfig(), clientId })
  return { clientIdSet: Boolean(clientId || githubClientId()) }
}

// --- Self-bootstrap: GitHub App manifest flow -------------------------------
// Self-hosted OAuth needs a registered app. Instead of asking the admin to
// fill GitHub's developer form, Pixcode posts a manifest to
// github.com/settings/apps/new — the admin only presses the green "Create"
// button, GitHub redirects back with a code, and the conversion response
// carries the client_id. One click of real work, like a hosted app's
// "sign in with GitHub" but owned by this instance.
const bootstrapNonces = new Map()

export function oauthConfigInfo() {
  const record = readConfig()
  return { clientIdSet: Boolean(githubClientId()), slug: record.slug || '', webFlow: Boolean(record.clientSecret) }
}

export function appBootstrap(origin) {
  const nonce = crypto.randomUUID()
  const callback = `${origin}/api/git/app/callback`
  bootstrapNonces.set(nonce, Date.now())
  // Drop stale nonces so the map never grows.
  for (const [key, ts] of bootstrapNonces) if (Date.now() - ts > 15 * 60_000) bootstrapNonces.delete(key)
  return {
    state: nonce,
    manifest: {
      name: `Pixcode ${nonce.slice(0, 4)}`,
      url: origin,
      description: 'Self-hosted coding workbench — Git sign-in',
      public: false,
      redirect_url: callback,
      callback_urls: [`${origin}/api/git/oauth/callback`],
      request_oauth_on_install: false,
      // contents:write lets the user's token push/pull; emails:read lets the
      // connect step resolve a real commit email instead of noreply.
      default_permissions: { contents: 'write', emails: 'read' }
    }
  }
}

export async function convertBootstrap(code, state) {
  if (!bootstrapNonces.delete(state)) throw httpError(403, 'unknown or expired bootstrap state')
  const data = await githubPost(`https://api.github.com/app-manifests/${encodeURIComponent(String(code || ''))}/conversions`, {})
  if (!data.client_id) throw httpError(502, 'unexpected github response')
  // The web OAuth exchange needs client_secret; it stays in this 0600 store
  // and is never returned to any client.
  writeConfig({ ...readConfig(), clientId: data.client_id, clientSecret: data.client_secret || '', slug: data.slug || '' })
  return { clientIdSet: true, slug: data.slug || '' }
}

// --- Web OAuth flow (the "Authorize" button path) ---------------------------
// GitHub Apps support the standard authorization-code flow with no opt-in —
// unlike device flow, which GitHub gates behind a manual settings checkbox.
// The state nonce binds the redirect back to the principal who clicked
// connect, so the callback needs no session cookie.
const webNonces = new Map()

export function webStart(sub) {
  const clientId = githubClientId()
  if (!clientId) throw httpError(400, 'github client id not configured')
  const nonce = crypto.randomUUID()
  webNonces.set(nonce, { sub: String(sub || 'owner'), ts: Date.now() })
  for (const [key, entry] of webNonces) if (Date.now() - entry.ts > 15 * 60_000) webNonces.delete(key)
  return { url: `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(nonce)}` }
}

// Verifies the state, swaps the code for a user access token and adopts the
// GitHub profile as that user's commit identity — all in the callback, so the
// workbench tab just watches its account record appear.
export async function webComplete(code, state) {
  const entry = webNonces.get(String(state || ''))
  if (!entry) throw httpError(403, 'unknown or expired oauth state')
  webNonces.delete(String(state))
  const clientSecret = String(readConfig().clientSecret || '')
  if (!clientSecret) throw httpError(400, 'github client secret not configured')
  const data = await githubPost('https://github.com/login/oauth/access_token', {
    client_id: githubClientId(),
    client_secret: clientSecret,
    code: String(code || '')
  })
  if (!data.access_token) throw httpError(502, `github oauth error: ${data.error || 'unknown'}`)
  return adoptGithubUser(entry.sub, data.access_token)
}

// Shared by every token source (web flow, device flow, manual PAT): verify
// the token, fetch the profile + primary email, store both.
export async function adoptGithubUser(sub, token) {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'pixcode' }
  let profile
  try {
    const res = await fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw httpError(401, 'github token rejected')
    profile = await res.json()
  } catch (error) {
    if (error.status) throw error
    throw httpError(502, 'github unreachable')
  }
  let email = ''
  try {
    const res = await fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(8_000) })
    if (res.ok) {
      const list = await res.json()
      email = list.find((item) => item.primary)?.email || list[0]?.email || ''
    }
  } catch { /* noreply fallback below */ }
  const github = { login: profile.login, name: profile.name || profile.login, avatarUrl: profile.avatar_url || '' }
  return saveGitAccount({ principal: { sub } }, {
    host: 'github.com',
    token,
    name: github.name,
    email: email || `${profile.login}@users.noreply.github.com`,
    github
  })
}

async function githubPost(url, payload) {
  let res
  try {
    res = await fetch(url, { method: 'POST', headers: GITHUB_HEADERS, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
  } catch {
    throw httpError(502, 'github unreachable')
  }
  // GitHub 404s the device endpoints when the client_id is unknown — surface
  // that as a configuration error, not a generic gateway failure.
  if (res.status === 404) throw httpError(400, 'invalid github client id')
  if (!res.ok) {
    let detail = `github returned ${res.status}`
    try { detail = (await res.json()).error_description || detail } catch { void 0 }
    throw httpError(502, detail)
  }
  return res.json()
}

export async function deviceStart() {
  const clientId = githubClientId()
  if (!clientId) throw httpError(400, 'github client id not configured')
  const data = await githubPost('https://github.com/login/device/code', { client_id: clientId, scope: SCOPES })
  if (!data.device_code || !data.user_code) throw httpError(502, 'unexpected github response')
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://github.com/login/device',
    interval: Math.max(Number(data.interval) || 5, 5),
    expiresIn: Number(data.expires_in) || 900
  }
}

// One poll round. Returns { status: 'pending', interval } while the user is
// still on GitHub's page, or { status: 'authorized', token } once approved.
export async function devicePoll(deviceCode) {
  const clientId = githubClientId()
  if (!clientId) throw httpError(400, 'github client id not configured')
  const data = await githubPost('https://github.com/login/oauth/access_token', {
    client_id: clientId,
    device_code: String(deviceCode || ''),
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
  })
  if (data.access_token) return { status: 'authorized', token: data.access_token }
  const error = data.error || 'authorization_pending'
  if (error === 'authorization_pending') return { status: 'pending', interval: 0 }
  if (error === 'slow_down') return { status: 'pending', interval: 5 }
  if (error === 'expired_token') throw httpError(408, 'device code expired')
  if (error === 'access_denied') throw httpError(403, 'authorization denied')
  throw httpError(502, `github oauth error: ${error}`)
}

const CALLBACK_PAGE = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{background:#0b0e13;color:#e7eaf0;font:14px/1.6 system-ui;display:grid;place-items:center;min-height:100vh;margin:0}div{max-width:360px;text-align:center}h1{font-size:18px}p{color:#98a2b3}</style></head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`

export function oauthRoutes(router) {
  // GitHub redirects the admin's browser here after the manifest "Create"
  // click. The one-time `state` nonce is the authorization — the browser
  // carries no session cookie on a cross-site redirect.
  router.get('/api/git/app/callback', async (req, res) => {
    try {
      await convertBootstrap(req.query.get('code'), req.query.get('state'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(CALLBACK_PAGE('GitHub connected', 'The Pixcode GitHub App was created. You can close this tab and connect from the Git panel.'))
    } catch (error) {
      res.writeHead(error.status || 500, { 'content-type': 'text/html; charset=utf-8' })
      res.end(CALLBACK_PAGE('Setup failed', error.message || 'unknown error'))
    }
  }, { auth: false })

  // The per-user authorize redirect lands here. `state` proves which signed-in
  // principal started the flow; the exchange + account save happen server-side.
  router.get('/api/git/oauth/callback', async (req, res) => {
    try {
      await webComplete(req.query.get('code'), req.query.get('state'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(CALLBACK_PAGE('GitHub connected', 'Your account is linked. You can close this tab — the Git panel already shows your profile.'))
    } catch (error) {
      res.writeHead(error.status || 500, { 'content-type': 'text/html; charset=utf-8' })
      res.end(CALLBACK_PAGE('Connection failed', error.message || 'unknown error'))
    }
  }, { auth: false })
}
