import { CURRENT_VERSION, compareVersions } from './updater.js'

const TOKEN_KEY = 'pixcode.token'

// Tauri serves the built UI from its own origin. Point desktop requests at
// the bundled local server; browser/Vite builds keep using relative URLs so
// the development proxy and same-origin production server remain unchanged.
export const desktopRuntime = typeof location !== 'undefined' &&
  (location.hostname === 'tauri.localhost' || location.protocol === 'tauri:')
export let backendOrigin = desktopRuntime ? 'http://127.0.0.1:3001' : ''

const DESKTOP_PORT_START = 3001
const DESKTOP_PORT_END = 3021

function desktopOrigins() {
  if (!desktopRuntime) return ['']
  const origins = [backendOrigin]
  for (let port = DESKTOP_PORT_START; port <= DESKTOP_PORT_END; port += 1) {
    const origin = `http://127.0.0.1:${port}`
    if (!origins.includes(origin)) origins.push(origin)
  }
  return origins
}

export function resolveApiUrl(path) {
  return `${backendOrigin}${path}`
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(method, path, body, origin = backendOrigin) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (getToken()) headers.authorization = `Bearer ${getToken()}`
  const response = await fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { error: text || response.statusText } }
  if (!response.ok) throw Object.assign(new Error(data?.error || response.statusText), { status: response.status })
  return data
}

async function desktopHealth() {
  let lastError
  for (const origin of desktopOrigins()) {
    try {
      const data = await request('GET', '/api/health', undefined, origin)
      // A previous Pixcode daemon may still own port 3001 while the bundled
      // desktop server has moved to 3002. Never attach the UI to an older
      // protocol instance; continue scanning until the current server is
      // found instead.
      if (data?.name !== 'pixcode' || compareVersions(data.version, CURRENT_VERSION) < 0) throw new Error('outdated Pixcode server')
      backendOrigin = origin
      return data
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('server unavailable')
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  health: () => desktopRuntime ? desktopHealth() : request('GET', '/api/health')
}
