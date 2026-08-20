import crypto from 'node:crypto';

import express from 'express';

import { userDb, githubTokensDb, credentialsDb } from '../database/db.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import {
  applyPixcodeGitIdentity,
  getSystemGitConfig,
  userHasGithubToken,
} from '../utils/gitConfig.js';

const router = express.Router();

// Short-lived, single-use OAuth state. The state is intentionally kept in
// memory: it contains no credential and expires quickly, while persisting it
// would make a copied auth store usable for login CSRF.
const githubOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_GITHUB_OAUTH_STATES = 1024;
const GITHUB_OAUTH_SCOPE = 'repo read:user user:email';
const GITHUB_OAUTH_HTTP_TIMEOUT_MS = 15_000;

function githubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID || process.env.PIXCODE_GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.PIXCODE_GITHUB_CLIENT_SECRET || '',
  };
}

/**
 * Fetch and decode a GitHub OAuth response with a bounded lifetime. OAuth
 * callbacks are public browser requests, so a stalled upstream must not hold
 * an Express request (or its one-time state) open indefinitely. Abort when
 * the browser disconnects as well as when the upstream timeout expires.
 */
async function fetchGithubOAuthJson(url, options, request) {
  const controller = new AbortController();
  const onRequestAborted = () => {
    controller.abort(new Error('GitHub OAuth callback request was aborted.'));
  };
  const timeout = setTimeout(() => {
    controller.abort(new Error('GitHub OAuth upstream request timed out.'));
  }, GITHUB_OAUTH_HTTP_TIMEOUT_MS);

  if (request?.aborted) {
    onRequestAborted();
  } else if (typeof request?.once === 'function') {
    request.once('aborted', onRequestAborted);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
    request?.removeListener?.('aborted', onRequestAborted);
  }
}

function callbackUrlForRequest(req) {
  const configured = process.env.GITHUB_OAUTH_CALLBACK_URL || process.env.PIXCODE_GITHUB_CALLBACK_URL;
  if (configured) return normalizeGithubOAuthCallbackUrl(configured.trim());
  // Express already applies the configured `trust proxy` policy when
  // resolving `req.protocol`. Do not read X-Forwarded-* directly here: on a
  // directly exposed server an attacker could otherwise influence the OAuth
  // redirect URI with spoofed proxy headers.
  const protocol = req.protocol || 'http';
  const host = req.get('host');
  if (!host || !/^[a-z0-9][a-z0-9.:[\]-]*$/iu.test(host)) {
    throw new Error('Unable to determine a safe GitHub OAuth callback host. Set GITHUB_OAUTH_CALLBACK_URL.');
  }
  return normalizeGithubOAuthCallbackUrl(`${protocol}://${host}/api/user/github/oauth/callback`);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized === 'localhost.localdomain'
    || normalized === '::1'
    || /^127\./u.test(normalized);
}

function normalizeGithubOAuthCallbackUrl(value) {
  const parsed = safeHttpUrl(value);
  if (!parsed || parsed.pathname !== '/api/user/github/oauth/callback' || parsed.search || parsed.hash) {
    throw new Error('GitHub OAuth callback URL must be the exact /api/user/github/oauth/callback path.');
  }
  const loopback = isLoopbackHostname(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('GitHub OAuth callback URL must use HTTPS (HTTP is allowed only on loopback).');
  }
  return parsed.toString();
}

function cleanupGithubOAuthStates() {
  const now = Date.now();
  for (const [state, entry] of githubOAuthStates.entries()) {
    if (entry.expiresAt <= now) githubOAuthStates.delete(state);
  }

  // OAuth start is authenticated, but an authenticated client can still be
  // buggy or hostile. Keep the process-local state cache bounded so abandoned
  // starts cannot grow memory without limit.
  while (githubOAuthStates.size >= MAX_GITHUB_OAUTH_STATES) {
    const oldestState = githubOAuthStates.keys().next().value;
    if (oldestState === undefined) break;
    githubOAuthStates.delete(oldestState);
  }
}

function oauthErrorResponse(res, message, status = 400) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ success: false, error: message });
}

const OAUTH_HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!OAUTH_HTTP_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeOrigin(value) {
  return safeHttpUrl(value)?.origin || null;
}

