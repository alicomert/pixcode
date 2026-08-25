import { WebSocketServer } from 'ws'
import { verifyToken, checkApiKey } from './auth.js'

export function createHub(server) {
  const channels = new Map()
  const connections = new Set()
  const wss = new WebSocketServer({ noServer: true })

  function authenticate(url) {
    const key = url.searchParams.get('key')
    if (key && checkApiKey(key)) return { sub: 'owner', role: 'owner' }
    const token = url.searchParams.get('token')
    return token ? verifyToken(token) : null
  }

  function broadcast(channel, event, data) {
    const frame = JSON.stringify({ ch: channel, ev: event, data })
    for (const connection of connections) {
      if (connection.readyState === 1) connection.send(frame)
    }
  }

  server.on('upgrade', (req, socket, head) => {
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { socket.destroy(); return }
    if (url.pathname !== '/ws') { socket.destroy(); return }
    const principal = authenticate(url)
    if (!principal) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      connections.add(ws)
      const context = {
        principal,
        ws,
        ch: {},
        send: (frame) => { if (ws.readyState === 1) ws.send(JSON.stringify(frame)) },
        request: async (channelName, operationName, data = {}) => {
          const channel = channels.get(channelName)
          const operation = channel?.ops?.[operationName]
          if (typeof operation !== 'function') throw new Error('unknown operation')
          return operation(context, data)
        }
      }
      context.emit = (channel, event, data) => context.send({ ch: channel, ev: event, data })
      for (const channel of channels.values()) {
        try { channel.onOpen?.(context) } catch { void 0 }
      }
      ws.on('message', async (raw) => {
        let frame
        try { frame = JSON.parse(raw.toString()) } catch { return }
        if (!frame || typeof frame !== 'object' || typeof frame.ch !== 'string') return
        const channel = channels.get(frame.ch)
        if (!channel) { context.send({ ch: frame.ch, id: frame.id, ok: false, error: 'unknown channel' }); return }
        const operation = channel.ops?.[frame.op]
        if (typeof operation !== 'function') { context.send({ ch: frame.ch, id: frame.id, ok: false, error: 'unknown op' }); return }
        try {
          const data = frame.data && typeof frame.data === 'object' ? frame.data : frame
          const result = await operation(context, data)
          context.send({ ch: frame.ch, id: frame.id, ok: true, data: result })
        } catch (error) {
          context.send({ ch: frame.ch, id: frame.id, ok: false, error: error.message || 'channel error' })
        }
      })
      ws.on('close', () => {
        connections.delete(ws)
        for (const channel of channels.values()) {
          try { channel.onClose?.(context) } catch { void 0 }
        }
      })
      ws.on('error', () => {})
    })
  })

  function register(name, channel) {
    channels.set(name, channel)
    for (const context of connections) channel.onOpen?.(context)
  }

  return { register, registerChannel: register, broadcast }
}
