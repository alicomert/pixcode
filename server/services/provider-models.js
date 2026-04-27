/**
 * Provider model catalog — dynamic discovery + persistent cache.
 *
 * Each CLI provider offers a different way to list the models it can run:
 *
 *   - Anthropic: https://api.anthropic.com/v1/models (API key required)
 *   - OpenAI   : https://api.openai.com/v1/models (or a custom baseUrl when
 *                the user points Codex at an OpenAI-compatible proxy)
 *   - Google   : https://generativelanguage.googleapis.com/v1beta/models
 *   - Qwen     : same OpenAI-compat shape when users BYOK through
 *                ModelStudio / ModelScope / OpenRouter etc.
 *
 * The UI still keeps a hardcoded "known good" catalog as a baseline so
 * brand-new installs don't show an empty dropdown; discovery merges the
 * server-reported list on top, dedupes, and persists to
 * `~/.pixcode/provider-models.json` with a 6-hour freshness window.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getProviderCredentials } from './provider-credentials.js';

const CACHE_FILE = path.join(os.homedir(), '.pixcode', 'provider-models.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function readCache() {
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function writeCache(next) {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/**
 * Cache entry shape:
 *   { models: [{ value, label, source: 'static' | 'api' }],
 *     fetchedAt: '<iso date>',
 *     error?: '...' }
 *
 * `source` tells the UI which entries came from the live API so a
 * refresh can prune stale ones without losing the hand-maintained
 * defaults.
 */
async function loadCachedEntry(provider) {
    const cache = await readCache();
    return cache[provider] || null;
}

async function saveCacheEntry(provider, entry) {
    const cache = await readCache();
    cache[provider] = { ...entry, fetchedAt: new Date().toISOString() };
    await writeCache(cache);
}

function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const value = typeof item.value === 'string' ? item.value.trim() : '';
        if (!value || seen.has(value)) continue;
        seen.add(value);
        const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : value;
        const source = item.source === 'api' ? 'api' : 'static';
        const entry = { value, label, source };
        if (typeof item.free === 'boolean') entry.free = item.free;
        out.push(entry);
    }
    return out;
}

function mergeCatalogs(primary, secondary) {
    const seen = new Map();
    for (const item of [...primary, ...secondary]) {
        if (!seen.has(item.value)) seen.set(item.value, item);
    }
    return Array.from(seen.values());
}

// ---------------- Per-provider live discovery ----------------

