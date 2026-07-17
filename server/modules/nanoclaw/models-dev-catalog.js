/**
 * models.dev catalog for PixBot.
 *
 * Source: https://models.dev/api.json
 * We surface providers that look OpenAI-compatible (or have a usable `api`
 * base URL) so users can one-click add them. Pure custom OpenAI endpoints
 * are still allowed separately without catalog entry.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CATALOG_URL = process.env.OPENCODE_MODELS_URL || 'https://models.dev/api.json';
const CACHE_FILE = path.join(os.homedir(), '.pixcode', 'models-dev-cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Well-known defaults when models.dev omits `api` (common for openai / ollama).
const KNOWN_API_BASES = Object.freeze({
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
  'github-models': 'https://models.github.ai/inference',
  huggingface: 'https://router.huggingface.co/v1',
  'fireworks-ai': 'https://api.fireworks.ai/inference/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  perplexity: 'https://api.perplexity.ai',
});

// Featured first in UI (simple list, not 160 providers dumped randomly).
const FEATURED_IDS = [
  'openai',
  'openrouter',
  'groq',
  'deepseek',
  'xai',
  'mistral',
  'together',
  'ollama',
  'lmstudio',
  'huggingface',
  'fireworks-ai',
  'github-models',
  'cerebras',
  'perplexity',
];

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(payload) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload), { mode: 0o600 });
}

function isOpenAiCompatibleShape(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const npm = String(entry.npm || '');
  const api = String(entry.api || '');
  if (npm.includes('openai-compatible')) return true;
  if (npm.includes('@ai-sdk/openai') && !npm.includes('anthropic')) return true;
  if (/\/v1\/?$/i.test(api) || /\/openai\/v1/i.test(api) || /\/inference\/v1/i.test(api)) return true;
  // Known ids even without api field
  if (KNOWN_API_BASES[entry.id]) return true;
  return false;
}

function normalizeBaseUrl(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  // models.dev sometimes ends with trailing path already
  if (!/\/v1$/i.test(base) && !/\/v1\//i.test(base) && !/\/compatible-mode\/v1$/i.test(base)) {
    if (!/\/v\d+/i.test(base) && !/\/inference$/i.test(base)) {
      // leave bare hosts without forcing /v1 if path already deep
      if (!base.includes('/', base.indexOf('://') + 3) || base.endsWith('.ai') || base.endsWith('.com')) {
        // only auto-append for bare host-ish; for known paths keep as-is
      }
    }
  }
  return base;
}

function summarizeProvider(id, entry) {
  const modelsMap = entry.models && typeof entry.models === 'object' ? entry.models : {};
  const modelIds = Object.keys(modelsMap);
  const sampleModels = modelIds.slice(0, 8).map((mid) => {
    const m = modelsMap[mid];
    return {
      id: mid,
      label: (m && typeof m.name === 'string' && m.name.trim()) ? m.name.trim() : mid,
    };
  });

  const knownBase = KNOWN_API_BASES[id] || null;
  let api = entry.api ? normalizeBaseUrl(entry.api) : knownBase;
  // template placeholders like ${DATABRICKS_HOST} — skip for one-click add
  if (api && api.includes('${')) api = null;

  const envList = Array.isArray(entry.env) ? entry.env.filter((e) => typeof e === 'string') : [];
  const requiresKey = envList.length > 0 && !['ollama', 'lmstudio'].includes(id);

  return {
    id,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : id,
    api,
    env: envList[0] || null,
    envAll: envList,
    doc: typeof entry.doc === 'string' ? entry.doc : null,
    npm: typeof entry.npm === 'string' ? entry.npm : null,
    modelCount: modelIds.length,
    sampleModels,
    requiresKey,
    featured: FEATURED_IDS.includes(id),
    openaiCompatible: isOpenAiCompatibleShape({ ...entry, id }),
  };
}

/**
 * Fetch full models.dev payload (cached 6h on disk).
 */
