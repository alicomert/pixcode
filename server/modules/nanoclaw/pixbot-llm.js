/**
 * PixBot LLM — multi Custom-provider OpenAI-compatible chat.
 *
 * - Many endpoints (models.dev catalog + pure custom)
 * - API key optional
 * - Auto-syncs system credentials (env / custom / codex / qwen) every load
 * - Model cache + live refresh so the UI has models immediately on open
 * - Auto-activates first healthy provider with models
 *
 * Store: ~/.pixcode/pixbot-providers.json
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  getProviderCredentials,
  setProviderCredentials,
  applyProviderCredentialsToEnv,
} from '../../services/provider-credentials.js';
import { getCatalogProvider, listCatalogProviders } from './models-dev-catalog.js';

const STORE_FILE = path.join(os.homedir(), '.pixcode', 'pixbot-providers.json');
const LEGACY_CUSTOM = 'custom';
const LEGACY_PIXBOT = 'pixbot';
const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_QWEN_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes soft TTL

// In-process refresh lock so concurrent UI polls don't stampede upstreams
let refreshInFlight = null;

// ───────────────────────── helpers ─────────────────────────

export function normalizeOpenAiBaseUrl(raw, fallback = DEFAULT_OPENAI_BASE) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) base = String(fallback || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  if (!/\/v1$/i.test(base) && !/\/compatible-mode\/v1$/i.test(base)) {
    if (!/\/v\d+/i.test(base) && !/\/inference$/i.test(base)) {
      try {
        const u = new URL(base);
        if (!u.pathname || u.pathname === '/') base = `${base.replace(/\/+$/, '')}/v1`;
      } catch {
        base = `${base}/v1`;
      }
    }
  }
  return base.replace(/\/+$/, '');
}

function filterEnabledModels(provider, models) {
  if (!provider || !Array.isArray(models)) return models || [];
  // null/undefined → all models; [] → none; [ids] → filter
  if (provider.enabledModels == null) return models;
  if (!Array.isArray(provider.enabledModels)) return models;
  if (provider.enabledModels.length === 0) return [];
  const set = new Set(provider.enabledModels);
  return models.filter((m) => set.has(m.id));
}

function publicProvider(p, cacheEntry) {
  if (!p) return null;
  const cached = cacheEntry || null;
  const rawModels = Array.isArray(cached?.models) ? cached.models : null;
  const visible = rawModels ? filterEnabledModels(p, rawModels) : null;
  return {
    id: p.id,
    name: p.name,
    catalogId: p.catalogId || null,
    baseUrl: p.baseUrl,
    hasApiKey: Boolean(p.apiKey && p.apiKey !== '__none__' && p.apiKey !== 'no-key'),
    enabled: p.enabled !== false,
    system: Boolean(p.system),
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
    modelCount: visible ? visible.length : (p.lastModelCount ?? null),
    lastError: cached?.error || p.lastError || null,
    modelsFetchedAt: cached?.fetchedAt || p.modelsFetchedAt || null,
    healthy: visible ? visible.length > 0 : null,
  };
}

async function readStoreRaw() {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return emptyStore();
    }
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      activeProviderId: typeof parsed.activeProviderId === 'string' ? parsed.activeProviderId : null,
      defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : null,
      modelCache: parsed.modelCache && typeof parsed.modelCache === 'object' ? parsed.modelCache : {},
    };
  } catch {
    return emptyStore();
  }
}

function emptyStore() {
  return { providers: [], activeProviderId: null, defaultModel: null, modelCache: {} };
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Collect system OpenAI-compatible sources (stable ids so we can re-sync).
 */
