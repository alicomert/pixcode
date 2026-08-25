export function httpError(status, message) {
  const error = new Error(message || `HTTP ${status}`)
  error.status = status
  return error
}

export function sendJson(res, status, data) {
  if (res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(data ?? null))
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message || `HTTP ${status}` })
}

export async function readBody(req, limit = 1_000_000) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw httpError(413, 'payload too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  const contentType = req.headers['content-type'] || ''
  if (!contentType.toLowerCase().includes('json')) throw httpError(415, 'content-type must be json')
  try {
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object')
    return body
  } catch {
    throw httpError(400, 'invalid json body')
  }
}