function requestOrigin(req) {
  const host = req.get('host');
  if (!host || !/^[a-z0-9][a-z0-9.:[\]-]*$/iu.test(host)) return null;
  const protocol = req.protocol === 'https' ? 'https:' : 'http:';
  return safeOrigin(`${protocol}//${host}`);
}

function openerOriginFromRequest(req) {
  // A remote Pixcode client can be hosted on a different origin than the API
  // callback.  The browser supplies the origin explicitly so the popup can
  // post its completion message back to the correct opener.  Treat this as a
  // hint only: it is validated as an absolute http(s) origin and falls back
  // to the request origin when absent or malformed.
  const requested = typeof req.query?.openerOrigin === 'string'
    ? req.query.openerOrigin
    : req.get('origin');
  return safeOrigin(requested) || requestOrigin(req);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeScriptValue(value) {
  // JSON.stringify is not sufficient inside a script tag: an untrusted
  // error_description containing </script> could terminate the element.
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function normalizeOAuthMessage(message, fallback = 'GitHub authorization failed. Please try again.') {
  const normalized = typeof message === 'string'
    ? message.replace(/\s+/g, ' ').trim().slice(0, 500)
    : '';
  return normalized || fallback;
}

/**
 * Finish OAuth in a popup-friendly document. The callback never returns a
 * GitHub token. It posts a short-lived result to the opener and then closes;
 * an optional configured redirect remains available for older clients.
 */
function oauthPopupResponse(res, {
  success,
  message,
  login = null,
  status = 200,
  targetOrigin = null,
  redirectUrl = null,
} = {}) {
  const isSuccess = Boolean(success);
  const safeMessage = normalizeOAuthMessage(
    message,
    isSuccess ? 'GitHub connected. You can close this window.' : undefined,
  );
  const payload = {
    source: 'pixcode-github-oauth',
    type: 'github-oauth-complete',
    success: isSuccess,
    githubLogin: isSuccess && login ? login : null,
    ...(isSuccess ? {} : { error: safeMessage }),
  };
  const messageJson = serializeScriptValue(payload);
  // A configured callback URL is trusted state. If it is unavailable (for
  // example, an invalid/expired state), use the callback document's own
  // origin in the browser as the narrowly scoped fallback.
  const target = safeOrigin(targetOrigin);
  const targetOriginExpression = target ? serializeScriptValue(target) : 'window.location.origin';
  const redirect = isSuccess ? safeHttpUrl(redirectUrl) : null;
  const redirectExpression = redirect ? serializeScriptValue(redirect.toString()) : 'null';
  const title = isSuccess ? 'GitHub connected' : 'GitHub connection failed';
  const body = isSuccess
    ? 'GitHub connected. You can close this window.'
    : `${safeMessage} You can close this window.`;
  const closeDelay = redirect ? 150 : (isSuccess ? 250 : 700);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'unsafe-inline'",
  );
  res.type('html');
  return res.status(status).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><p>${escapeHtml(body)}</p>
<script>
(() => {
  const message = ${messageJson};
  const targetOrigin = ${targetOriginExpression};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, targetOrigin);
    }
  } catch (_) { /* the close/redirect fallback below remains available */ }
  const redirect = ${redirectExpression};
  window.setTimeout(() => {
    if (redirect) window.location.replace(redirect);
    else window.close();
  }, ${closeDelay});
})();
</script></body></html>`);
}

function oauthCallbackErrorResponse(res, req, message, status = 400, pending = null) {
  const targetOrigin = safeOrigin(pending?.openerOrigin)
    || safeOrigin(pending?.redirectUri)
    || requestOrigin(req);
  return oauthPopupResponse(res, {
    success: false,
    message,
    status,
    targetOrigin,
  });
}

/**
 * Finish OAuth in a small popup-friendly document.  The callback cannot carry
 * Pixcode's Authorization header, so the one-time state is the only server
 * credential needed here.  Posting a result to the opener lets the settings
 * page refresh without exposing the GitHub access token or forcing a full-page
 * navigation.  A configured success URL is still honoured as a fallback for
 * non-browser clients and older frontends.
 */
function oauthSuccessResponse(res, login, successUrl, targetOrigin) {
  return oauthPopupResponse(res, {
    success: true,
    login,
    redirectUrl: successUrl,
    targetOrigin,
  });
}

function saveGithubOAuthCredential(userId, accessToken, login) {
  const existing = githubTokensDb.getGithubTokens(userId) || [];
  for (const entry of existing) {
    if (entry.is_active === true || entry.is_active === 1) {
      credentialsDb.toggleCredential(userId, entry.id, false);
    }
  }
  credentialsDb.createCredential(
    userId,
    `GitHub OAuth${login ? ` (${login})` : ''}`,
    'github_token',
    accessToken,
    'OAuth authorization; token encrypted in the Pixcode credential store',
  );
}

/**
 * Start a browser-based GitHub OAuth flow. This replaces the old requirement
 * to paste a `ghp_…` PAT into onboarding. Configure a GitHub OAuth App with
 * the callback URL shown in the response (or set GITHUB_OAUTH_CALLBACK_URL).
 */
router.get('/github/oauth/start', authRateLimiter, authenticateToken, (req, res) => {
  const { clientId, clientSecret } = githubOAuthConfig();
  if (!clientId || !clientSecret) {
    return oauthErrorResponse(res, 'GitHub OAuth is not configured on this server.', 501);
  }

  cleanupGithubOAuthStates();
  const state = crypto.randomBytes(32).toString('base64url');
  let redirectUri;
  try {
    redirectUri = callbackUrlForRequest(req);
  } catch (error) {
    return oauthErrorResponse(res, error.message || 'GitHub OAuth callback URL is not configured.', 500);
  }
  githubOAuthStates.set(state, {
    userId: req.user.id,
    redirectUri,
    openerOrigin: openerOriginFromRequest(req),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_OAUTH_SCOPE,
    state,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    success: true,
    authUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
    // The callback document can be served by a different origin than the UI
    // (for example a Vite dev server or a split reverse-proxy deployment).
    // Return only the validated origin so the popup listener can authenticate
    // the postMessage without ever exposing OAuth credentials.
    callbackOrigin: new URL(redirectUri).origin,
    expiresIn: Math.floor(OAUTH_STATE_TTL_MS / 1000),
  });
});

/** OAuth callback; intentionally public so GitHub can redirect without API headers. */
router.get('/github/oauth/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const pending = githubOAuthStates.get(state);
  githubOAuthStates.delete(state);

  if (!pending || pending.expiresAt <= Date.now()) {
    return oauthCallbackErrorResponse(res, req, 'GitHub OAuth state is invalid or expired.', 400);
  }
  if (!code) {
    const description = typeof req.query.error_description === 'string' ? req.query.error_description : 'Authorization was cancelled.';
    return oauthCallbackErrorResponse(res, req, description, 400, pending);
  }

  const { clientId, clientSecret } = githubOAuthConfig();
  if (!clientId || !clientSecret) {
    return oauthCallbackErrorResponse(res, req, 'GitHub OAuth is not configured on this server.', 501, pending);
  }

  try {
    const { response: tokenResponse, payload: tokenPayload } = await fetchGithubOAuthJson(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Pixcode-GitHub-OAuth',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: pending.redirectUri,
        }),
      },
      req,
    );
    const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token.trim() : '';
    if (!tokenResponse.ok || !accessToken) {
      return oauthCallbackErrorResponse(res, req, 'GitHub authorization could not be completed.', 502, pending);
    }

    const { response: profileResponse, payload: profile } = await fetchGithubOAuthJson(
      'https://api.github.com/user',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Pixcode-GitHub-OAuth',
        },
      },
      req,
    );
    if (!profileResponse.ok || typeof profile.login !== 'string' || !profile.login.trim()) {
      return oauthCallbackErrorResponse(res, req, 'GitHub profile lookup failed. Please try again.', 502, pending);
    }
    const login = profile.login.trim();
    saveGithubOAuthCredential(pending.userId, accessToken, login);

    const successUrl = process.env.GITHUB_OAUTH_SUCCESS_URL || process.env.PIXCODE_GITHUB_SUCCESS_URL;
    if (successUrl) {
      const redirect = new URL(successUrl);
      if (!OAUTH_HTTP_PROTOCOLS.has(redirect.protocol) || redirect.username || redirect.password) {
        throw new Error('GitHub OAuth success URL must be an http(s) URL without credentials.');
      }
      redirect.searchParams.set('github', 'connected');
      return oauthSuccessResponse(
        res,
        login,
        redirect.toString(),
        safeOrigin(pending.openerOrigin) || safeOrigin(pending.redirectUri) || requestOrigin(req),
      );
    }
    return oauthSuccessResponse(
      res,
      login,
      null,
      safeOrigin(pending.openerOrigin) || safeOrigin(pending.redirectUri) || requestOrigin(req),
    );
  } catch (error) {
    console.error('[github-oauth] callback failed:', error?.message || error);
    // The browser may close the popup while the upstream request is in
    // flight. Avoid attempting a second write to an already-aborted socket.
    if (req.aborted || res.destroyed) return undefined;
    return oauthCallbackErrorResponse(res, req, 'GitHub authorization failed. Please try again.', 502, pending);
  }
});

router.get('/git-config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let gitConfig = userDb.getGitConfig(userId);

    // If database is empty, try Pixcode/system git config once
    if (!gitConfig || (!gitConfig.git_name && !gitConfig.git_email)) {
      const systemConfig = await getSystemGitConfig();
      if (systemConfig.git_name || systemConfig.git_email) {
        userDb.updateGitConfig(userId, systemConfig.git_name, systemConfig.git_email);
        gitConfig = systemConfig;
      }
    }

    res.json({
      success: true,
      gitName: gitConfig?.git_name || null,
      gitEmail: gitConfig?.git_email || null,
      hasGithubToken: userHasGithubToken(userId),
      storage: 'pixcode', // identity lives in DB + ~/.pixcode/gitconfig (not system --global)
    });
  } catch (error) {
    console.error('Error getting git config:', error);
    res.status(500).json({ error: 'Failed to get git configuration' });
  }
});

/**
 * Save git identity + optional GitHub PAT for private repos.
 * Never touches `git config --global` (fails under many server/daemon setups).
 */
router.post('/git-config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { gitName, gitEmail, githubToken, githubTokenName } = req.body;

    if (!gitName || !gitEmail) {
      return res.status(400).json({ error: 'Git name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gitEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    userDb.updateGitConfig(userId, gitName, gitEmail);

    let identityFile = null;
    try {
      identityFile = await applyPixcodeGitIdentity(gitName, gitEmail);
    } catch (gitError) {
      // Non-fatal: DB still holds identity; commits use env vars as fallback.
      console.warn(
        '[git-config] Could not write Pixcode gitconfig (commits still use DB identity):',
        gitError?.message || gitError,
      );
    }

    let githubSaved = false;
    const rawToken = typeof githubToken === 'string' ? githubToken.trim() : '';
    if (rawToken.length > 512) {
      return res.status(400).json({ error: 'GitHub credential is too long.' });
    }
    if (rawToken) {
      const name = (typeof githubTokenName === 'string' && githubTokenName.trim())
        ? githubTokenName.trim()
        : 'GitHub (onboarding)';
      // Deactivate previous active tokens so the new one is authoritative
      try {
        const existing = githubTokensDb.getGithubTokens(userId) || [];
        for (const entry of existing) {
          if (entry.is_active === true || entry.is_active === 1) {
            credentialsDb.toggleCredential(userId, entry.id, false);
          }
        }
      } catch {
        // ignore
      }
      credentialsDb.createCredential(
        userId,
        name,
        'github_token',
        rawToken,
        'Saved from Git settings / onboarding for private repo access',
      );
      githubSaved = true;
    }

    res.json({
      success: true,
      gitName,
      gitEmail,
      hasGithubToken: userHasGithubToken(userId) || githubSaved,
      identityFile,
      storage: 'pixcode',
    });
  } catch (error) {
    console.error('Error updating git config:', error);
    res.status(500).json({ error: 'Failed to update git configuration' });
  }
});

router.post('/complete-onboarding', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    userDb.completeOnboarding(userId);

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

router.get('/onboarding-status', optionalAuthenticateToken, async (req, res) => {
  try {
    const hasUsers = userDb.hasUsers();
    if (!hasUsers) {
      return res.json({ success: true, needsSetup: true, hasCompletedOnboarding: false });
    }

    if (!req.user) {
      return res.json({ success: true, needsSetup: false, hasCompletedOnboarding: true });
    }

    const hasCompleted = userDb.hasCompletedOnboarding(req.user.id);

    res.json({
      success: true,
      needsSetup: false,
      hasCompletedOnboarding: hasCompleted,
    });
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    res.status(500).json({ error: 'Failed to check onboarding status' });
  }
});

export default router;
