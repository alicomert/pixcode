/**
 * PixBot LLM — multi Custom-provider OpenAI-compatible chat.
 *
 * Users can attach many endpoints:
 *   - from models.dev catalog (OpenRouter, Groq, DeepSeek, …)
 *   - pure custom (Ollama, LiteLLM, private gateway)
 *
 * API key is optional (local Ollama / open proxies). Each provider has its
 * own baseUrl + optional key. Models come from live GET /v1/models, with
 * models.dev labels as fallback when live list fails.
 *
 * Store: ~/.pixcode/pixbot-providers.json
 * Also migrates legacy single-key credentials (custom / pixbot / codex / env).
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

// ───────────────────────── helpers ─────────────────────────

export function normalizeOpenAiBaseUrl(raw, fallback = DEFAULT_OPENAI_BASE) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) base = String(fallback || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  if (!/\/v1$/i.test(base) && !/\/compatible-mode\/v1$/i.test(base)) {
    if (!/\/v\d+/i.test(base) && !/\/inference$/i.test(base)) {
      // Only append /v1 for bare host or path without version segment
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

function publicProvider(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    catalogId: p.catalogId || null,
    baseUrl: p.baseUrl,
    hasApiKey: Boolean(p.apiKey),
    enabled: p.enabled !== false,
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
  };
}

async function readStoreRaw() {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { providers: [], activeProviderId: null };
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      activeProviderId: typeof parsed.activeProviderId === 'string' ? parsed.activeProviderId : null,
      defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : null,
    };
  } catch {
    return { providers: [], activeProviderId: null, defaultModel: null };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * One-time migration from legacy single credential keys / env into multi-provider store.
 */
async function migrateLegacyIfNeeded(store) {
  if (store.providers.length > 0) return store;

  const candidates = [];
  for (const id of [LEGACY_CUSTOM, LEGACY_PIXBOT, 'codex', 'qwen']) {
    const entry = await getProviderCredentials(id).catch(() => null);
    if (!entry?.apiKey && !entry?.baseUrl) continue;
    const fallback = id === 'qwen' ? DEFAULT_QWEN_BASE : DEFAULT_OPENAI_BASE;
    const baseUrl = normalizeOpenAiBaseUrl(entry.baseUrl, fallback);
    if (!baseUrl && !entry.apiKey) continue;
    candidates.push({
      id,
      name: id === 'codex' ? 'OpenAI / Codex' : id === 'qwen' ? 'Qwen' : id === LEGACY_CUSTOM ? 'Custom' : 'PixBot (legacy)',
      catalogId: id === 'codex' ? 'openai' : null,
      baseUrl: baseUrl || DEFAULT_OPENAI_BASE,
      apiKey: entry.apiKey || null,
    });
  }

  if (!candidates.length) {
    const envKey = process.env.PIXCODE_CUSTOM_API_KEY
      || process.env.PIXCODE_PIXBOT_API_KEY
      || process.env.OPENAI_API_KEY
      || null;
    const envBase = normalizeOpenAiBaseUrl(
      process.env.PIXCODE_CUSTOM_BASE_URL
        || process.env.PIXCODE_PIXBOT_BASE_URL
        || process.env.OPENAI_BASE_URL
        || process.env.OPENAI_API_BASE,
      envKey ? DEFAULT_OPENAI_BASE : null,
    );
    if (envBase) {
      candidates.push({
        id: 'env',
        name: 'Environment',
        catalogId: null,
        baseUrl: envBase,
        apiKey: envKey,
      });
    }
  }

  if (!candidates.length) return store;

  const now = new Date().toISOString();
  const providers = candidates.map((c, i) => ({
    id: c.id === 'env' ? 'env-default' : `migrated-${c.id}`,
    name: c.name,
    catalogId: c.catalogId,
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    // Prefer custom-like first
    _rank: c.id === LEGACY_CUSTOM ? 0 : c.id === LEGACY_PIXBOT ? 1 : 2 + i,
  })).sort((a, b) => a._rank - b._rank).map(({ _rank, ...rest }) => rest);

  const next = {
    providers,
    activeProviderId: providers[0]?.id || null,
    defaultModel: process.env.PIXCODE_PIXBOT_MODEL || process.env.PIXCODE_CUSTOM_MODEL || null,
  };
  await writeStore(next);
  return next;
}

