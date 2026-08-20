import dns from 'node:dns/promises';
import net from 'node:net';

import {
  appConfigDb,
  decryptCredentialValue,
  encryptCredentialValue,
} from '../database/db.js';

const CONFIG_KEY = 'remote_connection';

// This is optional outbound endpoint metadata for administrative health
// checks. It never proxies a browser, terminal, filesystem, or WebSocket
// session to another Pixcode server.

const DEFAULT_CONFIG = {
  mode: 'local',
  remoteUrl: null,
  apiKey: null,
  updatedAt: null,
  lastHealth: null,
};

function parseStoredConfig() {
  const raw = appConfigDb.get(CONFIG_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    const rawApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
    const apiKey = rawApiKey ? decryptCredentialValue(rawApiKey) : null;
    const normalized = normalizeRemoteConnectionConfig({ ...parsed, apiKey });

    // Upgrade legacy remote API keys on first read, matching provider/GitHub
    // credential migration. If decryption failed, preserve the ciphertext and
    // let the health check report the remote authentication failure.
    if (rawApiKey && !rawApiKey.startsWith('enc:v1:') && apiKey) {
      appConfigDb.set(CONFIG_KEY, JSON.stringify({ ...normalized, apiKey: encryptCredentialValue(apiKey) }));
    }
    return normalized;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function normalizeRemoteUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Remote Pixcode URL must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Remote Pixcode URL must not contain embedded credentials. Use the API key field instead.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blockedInternalHost = hostname === 'localhost'
    || hostname === 'localhost.localdomain'
    || hostname === '0.0.0.0'
    || hostname === '::1'
    || hostname === 'metadata.google.internal'
    || /^127\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || isPrivateIp(hostname);
  if (blockedInternalHost && process.env.PIXCODE_ALLOW_PRIVATE_REMOTE !== '1') {
    throw new Error('Remote Pixcode URL cannot target a loopback or cloud metadata host. Set PIXCODE_ALLOW_PRIVATE_REMOTE=1 for an intentional local bridge.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function isPrivateIp(value) {
  const normalized = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(normalized);
  if (version === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 168
      || a === 100 && b >= 64 && b <= 127
      || a === 198 && b >= 18 && b <= 19
      || a >= 224;
  }
  if (version === 6) {
    // Treat hexadecimal IPv4-mapped IPv6 spellings as their IPv4 address;
    // Node fetch routes [::ffff:7f00:1] to 127.0.0.1.
    const mapped = normalized.split('::');
    const head = mapped[0] ? mapped[0].split(':') : [];
    const tail = mapped[1] ? mapped[1].split(':') : [];
    if (mapped.length <= 2 && head.length + tail.length <= 8) {
      const expanded = [
        ...head,
        ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'),
        ...tail,
      ];
      if (expanded.length === 8
        && expanded.slice(0, 5).every((part) => Number.parseInt(part || '0', 16) === 0)
        && Number.parseInt(expanded[5] || '0', 16) === 0xffff) {
        const high = Number.parseInt(expanded[6] || '0', 16);
        const low = Number.parseInt(expanded[7] || '0', 16);
        return isPrivateIp(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
      }
    }
    const compact = normalized.replace(/^::ffff:/, '');
    if (compact !== normalized && net.isIP(compact) === 4) return isPrivateIp(compact);
    return normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return false;
}

async function assertResolvedRemoteHostSafe(remoteUrl) {
  if (process.env.PIXCODE_ALLOW_PRIVATE_REMOTE === '1') return;
  const parsed = new URL(remoteUrl);
  if (isPrivateIp(parsed.hostname)) {
    throw new Error('Remote Pixcode URL cannot target a private or loopback address. Set PIXCODE_ALLOW_PRIVATE_REMOTE=1 for an intentional local bridge.');
  }
  try {
    const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    if (records.some((record) => isPrivateIp(record.address))) {
      throw new Error('Remote Pixcode hostname resolves to a private or loopback address.');
    }
  } catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') return;
    throw error;
  }
}

export function normalizeRemoteConnectionConfig(input = {}) {
  const mode = input.mode === 'remote' ? 'remote' : 'local';
  const remoteUrl = mode === 'remote' ? normalizeRemoteUrl(input.remoteUrl) : null;
  const rawApiKey = mode === 'remote' && typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (rawApiKey.length > 512) {
    throw new Error('Remote API key is too long.');
  }
  const apiKey = mode === 'remote' && rawApiKey
    ? rawApiKey
    : null;

  if (mode === 'remote' && !remoteUrl) {
    throw new Error('Remote Pixcode URL is required in remote mode.');
  }

  return {
    ...DEFAULT_CONFIG,
    ...input,
    mode,
    remoteUrl,
    apiKey,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    lastHealth: input.lastHealth && typeof input.lastHealth === 'object' ? input.lastHealth : null,
  };
}

export function saveRemoteConnectionConfig(input = {}) {
  const current = parseStoredConfig();
  const hasApiKeyInput = Object.prototype.hasOwnProperty.call(input, 'apiKey') && input.apiKey !== undefined;
  const normalized = normalizeRemoteConnectionConfig({
    ...current,
    ...input,
    apiKey: input.apiKey === undefined ? current.apiKey : input.apiKey,
    updatedAt: new Date().toISOString(),
  });

  // If the installation encryption key changed, decryptCredentialValue()
  // intentionally returns null.  A health check or an unrelated config edit
  // must not interpret that as "clear the key" and destroy the only recovery
  // copy of the ciphertext.  Preserve an undecryptable encrypted value unless
  // the caller explicitly supplied an apiKey (including an empty value).
  let storedApiKey = normalized.apiKey ? encryptCredentialValue(normalized.apiKey) : null;
  if (!normalized.apiKey && !hasApiKeyInput) {
    try {
      const raw = appConfigDb.get(CONFIG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const rawApiKey = typeof parsed?.apiKey === 'string' ? parsed.apiKey : '';
      if (rawApiKey.startsWith('enc:v1:') && decryptCredentialValue(rawApiKey) === null) {
        storedApiKey = rawApiKey;
      }
    } catch {
      // A malformed/legacy app-config entry is safe to replace with the
      // normalized value; only a valid encrypted ciphertext is preserved.
    }
  }
  appConfigDb.set(CONFIG_KEY, JSON.stringify({
    ...normalized,
    apiKey: storedApiKey,
  }));
  return getPublicRemoteConnectionConfig(normalized);
}

export function getRemoteConnectionConfig() {
  return parseStoredConfig();
}

export function getPublicRemoteConnectionConfig(config = parseStoredConfig()) {
  return {
    mode: config.mode,
    remoteUrl: config.remoteUrl,
    apiKeyPresent: Boolean(config.apiKey),
    updatedAt: config.updatedAt,
    lastHealth: config.lastHealth,
  };
}

export async function checkRemoteConnection(config = parseStoredConfig(), { timeoutMs = 5000 } = {}) {
  const normalized = normalizeRemoteConnectionConfig(config);
  if (normalized.mode !== 'remote') {
    const localHealth = {
      reachable: true,
      checkedAt: new Date().toISOString(),
      status: 'local',
      message: 'Pixcode is running in local mode.',
    };
    saveRemoteConnectionConfig({ mode: normalized.mode, remoteUrl: normalized.remoteUrl, lastHealth: localHealth });
    return localHealth;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const checkedAt = new Date().toISOString();
  try {
    await assertResolvedRemoteHostSafe(normalized.remoteUrl);
    const response = await fetch(`${normalized.remoteUrl}/api/auth/status`, {
      signal: controller.signal,
      // Do not follow a redirect from a trusted public host into an internal
      // address. The URL is user-configurable and this check runs in the
      // desktop/server process, so redirects must be treated as untrusted.
      redirect: 'error',
      headers: normalized.apiKey ? { 'X-API-Key': normalized.apiKey } : {},
    });
    const health = {
      reachable: response.ok,
      checkedAt,
      status: response.ok ? 'ok' : 'http_error',
      statusCode: response.status,
      message: response.ok ? 'Remote Pixcode server is reachable.' : `Remote server returned HTTP ${response.status}.`,
    };
    saveRemoteConnectionConfig({ mode: normalized.mode, remoteUrl: normalized.remoteUrl, lastHealth: health });
    return health;
  } catch (error) {
    const health = {
      reachable: false,
      checkedAt,
      status: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error?.message || 'Remote Pixcode server is unreachable.',
    };
    saveRemoteConnectionConfig({ mode: normalized.mode, remoteUrl: normalized.remoteUrl, lastHealth: health });
    return health;
  } finally {
    clearTimeout(timeout);
  }
}
