/**
 * Short-lived, single-use credentials for browser transports that cannot set
 * an Authorization header (EventSource and WebSocket handshakes).
 *
 * A ticket is intentionally opaque rather than another JWT.  Only a SHA-256
 * digest is kept in memory, and consuming it removes it before returning the
 * associated user.  This makes a copied URL useful for one handshake only and
 * limits the impact of access/proxy/history logs retaining the URL.
 */
import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 60_000;
const MAX_TTL_MS = 5 * 60_000;
const MAX_TICKETS = 4096;

const tickets = new Map();

function normalizePath(value) {
  const raw = String(value || '').trim();
  const pathname = raw.split(/[?#]/u, 1)[0] || '/';
  if (!pathname.startsWith('/') || pathname.length > 512 || pathname.includes('\0')) {
    throw new Error('A stream ticket requires a valid absolute request path.');
  }
  return pathname;
}

function digest(ticket) {
  return crypto.createHash('sha256').update(String(ticket)).digest('hex');
}

function purgeExpired(now = Date.now()) {
  for (const [key, record] of tickets) {
    if (record.expiresAt <= now) tickets.delete(key);
  }
}

function normalizeTransport(value) {
  return value === 'ws' ? 'ws' : 'sse';
}

function normalizeMethod(value) {
  const method = String(value || 'GET').trim().toUpperCase();
  return /^[A-Z]+$/u.test(method) && method.length <= 16 ? method : 'GET';
}

/**
 * Issue an opaque ticket tied to one route and one transport.
 * @returns {{ ticket: string, expiresAt: number, transport: 'sse'|'ws', path: string }}
 */
export function issueStreamAuthTicket({
  userId,
  path,
  transport = 'sse',
  method = 'GET',
  ttlMs = DEFAULT_TTL_MS,
  apiKeyId = null,
  apiKeyScopes = null,
  apiKeyHasExplicitScopes = false,
} = {}) {
  if (userId === undefined || userId === null) {
    throw new Error('A user is required to issue a stream ticket.');
  }

  const normalizedPath = normalizePath(path);
  const normalizedTtl = Number.isFinite(Number(ttlMs))
    ? Math.max(5_000, Math.min(MAX_TTL_MS, Number(ttlMs)))
    : DEFAULT_TTL_MS;
  const now = Date.now();
  purgeExpired(now);

  // Keep this process-local cache bounded even if a hostile client repeatedly
  // requests tickets without ever opening the stream.
  while (tickets.size >= MAX_TICKETS) {
    const oldest = tickets.keys().next().value;
    if (oldest === undefined) break;
    tickets.delete(oldest);
  }

  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(digest(ticket), {
    userId,
    apiKeyId: apiKeyId || null,
    apiKeyScopes: Array.isArray(apiKeyScopes) ? [...apiKeyScopes] : null,
    apiKeyHasExplicitScopes: apiKeyHasExplicitScopes === true,
    path: normalizedPath,
    transport: normalizeTransport(transport),
    method: normalizeMethod(method),
    expiresAt: now + normalizedTtl,
  });

  return {
    ticket,
    expiresAt: now + normalizedTtl,
    transport: normalizeTransport(transport),
    method: normalizeMethod(method),
    path: normalizedPath,
  };
}

/**
 * Consume a ticket once.  Invalid, expired, mismatched, and replayed tickets
 * all return null without revealing which check failed.
 */
export function consumeStreamAuthTicket(ticket, { path, transport = 'sse', method = 'GET' } = {}) {
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 256) return null;
  const key = digest(ticket);
  const record = tickets.get(key);
  // Delete before validation so even a path/transport mismatch cannot be
  // retried as an oracle or replayed against the intended endpoint.
  tickets.delete(key);
  if (!record || record.expiresAt <= Date.now()) return null;

  let normalizedPath;
  try {
    normalizedPath = normalizePath(path);
  } catch {
    return null;
  }
  if (
    record.path !== normalizedPath
    || record.transport !== normalizeTransport(transport)
    || record.method !== normalizeMethod(method)
  ) {
    return null;
  }
  return record;
}

export function getStreamAuthTicketTtlMs() {
  return DEFAULT_TTL_MS;
}
