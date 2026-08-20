import jwt from 'jsonwebtoken';

import { userDb, appConfigDb, apiKeysDb } from '../database/db.js';
import { IS_PLATFORM } from '../constants/config.js';
import { consumeStreamAuthTicket } from '../services/stream-auth-ticket.js';
import { securityLog, getClientIp } from '../utils/security-log.js';

// Use env var if set, otherwise auto-generate a unique secret per installation
const JWT_SECRET = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const isPixcodeApiKey = (token) => typeof token === 'string' && (token.startsWith('px_') || token.startsWith('ck_'));
const ADMIN_ROLES = new Set(['owner', 'admin']);
const PLATFORM_AUTH_BYPASS_ENABLED = IS_PLATFORM && process.env.PIXCODE_ALLOW_PLATFORM_AUTH_BYPASS === '1';
// Raw query credentials are easy to leak through browser history, proxy logs,
// and referrer headers. Keep the legacy EventSource fallback opt-in; short-lived
// stream tickets remain available for browser SSE/WebSocket clients.
const ALLOW_QUERY_CREDENTIALS = process.env.PIXCODE_ALLOW_QUERY_CREDENTIALS === '1';

// Keys minted before scoped API keys were introduced carry an empty scope
// list and `api_key_has_explicit_scopes: false`.  Keep those keys fully
// compatible with the historical API while treating any explicitly scoped
// key as least-privilege.  This helper is shared by the route-level guards
// below; the central path/method guard uses the same rule.
const hasExplicitApiKeyScopes = (user) => Boolean(
  user?.api_key_id
  && (user.api_key_has_explicit_scopes === true
    || (Array.isArray(user.api_key_scopes) && user.api_key_scopes.length > 0)),
);

const apiKeyHasScope = (user, scope) => Array.isArray(user?.api_key_scopes)
  && (user.api_key_scopes.includes('*') || user.api_key_scopes.includes(scope));

// A few administrator-owned route families expose their own narrowly scoped
// capabilities.  Keep `requireAdmin` as the role gate, then let those routes
// opt into the matching scope without granting an unrelated settings/admin
// key access to every admin endpoint.
const hasRouteSpecificAdminScope = (req, user) => {
  const pathname = requestPathForAuth(req);
  if (/^\/api\/system\/restart(?:\/|$)/u.test(pathname)) {
    return apiKeyHasScope(user, 'system:restart');
  }
  if (/^\/api\/system(?:\/|$)/u.test(pathname)) {
    return apiKeyHasScope(user, 'system:update');
  }
  if (/^\/api\/production-agent-loop(?:\/|$)/u.test(pathname)) {
    return apiKeyHasScope(user, 'orchestration:read')
      || apiKeyHasScope(user, 'orchestration:write');
  }
  if (/^\/api\/remote(?:\/|$)/u.test(pathname)) {
    return apiKeyHasScope(user, 'remote:read')
      || apiKeyHasScope(user, 'remote:write');
  }
  return false;
};

// API keys can be issued with an explicit least-privilege scope set.  Older
// keys (and keys created by pre-scope clients) have an empty scope array; keep
// those keys backwards compatible and let the route-level guards below retain
// their historical behaviour.  Once a key contains one or more scopes, every
// authenticated API request must match one of the groups below.  The mapping
// intentionally lives next to authentication rather than in each router so a
// newly-mounted route cannot accidentally become reachable with an unrelated
// scoped key.
const API_KEY_SCOPE_EXEMPT_PREFIXES = [
  '/api/auth', // public login/register/status plus stream-ticket bootstrap
  '/api/user/onboarding-status', // first-run discovery is intentionally public
  '/api/user/github/oauth/callback', // GitHub redirects here without credentials
  '/api/public', // versioned API manifest/openapi/cookbook discovery
  '/api/agent', // legacy agent endpoint has its own API-key middleware
];

