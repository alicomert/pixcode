import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, VERSION } from './config.js'
import { authMiddleware, authRoutes, loadAuth } from './auth.js'
import { Router } from './router.js'
import { serveStatic } from './static.js'
import { sendJson } from './util/http.js'
import { createHub } from './ws.js'
import { fsChannel } from './channels/fs.channel.js'
import { gitChannel } from './channels/git.channel.js'
import { ptyChannel } from './channels/pty.channel.js'
import { agentChannel } from './channels/agent.channel.js'
import { authChannel } from './channels/auth.channel.js'
import { registerAllAdapters } from './agents/adapters/index.js'

export function createHttpServer() {
  loadAuth()
  fs.mkdirSync(config.workspace, { recursive: true })
  const router = new Router()
  authRoutes(router)
  const distExists = fs.existsSync(config.distDir)
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/api/')) {
      const handled = await router.handle(req, res, { verify: authMiddleware })
      if (handled || res.writableEnded) return
      sendJson(res, 404, { error: 'not found' })
      return
    }
    if (distExists && serveStatic(req, res, config.distDir)) return
    sendJson(res, 404, { error: 'not found' })
  })
  server.on('clientError', (_error, socket) => socket.destroy())

  const hub = createHub(server)
  registerAllAdapters()
  hub.register('auth', authChannel)
  hub.register('fs', fsChannel)
  hub.register('git', gitChannel)
  hub.register('pty', ptyChannel)
  hub.register('agent', agentChannel)
  return { server, router, hub }
}

export function startServer(options = {}) {
  const { server } = createHttpServer()
  const port = Number(options.port || config.port)
  const host = options.host || config.host
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host
    console.log(`pixcode v${VERSION} listening on http://${displayHost}:${port}`)
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer()
