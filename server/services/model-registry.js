import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  CURSOR_MODELS,
  GEMINI_MODELS,
  OPENCODE_MODELS,
  QWEN_MODELS,
} from '../../shared/modelConstants.js';

import { clearProviderModelCache, getProviderModels } from './provider-models.js';

export const MODEL_REGISTRY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const PROVIDER_CONFIG = {
  claude: {
    defaultModel: CLAUDE_MODELS.DEFAULT,
    staticModels: CLAUDE_MODELS.OPTIONS,
  },
  cursor: {
    defaultModel: CURSOR_MODELS.DEFAULT,
    staticModels: CURSOR_MODELS.OPTIONS,
  },
  codex: {
    defaultModel: CODEX_MODELS.DEFAULT,
    staticModels: CODEX_MODELS.OPTIONS,
  },
  gemini: {
    defaultModel: GEMINI_MODELS.DEFAULT,
    staticModels: GEMINI_MODELS.OPTIONS,
  },
  qwen: {
    defaultModel: QWEN_MODELS.DEFAULT,
    staticModels: QWEN_MODELS.OPTIONS,
  },
  opencode: {
    defaultModel: OPENCODE_MODELS.DEFAULT,
    staticModels: OPENCODE_MODELS.OPTIONS,
  },
};

export const MODEL_REGISTRY_PROVIDERS = Object.freeze(Object.keys(PROVIDER_CONFIG));

function normalizeStaticModels(models) {
  const seen = new Set();
  const out = [];

  for (const model of Array.isArray(models) ? models : []) {
    if (!model || typeof model !== 'object') continue;
    const value = typeof model.value === 'string' ? model.value.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);

    const label = typeof model.label === 'string' && model.label.trim() ? model.label.trim() : value;
    const entry = { value, label, source: 'static' };
    if (typeof model.free === 'boolean') entry.free = model.free;
    out.push(entry);
  }

  return out;
}

function readProviderConfig(provider) {
  return PROVIDER_CONFIG[provider] ?? null;
}

export function isModelRegistryProvider(provider) {
  return Boolean(readProviderConfig(provider));
}

export function getProviderModelRegistryConfig(provider) {
  const config = readProviderConfig(provider);
  if (!config) return null;

  return {
    provider,
    defaultModel: config.defaultModel,
    staticModels: getStaticProviderModels(provider),
  };
}

export function getStaticProviderModels(provider) {
  const config = readProviderConfig(provider);
  return normalizeStaticModels(config?.staticModels ?? []);
}

export function getDefaultProviderModel(provider) {
  return readProviderConfig(provider)?.defaultModel;
}

function readFreshnessSource({ error, fromCache }) {
  if (error) return 'fallback';
  if (fromCache) return 'cache';
  return 'live';
}

export async function getProviderModelRegistryEntry(provider, opts = {}) {
  const config = readProviderConfig(provider);
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const staticModels = getStaticProviderModels(provider);
  const result = await getProviderModels(provider, {
    forceRefresh: Boolean(opts.forceRefresh),
    staticList: staticModels,
  });

  const models = Array.isArray(result?.models) && result.models.length > 0
    ? result.models
    : staticModels;
  const error = result?.error || null;

  return {
    provider,
    models,
    defaultModel: config.defaultModel,
    fetchedAt: result?.fetchedAt ?? null,
    error,
    fromCache: Boolean(result?.fromCache),
    freshness: {
      ttlMs: MODEL_REGISTRY_CACHE_TTL_MS,
      fetchedAt: result?.fetchedAt ?? null,
      fromCache: Boolean(result?.fromCache),
      degraded: Boolean(error),
      source: readFreshnessSource({ error, fromCache: result?.fromCache }),
    },
  };
}

export async function getAllProviderModelRegistry(opts = {}) {
  const entries = await Promise.all(
    MODEL_REGISTRY_PROVIDERS.map((provider) => getProviderModelRegistryEntry(provider, opts)),
  );

  return Object.fromEntries(entries.map((entry) => [entry.provider, entry]));
}

export async function clearProviderModelRegistryCache(provider) {
  if (!isModelRegistryProvider(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  await clearProviderModelCache(provider);
}
