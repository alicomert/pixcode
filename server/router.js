import { sendError, sendJson } from './util/http.js'

function match(routeParts, urlParts) {
  if (routeParts.length !== urlParts.length) return null
  const params = {}
  for (let i = 0; i < routeParts.length; i += 1) {
    const routePart = routeParts[i]
    const urlPart = urlParts[i]
    if (routePart.startsWith(':')) {
      try { params[routePart.slice(1)] = decodeURIComponent(urlPart) } catch { return null }
    } else if (routePart !== urlPart) return null
  }
  return params
}

export class Router {
  constructor() {
    this.routes = []
  }

  add(method, pattern, handler, options = {}) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, auth: options.auth !== false })
  }

  get(pattern, handler, options) { this.add('GET', pattern, handler, options) }
  post(pattern, handler, options) { this.add('POST', pattern, handler, options) }
  put(pattern, handler, options) { this.add('PUT', pattern, handler, options) }
  delete(pattern, handler, options) { this.add('DELETE', pattern, handler, options) }

  async handle(req, res, context = {}) {
    let url
    try { url = new URL(req.url, 'http://localhost') } catch {
      sendError(res, 400, 'invalid url')
      return true
    }
    const urlParts = url.pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== req.method) continue
      const params = match(route.parts, urlParts)
      if (!params) continue
      if (route.auth) {
        const principal = context.verify?.(req)
        if (!principal) {
          sendError(res, 401, 'unauthorized')
          return true
        }
        req.principal = principal
      }
      req.params = params
      req.query = url.searchParams
      try {
        const result = await route.handler(req, res)
        if (!res.writableEnded) sendJson(res, 200, result)
      } catch (error) {
        if (!res.writableEnded) sendError(res, error.status || 500, error.message)
      }
      return true
    }
    return false
  }
}
