import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from './config.js'
import { sendJson } from './util/http.js'
import { workspacePath } from './workspace.js'
import { resolvePrincipal, verifyToken } from './auth.js'

const execFileAsync = promisify(execFile)

// Ports that commonly host dev servers even when the socket scan misses.
const CANDIDATE_PORTS = [3000, 3002, 4200, 4321, 5000, 5173, 5174, 5175, 8000, 8080, 8081, 8888, 9000, 9090, 1234, 1111]

// Listing dev servers = reading LISTEN sockets on this machine. /proc is the
// cheapest source on Linux; lsof covers macOS. Both are best-effort.
async function listeningPorts() {
  const ports = new Set(CANDIDATE_PORTS)
  try {
    for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
      const raw = fs.readFileSync(file, 'utf8')
      for (const line of raw.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/)
        if (parts[3] === '0A') ports.add(parseInt(parts[1].split(':')[1], 16))
      }
    }
  } catch {
    try {
      const { stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 4_000 })
      for (const line of stdout.split('\n')) {
        const match = line.match(/:(\d+)\s*\(LISTEN\)/)
        if (match) ports.add(Number(match[1]))
      }
    } catch { /* candidates only */ }
  }
  for (const port of ports) {
    if (!port || port < 80 || port > 65535 || port === config.port) ports.delete(port)
  }
  return ports
}

// Other Pixcode instances on this machine answer /api/health with a marker
// body — filtering them keeps the workbench out of its own target list.
function isPixcodeServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 600 }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk; if (body.length > 2048) req.destroy() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)?.name === 'pixcode') } catch { resolve(false) }
      })
      res.on('error', () => resolve(false))
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

// A dev server counts as previewable when it answers HTTP with an HTML page.
// Anything else (API-only services, databases, our own socket) is skipped.
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 700 }, (res) => {
      const type = String(res.headers['content-type'] || '')
      let head = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { head += chunk; if (head.length > 4096) req.destroy() })
      res.on('end', () => {
        const html = type.includes('html') || /<(!doctype|html|head|body)\b/i.test(head)
        resolve(html ? {
          port,
          label: res.headers['x-powered-by'] || res.headers.server || '',
          url: `http://127.0.0.1:${port}/`
        } : null)
      })
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

let targetsCache = { ts: 0, targets: [] }
export async function previewTargets() {
  if (Date.now() - targetsCache.ts < 3_000) return targetsCache.targets
  const ports = await listeningPorts()
  const found = (await Promise.all([...ports].map(async (port) => (await isPixcodeServer(port)) ? null : probe(port)))).filter(Boolean)
  targetsCache = { ts: Date.now(), targets: found.sort((a, b) => a.port - b.port) }
  return found
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
}

// Static preview: serve a workspace file (or its folder's index.html) over
// HTTP so plain HTML/CSS/JS previews instantly with no dev server at all.
function serveStaticFile(req, res) {
  const token = req.query.get('token') || ''
  const principal = resolvePrincipal(verifyToken(token))
  if (!principal) { sendJson(res, 401, { error: 'unauthorized' }); return }
  let resolved
  try {
    const file = req.query.get('p') || 'index.html'
    resolved = workspacePath(req.query.get('w') || '', file, { principal }).resolved
    if (fs.statSync(resolved).isDirectory()) resolved = path.join(resolved, 'index.html')
  } catch (error) {
    sendJson(res, error.status || 404, { error: error.status ? error.message : 'not found' })
    return
  }
  const type = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream'
  try {
    const body = fs.readFileSync(resolved)
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    sendJson(res, 404, { error: 'not found' })
  }
}

export function previewRoutes(router) {
  router.get('/api/preview/targets', async () => ({ targets: await previewTargets() }))
  // Iframes cannot send Authorization headers; the token travels as a query
  // param instead — same pattern the /ws endpoint already uses.
  router.get('/api/preview/static', (req, res) => serveStaticFile(req, res), { auth: false })
}