async function collectSystemSources() {
  const out = [];

  const envKey = process.env.PIXCODE_CUSTOM_API_KEY
    || process.env.PIXCODE_PIXBOT_API_KEY
    || process.env.OPENAI_API_KEY
    || null;
  const envBase = normalizeOpenAiBaseUrl(
    process.env.PIXCODE_CUSTOM_BASE_URL
      || process.env.PIXCODE_PIXBOT_BASE_URL
      || process.env.OPENAI_BASE_URL
      || process.env.OPENAI_API_BASE
      || process.env.CUSTOM_API_BASE_URL,
    envKey ? DEFAULT_OPENAI_BASE : null,
  );
  if (envBase) {
    out.push({
      id: 'sys-env',
      name: 'System (env)',
      catalogId: null,
      baseUrl: envBase,
      apiKey: envKey,
      system: true,
    });
  }

  for (const [id, meta] of [
    [LEGACY_CUSTOM, { name: 'System (custom)', catalogId: null, fallback: DEFAULT_OPENAI_BASE }],
    [LEGACY_PIXBOT, { name: 'System (pixbot legacy)', catalogId: null, fallback: DEFAULT_OPENAI_BASE }],
    ['codex', { name: 'System (Codex / OpenAI)', catalogId: 'openai', fallback: DEFAULT_OPENAI_BASE }],
    ['qwen', { name: 'System (Qwen)', catalogId: null, fallback: DEFAULT_QWEN_BASE }],
  ]) {
    const entry = await getProviderCredentials(id).catch(() => null);
    if (!entry?.apiKey && !entry?.baseUrl) continue;
    const baseUrl = normalizeOpenAiBaseUrl(entry.baseUrl, entry.apiKey ? meta.fallback : null);
    if (!baseUrl) continue;
    // Skip if identical to env already listed
    const dup = out.find((s) => s.baseUrl === baseUrl && (s.apiKey || null) === (entry.apiKey || null));
    if (dup) continue;
    out.push({
      id: `sys-${id}`,
      name: meta.name,
      catalogId: meta.catalogId,
      baseUrl,
      apiKey: entry.apiKey || null,
      system: true,
    });
  }

  return out;
}

/**
 * Merge system sources into store without deleting user-added providers.
 * Updates keys/base for system rows when credentials change.
 */
