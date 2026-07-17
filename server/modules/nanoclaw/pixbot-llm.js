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

/**
 * Lightweight project snapshot so PixBot can answer "projeyi tara", "ne var"
 * without spawning CLIs. Best-effort only.
 */
export async function buildProjectScanContext(projectPath) {
  if (!projectPath) return '';
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const entries = await fs.readdir(projectPath, { withFileTypes: true });
    const names = entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'dist-server')
      .slice(0, 40)
      .map((e) => `${e.isDirectory() ? 'dir' : 'file'}: ${e.name}`);

    let pkgHint = '';
    try {
      const pkgRaw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw);
      pkgHint = `package.json name=${pkg.name || '?'} scripts=${Object.keys(pkg.scripts || {}).slice(0, 12).join(', ')}`;
    } catch { /* no package.json */ }

    let readmeHint = '';
    try {
      const readme = await fs.readFile(path.join(projectPath, 'README.md'), 'utf8');
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
    '- You chat via an OpenAI-compatible HTTP API (no local tool runtime unless files were attached).',
    '- You cannot silently mutate the machine; give clear commands/steps for the user or Pixcode Shell.',
    '- For heavy multi-file edits, give a plan + patches; user applies via editor/CLI.',
    '',
    projectId ? `Workspace projectId: ${projectId}` : 'Workspace: general (no project bound).',
    projectPath ? `Workspace path: ${projectPath}` : '',
    scanContext || '',
  ].filter(Boolean).join('\n');
}