async function discoverAnthropic(apiKey, baseUrl) {
    const endpoint = (baseUrl?.replace(/\/+$/, '') || 'https://api.anthropic.com') + '/v1/models';
    const response = await fetch(endpoint, {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
    });
    if (!response.ok) throw new Error(`Anthropic /v1/models returned ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows
        .filter((m) => typeof m?.id === 'string')
        .map((m) => ({
            value: m.id,
            label: typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name : m.id,
            source: 'api',
        }));
}

async function discoverOpenAiCompat(apiKey, baseUrl, fallbackBase) {
    const endpoint = (baseUrl?.replace(/\/+$/, '') || fallbackBase) + '/models';
    const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
        // 401 specifically means our key is bad — but for codex/qwen/etc.
        // users often log in via OAuth (`codex login`, `qwen auth`) which
        // doesn't expose an OpenAI-compatible API key. Surface a clean
        // "no live discovery available" rather than a scary 401 trace.
        if (response.status === 401) {
            const err = new Error('OpenAI-compatible /v1/models requires an API key. The static catalog is shown instead — that\'s expected when you signed in via OAuth (e.g. `codex login`).');
            err.code = 'OAUTH_NO_API_KEY';
            throw err;
        }
        throw new Error(`${endpoint} returned ${response.status}`);
    }
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows
        .filter((m) => typeof m?.id === 'string')
        .map((m) => ({
            value: m.id,
            label: m.id,
            source: 'api',
        }));
}

/**
 * Detect whether the user is authenticated via the provider's OAuth flow
 * (codex login / qwen auth) so we can skip live model discovery silently
 * — those flows don't surface a usable OpenAI-compatible API key, and the
 * SDK calls the upstream APIs through its own internal auth path.
 */
async function hasProviderOauthAuth(provider) {
    if (provider === 'codex') {
        try {
            await fs.access(path.join(os.homedir(), '.codex', 'auth.json'));
            return true;
        } catch { return false; }
    }
    if (provider === 'qwen') {
        try {
            await fs.access(path.join(os.homedir(), '.qwen', 'oauth_creds.json'));
            return true;
        } catch { return false; }
    }
    return false;
}

/**
 * OpenCode is multi-provider — its "model" picker isn't a single API list,
 * it's the union of every provider it can route to (Anthropic, OpenAI,
 * Google, xAI, OpenRouter, OpenCode Zen, Ollama, etc.). The canonical
 * catalog lives at https://models.dev/api.json (no auth, ~1.8 MB JSON, 115
 * providers as of 2026-04). We pull that, filter to providers the user
 * has authenticated with (read `~/.local/share/opencode/auth.json`) plus
 * always include the OpenCode Zen tier (works without explicit auth on
 * the free models), drop deprecated entries, and tag free models.
 */
async function discoverOpencode() {
    const url = process.env.OPENCODE_MODELS_URL || 'https://models.dev/api.json';
    const response = await fetch(url, {
        // OpenCode itself caches this for hours; we cache for 6h via the
        // outer wrapper so a single 7s fetch on cold start is acceptable.
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`models.dev/api.json returned ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object') throw new Error('models.dev returned a non-object payload');

    // Read OpenCode's auth.json to know which providers the user can
    // actually call. Missing file → only show always-free Zen.
    const authedProviders = new Set(['opencode']);
    try {
        const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
        const raw = await fs.readFile(authPath, 'utf8');
        const auth = JSON.parse(raw);
        if (auth && typeof auth === 'object') {
            for (const k of Object.keys(auth)) authedProviders.add(k);
        }
    } catch { /* no auth.json → only Zen free models surface */ }

    // Common env-var providers OpenCode picks up automatically. If the user
    // exported one in their shell, surface those models too even without
    // auth.json. Mirrors the env list in opencode-auth.provider.ts.
    const envProviderHints = {
        anthropic: ['ANTHROPIC_API_KEY'],
        openai: ['OPENAI_API_KEY'],
        google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
        'google-vertex': ['GOOGLE_APPLICATION_CREDENTIALS'],
        xai: ['XAI_API_KEY'],
        groq: ['GROQ_API_KEY'],
        cerebras: ['CEREBRAS_API_KEY'],
        openrouter: ['OPENROUTER_API_KEY'],
    };
    for (const [providerId, envVars] of Object.entries(envProviderHints)) {
        if (envVars.some((v) => process.env[v]?.trim())) authedProviders.add(providerId);
    }

    const out = [];
    for (const [providerId, providerCfg] of Object.entries(data)) {
        if (!authedProviders.has(providerId)) continue;
        if (!providerCfg || typeof providerCfg !== 'object') continue;
        const models = providerCfg.models;
        if (!models || typeof models !== 'object') continue;

        const providerName = typeof providerCfg.name === 'string' && providerCfg.name.trim()
            ? providerCfg.name
            : providerId;

        for (const [modelId, modelCfg] of Object.entries(models)) {
            if (!modelCfg || typeof modelCfg !== 'object') continue;
            // Skip deprecated entries from the default list — users can
            // still hand-type them if they really need to.
            if (modelCfg.status === 'deprecated') continue;
            const cost = modelCfg.cost && typeof modelCfg.cost === 'object' ? modelCfg.cost : null;
            const free = !cost || (Number(cost.input) === 0 && Number(cost.output) === 0);
            const ctx = modelCfg.limit?.context;
            const ctxLabel = typeof ctx === 'number' && ctx > 0
                ? ` · ${ctx >= 1_000_000 ? `${(ctx / 1_000_000).toFixed(1)}M` : `${Math.round(ctx / 1000)}K`}`
                : '';
            const freeLabel = free ? ' · Free' : '';
            const modelName = typeof modelCfg.name === 'string' && modelCfg.name.trim()
                ? modelCfg.name
                : modelId;

            out.push({
                value: `${providerId}/${modelId}`,
                label: `${providerName} · ${modelName}${ctxLabel}${freeLabel}`,
                source: 'api',
                free,
            });
        }
    }

    // Sort: free first (handy when the user is unauthed), then by label.
    out.sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1;
        return a.label.localeCompare(b.label);
    });

    return out;
}