async function syncSystemProviders(store) {
  const sources = await collectSystemSources();
  const now = new Date().toISOString();
  let changed = false;

  for (const src of sources) {
    const existing = store.providers.find((p) => p.id === src.id);
    if (existing) {
      if (existing.baseUrl !== src.baseUrl || existing.apiKey !== src.apiKey || existing.name !== src.name) {
        existing.baseUrl = src.baseUrl;
        existing.apiKey = src.apiKey;
        existing.name = src.name;
        existing.catalogId = src.catalogId;
        existing.system = true;
        existing.enabled = existing.enabled !== false;
        existing.updatedAt = now;
        changed = true;
      } else if (!existing.system) {
        existing.system = true;
        changed = true;
      }
    } else {
      store.providers.push({
        id: src.id,
        name: src.name,
        catalogId: src.catalogId,
        baseUrl: src.baseUrl,
        apiKey: src.apiKey,
        system: true,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
    }
  }

  // One-time migration when store was empty of any providers (user + system)
  if (!store.providers.length) {
    // nothing more
  }

  if (!store.activeProviderId && store.providers.length) {
    store.activeProviderId = store.providers.find((p) => p.enabled !== false)?.id || store.providers[0].id;
    changed = true;
  }

  if (changed) await writeStore(store);
  return store;
}

async function loadStore() {
  let store = await readStoreRaw();
  if (!store.modelCache) store.modelCache = {};
  store = await syncSystemProviders(store);
  return store;
}

function findProvider(store, providerId) {
  if (!providerId) return null;
  return store.providers.find((p) => p.id === providerId) || null;
}

function resolveActiveProvider(store, preferredId) {
  if (preferredId) {
    const p = findProvider(store, preferredId);
    if (p && p.enabled !== false) return p;
  }
  if (store.activeProviderId) {
    const p = findProvider(store, store.activeProviderId);
    if (p && p.enabled !== false) return p;
  }
  return store.providers.find((p) => p.enabled !== false) || null;
}

function mapCachedModels(provider, rawList, multi) {
  const filtered = filterEnabledModels(provider, rawList || []);
  return filtered.map((m) => ({
    id: m.id,
    value: `${provider.id}::${m.id}`,
    label: multi ? `${m.label || m.id} · ${provider.name}` : (m.label || m.id),
    providerId: provider.id,
    providerName: provider.name,
    source: m.source || 'cache',
  }));
}

// ───────────────────────── public config ─────────────────────────

export async function getPixbotConfig() {
  const store = await loadStore();
  const active = resolveActiveProvider(store);
  return {
    brand: 'PixBot',
    configured: store.providers.some((p) => p.enabled !== false && p.baseUrl),
    providerCount: store.providers.length,
    activeProviderId: active?.id || null,
    activeProvider: publicProvider(active, store.modelCache?.[active?.id]),
    providers: store.providers.map((p) => publicProvider(p, store.modelCache?.[p.id])),
    defaultModel: store.defaultModel || process.env.PIXCODE_PIXBOT_MODEL || null,
    hasApiKey: Boolean(active?.apiKey),
    baseUrl: active?.baseUrl || null,
    source: active ? (active.catalogId || (active.system ? 'system' : 'custom')) : null,
    preferredStore: LEGACY_CUSTOM,
  };
}

export async function resolvePixbotCredentials(providerId) {
  const store = await loadStore();
  const p = resolveActiveProvider(store, providerId);
  if (!p?.baseUrl) return null;
  return {
    apiKey: p.apiKey || null,
    baseUrl: p.baseUrl,
    source: p.catalogId || p.id,
    providerId: p.id,
    name: p.name,
  };
}

/** @deprecated */
export async function getPixbotCredentials() {
  return resolvePixbotCredentials();
}

// ───────────────────────── CRUD ─────────────────────────

export async function listPixbotProviders() {
  const store = await loadStore();
  return {
    activeProviderId: store.activeProviderId,
    providers: store.providers.map((p) => publicProvider(p, store.modelCache?.[p.id])),
  };
}

export async function addPixbotProvider(input = {}) {
  const store = await loadStore();
  let name = typeof input.name === 'string' ? input.name.trim() : '';
  let baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : '';
  let catalogId = typeof input.catalogId === 'string' ? input.catalogId.trim() : null;
  const apiKeyRaw = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const apiKey = apiKeyRaw || null;
  const enabledModels = Array.isArray(input.enabledModels)
    ? input.enabledModels.map((x) => String(x).trim()).filter(Boolean)
    : null; // null = all models

  if (catalogId) {
    const cat = await getCatalogProvider(catalogId).catch(() => null);
    if (cat) {
      if (!name) name = cat.name;
      if (!baseUrl && cat.api) baseUrl = cat.api;
    }
  }

  const normalized = normalizeOpenAiBaseUrl(baseUrl, null);
  if (!normalized) {
    const err = new Error('Base URL gerekli (ör. https://api.openai.com/v1 veya http://127.0.0.1:11434/v1).');
    err.statusCode = 400;
    throw err;
  }
  if (!name) {
    try { name = new URL(normalized).host; } catch { name = 'Custom'; }
  }

  const existing = store.providers.find(
    (p) => p.baseUrl.replace(/\/+$/, '') === normalized
      && !p.system
      && (catalogId ? p.catalogId === catalogId : true),
  );
  const now = new Date().toISOString();
  if (existing) {
    if (apiKey) existing.apiKey = apiKey;
    if (name) existing.name = name;
    if (enabledModels) existing.enabledModels = enabledModels;
    else if (input.enabledModels === null) existing.enabledModels = null;
    existing.updatedAt = now;
    existing.enabled = true;
    store.activeProviderId = existing.id;
    await writeStore(store);
    await syncLegacyCustomMirror(store);
    // Kick model refresh for this provider
    await refreshProviderModels(store, existing).catch(() => {});
    await writeStore(store);
    return { provider: publicProvider(existing, store.modelCache?.[existing.id]), created: false };
  }

  const id = (typeof input.id === 'string' && input.id.trim())
    ? input.id.trim().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48)
    : `${catalogId || 'custom'}-${randomUUID().slice(0, 8)}`;

  const provider = {
    id,
    name,
    catalogId: catalogId || null,
    baseUrl: normalized,
    apiKey,
    enabledModels: enabledModels && enabledModels.length ? enabledModels : null,
    system: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  store.providers.push(provider);
  store.activeProviderId = provider.id;
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  await refreshProviderModels(store, provider).catch(() => {});
  await writeStore(store);
  return { provider: publicProvider(provider, store.modelCache?.[provider.id]), created: true };
}

export async function updatePixbotProvider(providerId, patch = {}) {
  const store = await loadStore();
  const p = findProvider(store, providerId);
  if (!p) {
    const err = new Error(`Provider not found: ${providerId}`);
    err.statusCode = 404;
    throw err;
  }
  if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim();
  if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) {
    const n = normalizeOpenAiBaseUrl(patch.baseUrl, null);
    if (n) p.baseUrl = n;
  }
  if (typeof patch.apiKey === 'string') {
    p.apiKey = patch.apiKey.trim() || null;
  }
  if (typeof patch.enabled === 'boolean') p.enabled = patch.enabled;
  if (Array.isArray(patch.enabledModels)) {
    p.enabledModels = patch.enabledModels.map((x) => String(x).trim()).filter(Boolean);
  } else if (patch.enabledModels === null) {
    p.enabledModels = null; // all
  }
  p.updatedAt = new Date().toISOString();
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  await refreshProviderModels(store, p).catch(() => {});
  await writeStore(store);
  return publicProvider(p, store.modelCache?.[p.id]);
}

export async function removePixbotProvider(providerId) {
  const store = await loadStore();
  const target = findProvider(store, providerId);
  // System providers: allow disable instead of hard-delete so they reappear on next sync
  if (target?.system) {
    target.enabled = false;
    target.updatedAt = new Date().toISOString();
    if (store.activeProviderId === providerId) {
      store.activeProviderId = store.providers.find((p) => p.id !== providerId && p.enabled !== false)?.id || null;
    }
    delete store.modelCache[providerId];
    await writeStore(store);
    return { removed: false, disabled: true, activeProviderId: store.activeProviderId };
  }

  const before = store.providers.length;
  store.providers = store.providers.filter((p) => p.id !== providerId);
  delete store.modelCache[providerId];
  if (store.activeProviderId === providerId) {
    store.activeProviderId = store.providers.find((p) => p.enabled !== false)?.id || store.providers[0]?.id || null;
  }
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  return { removed: before !== store.providers.length, activeProviderId: store.activeProviderId };
}

export async function setActivePixbotProvider(providerId) {
  const store = await loadStore();
  const p = findProvider(store, providerId);
  if (!p) {
    const err = new Error(`Provider not found: ${providerId}`);
    err.statusCode = 404;
    throw err;
  }
  store.activeProviderId = p.id;
  p.enabled = true;
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  // Ensure models for this provider
  await refreshProviderModels(store, p).catch(() => {});
  await writeStore(store);
  return publicProvider(p, store.modelCache?.[p.id]);
}

async function syncLegacyCustomMirror(store) {
  const active = resolveActiveProvider(store);
  try {
    if (active?.baseUrl && active.apiKey) {
      await setProviderCredentials(LEGACY_CUSTOM, {
        apiKey: active.apiKey,
        baseUrl: active.baseUrl,
      });
      await applyProviderCredentialsToEnv(LEGACY_CUSTOM).catch(() => {});
    }
  } catch {
    /* non-fatal */
  }
}

export async function savePixbotConfig({ apiKey, baseUrl, model, name } = {}) {
  const nextBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const nextKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!nextBase && !nextKey) {
    return getPixbotConfig();
  }

  await addPixbotProvider({
    name: name || 'Custom',
    baseUrl: nextBase || DEFAULT_OPENAI_BASE,
    apiKey: nextKey || null,
    catalogId: null,
  });

  if (model && typeof model === 'string' && model.trim()) {
    const store = await loadStore();
    store.defaultModel = model.trim();
    await writeStore(store);
    process.env.PIXCODE_PIXBOT_MODEL = model.trim();
  }

  return getPixbotConfig();
}

