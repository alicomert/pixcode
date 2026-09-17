import { api, backendOrigin, getToken, setToken } from './api.js'

function clientId() {
  const key = 'pixcode.clientId'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const value = globalThis.crypto?.randomUUID?.() || `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, value)
    return value
  } catch {
    // Storage can be unavailable (private mode, locked profile). A shared
    // 'legacy' id would merge sessions across every such client — fall back
    // to a per-page random id instead.
    return clientId.memory ||= `mem_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  }
}

// JWT bodies carry `exp` in ms. Reading it here lets the client skip a doomed
// upgrade and go straight to the login screen instead of retrying a dead
// credential forever. Non-JWT keys (px_…) fail the parse and connect normally.
function tokenExpired() {
  const token = getToken()
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.exp || payload.exp < Date.now()
  } catch {
    return false
  }
}

export class MultiplexWS {
  constructor() {
    this.socket = null
    this.handlers = new Map()
    this.pending = new Map()
    this.queue = []
    this.counter = 0
    this.reconnectTimer = null
    this.closed = false
    this.attempts = 0
    this.authFailed = false
  }

  // The session is unrecoverable (expired token, revoked account): drop the
  // credential once and bounce the app back to the login gate.
  expireSession() {
    if (this.authFailed) return
    this.authFailed = true
    this.failedToken = getToken()
    setToken('')
    // The revoked-account path reaches here with the socket still open —
    // close it so the server drops the connection instead of serving ops.
    this.socket?.close()
    window.dispatchEvent(new Event('pixcode:auth-expired'))
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer || this.authFailed) return
    // 1s → 2s → 4s → 8s → capped at ~15s with jitter so a room of clients
    // does not stampede the server the moment it comes back.
    const delay = Math.min(1_000 * 2 ** this.attempts, 15_000) + Math.random() * 500
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  connect() {
    this.closed = false
    const token = getToken()
    // A fresh login replaces the dead credential — that is the only thing
    // allowed to clear authFailed and let the socket try again.
    if (this.authFailed && token && token !== this.failedToken) this.authFailed = false
    if (this.socket || !token || this.authFailed) return
    if (tokenExpired()) { this.expireSession(); return }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const endpoint = backendOrigin ? backendOrigin.replace(/^http/, 'ws') : `${protocol}//${location.host}`
    const socket = new WebSocket(`${endpoint}/ws?token=${encodeURIComponent(token)}&client=${encodeURIComponent(clientId())}`)
    this.socket = socket
    socket.wasOpen = false
    socket.onopen = () => {
      socket.wasOpen = true
      this.attempts = 0
      for (const frame of this.queue.splice(0)) socket.send(frame)
      // Let mounted views re-attach long-lived sessions and re-fit terminals
      // after a transient connection loss.
      window.dispatchEvent(new Event('pixcode:ws-open'))
    }
    this.socket.onmessage = (event) => {
      let frame
      try { frame = JSON.parse(event.data) } catch { return }
      if (frame.id && this.pending.has(frame.id)) {
        const pending = this.pending.get(frame.id)
        this.pending.delete(frame.id)
        if (frame.ok) pending.resolve(frame.data)
        else {
          // An account disabled/deleted mid-session fails every op with this
          // marker — treat it like an expired token and drop to the gate.
          if (frame.error === 'session revoked') this.expireSession()
          pending.reject(new Error(frame.error || 'websocket error'))
        }
        return
      }
      if (!frame.ev) return
      const listeners = this.handlers.get(`${frame.ch}:${frame.ev}`)
      if (listeners) {
        for (const listener of listeners) {
          // A throwing view handler must not starve the remaining listeners
          // on the same frame or kill the message pump.
          try { listener(frame.data) } catch (error) { console.error('[ws] listener error', error) }
        }
      }
    }
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null
      // A request attached to a socket that has already closed can never be
      // answered. Reject it so hydration/loading guards are released and the
      // next reconnect can issue a fresh request instead of leaving the
      // terminal permanently waiting.
      for (const pending of this.pending.values()) pending.reject(new Error('websocket disconnected'))
      this.pending.clear()
      this.queue = []
      if (this.closed || !getToken()) return
      if (!socket.wasOpen) {
        // The upgrade itself was refused — either the token died (401) or the
        // server is unreachable. Probe the REST endpoint once: a 401 means
        // the session is over, anything else means keep retrying.
        api.get('/api/auth/me').then(
          () => this.scheduleReconnect(),
          (error) => {
            if (error?.status === 401) this.expireSession()
            else this.scheduleReconnect()
          }
        )
        return
      }
      this.scheduleReconnect()
    }
    socket.onerror = () => {}
  }

  send(frame) {
    const encoded = JSON.stringify(frame)
    this.connect()
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encoded)
    else {
      // While disconnected, every send would buffer — including keystrokes
      // typed into a dead terminal, which must never replay on reconnect.
      // Cap the backlog and keep the newest frames.
      this.queue.push(encoded)
      if (this.queue.length > 256) this.queue.splice(0, this.queue.length - 256)
    }
  }

  request(ch, op, data = {}) {
    const id = `r${++this.counter}`
    return new Promise((resolve, reject) => {
      // A response lost between the server and this frame would otherwise
      // pin a loading spinner forever — reject after a hard ceiling.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('request timed out'))
      }, 60_000)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) }
      })
      this.send({ ch, id, op, data })
    })
  }

  on(ch, ev, listener) {
    const key = `${ch}:${ev}`
    if (!this.handlers.has(key)) this.handlers.set(key, new Set())
    this.handlers.get(key).add(listener)
    this.connect()
    return () => this.handlers.get(key)?.delete(listener)
  }

  close() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    for (const pending of this.pending.values()) pending.reject(new Error('websocket closed'))
    this.pending.clear()
    this.queue = []
  }
}

export const ws = new MultiplexWS()