const API_KEY_SCOPE_RULES = [
  // Project file routes must be checked before the broader projects rule.
  { pattern: /^\/api\/projects\/[^/]+\/(?:file|files)(?:\/|$)/u, read: 'files:read', write: 'files:write' },
  { pattern: /^\/api\/projects\/[^/]+\/upload-images(?:\/|$)/u, read: 'files:read', write: 'files:write' },
  { pattern: /^\/api\/projects\/[^/]+\/sessions(?:\/|$)/u, read: 'sessions:read', write: 'sessions:write' },
  { pattern: /^\/api\/projects(?:\/|$)/u, read: 'projects:read', write: 'projects:write' },
  { pattern: /^\/api\/sessions(?:\/|$)/u, read: 'sessions:read', write: 'sessions:write' },
  { pattern: /^\/api\/search\/conversations(?:\/|$)/u, read: 'sessions:read', write: 'sessions:write' },
  { pattern: /^\/api\/browse-filesystem(?:\/|$)/u, read: 'files:read', write: 'files:write' },
  { pattern: /^\/api\/create-folder(?:\/|$)/u, read: 'files:read', write: 'files:write' },
  { pattern: /^\/api\/(?:codex|gemini|qwen)\/sessions(?:\/|$)/u, read: 'sessions:read', write: 'sessions:write' },
  { pattern: /^\/api\/cursor\/config(?:\/|$)/u, read: 'providers:read', write: 'providers:write' },
  { pattern: /^\/api\/(?:providers|mcp-utils)(?:\/|$)/u, read: 'providers:read', write: 'providers:write' },
  { pattern: /^\/api\/git(?:\/|$)/u, read: 'git:read', write: 'git:write' },
  // Notification and push endpoints are nested under /settings but have a
  // separate scope family in the public API contract.
  { pattern: /^\/api\/settings\/(?:notification-|push\/)/u, read: 'notifications:read', write: 'notifications:write' },
  { pattern: /^\/api\/settings(?:\/|$)/u, read: 'settings:read', write: 'settings:write' },
  { pattern: /^\/api\/user\/github\/oauth\/start(?:\/|$)/u, read: 'settings:write', write: 'settings:write' },
  { pattern: /^\/api\/user\/git-config(?:\/|$)/u, read: 'settings:read', write: 'settings:write' },
  { pattern: /^\/api\/user\/complete-onboarding(?:\/|$)/u, read: 'settings:read', write: 'settings:write' },
  { pattern: /^\/api\/diagnostics(?:\/|$)/u, read: 'diagnostics:read', write: 'diagnostics:write' },
  { pattern: /^\/api\/remote(?:\/|$)/u, read: 'remote:read', write: 'remote:write' },
  { pattern: /^\/api\/webhooks(?:\/|$)/u, read: 'webhooks:read', write: 'webhooks:write' },
  { pattern: /^\/api\/plugins(?:\/|$)/u, read: 'plugins:read', write: 'plugins:write' },
  { pattern: /^\/api\/telegram(?:\/|$)/u, read: 'telegram:read', write: 'telegram:write' },
  { pattern: /^\/api\/nanoclaw(?:\/|$)/u, read: 'tasks:read', write: 'tasks:write' },
  { pattern: /^\/api\/tasks(?:\/|$)/u, read: 'tasks:read', write: 'tasks:write' },
  { pattern: /^\/api\/shell(?:\/|$)/u, read: 'terminal:launch', write: 'terminal:launch' },
  { pattern: /^\/api\/live-view(?:\/|$)/u, read: 'terminal:launch', write: 'terminal:launch' },
  { pattern: /^\/api\/commands(?:\/|$)/u, read: 'terminal:launch', write: 'terminal:launch' },
  { pattern: /^\/api\/network(?:\/|$)/u, read: 'remote:read', write: 'remote:write' },
  { pattern: /^\/api\/production-agent-loop(?:\/|$)/u, read: 'orchestration:read', write: 'orchestration:write' },
  { pattern: /^\/api\/platformization(?:\/|$)/u, read: 'admin', write: 'admin' },
  // The update routes are mounted directly in server/index.js and retain
  // their more specific system:update/system:restart checks as well.
  { pattern: /^\/api\/system\/restart(?:\/|$)/u, read: 'system:restart', write: 'system:restart' },
  { pattern: /^\/api\/system(?:\/|$)/u, read: 'system:update', write: 'system:update' },
];