export async function loadModelsDevRaw({ force = false } = {}) {
  if (!force) {
    const cached = await readCache();
    if (cached?.fetchedAt && cached?.data) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) {
        return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true };
      }
    }
  }

  const response = await fetch(CATALOG_URL, {
    signal: AbortSignal.timeout(20000),
    headers: { accept: 'application/json', 'user-agent': 'pixcode-pixbot' },
  });
  if (!response.ok) {
    // Fall back to stale cache if network fails
    const cached = await readCache();
    if (cached?.data) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: true };
    }
    throw new Error(`models.dev fetch failed HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('models.dev returned non-object');
  const fetchedAt = new Date().toISOString();
  await writeCache({ fetchedAt, data }).catch(() => {});
  return { data, fetchedAt, fromCache: false };
}

/** Always-available local / common endpoints (models.dev may omit bare Ollama). */
const SYNTHETIC_LOCAL = [
  {
    id: 'ollama',
    name: 'Ollama (local)',
    api: 'http://127.0.0.1:11434/v1',
    env: null,
    envAll: [],
    doc: 'https://ollama.com',
    npm: '@ai-sdk/openai-compatible',
    modelCount: 0,
    sampleModels: [],
    requiresKey: false,
    featured: true,
    openaiCompatible: true,
  },
  {
    id: 'openai-local',
    name: 'OpenAI-compatible (any host)',
    api: 'http://127.0.0.1:8080/v1',
    env: null,
    envAll: [],
    doc: null,
    npm: '@ai-sdk/openai-compatible',
    modelCount: 0,
    sampleModels: [],
    requiresKey: false,
    featured: true,
    openaiCompatible: true,
  },
];

/**
 * List OpenAI-compatible (or known chat) providers for the add-provider UI.
 * @param {{ q?: string, limit?: number, force?: boolean }} opts
 */
export async function listCatalogProviders({ q = '', limit = 80, force = false } = {}) {
  const { data, fetchedAt, fromCache, stale } = await loadModelsDevRaw({ force });
  const query = String(q || '').trim().toLowerCase();

  const rows = [];
  const seen = new Set();

  for (const synth of SYNTHETIC_LOCAL) {
    if (query) {
      const hay = `${synth.id} ${synth.name} ${synth.api}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    rows.push(synth);
    seen.add(synth.id);
  }

  for (const [id, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') continue;
    if (seen.has(id)) continue;
    if (!isOpenAiCompatibleShape({ ...entry, id }) && !KNOWN_API_BASES[id]) continue;
    const row = summarizeProvider(id, entry);
    // Skip entries without a resolvable API base (can't one-click chat)
    if (!row.api) continue;
    if (query) {
      const hay = `${row.id} ${row.name} ${row.api}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    rows.push(row);
    seen.add(id);
  }

  rows.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const ai = FEATURED_IDS.indexOf(a.id);
    const bi = FEATURED_IDS.indexOf(b.id);
    if (a.featured && b.featured && ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  const capped = rows.slice(0, Math.max(1, Math.min(200, Number(limit) || 80)));
  return {
    source: CATALOG_URL,
    fetchedAt,
    fromCache: Boolean(fromCache),
    stale: Boolean(stale),
    count: capped.length,
    totalMatched: rows.length,
    providers: capped,
  };
}

/**
 * Single catalog provider + full model list (for offline model labels).
 */
export async function getCatalogProvider(providerId, { force = false } = {}) {
  const id = String(providerId || '').trim();
  if (!id) return null;
  const synth = SYNTHETIC_LOCAL.find((s) => s.id === id);
  if (synth) return { ...synth, models: [] };

  const { data } = await loadModelsDevRaw({ force });
  const entry = data[id];
  if (!entry) {
    // Known base without full models.dev row
    if (KNOWN_API_BASES[id]) {
      return {
        id,
        name: id,
        api: KNOWN_API_BASES[id],
        env: null,
        envAll: [],
        doc: null,
        npm: null,
        modelCount: 0,
        sampleModels: [],
        requiresKey: !['ollama', 'lmstudio'].includes(id),
        featured: FEATURED_IDS.includes(id),
        openaiCompatible: true,
        models: [],
      };
    }
    return null;
  }
  const summary = summarizeProvider(id, entry);
  const modelsMap = entry.models && typeof entry.models === 'object' ? entry.models : {};
  const models = Object.keys(modelsMap).map((mid) => {
    const m = modelsMap[mid];
    return {
      id: mid,
      label: (m && typeof m.name === 'string' && m.name.trim()) ? m.name.trim() : mid,
      reasoning: Boolean(m?.reasoning),
      toolCall: Boolean(m?.tool_call),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { ...summary, models };
}
