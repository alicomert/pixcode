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
        out.push({ value, label, source });
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
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
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

    let liveModels = [];
    let error;
    if (!apiKey) {
        // Be explicit so the UI can surface a useful hint rather than just
        // showing the static baseline with no reason given.
        error = `No ${provider} API key configured. Save one in Settings > Agents > API Key to enable live discovery.`;
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
            error = err?.message || String(err);
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