const API_KEY_SCOPE_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function pathMatchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isApiKeyScopeExemptPath(pathname) {
  return API_KEY_SCOPE_EXEMPT_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

function requiredApiKeyScopeForRequest(req) {
  const pathname = requestPathForAuth(req);
  if (isApiKeyScopeExemptPath(pathname)) return null;

  const rule = API_KEY_SCOPE_RULES.find((candidate) => candidate.pattern.test(pathname));
  if (!rule) return null;
  return API_KEY_SCOPE_READ_METHODS.has(String(req.method || 'GET').toUpperCase())
    ? rule.read
    : rule.write;
}

/**
 * Enforce the central method/path API-key scope policy after authentication.
 * JWTs are deliberately ignored: their permissions continue to come from the
 * existing project/role middleware.  Empty-scope API keys are legacy keys and
 * remain unrestricted here for compatibility; explicit scopes are fail-closed
 * for API paths and therefore cannot reach an unrelated group such as
 * /api/projects with a tasks:read key (or an endpoint with no declared group).
 */
function enforceApiKeyScope(req, res) {
  const user = req.user;
  if (!user?.api_key_id) return null;

  const scopes = Array.isArray(user.api_key_scopes) ? user.api_key_scopes : [];
  const hasExplicitScopes = user.api_key_has_explicit_scopes === true || scopes.length > 0;
  if (!hasExplicitScopes || scopes.includes('*') || scopes.includes('admin') || scopes.includes('system')) {
    return null;
  }

  const pathname = requestPathForAuth(req);
  const requiredScope = requiredApiKeyScopeForRequest(req);
  if (requiredScope || isApiKeyScopeExemptPath(pathname)) {
    if (!requiredScope || scopes.includes(requiredScope)) return null;
  }

  securityLog('api_scope_denied', {
    ip: getClientIp(req),
    endpoint: requestPathForAuth(req),
    method: req.method,
    userId: user.id,
    reason: requiredScope ? `Missing scope: ${requiredScope}` : 'No scope mapping for API endpoint',
  });
  return {
    status: 403,
    body: {
      error: requiredScope
        ? `API key lacks required scope: ${requiredScope}`
        : 'API key scope is not permitted for this endpoint.',
    },
  };
}

function requestPathForAuth(req) {
  return String(req?.originalUrl || req?.url || req?.path || '/').split('?')[0] || '/';
}

// Optional API key middleware
const validateApiKey = (req, res, next) => {
  // First-run auth endpoints must never require a machine API_KEY — registration
  // and status checks happen before any user/token exists.
  const path = req.path || '';
  const isPublicAuth = path.startsWith('/auth/')
    || path === '/auth'
    || path.startsWith('/user/onboarding-status')
    // GitHub redirects the browser directly to this callback and cannot add
    // Pixcode's machine API key. The one-time OAuth state protects it.
    || path === '/user/github/oauth/callback';
  if (isPublicAuth) {
    return next();
  }

  // Browser stream transports may authenticate with a short-lived ticket in
  // the URL.  The route-level auth middleware consumes and verifies it.
  if (typeof req.query?.streamTicket === 'string' && req.query.streamTicket) {
    return next();
  }

  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }
  
  const apiKey = typeof req.headers['x-api-key'] === 'string'
    ? req.headers['x-api-key'].trim()
    : '';
  const authHeader = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  // API_KEY is a legacy machine-level gate.  Do not let it break the modern
  // per-user JWT/API-key flow when an operator keeps the old variable set:
  // downstream authenticateToken/agent middleware still verifies the actual
  // credential and applies ownership/scope checks.
  const hasModernCredential = isPixcodeApiKey(apiKey) || isPixcodeApiKey(bearerToken);
  if (apiKey !== process.env.API_KEY && !hasModernCredential) {
    securityLog('api_key_validation_failed', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
    });
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

function readRequestCredentials(req) {
  // Pull credentials from any of the supported transports.
  //  - Authorization: Bearer <jwt-or-apikey>
  //  - X-API-Key: <apikey>            (legacy, kept for /api/agent compatibility)
  //  - ?token=<jwt> / ?apiKey=<apikey> (legacy EventSource workaround; only
  //    accepted when PIXCODE_ALLOW_QUERY_CREDENTIALS=1)
  // Auth-token mode is decided by the prefix: new keys generated by Pixcode
  // start with `px_`; older `ck_` keys remain valid for existing installs.
  // SECURITY NOTE: Query-param credentials may appear in server logs, proxy
  // logs, and browser history. Prefer Authorization headers for new clients.
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const apiKeyHeader = req.headers['x-api-key'];
  const rawQueryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const rawQueryApiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : null;
  const queryToken = ALLOW_QUERY_CREDENTIALS ? rawQueryToken : null;
  const queryApiKey = ALLOW_QUERY_CREDENTIALS ? rawQueryApiKey : null;
  const streamTicket = typeof req.query.streamTicket === 'string' ? req.query.streamTicket : null;

  if (rawQueryToken || rawQueryApiKey || streamTicket) {
    securityLog(ALLOW_QUERY_CREDENTIALS || streamTicket ? 'query_param_credential_used' : 'query_param_credential_rejected', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
    });
  }

  const explicitApiKey = apiKeyHeader || queryApiKey
    || (isPixcodeApiKey(bearerToken) ? bearerToken : null)
    || (isPixcodeApiKey(queryToken) ? queryToken : null);

  return {
    bearerToken,
    queryToken,
    explicitApiKey,
    jwtToken: bearerToken || queryToken,
    streamTicket,
  };
}

