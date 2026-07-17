/**
 * PixBot LLM — OpenAI-compatible HTTP chat for NanoClaw/PixBot UI.
 *
 * Replaces flaky CLI spawns (opencode 404, grok argv, …) for conversational
 * chat. Credentials live in ~/.pixcode/provider-credentials.json under key
 * `pixbot` (apiKey + baseUrl). Models come from GET {base}/v1/models.
 */
import {
  getProviderCredentials,
  setProviderCredentials,
} from '../../services/provider-credentials.js';

const STORE_KEY = 'pixbot';

/** Normalize base URL to end with /v1 (no trailing slash after v1). */
export function normalizeOpenAiBaseUrl(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) {
    base = process.env.PIXCODE_PIXBOT_BASE_URL
      || process.env.OPENAI_BASE_URL
      || process.env.OPENAI_API_BASE
      || '';
  }
  base = base.replace(/\/+$/, '');
  if (!base) return null;
  // Accept both https://host and https://host/v1
  if (!/\/v1$/i.test(base)) {
    base = `${base}/v1`;
  }
  return base;
}

export async function getPixbotConfig() {
  const fromStore = await getProviderCredentials(STORE_KEY).catch(() => null);
  const apiKey = fromStore?.apiKey
    || process.env.PIXCODE_PIXBOT_API_KEY
    || process.env.OPENAI_API_KEY
    || null;
  const baseUrl = normalizeOpenAiBaseUrl(fromStore?.baseUrl || process.env.PIXCODE_PIXBOT_BASE_URL || process.env.OPENAI_BASE_URL);
  const defaultModel = process.env.PIXCODE_PIXBOT_MODEL || null;
  return {
    configured: Boolean(apiKey && baseUrl),
    hasApiKey: Boolean(apiKey),
    baseUrl,
    defaultModel,
    // never return raw key to clients
  };
}

export async function getPixbotCredentials() {
  const fromStore = await getProviderCredentials(STORE_KEY).catch(() => null);
  const apiKey = fromStore?.apiKey
    || process.env.PIXCODE_PIXBOT_API_KEY
    || process.env.OPENAI_API_KEY
    || null;
  const baseUrl = normalizeOpenAiBaseUrl(fromStore?.baseUrl || process.env.PIXCODE_PIXBOT_BASE_URL || process.env.OPENAI_BASE_URL);
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

export async function savePixbotConfig({ apiKey, baseUrl, model } = {}) {
  const nextKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const nextBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!nextKey) {
    await setProviderCredentials(STORE_KEY, { apiKey: '', baseUrl: '' });
    return getPixbotConfig();
  }
  await setProviderCredentials(STORE_KEY, {
    apiKey: nextKey,
    baseUrl: nextBase || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });
  if (model && typeof model === 'string' && model.trim()) {
    process.env.PIXCODE_PIXBOT_MODEL = model.trim();
  }
  return getPixbotConfig();
}

/**
 * GET /v1/models → normalized list for the UI.
 */
export async function fetchPixbotModels() {
  const creds = await getPixbotCredentials();
  if (!creds) {
    const err = new Error('PixBot API key / base URL not configured. Settings → PixBot LLM.');
    err.statusCode = 400;
    err.code = 'PIXBOT_NOT_CONFIGURED';
    throw err;
  }

  const url = `${creds.baseUrl}/models`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${creds.apiKey}`,
      accept: 'application/json',
      'user-agent': 'pixcode-pixbot',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Models fetch failed HTTP ${res.status}: ${body.slice(0, 200)}`);
    err.statusCode = res.status;
    throw err;
  }

  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
  const models = rows
    .map((row) => {
      const id = row?.id || row?.name || row?.model;
      if (!id || typeof id !== 'string') return null;
      return {
        id,
        label: id,
        ownedBy: row?.owned_by || row?.ownedBy || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    baseUrl: creds.baseUrl,
    models,
    count: models.length,
  };
}

/**
 * Chat completion via OpenAI-compatible API.
 * @param {{ messages: {role:string, content:string}[], model?: string, temperature?: number }} opts
 */
export async function pixbotChatCompletion({
  messages,
  model,
  temperature = 0.6,
  maxTokens = 4096,
} = {}) {
  const creds = await getPixbotCredentials();
  if (!creds) {
    const err = new Error('PixBot API key / base URL not configured.');
    err.statusCode = 400;
    err.code = 'PIXBOT_NOT_CONFIGURED';
    throw err;
  }

  let modelId = (model && String(model).trim()) || process.env.PIXCODE_PIXBOT_MODEL || null;
  if (!modelId) {
    // Pick first model from catalog if none chosen
    try {
      const catalog = await fetchPixbotModels();
      modelId = catalog.models[0]?.id || null;
    } catch {
      modelId = null;
    }
  }
  if (!modelId) {
    const err = new Error('No model selected and /v1/models returned empty. Pick a model in PixBot.');
    err.statusCode = 400;
    throw err;
  }

  const url = `${creds.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'pixcode-pixbot',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
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
  };
}

export function buildPixbotSystemPrompt({ projectId, projectPath } = {}) {
  return [
    'You are PixBot — the conversational coding assistant inside Pixcode.',
    'Reply in the same language the user writes.',
    'You are not a ticket queue. Be direct and helpful.',
    'You can plan code, explain files, and suggest shell/git steps.',
    projectId ? `Workspace project: ${projectId}` : 'Workspace: general',
    projectPath ? `Path: ${projectPath}` : '',
  ].filter(Boolean).join('\n');
}
