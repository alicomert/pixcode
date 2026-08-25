import { getToken } from './api.js'

export class MultiplexWS {
  constructor() {
    this.socket = null
    this.handlers = new Map()
    this.pending = new Map()
    this.queue = []
    this.counter = 0
    this.reconnectTimer = null
    this.closed = false
  }

  connect() {
    if (this.closed || this.socket || !getToken()) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = encodeURIComponent(getToken())
    this.socket = new WebSocket(`${protocol}//${location.host}/ws?token=${token}`)
    this.socket.onopen = () => {
      for (const frame of this.queue.splice(0)) this.socket.send(frame)
    }
    this.socket.onmessage = (event) => {
      let frame
      try { frame = JSON.parse(event.data) } catch { return }
      if (frame.id && this.pending.has(frame.id)) {
        const pending = this.pending.get(frame.id)
        this.pending.delete(frame.id)
        if (frame.ok) pending.resolve(frame.data)
        else pending.reject(new Error(frame.error || 'websocket error'))
        return
      }
      if (!frame.ev) return
      const listeners = this.handlers.get(`${frame.ch}:${frame.ev}`)
      if (listeners) for (const listener of listeners) listener(frame.data)
    }
    this.socket.onclose = () => {
      this.socket = null
      if (!this.closed && getToken()) this.reconnectTimer = setTimeout(() => this.connect(), 1_000)
    }
    this.socket.onerror = () => {}
  }

  send(frame) {
    const encoded = JSON.stringify(frame)
    this.connect()
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encoded)
    else this.queue.push(encoded)
  }

  request(ch, op, data = {}) {
    const id = `r${++this.counter}`
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
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