async function resolveUserFromCredentials(req, { allowMissing = false, issueRefreshHeader = false, res = null } = {}) {
  if (PLATFORM_AUTH_BYPASS_ENABLED) {
    try {
      const user = userDb.getFirstUser();
      if (!user) {
        return { error: { status: 500, body: { error: 'Platform mode: No user found in database' } } };
      }
      return { user };
    } catch (error) {
      console.error('Platform mode error:', error);
      return { error: { status: 500, body: { error: 'Platform mode: Failed to fetch user' } } };
    }
  }

  const { explicitApiKey, jwtToken, streamTicket } = readRequestCredentials(req);

  if ((req.query?.token || req.query?.apiKey || req.query?.streamTicket) && res) {
    // EventSource/WebSocket fallbacks put credentials in the URL. Prevent
    // browsers and reverse proxies from caching a response that contains
    // user-specific data or reflecting the credential in cache keys.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }

  if (streamTicket) {
    const ticketRecord = consumeStreamAuthTicket(streamTicket, {
      path: requestPathForAuth(req),
      transport: 'sse',
      method: req.method,
    });
    if (ticketRecord) {
      const user = userDb.getUserById(ticketRecord.userId);
      if (user) {
        return {
          user: ticketRecord.apiKeyId
            ? {
              ...user,
              api_key_id: ticketRecord.apiKeyId,
              api_key_scopes: ticketRecord.apiKeyScopes || [],
              api_key_has_explicit_scopes: ticketRecord.apiKeyHasExplicitScopes === true
                || (Array.isArray(ticketRecord.apiKeyScopes) && ticketRecord.apiKeyScopes.length > 0),
            }
            : user,
        };
      }
    }
    // Preserve legacy fallback when a client supplies another credential too.
    if (!explicitApiKey && !jwtToken) {
      if (allowMissing) return { user: null };
      return { error: { status: 401, body: { error: 'Invalid or expired stream ticket.' } } };
    }
  }

  if (explicitApiKey) {
    try {
      const user = apiKeysDb.validateApiKey(explicitApiKey);
      if (!user) {
        securityLog('api_key_auth_failed', {
          ip: getClientIp(req),
          endpoint: req.path,
          method: req.method,
        });
        if (allowMissing) return { user: null };
        return { error: { status: 401, body: { error: 'Invalid or inactive API key' } } };
      }
      securityLog('api_key_auth_success', {
        ip: getClientIp(req),
        endpoint: req.path,
        method: req.method,
        userId: user.id,
        username: user.username,
      });
      return { user };
    } catch (error) {
      console.error('API key validation error:', error);
      return { error: { status: 500, body: { error: 'Authentication backend error' } } };
    }
  }

  if (!jwtToken) {
    if (allowMissing) return { user: null };
    securityLog('auth_no_token', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
    });
    return { error: { status: 401, body: { error: 'Access denied. No token provided.' } } };
  }

  try {
    const decoded = jwt.verify(jwtToken, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      securityLog('jwt_user_not_found', {
        ip: getClientIp(req),
        endpoint: req.path,
        method: req.method,
        userId: decoded.userId,
      });
      if (allowMissing) return { user: null };
      return { error: { status: 401, body: { error: 'Invalid token. User not found.' } } };
    }

    // Auto-refresh: if token is past halfway through its lifetime, issue a new one
    if (issueRefreshHeader && res && decoded.exp && decoded.iat) {
      const now = Math.floor(Date.now() / 1000);
      const halfLife = (decoded.exp - decoded.iat) / 2;
      if (now > decoded.iat + halfLife) {
        const newToken = generateToken(user);
        res.setHeader('X-Refreshed-Token', newToken);
      }
    }

    return { user };
  } catch (error) {
    securityLog('jwt_verification_failed', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
      reason: error.name || 'unknown',
    });
    if (allowMissing) return { user: null };
    return { error: { status: 403, body: { error: 'Invalid token' } } };
  }
}

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  // A few legacy routers are mounted below a route-level authenticateToken
  // (for example `/api/projects`).  Keep authentication idempotent within a
  // single request so a one-shot stream ticket is not consumed twice while
  // the request falls through from the router to the legacy handler.
  if (req._pixcodeAuthResolved && req.user) {
    return next();
  }

  const result = await resolveUserFromCredentials(req, {
    allowMissing: false,
    issueRefreshHeader: true,
    res,
  });

  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }

  req.user = result.user;
  req._pixcodeAuthResolved = true;

  const scopeError = enforceApiKeyScope(req, res);
  if (scopeError) {
    return res.status(scopeError.status).json(scopeError.body);
  }

  return next();
};

