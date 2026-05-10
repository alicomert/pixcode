import { appConfigDb } from '../database/db.js';

const CONFIG_KEY = 'remote_connection';

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
    return normalizeRemoteConnectionConfig(JSON.parse(raw));
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
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function normalizeRemoteConnectionConfig(input = {}) {
  const mode = input.mode === 'remote' ? 'remote' : 'local';
  const remoteUrl = mode === 'remote' ? normalizeRemoteUrl(input.remoteUrl) : null;
  const apiKey = mode === 'remote' && typeof input.apiKey === 'string' && input.apiKey.trim()
    ? input.apiKey.trim()
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
  const normalized = normalizeRemoteConnectionConfig({
    ...current,
    ...input,
    apiKey: input.apiKey === undefined ? current.apiKey : input.apiKey,
    updatedAt: new Date().toISOString(),
  });
  appConfigDb.set(CONFIG_KEY, JSON.stringify(normalized));
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
    saveRemoteConnectionConfig({ ...normalized, lastHealth: localHealth });
    return localHealth;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(`${normalized.remoteUrl}/api/auth/status`, {
      signal: controller.signal,
      headers: normalized.apiKey ? { 'X-API-Key': normalized.apiKey } : {},
    });
    const health = {
      reachable: response.ok,
      checkedAt,
      status: response.ok ? 'ok' : 'http_error',
      statusCode: response.status,
      message: response.ok ? 'Remote Pixcode server is reachable.' : `Remote server returned HTTP ${response.status}.`,
    };
    saveRemoteConnectionConfig({ ...normalized, lastHealth: health });
    return health;
  } catch (error) {
    const health = {
      reachable: false,
      checkedAt,
      status: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error?.message || 'Remote Pixcode server is unreachable.',
    };
    saveRemoteConnectionConfig({ ...normalized, lastHealth: health });
    return health;
  } finally {
    clearTimeout(timeout);
  }
}
