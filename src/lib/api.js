const TOKEN_KEY = 'pixcode.token'

// Tauri serves the built UI from its own origin. Point desktop requests at
// the bundled local server; browser/Vite builds keep using relative URLs so
// the development proxy and same-origin production server remain unchanged.
export const backendOrigin = typeof location !== 'undefined' &&
  (location.hostname === 'tauri.localhost' || location.protocol === 'tauri:')
  ? 'http://127.0.0.1:3001'
  : ''

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

async function request(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (getToken()) headers.authorization = `Bearer ${getToken()}`
  const response = await fetch(resolveApiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { error: text || response.statusText } }
  if (!response.ok) throw Object.assign(new Error(data?.error || response.statusText), { status: response.status })
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  health: () => request('GET', '/api/health')
}