/**
 * Soft auth: attaches req.user when a valid token is present, otherwise
 * continues anonymously. Used for first-run endpoints (e.g. onboarding-status)
 * that must never return "Access denied. No token provided."
 */
const optionalAuthenticateToken = async (req, res, next) => {
  const result = await resolveUserFromCredentials(req, {
    allowMissing: true,
    issueRefreshHeader: true,
    res,
  });

  if (result.error) {
    // Unexpected backend failures still surface; missing/invalid tokens do not.
    return res.status(result.error.status).json(result.error.body);
  }

  req.user = result.user || null;
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Access denied. No authenticated user.' });
  }

  if (!ADMIN_ROLES.has(req.user.role)) {
    securityLog('admin_access_denied', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
      userId: req.user.id,
      username: req.user.username,
    });
    return res.status(403).json({ error: 'Admin access required.' });
  }

  if (
    req.user.api_key_id &&
    hasExplicitApiKeyScopes(req.user) &&
    !req.user.api_key_scopes?.includes('admin') &&
    !req.user.api_key_scopes?.includes('system') &&
    !req.user.api_key_scopes?.includes('*') &&
    !hasRouteSpecificAdminScope(req, req.user)
  ) {
    securityLog('admin_scope_denied', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
      userId: req.user.id,
    });
    return res.status(403).json({ error: 'API key lacks admin scope.' });
  }

  next();
};