async function loadStore() {
  const store = await readStoreRaw();
  return migrateLegacyIfNeeded(store);
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

// ───────────────────────── public config ─────────────────────────

export async function getPixbotConfig() {
  const store = await loadStore();
  const active = resolveActiveProvider(store);
  return {
    brand: 'PixBot',
    configured: store.providers.some((p) => p.enabled !== false && p.baseUrl),
    providerCount: store.providers.length,
    activeProviderId: active?.id || null,
    activeProvider: publicProvider(active),
    providers: store.providers.map(publicProvider),
    defaultModel: store.defaultModel || process.env.PIXCODE_PIXBOT_MODEL || null,
    // legacy fields
    hasApiKey: Boolean(active?.apiKey),
    baseUrl: active?.baseUrl || null,
    source: active ? (active.catalogId || 'custom') : null,
    preferredStore: LEGACY_CUSTOM,
  };
}

/** Resolve credentials for chat/models — multi-provider aware. */
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
    providers: store.providers.map(publicProvider),
  };
}

/**
 * Add a provider.
 * @param {{ name?: string, baseUrl?: string, apiKey?: string|null, catalogId?: string|null, id?: string }} input
 * apiKey is optional — local servers often need none.
 */
export async function addPixbotProvider(input = {}) {
  const store = await loadStore();
  let name = typeof input.name === 'string' ? input.name.trim() : '';
  let baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : '';
  let catalogId = typeof input.catalogId === 'string' ? input.catalogId.trim() : null;
  const apiKeyRaw = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  // Empty string means no key (allowed). undefined → no key. Only store if non-empty.
  const apiKey = apiKeyRaw || null;

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

  // Avoid exact duplicates of same baseUrl — update key instead
  const existing = store.providers.find(
    (p) => p.baseUrl.replace(/\/+$/, '') === normalized && (catalogId ? p.catalogId === catalogId : !p.catalogId || p.name === name),
  );
  const now = new Date().toISOString();
  if (existing) {
    if (apiKey) existing.apiKey = apiKey;
    if (name) existing.name = name;
    existing.updatedAt = now;
    existing.enabled = true;
    if (!store.activeProviderId) store.activeProviderId = existing.id;
    await writeStore(store);
    // Keep system `custom` in sync with active for spawn env consumers
    await syncLegacyCustomMirror(store);
    return { provider: publicProvider(existing), created: false };
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
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  store.providers.push(provider);
  if (!store.activeProviderId) store.activeProviderId = provider.id;
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  return { provider: publicProvider(provider), created: true };
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
    // empty string clears key (allowed)
    p.apiKey = patch.apiKey.trim() || null;
  }
  if (typeof patch.enabled === 'boolean') p.enabled = patch.enabled;
  p.updatedAt = new Date().toISOString();
  await writeStore(store);
  await syncLegacyCustomMirror(store);
  return publicProvider(p);
}

