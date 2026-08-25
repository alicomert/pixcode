import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
}

export function serveStatic(req, res, root) {
  if (!['GET', 'HEAD'].includes(req.method)) return false
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch {
    res.writeHead(400)
    res.end('bad path')
    return true
  }
  const base = path.resolve(root)
  const candidate = path.resolve(base, `.${pathname}`)
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) {
    res.writeHead(400)
    res.end('bad path')
    return true
  }
  let filePath = candidate
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(base, 'index.html')
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const stat = fs.statSync(filePath)
    res.writeHead(200, { 'content-type': type, 'content-length': stat.size })
    if (req.method === 'HEAD') res.end()
    else fs.createReadStream(filePath).pipe(res)
    return true
  } catch {
    if (!res.writableEnded) res.writeHead(500).end('failed to serve file')
    return true
  }
}