const requireApiScope = (scope) => (req, res, next) => {
  if (!req.user?.api_key_id) {
    return next();
  }

  // Legacy unscoped keys intentionally retain their historical full-access
  // behaviour.  Only keys created with an explicit scope set are checked.
  if (!hasExplicitApiKeyScopes(req.user)) {
    return next();
  }

  const scopes = Array.isArray(req.user.api_key_scopes) ? req.user.api_key_scopes : [];
  if (scopes.includes('*') || scopes.includes(scope)) {
    return next();
  }

  securityLog('api_scope_denied', {
    ip: getClientIp(req),
    endpoint: req.path,
    method: req.method,
    userId: req.user.id,
    reason: `Missing scope: ${scope}`,
  });
  return res.status(403).json({ error: `API key lacks required scope: ${scope}` });
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, algorithm: JWT_ALGORITHM }
  );
};

// WebSocket authentication function
const authenticateWebSocket = (token, { streamTicket = null, path = '/ws' } = {}) => {
  // Platform mode: bypass token validation, return first user
  if (PLATFORM_AUTH_BYPASS_ENABLED) {
    try {
      const user = userDb.getFirstUser();
      if (user) {
        return { id: user.id, userId: user.id, username: user.username, role: user.role || null };
      }
      return null;
    } catch (error) {
      console.error('Platform mode WebSocket error:', error);
      return null;
    }
  }

  // Normal OSS validation — accept either an API key (`px_…` or legacy
  // `ck_…`) or a JWT.
  if (streamTicket) {
    const ticketRecord = consumeStreamAuthTicket(streamTicket, {
      path,
      transport: 'ws',
      method: 'GET',
    });
    if (ticketRecord) {
      const user = userDb.getUserById(ticketRecord.userId);
      if (user) {
        return {
          id: user.id,
          userId: user.id,
          username: user.username,
          role: user.role || null,
          api_key_id: ticketRecord.apiKeyId || undefined,
          api_key_scopes: Array.isArray(ticketRecord.apiKeyScopes) ? ticketRecord.apiKeyScopes : undefined,
          api_key_has_explicit_scopes: ticketRecord.apiKeyHasExplicitScopes === true
            || (Array.isArray(ticketRecord.apiKeyScopes) && ticketRecord.apiKeyScopes.length > 0),
        };
      }
    }
    // Fall through to a legacy token when one was supplied alongside a stale
    // ticket so existing reconnecting clients continue to work.
  }

  if (!token) {
    return null;
  }

  if (isPixcodeApiKey(token)) {
    try {
      const user = apiKeysDb.validateApiKey(token);
      if (!user) return null;
      return {
        id: user.id,
        userId: user.id,
        username: user.username,
        role: user.role || null,
        // Preserve scope metadata through the WebSocket handshake so command
        // handlers can enforce the same least-privilege rules as HTTP routes.
        api_key_id: user.api_key_id || undefined,
        api_key_scopes: Array.isArray(user.api_key_scopes) ? user.api_key_scopes : undefined,
        api_key_has_explicit_scopes: user.api_key_has_explicit_scopes === true
          || (Array.isArray(user.api_key_scopes) && user.api_key_scopes.length > 0),
      };
    } catch (error) {
      console.error('WebSocket API key validation error:', error);
      return null;
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return null;
    }
    return { id: user.id, userId: user.id, username: user.username, role: user.role || null };
  } catch (error) {
    console.error('WebSocket token verification error:', error);
    return null;
  }
};

export {
  validateApiKey,
  authenticateToken,
  optionalAuthenticateToken,
  requireAdmin,
  requireApiScope,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET,
  ALLOW_QUERY_CREDENTIALS,
  PLATFORM_AUTH_BYPASS_ENABLED,
  enforceApiKeyScope,
  requiredApiKeyScopeForRequest,
};