async function discoverGoogle(apiKey) {
    // Google Generative Language API — public models list, API key as query.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Google /v1beta/models returned ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data?.models) ? data.models : [];
    return rows
        .filter((m) => typeof m?.name === 'string' && m.name.includes('models/'))
        .map((m) => {
            const id = m.name.replace(/^models\//, '');
            return {
                value: id,
                label: typeof m.displayName === 'string' && m.displayName.trim() ? m.displayName : id,
                source: 'api',
            };
        });
}

/**
 * Returns the merged catalog for a provider.
 *   opts.forceRefresh: ignore cache and hit the upstream API
 *   opts.staticList: hardcoded fallback from shared/modelConstants.js
 */
export async function getProviderModels(provider, opts = {}) {
    const { forceRefresh = false, staticList = [] } = opts;
    const staticCatalog = normalizeList(staticList.map((m) => ({ ...m, source: 'static' })));

    const cached = await loadCachedEntry(provider);
    const cacheFresh = cached?.fetchedAt
        ? Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS
        : false;

    if (!forceRefresh && cacheFresh && Array.isArray(cached?.models)) {
        return {
            models: mergeCatalogs(normalizeList(cached.models), staticCatalog),
            fetchedAt: cached.fetchedAt,
            error: cached.error,
            fromCache: true,
        };
    }

    // OpenCode is the odd one out: its catalog is models.dev, not a per-key
    // API endpoint. Skip the credential plumbing and dispatch straight.
    let liveModels = [];
    let error;
    if (provider === 'opencode') {
        try {
            liveModels = await discoverOpencode();
        } catch (err) {
            error = err?.message || String(err);
        }
        const merged = mergeCatalogs(normalizeList(liveModels), staticCatalog);
        const entry = { models: merged, error };
        await saveCacheEntry(provider, entry).catch(() => { /* non-fatal */ });
        return { models: merged, fetchedAt: new Date().toISOString(), error, fromCache: false };
    }

    // Pick up credentials from Pixcode's UI store first, then fall back to
    // the native env vars so a user who already exported ANTHROPIC_API_KEY
    // (or authenticated Claude Code via OAuth — the SDK writes the key into
    // process.env on boot) gets live models without re-entering anything.
    const creds = await getProviderCredentials(provider);
    const envKey = {
        claude: process.env.ANTHROPIC_API_KEY,
        codex: process.env.OPENAI_API_KEY,
        qwen: process.env.OPENAI_API_KEY || process.env.QWEN_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
    }[provider];
    const envBase = {
        claude: process.env.ANTHROPIC_BASE_URL,
        codex: process.env.OPENAI_BASE_URL,
        qwen: process.env.OPENAI_BASE_URL,
        gemini: undefined,
    }[provider];
    const apiKey = creds?.apiKey || envKey;
    const baseUrl = creds?.baseUrl || envBase || undefined;

    if (!apiKey) {
        // Codex and Qwen support OAuth (`codex login`, `qwen auth`) which
        // DOESN'T expose a usable API key — the SDK auths against the
        // upstream API directly. Skip the discovery step silently in that
        // case; the static catalog is the right answer.
        const oauthOnly = await hasProviderOauthAuth(provider);
        if (!oauthOnly) {
            // Be explicit so the UI can surface a useful hint rather than just
            // showing the static baseline with no reason given.
            error = `No ${provider} API key configured. Save one in Settings > Agents > API Key, or sign in via the CLI (e.g. \`codex login\`).`;
        }
    } else {
        try {
            if (provider === 'claude') {
                liveModels = await discoverAnthropic(apiKey, baseUrl);
            } else if (provider === 'codex') {
                liveModels = await discoverOpenAiCompat(apiKey, baseUrl, 'https://api.openai.com/v1');
            } else if (provider === 'qwen') {
                liveModels = await discoverOpenAiCompat(
                    apiKey,
                    baseUrl,
                    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
                );
            } else if (provider === 'gemini') {
                liveModels = await discoverGoogle(apiKey);
            }
        } catch (err) {
            // OAuth users get a clean message instead of a raw 401 stack.
            if (err?.code === 'OAUTH_NO_API_KEY') {
                error = err.message;
            } else {
                error = err?.message || String(err);
            }
        }
    }

    const merged = mergeCatalogs(normalizeList(liveModels), staticCatalog);
    const entry = { models: merged, error };
    await saveCacheEntry(provider, entry).catch(() => { /* non-fatal */ });
    return { models: merged, fetchedAt: new Date().toISOString(), error, fromCache: false };
}

export async function clearProviderModelCache(provider) {
    const cache = await readCache();
    if (provider) delete cache[provider];
    else Object.keys(cache).forEach((k) => delete cache[k]);
    await writeCache(cache);
}
