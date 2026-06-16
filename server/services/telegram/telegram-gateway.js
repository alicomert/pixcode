import crypto from 'node:crypto';

import { telegramLinksDb } from '../../database/db.js';

export const TELEGRAM_CONTROL_SCOPES = [
  'admin',
  'telegram:read',
  'telegram:write',
  'providers:read',
  'providers:write',
  'orchestration:read',
  'orchestration:write',
  'projects:read',
  'sessions:read',
  'webhooks:read',
];

export const TELEGRAM_PROVIDERS = ['claude', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'];

export const TELEGRAM_PROGRESS_MODES = ['final', 'steps', 'all', 'errors'];

const MAX_TELEGRAM_TEXT = 3600;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 10 * 60 * 1000;
const chatQueues = new Map();

export const TELEGRAM_AI_INTENT_ACTIONS = [
  'agent_prompt',
  'show_menu',
  'show_projects',
  'select_project',
  'show_provider_menu',
  'select_provider',
  'show_model_menu',
  'select_model',
  'show_runs',
  'show_approvals',
  'show_workflows',
  'run_workflow',
  'show_sessions',
  'new_chat',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function splitTelegramText(text, max = MAX_TELEGRAM_TEXT) {
  const value = String(text || '').trim();
  if (!value) return [''];
  if (value.length <= max) return [value];

  const chunks = [];
  let remaining = value;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < Math.floor(max * 0.55)) cut = remaining.lastIndexOf(' ', max);
    if (cut < Math.floor(max * 0.55)) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function normalizeTelegramToolResult(result = {}) {
  if (result?.ok === false) {
    return {
      ok: false,
      message: String(result.message || result.error || 'Action failed.'),
      data: result.data ?? null,
      requiresConfirmation: Boolean(result.requiresConfirmation),
    };
  }
  return {
    ok: true,
    message: String(result.message || 'OK'),
    data: result.data ?? result,
    requiresConfirmation: Boolean(result.requiresConfirmation),
  };
}

export function withTimeout(promiseFactory, timeoutMs = DEFAULT_ACTION_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Telegram action timed out after ${timeoutMs}ms`);
      error.code = 'TELEGRAM_ACTION_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(promiseFactory), timeout])
    .finally(() => clearTimeout(timeoutId));
}

function isRetryableError(error) {
  const status = error?.status || error?.statusCode || error?.response?.status || error?.response?.statusCode;
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  const message = String(error?.message || '');
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(message);
}

export async function retryWithBackoff(action, {
  retries = 2,
  baseDelayMs = 500,
  maxDelayMs = 4000,
  shouldRetry = isRetryableError,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function enqueueTelegramJob(chatId, job, { timeoutMs = DEFAULT_ACTION_TIMEOUT_MS } = {}) {
  const key = String(chatId);
  const previous = chatQueues.get(key) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => withTimeout(job, timeoutMs));
  let queued;
  queued = current.finally(() => {
    if (chatQueues.get(key) === queued) chatQueues.delete(key);
  }).catch(() => {});
  chatQueues.set(key, queued);
  return current;
}

export async function runTelegramTool({
  userId,
  action,
  execute,
  remoteControlRequired = true,
  timeoutMs = DEFAULT_ACTION_TIMEOUT_MS,
  retries = 1,
}) {
  const state = telegramLinksDb.getControlState(userId);
  if (remoteControlRequired && state.remoteControlEnabled === false) {
    return normalizeTelegramToolResult({
      ok: false,
      message: 'REMOTE_CONTROL_DISABLED',
      data: { action },
    });
  }

  const data = await retryWithBackoff(
    () => withTimeout(execute, timeoutMs),
    { retries },
  );
  return normalizeTelegramToolResult({ ok: true, message: 'OK', data });
}

export function createTelegramConfirmation(userId, action, payload = {}) {
  const pending = {
    id: crypto.randomBytes(8).toString('hex'),
    action,
    payload,
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
  };
  telegramLinksDb.updateControlState(userId, { pendingConfirmation: pending });
  return pending;
}

export function consumeTelegramConfirmation(userId, id) {
  const state = telegramLinksDb.getControlState(userId);
  const pending = state.pendingConfirmation;
  if (!pending || pending.id !== id) return { ok: false, reason: 'missing' };
  if (Date.parse(pending.expiresAt) <= Date.now()) {
    telegramLinksDb.updateControlState(userId, { pendingConfirmation: null });
    return { ok: false, reason: 'expired' };
  }
  telegramLinksDb.updateControlState(userId, { pendingConfirmation: null });
  return { ok: true, confirmation: pending };
}

export function clearTelegramConfirmation(userId, id = null) {
  const state = telegramLinksDb.getControlState(userId);
  if (id && state.pendingConfirmation?.id !== id) return false;
  telegramLinksDb.updateControlState(userId, { pendingConfirmation: null });
  return true;
}

export function resolveTelegramProvider(state = {}) {
  const provider = TELEGRAM_PROVIDERS.includes(state.routerProvider)
    ? state.routerProvider
    : state.selectedProvider;
  return TELEGRAM_PROVIDERS.includes(provider) ? provider : 'opencode';
}

export function resolveTelegramModel(state = {}) {
  return typeof state.routerModel === 'string' && state.routerModel.trim()
    ? state.routerModel.trim()
    : state.selectedModel;
}

export function buildTelegramAgentPrompt(prompt, state = {}) {
  const provider = resolveTelegramProvider(state);
  const model = resolveTelegramModel(state);
  const project = state.selectedProjectName || state.selectedProjectPath || 'not selected';
  return [
    'Source: Telegram.',
    `Selected project: ${project}.`,
    `Selected provider: ${provider}${model ? ` / ${model}` : ''}.`,
    'Return a Telegram-friendly final summary with status, relevant IDs, concise output, and any diff/test summary.',
    'Keep the final answer brief unless the user explicitly asks for detail.',
    '',
    'User request:',
    String(prompt || '').trim(),
  ].join('\n');
}

function readJsonObjectFromText(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(value.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function readOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeTelegramAiIntent(rawIntent, fallbackPrompt = '') {
  const intent = rawIntent && typeof rawIntent === 'object' && !Array.isArray(rawIntent)
    ? rawIntent
    : {};
  const action = TELEGRAM_AI_INTENT_ACTIONS.includes(intent.action)
    ? intent.action
    : 'agent_prompt';
  const confidence = readConfidence(intent.confidence);
  const safeAction = confidence >= 0.72 ? action : 'agent_prompt';
  const prompt = readOptionalString(intent.prompt) || String(fallbackPrompt || '').trim();

  return {
    action: safeAction,
    confidence,
    provider: TELEGRAM_PROVIDERS.includes(intent.provider) ? intent.provider : null,
    projectQuery: readOptionalString(intent.projectQuery),
    model: readOptionalString(intent.model),
    workflowInput: readOptionalString(intent.workflowInput) || prompt,
    prompt,
    reply: readOptionalString(intent.reply),
  };
}

export function parseTelegramAiIntentResponse(text, fallbackPrompt = '') {
  return normalizeTelegramAiIntent(readJsonObjectFromText(text), fallbackPrompt);
}

export function buildTelegramIntentPrompt(userText, state = {}, context = {}) {
  const provider = resolveTelegramProvider(state);
  const model = resolveTelegramModel(state);
  const project = state.selectedProjectName || state.selectedProjectPath || 'not selected';
  const projects = Array.isArray(context.projects) ? context.projects.slice(0, 12) : [];
  const workflows = Array.isArray(context.workflows) ? context.workflows.slice(0, 12) : [];

  return [
    'You are the Telegram intent router for Pixcode.',
    'Decide the user intent by meaning, not by matching keywords.',
    'Do not use or describe regex, substring rules, or word-trigger rules.',
    'If the message is casual, ambiguous, asks a broad project/status question, or could be a normal coding request, choose agent_prompt.',
    'Only choose a control action when the user clearly asks to open/change a Pixcode control surface.',
    'Return JSON only. Do not run tools. Do not inspect files. Do not add Markdown.',
    '',
    'Allowed JSON shape:',
    '{"action":"agent_prompt|show_menu|show_projects|select_project|show_provider_menu|select_provider|show_model_menu|select_model|show_runs|show_approvals|show_workflows|run_workflow|show_sessions|new_chat","confidence":0.0,"provider":null,"projectQuery":null,"model":null,"workflowInput":null,"prompt":null,"reply":null}',
    '',
    'Routing policy:',
    '- agent_prompt: default for normal chat, coding work, analysis, debugging, status questions about the repo/server, or unclear text.',
    '- select_provider: only when a provider is explicitly requested as the Telegram provider. provider must be one of the listed providers.',
    '- select_model: only when a concrete model id/name is explicitly requested. model must contain the model id/name.',
    '- select_project: only when a project choice is explicit. projectQuery should be the project name/path the user meant.',
    '- run_workflow: only when the user clearly wants the selected workflow/orchestration to run.',
    '- show_runs/show_approvals/show_workflows/show_projects/show_provider_menu/show_model_menu/show_sessions/show_menu/new_chat: only for clear UI/navigation requests.',
    '- If confidence is below 0.72, set action to agent_prompt.',
    '',
    `Current Telegram provider: ${provider}${model ? ` / ${model}` : ''}.`,
    `Current project: ${project}.`,
    `Available providers: ${TELEGRAM_PROVIDERS.join(', ')}.`,
    projects.length
      ? `Known projects: ${projects.map((item) => item.displayName || item.name || item.path).filter(Boolean).join(' | ')}.`
      : 'Known projects: none loaded.',
    workflows.length
      ? `Known workflows: ${workflows.map((item) => item.name || item.id).filter(Boolean).join(' | ')}.`
      : 'Known workflows: none loaded.',
    '',
    'User message:',
    String(userText || '').trim(),
  ].join('\n');
}
