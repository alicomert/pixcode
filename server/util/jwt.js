import crypto from 'node:crypto'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function sign(payload, secret, ttlMs) {
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode({ ...payload, exp: Date.now() + Number(ttlMs) })
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verify(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const actualBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return null
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.exp || Number(payload.exp) < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