// ───────────────────────── models + chat ─────────────────────────

function authHeaders(apiKey) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'pixcode-pixbot',
  };
  if (apiKey && apiKey !== '__none__' && apiKey !== 'no-key') {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function isOllamaBase(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.port === '11434' || u.hostname.includes('ollama') || /:11434\b/.test(baseUrl);
  } catch {
    return /11434/.test(baseUrl || '');
  }
}

async function fetchOllamaTags(baseUrl) {
  // http://host:11434/v1 → http://host:11434/api/tags
  let origin;
  try {
    const u = new URL(baseUrl);
    origin = `${u.protocol}//${u.host}`;
  } catch {
    return [];
  }
  const res = await fetch(`${origin}/api/tags`, {
    headers: { accept: 'application/json', 'user-agent': 'pixcode-pixbot' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const rows = Array.isArray(json?.models) ? json.models : [];
  return rows
    .map((row) => {
      const id = row?.name || row?.model || row?.id;
      if (!id || typeof id !== 'string') return null;
      return { id, label: id, ownedBy: 'ollama', source: 'ollama-tags' };
    })
    .filter(Boolean);
}

async function fetchLiveModels(creds) {
  const url = `${creds.baseUrl}/models`;
  const res = await fetch(url, {
    headers: authHeaders(creds.apiKey),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Ollama often needs /api/tags when OpenAI shim isn't up
    if (isOllamaBase(creds.baseUrl)) {
      const tags = await fetchOllamaTags(creds.baseUrl).catch(() => []);
      if (tags.length) return tags;
    }
    const err = new Error(`Models HTTP ${res.status}: ${body.slice(0, 160)}`);
    err.statusCode = res.status;
    throw err;
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
  let list = rows
    .map((row) => {
      const id = row?.id || row?.name || row?.model;
      if (!id || typeof id !== 'string') return null;
      return { id, label: id, ownedBy: row?.owned_by || null, source: 'live' };
    })
    .filter(Boolean);

  if (!list.length && isOllamaBase(creds.baseUrl)) {
    list = await fetchOllamaTags(creds.baseUrl).catch(() => []);
  }
  return list;
}

async function catalogModelsForProvider(provider) {
  if (!provider?.catalogId) return [];
  try {
    const cat = await getCatalogProvider(provider.catalogId);
    if (!cat?.models?.length) return [];
    return cat.models.map((m) => ({
      id: m.id,
      label: m.label || m.id,
      ownedBy: provider.catalogId,
      source: 'catalog',
    }));
  } catch {
    return [];
  }
}

async function refreshProviderModels(store, provider) {
  if (!provider?.baseUrl) return;
  let models = [];
  let error = null;
  try {
    models = await fetchLiveModels({ apiKey: provider.apiKey, baseUrl: provider.baseUrl });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    models = await catalogModelsForProvider(provider);
    if (!models.length && isOllamaBase(provider.baseUrl)) {
      models = await fetchOllamaTags(provider.baseUrl).catch(() => []);
    }
  }

  const fetchedAt = new Date().toISOString();
  store.modelCache[provider.id] = {
    models: models.map((m) => ({ id: m.id, label: m.label || m.id, source: m.source })),
    fetchedAt,
    error: models.length ? null : error,
  };
  provider.lastModelCount = models.length;
  provider.modelsFetchedAt = fetchedAt;
  provider.lastError = models.length ? null : error;
}

/**
 * Refresh all enabled providers' model lists. Deduped in-process.
 */
export async function refreshAllPixbotModels({ force = false } = {}) {
  if (refreshInFlight && !force) return refreshInFlight;

  refreshInFlight = (async () => {
    const store = await loadStore();
    const list = store.providers.filter((p) => p.enabled !== false && p.baseUrl);
    await Promise.all(list.map((p) => refreshProviderModels(store, p).catch(() => {})));

    // Auto-activate: if active has 0 models, pick best healthy (most models, prefer system)
    const active = resolveActiveProvider(store);
    const activeCount = store.modelCache?.[active?.id]?.models?.length || 0;
    if (!active || activeCount === 0) {
      const ranked = list
        .map((p) => ({
          p,
          n: store.modelCache?.[p.id]?.models?.length || 0,
        }))
        .filter((x) => x.n > 0)
        .sort((a, b) => {
          if (Boolean(a.p.system) !== Boolean(b.p.system)) return a.p.system ? -1 : 1;
          return b.n - a.n;
        });
      if (ranked[0]) {
        store.activeProviderId = ranked[0].p.id;
      }
    }

    // Default model if missing
    const finalActive = resolveActiveProvider(store);
    if (finalActive && !store.defaultModel) {
      const first = store.modelCache?.[finalActive.id]?.models?.[0];
      if (first?.id) store.defaultModel = `${finalActive.id}::${first.id}`;
    }

    await writeStore(store);
    return buildModelsPayload(store);
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function buildModelsPayload(store) {
  const list = store.providers.filter((p) => p.enabled !== false && p.baseUrl);
  const multi = list.length > 1;
  const groups = [];
  const models = [];

  for (const p of list) {
    const cache = store.modelCache?.[p.id];
    const raw = cache?.models || [];
    const mapped = mapCachedModels(p, raw, multi);
    groups.push({
      providerId: p.id,
      providerName: p.name,
      baseUrl: p.baseUrl,
      hasApiKey: Boolean(p.apiKey && p.apiKey !== '__none__'),
      system: Boolean(p.system),
      modelCount: mapped.length,
      error: cache?.error || null,
      fetchedAt: cache?.fetchedAt || null,
      models: mapped,
    });
    models.push(...mapped);
  }

  // Prefer active provider's models first in flat list
  models.sort((a, b) => {
    if (a.providerId === store.activeProviderId && b.providerId !== store.activeProviderId) return -1;
    if (b.providerId === store.activeProviderId && a.providerId !== store.activeProviderId) return 1;
    return a.label.localeCompare(b.label);
  });

  return {
    models,
    groups,
    count: models.length,
    activeProviderId: store.activeProviderId,
    defaultModel: store.defaultModel || null,
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Models for UI. Cache-first; optionally force live refresh.
 * @param {{ providerId?: string, refresh?: boolean }} opts
 */
export async function fetchPixbotModels({ providerId, refresh = false } = {}) {
  const store = await loadStore();
  const list = providerId
    ? store.providers.filter((p) => p.id === providerId)
    : store.providers.filter((p) => p.enabled !== false && p.baseUrl);

  if (!list.length) {
    const err = new Error(
      'Henüz provider yok. Catalog’dan ekle veya Custom base URL bağla (API key opsiyonel).',
    );
    err.statusCode = 400;
    err.code = 'PIXBOT_NOT_CONFIGURED';
    throw err;
  }

  const needsRefresh = refresh || list.some((p) => {
    const c = store.modelCache?.[p.id];
    if (!c?.fetchedAt) return true;
    const age = Date.now() - new Date(c.fetchedAt).getTime();
    return !Number.isFinite(age) || age > MODEL_CACHE_TTL_MS;
  });

  if (needsRefresh || refresh) {
    if (providerId) {
      const p = findProvider(store, providerId);
      if (p) {
        await refreshProviderModels(store, p).catch(() => {});
        await writeStore(store);
      }
    } else {
      return refreshAllPixbotModels({ force: refresh });
    }
  }

  // If cache empty for everyone, force one refresh
  const payload = buildModelsPayload(store);
  if (payload.count === 0) {
    return refreshAllPixbotModels({ force: true });
  }
  return payload;
}

/**
 * Bootstrap on PixBot open: sync system providers + refresh models + auto-select.
 */
export async function bootstrapPixbot({ refresh = true } = {}) {
  const store = await loadStore(); // includes system sync
  let modelsPayload;
  if (refresh) {
    modelsPayload = await refreshAllPixbotModels({ force: true });
  } else {
    modelsPayload = await fetchPixbotModels({ refresh: false });
  }
  const config = await getPixbotConfig();
  return {
    ...config,
    models: modelsPayload.models,
    groups: modelsPayload.groups,
    modelCount: modelsPayload.count,
    defaultModel: modelsPayload.defaultModel || config.defaultModel,
    refreshedAt: modelsPayload.refreshedAt,
  };
}

export function parseModelSelection(raw) {
  const s = String(raw || '').trim();
  if (!s) return { providerId: null, model: null };
  const idx = s.indexOf('::');
  if (idx > 0) {
    return { providerId: s.slice(0, idx), model: s.slice(idx + 2) };
  }
  return { providerId: null, model: s };
}

/**
 * Resolve provider + modelId for a chat turn.
 * @returns {Promise<{ store: any, provider: any, modelId: string }>}
 */
async function resolveChatTarget({ model, providerId } = {}) {
  const parsed = parseModelSelection(model);
  let store = await loadStore();
  let p = resolveActiveProvider(store, providerId || parsed.providerId);

  if (p) {
    const cached = store.modelCache?.[p.id]?.models;
    if (!cached?.length) {
      await refreshProviderModels(store, p).catch(() => {});
      await writeStore(store);
    }
  }

  if (!p?.baseUrl) {
    await bootstrapPixbot({ refresh: true }).catch(() => {});
    store = await loadStore();
    p = resolveActiveProvider(store, providerId || parsed.providerId);
  }

  if (!p?.baseUrl) {
    const err = new Error(
      'PixBot provider yok. Catalog veya Custom endpoint ekle (API key zorunlu değil).',
    );
    err.statusCode = 400;
    err.code = 'PIXBOT_NOT_CONFIGURED';
    throw err;
  }

  let modelId = parsed.model
    || (model && !String(model).includes('::') ? String(model).trim() : null)
    || null;

  if (!modelId && store.defaultModel) {
    const d = parseModelSelection(store.defaultModel);
    if (!d.providerId || d.providerId === p.id) modelId = d.model;
    else if (!parsed.providerId && d.providerId) {
      const alt = findProvider(store, d.providerId);
      if (alt) {
        p = alt;
        modelId = d.model;
      }
    }
  }

  modelId = modelId || process.env.PIXCODE_PIXBOT_MODEL || null;

  const pickFirst = (prov) => {
    const raw = store.modelCache?.[prov.id]?.models || [];
    const filtered = filterEnabledModels(prov, raw);
    return filtered[0]?.id || null;
  };

  if (!modelId) modelId = pickFirst(p);
  if (!modelId) {
    try {
      await refreshProviderModels(store, p);
      await writeStore(store);
      modelId = pickFirst(p);
    } catch {
      modelId = null;
    }
  }

  if (!modelId) {
    for (const other of store.providers.filter((x) => x.enabled !== false)) {
      const m = pickFirst(other);
      if (m) {
        p = other;
        modelId = m;
        store.activeProviderId = other.id;
        await writeStore(store);
        break;
      }
    }
  }

  if (!modelId) {
    const err = new Error(
      'Model listesi boş. Provider erişilemiyor olabilir (Ollama kapalı / key yanlış). Provider panelinden kontrol et.',
    );
    err.statusCode = 400;
    throw err;
  }

  return { store, provider: p, modelId };
}

export async function pixbotChatCompletion({
  messages,
  model,
  providerId,
  temperature = 0.6,
  maxTokens = 4096,
} = {}) {
  const { store, provider: p, modelId } = await resolveChatTarget({ model, providerId });

  const url = `${p.baseUrl}/chat/completions`;
  const headers = {
    ...authHeaders(p.apiKey),
    'content-type': 'application/json',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Chat failed HTTP ${res.status}: ${body.slice(0, 400)}`);
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }

  const json = await res.json();
  const choice = json?.choices?.[0];
  const content = choice?.message?.content
    || choice?.text
    || (typeof choice?.message === 'string' ? choice.message : null)
    || '';

  try {
    store.defaultModel = `${p.id}::${modelId}`;
    await writeStore(store);
  } catch { /* ignore */ }

  return {
    content: String(content || '').trim() || '…',
    model: json?.model || modelId,
    usage: json?.usage || null,
    finishReason: choice?.finish_reason || null,
    source: p.catalogId || p.id,
    baseUrl: p.baseUrl,
    providerId: p.id,
    providerName: p.name,
  };
}

/**
 * Stream OpenAI-compatible chat. Calls onDelta(textChunk) for each piece.
 * Falls back to non-stream if upstream rejects stream.
 * @returns {Promise<{ content: string, model: string, usage: any, providerId: string, providerName: string }>}
 */
export async function streamPixbotChatCompletion({
  messages,
  model,
  providerId,
  temperature = 0.6,
  maxTokens = 4096,
  onDelta,
  signal,
} = {}) {
  const { store, provider: p, modelId } = await resolveChatTarget({ model, providerId });
  const url = `${p.baseUrl}/chat/completions`;
  const headers = {
    ...authHeaders(p.apiKey),
    'content-type': 'application/json',
    accept: 'text/event-stream',
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: signal || AbortSignal.timeout(180000),
    });
  } catch (e) {
    // Network fail → non-stream fallback
    const full = await pixbotChatCompletion({ messages, model: `${p.id}::${modelId}`, temperature, maxTokens });
    if (typeof onDelta === 'function' && full.content) onDelta(full.content);
    return full;
  }

  if (!res.ok) {
    // Some gateways don't support stream — fall back
    if (res.status === 400 || res.status === 404 || res.status === 422) {
      const full = await pixbotChatCompletion({
        messages,
        model: `${p.id}::${modelId}`,
        temperature,
        maxTokens,
      });
      if (typeof onDelta === 'function' && full.content) onDelta(full.content);
      return full;
    }
    const body = await res.text().catch(() => '');
    const err = new Error(`Chat stream failed HTTP ${res.status}: ${body.slice(0, 400)}`);
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }

  // If body is not a stream, try parse as JSON once
  if (!res.body || typeof res.body.getReader !== 'function') {
    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content || '';
    if (content && typeof onDelta === 'function') onDelta(content);
    return {
      content: String(content || '…'),
      model: json?.model || modelId,
      usage: json?.usage || null,
      finishReason: json?.choices?.[0]?.finish_reason || null,
      providerId: p.id,
      providerName: p.name,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let usage = null;
  let finishReason = null;
  let outModel = modelId;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        if (json?.model) outModel = json.model;
        if (json?.usage) usage = json.usage;
        const choice = json?.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta?.content
          ?? choice?.delta?.text
          ?? choice?.text
          ?? (typeof choice?.message?.content === 'string' ? choice.message.content : null);
        if (delta) {
          content += delta;
          if (typeof onDelta === 'function') onDelta(delta);
        }
      } catch {
        /* skip bad chunk */
      }
    }
  }

  // Some providers send non-SSE JSON as a single body
  if (!content && buffer.trim()) {
    try {
      const json = JSON.parse(buffer);
      content = json?.choices?.[0]?.message?.content || '';
      if (content && typeof onDelta === 'function') onDelta(content);
      outModel = json?.model || outModel;
      usage = json?.usage || usage;
    } catch { /* ignore */ }
  }

  if (!content) {
    // Empty stream — non-stream retry once
    const full = await pixbotChatCompletion({
      messages,
      model: `${p.id}::${modelId}`,
      temperature,
      maxTokens,
    });
    if (typeof onDelta === 'function' && full.content) onDelta(full.content);
    return full;
  }

  try {
    store.defaultModel = `${p.id}::${modelId}`;
    await writeStore(store);
  } catch { /* ignore */ }

  return {
    content: content.trim() || '…',
    model: outModel,
    usage,
    finishReason,
    source: p.catalogId || p.id,
    baseUrl: p.baseUrl,
    providerId: p.id,
    providerName: p.name,
  };
}

export { listCatalogProviders, getCatalogProvider };

export async function buildProjectScanContext(projectPath) {
  if (!projectPath) return '';
  try {
    const fsp = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const entries = await fsp.readdir(projectPath, { withFileTypes: true });
    const names = entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'dist-server')
      .slice(0, 40)
      .map((e) => `${e.isDirectory() ? 'dir' : 'file'}: ${e.name}`);

    let pkgHint = '';
    try {
      const pkgRaw = await fsp.readFile(pathMod.join(projectPath, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw);
      pkgHint = `package.json name=${pkg.name || '?'} scripts=${Object.keys(pkg.scripts || {}).slice(0, 12).join(', ')}`;
    } catch { /* no package.json */ }

    let readmeHint = '';
    try {
      const readme = await fsp.readFile(pathMod.join(projectPath, 'README.md'), 'utf8');
      readmeHint = `README (first 800 chars):\n${readme.slice(0, 800)}`;
    } catch { /* no readme */ }

    return [
      '## Project scan (auto)',
      pkgHint,
      'Top-level entries:',
      ...names,
      readmeHint,
    ].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

export function buildPixbotSystemPrompt({ projectId, projectPath, scanContext } = {}) {
  return [
    'You are PixBot — a ChatGPT-style assistant embedded in Pixcode (self-hosted coding control room).',
    'Reply in the same language the user writes (Turkish, English, …).',
    'Be concise, practical, and conversational — like ChatGPT, not a ticket bot.',
    '',
    '## What you can help with',
    '- Explain / design / refactor code; write snippets and steps.',
    '- Scan and reason about the attached workspace context (see Project scan / @files).',
    '- Guide Pixcode usage: projects, Files, Shell, Git, providers, updates, desktop runtime.',
    '- Suggest shell/git commands the user can run in Pixcode Shell or terminal.',
    '- When the user pastes errors or @files, diagnose and propose fixes.',
    '',
    '## Limits (honest)',
    '- You chat via OpenAI-compatible HTTP (Custom / catalog providers). API key may be optional for local endpoints.',
    '- You cannot silently mutate the machine; give clear commands/steps for the user or Pixcode Shell.',
    '- For heavy multi-file edits, give a plan + patches; user applies via editor/CLI.',
    '',
    projectId ? `Workspace projectId: ${projectId}` : 'Workspace: general (no project bound).',
    projectPath ? `Workspace path: ${projectPath}` : '',
    scanContext || '',
  ].filter(Boolean).join('\n');
}
