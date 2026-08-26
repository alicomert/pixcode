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
import { initializeWorkspace } from './projects.js'
import { projectChannel } from './channels/project.channel.js'

function allowLocalOrigin(origin) {
  if (!origin) return false
  if (origin === 'tauri://localhost' || origin === 'http://tauri.localhost' || origin === 'https://tauri.localhost') return true
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function setCors(req, res) {
  const origin = req.headers.origin
  if (!allowLocalOrigin(origin)) return false
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('vary', 'Origin')
  return true
}

export function createHttpServer() {
  loadAuth()
  initializeWorkspace()
  const router = new Router()
  authRoutes(router)
  const distExists = fs.existsSync(config.distDir)
  const server = http.createServer(async (req, res) => {
    const localOrigin = setCors(req, res)
    if (req.method === 'OPTIONS' && localOrigin) {
      res.writeHead(204)
      res.end()
      return
    }
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
  hub.register('project', projectChannel)
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
  // A daemon child is supervised by the platform service/launcher. Keep the
  // process in the foreground so signals terminate the HTTP server cleanly;
  // the parent daemon command is the component that detaches from the shell.
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer()