export async function removePixbotProvider(providerId) {
  const store = await loadStore();
  const before = store.providers.length;
  store.providers = store.providers.filter((p) => p.id !== providerId);
  if (store.activeProviderId === providerId) {
    store.activeProviderId = store.providers[0]?.id || null;
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
  return publicProvider(p);
}

/** Mirror active provider into system `custom` credentials when a real key exists. */
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

/**
 * Backward-compatible single save → upserts one "Custom" provider.
 * apiKey optional when baseUrl points at local server.
 */
export async function savePixbotConfig({ apiKey, baseUrl, model, name } = {}) {
  const nextBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const nextKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!nextBase && !nextKey) {
    // clear all? too aggressive — just return config
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
  // Only send Authorization when a real key exists (not sentinel / empty)
  if (apiKey && apiKey !== '__none__' && apiKey !== 'no-key') {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchLiveModels(creds) {
  const url = `${creds.baseUrl}/models`;
  const res = await fetch(url, {
    headers: authHeaders(creds.apiKey),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Models HTTP ${res.status}: ${body.slice(0, 160)}`);
    err.statusCode = res.status;
    throw err;
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
  return rows
    .map((row) => {
      const id = row?.id || row?.name || row?.model;
      if (!id || typeof id !== 'string') return null;
      return { id, label: id, ownedBy: row?.owned_by || null, source: 'live' };
    })
    .filter(Boolean);
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

/**
 * Models for all enabled providers (or one). Composite value: `providerId::modelId`
 */
export async function fetchPixbotModels({ providerId } = {}) {
  const store = await loadStore();
  const list = providerId
    ? store.providers.filter((p) => p.id === providerId)
    : store.providers.filter((p) => p.enabled !== false && p.baseUrl);

  if (!list.length) {
    const err = new Error(
      'Henüz provider yok. Catalog’dan ekle veya kendi OpenAI-uyumlu base URL’ini bağla (API key opsiyonel).',
    );
    err.statusCode = 400;
    err.code = 'PIXBOT_NOT_CONFIGURED';
    throw err;
  }

  const groups = [];
  const models = [];

  for (const p of list) {
    let live = [];
    let error = null;
    try {
      live = await fetchLiveModels({ apiKey: p.apiKey, baseUrl: p.baseUrl });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      live = await catalogModelsForProvider(p);
    }
    const mapped = live.map((m) => ({
      id: m.id,
      value: `${p.id}::${m.id}`,
      label: list.length > 1 ? `${m.label || m.id} · ${p.name}` : (m.label || m.id),
      providerId: p.id,
      providerName: p.name,
      source: m.source,
    }));
    groups.push({
      providerId: p.id,
      providerName: p.name,
      baseUrl: p.baseUrl,
      hasApiKey: Boolean(p.apiKey && p.apiKey !== '__none__'),
      modelCount: mapped.length,
      error,
      models: mapped,
    });
    models.push(...mapped);
  }

  models.sort((a, b) => a.label.localeCompare(b.label));

  return {
    models,
    groups,
    count: models.length,
    activeProviderId: store.activeProviderId,
  };
}

/**
 * Parse UI model selection: plain id or `providerId::modelId`
 */
export function parseModelSelection(raw) {
  const s = String(raw || '').trim();
  if (!s) return { providerId: null, model: null };
  const idx = s.indexOf('::');
  if (idx > 0) {
    return { providerId: s.slice(0, idx), model: s.slice(idx + 2) };
  }
  return { providerId: null, model: s };
}

export async function pixbotChatCompletion({
  messages,
  model,
  providerId,
  temperature = 0.6,
  maxTokens = 4096,
} = {}) {
  const parsed = parseModelSelection(model);
  const store = await loadStore();
  const p = resolveActiveProvider(store, providerId || parsed.providerId);
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
    || store.defaultModel
    || process.env.PIXCODE_PIXBOT_MODEL
    || null;

  if (!modelId) {
    try {
      const catalog = await fetchPixbotModels({ providerId: p.id });
      modelId = catalog.models[0]?.id || null;
    } catch {
      modelId = null;
    }
  }
  if (!modelId) {
    const err = new Error('Model seçilmedi ve /v1/models boş. PixBot’ta model seç.');
    err.statusCode = 400;
    throw err;
  }

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

// re-export catalog list for routes
export { listCatalogProviders, getCatalogProvider };

/**
 * Lightweight project snapshot so PixBot can answer "projeyi tara".
 */
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
