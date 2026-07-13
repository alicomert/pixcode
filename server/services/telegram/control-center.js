import crypto from 'node:crypto';

import { apiKeysDb, telegramLinksDb } from '../../database/db.js';
import { getProjects } from '../../projects.js';
import { getStaticProviderModels } from '../model-registry.js';

import {
  TELEGRAM_CONTROL_SCOPES,
  TELEGRAM_PROVIDERS,
  buildTelegramAgentPrompt,
  buildTelegramIntentPrompt,
  clearTelegramConfirmation,
  consumeTelegramConfirmation,
  createTelegramConfirmation,
  enqueueTelegramJob,
  parseTelegramAiIntentResponse,
  resolveTelegramModel,
  resolveTelegramProvider,
  retryWithBackoff,
  runTelegramTool,
  splitTelegramText,
} from './telegram-gateway.js';
import { SUPPORTED_LANGUAGES, t } from './translations.js';

const PROVIDERS = TELEGRAM_PROVIDERS;
const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'canceled']);
const CALLBACK_TTL_MS = 10 * 60 * 1000;
const MAX_CALLBACK_ACTIONS = 1000;
const MAX_TELEGRAM_TEXT = 3600;
const MAX_ACTIVITY_OUTPUT_CHARS = 48_000;
const MAX_SSE_BUFFER_CHARS = 256_000;
const ACTIVITY_EDIT_THROTTLE_MS = 1200;
const ACTIVITY_HEARTBEAT_MS = 8000;
const INTENT_ROUTER_TIMEOUT_MS = 45_000;
const TERMINAL_BRIDGE_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_BRIDGE_POLL_MS = 1500;
const TERMINAL_BRIDGE_EDIT_THROTTLE_MS = 3500;
const TERMINAL_BRIDGE_SETTLE_MS = 6000;
const TERMINAL_BRIDGE_FINAL_OPEN = '<PIXCODE_TELEGRAM_FINAL>';
const TERMINAL_BRIDGE_FINAL_CLOSE = '</PIXCODE_TELEGRAM_FINAL>';
const callbackActions = new Map();
const runMonitors = new Map();
const activeLongTasks = new Map();
const terminalBridgeMonitors = new Map();

const MODEL_FALLBACKS = Object.fromEntries(
  PROVIDERS.map((provider) => [provider, getStaticProviderModels(provider)]),
);

const AUTH_HELP = {
  claude: '`claude login`',
  cursor: '`cursor-agent login`',
  codex: '`codex login`',
  gemini: '`gemini auth login`',
  qwen: '`qwen auth`',
  opencode: '`opencode auth login`',
};

const CONTROL_COMMANDS = new Set([
  '/menu',
  '/start',
  '/help',
  '/projects',
  '/provider',
  '/model',
  '/models',
  '/workflows',
  '/tasks',
  '/runs',
  '/approvals',
  '/controlroom',
  '/control-room',
  '/webhooks',
  '/sessions',
  '/newchat',
  '/settings',
  '/install',
  '/auth',
  '/control',
  '/progress',
  '/chat',
  '/workflow',
  '/orchestrate',
  '/cancel',
  '/terminal',
  '/detach',
  'menu',
]);

function compact(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function truncate(text, max = MAX_TELEGRAM_TEXT) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max - 20)}\n\n…truncated…` : value;
}

function appendBoundedText(current, chunk, maxChars = MAX_ACTIVITY_OUTPUT_CHARS) {
  const nextChunk = String(chunk || '');
  if (!nextChunk) return { text: current || '', truncated: false };
  const combined = `${current || ''}${nextChunk}`;
  if (combined.length <= maxChars) return { text: combined, truncated: false };
  return { text: combined.slice(-maxChars), truncated: true };
}

function languageFor(link) {
  return SUPPORTED_LANGUAGES.includes(link?.language) ? link.language : 'en';
}

function normalizeCommandToken(commandRaw = '') {
  return String(commandRaw || '')
    .trim()
    .toLowerCase()
    .replace(/@[^@\s]+$/, '');
}

export function getTelegramControlCommand(text = '') {
  const [commandRaw = ''] = String(text || '').trim().split(/\s+/);
  const command = normalizeCommandToken(commandRaw);
  return CONTROL_COMMANDS.has(command) ? command : null;
}

export function isTelegramControlCommand(text = '') {
  return Boolean(getTelegramControlCommand(text));
}

function getState(userId) {
  return telegramLinksDb.getControlState(userId);
}

export function updateTelegramControlState(userId, patch) {
  return telegramLinksDb.updateControlState(userId, patch);
}

function pruneCallbackActions() {
  const now = Date.now();
  for (const [id, entry] of callbackActions.entries()) {
    if (entry.expiresAt < now) {
      callbackActions.delete(id);
    }
  }

  while (callbackActions.size > MAX_CALLBACK_ACTIONS) {
    const oldestId = callbackActions.keys().next().value;
    if (!oldestId) break;
    callbackActions.delete(oldestId);
  }
}

function registerAction(action, payload = {}) {
  pruneCallbackActions();
  const id = crypto.randomBytes(8).toString('hex');
  callbackActions.set(id, {
    action,
    payload,
    expiresAt: Date.now() + CALLBACK_TTL_MS,
  });
  return `tc:${id}`;
}

function readAction(data) {
  if (typeof data !== 'string' || !data.startsWith('tc:')) return null;
  const id = data.slice(3);
  const entry = callbackActions.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    callbackActions.delete(id);
    return null;
  }
  return { id, ...entry };
}

function forgetAction(id) {
  if (id) callbackActions.delete(id);
}

function button(text, action, payload = {}) {
  return { text, callback_data: registerAction(action, payload) };
}

function rows(buttons, width = 2) {
  const out = [];
  for (let i = 0; i < buttons.length; i += width) out.push(buttons.slice(i, i + width));
  return out;
}

async function send(bot, chatId, text, options = {}) {
  const { editMessageId, ...telegramOptions } = options;
  const extra = {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...telegramOptions,
  };
  const chunks = splitTelegramText(text, MAX_TELEGRAM_TEXT);
  const [firstChunk = ''] = chunks;
  let startIndex = 0;
  if (editMessageId && typeof bot.editMessageText === 'function') {
    try {
      const edited = await bot.editMessageText(firstChunk, {
        chat_id: chatId,
        message_id: editMessageId,
        ...extra,
      });
      startIndex = 1;
      for (const chunk of chunks.slice(startIndex)) {
        await send(bot, chatId, chunk, telegramOptions);
      }
      return edited;
    } catch (err) {
      const description = err?.response?.body?.description || err?.message || '';
      if (/message is not modified/i.test(description)) {
        startIndex = 1;
        for (const chunk of chunks.slice(startIndex)) {
          await send(bot, chatId, chunk, telegramOptions);
        }
        return null;
      }
      console.warn('[telegram-control] editMessageText failed:', description || err);
    }
  }
  let result = null;
  for (const chunk of chunks.slice(startIndex)) {
    try {
      result = await bot.sendMessage(chatId, chunk, extra);
    } catch {
      const fallback = { ...extra };
      delete fallback.parse_mode;
      result = await bot.sendMessage(chatId, chunk, fallback);
    }
  }
  return result;
}

function localApiBase() {
  const port = process.env.SERVER_PORT || process.env.PORT || '3001';
  return `http://127.0.0.1:${port}`;
}

function getOrCreateTelegramApiKey(userId) {
  const existing = apiKeysDb
    .getApiKeys(userId)
    .find((key) => key.key_name === 'Telegram Control' && Boolean(key.is_active));
  if (existing?.api_key) {
    const existingScopes = apiKeysDb.normalizeScopes(existing.scopes || []);
    const nextScopes = apiKeysDb.normalizeScopes([...existingScopes, ...TELEGRAM_CONTROL_SCOPES]);
    const hasAllScopes = TELEGRAM_CONTROL_SCOPES.every((scope) => existingScopes.includes(scope));
    if (!hasAllScopes || nextScopes.length !== existingScopes.length) {
      apiKeysDb.updateApiKeyScopes(userId, existing.id, nextScopes);
    }
    return existing.api_key;
  }
  return apiKeysDb.createApiKey(userId, 'Telegram Control', TELEGRAM_CONTROL_SCOPES).apiKey;
}

async function localApi(userId, path, { method = 'GET', body, timeoutMs = 0 } = {}) {
  const apiKey = getOrCreateTelegramApiKey(userId);
  const response = await retryWithBackoff(async () => {
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error(`HTTP request timed out after ${timeoutMs}ms`)), timeoutMs)
      : null;
    const res = await fetch(`${localApiBase()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      signal: controller?.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    if ([408, 429, 500, 502, 503, 504].includes(res.status)) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return res;
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
  }
  return data?.data ?? data;
}

async function localAgentStream(userId, body, onEvent) {
  const apiKey = getOrCreateTelegramApiKey(userId);
  const response = await fetch(`${localApiBase()}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      ...body,
      stream: true,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeBlock = async (block) => {
    const lines = String(block || '').split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      await onEvent?.(event);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > MAX_SSE_BUFFER_CHARS) {
      buffer = buffer.slice(-MAX_SSE_BUFFER_CHARS);
    }
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await consumeBlock(block);
      boundary = buffer.indexOf('\n\n');
    }
  }

  const rest = `${buffer}${decoder.decode()}`;
  if (rest.trim()) await consumeBlock(rest);
}

function checked(label) {
  return `${label} ✓`;
}

function formatElapsed(startedAt) {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function projectLabel(state) {
  return state.selectedProjectName || state.selectedProjectPath || '-';
}

function createActivityState({ lang, type = 'agent', provider, project, prompt, mode = 'final' }) {
  return {
    lang,
    type,
    status: 'starting',
    phase: t(lang, 'control.activity.starting'),
    provider,
    project,
    prompt: compact(prompt, 120),
    mode,
    startedAt: Date.now(),
    lastEditAt: 0,
    messageId: null,
    sessionId: null,
    runId: null,
    workflowId: null,
    events: [],
    output: '',
    outputTruncated: false,
    error: null,
  };
}

function pushActivityEvent(activity, text) {
  const value = String(text || '').trim();
  if (!value) return;
  if (activity.events.at(-1) === value) return;
  activity.events.push(value);
  if (activity.events.length > 8) activity.events.splice(0, activity.events.length - 8);
}

function activityTitle(activity) {
  if (activity.type === 'workflow') return t(activity.lang, 'control.activity.workflowTitle');
  if (activity.type === 'router') return t(activity.lang, 'control.activity.routerTitle');
  return t(activity.lang, 'control.activity.agentTitle');
}

function trimTelegramOutput(text, max, suffix = '') {
  const value = String(text || '').trim();
  const ending = String(suffix || '').trim();
  if (value.length <= max) return value;
  const room = Math.max(300, max - ending.length - 4);
  return `${value.slice(0, room).trim()}\n\n${ending}`;
}

function appendActivityOutput(activity, chunk) {
  if (!activity) return;
  const next = appendBoundedText(activity.output, chunk);
  activity.output = next.text;
  activity.outputTruncated = Boolean(activity.outputTruncated || next.truncated);
}

function renderActivity(activity, { finalText = null } = {}) {
  const output = finalText || activity.output;
  if (activity.type === 'agent' && output && !activity.error) {
    if (activity.status === 'done') {
      return trimTelegramOutput(
        output,
        3400,
        activity.outputTruncated
          ? t(activity.lang, 'control.activity.outputHistoryTrimmed')
          : t(activity.lang, 'control.activity.outputTooLong'),
      );
    }

    const footer = `⏳ ${t(activity.lang, 'control.activity.liveFooter', { elapsed: formatElapsed(activity.startedAt) })}`;
    const body = trimTelegramOutput(
      output,
      3200,
      t(activity.lang, 'control.activity.outputShortened'),
    );
    return truncate(`${body}\n\n${footer}`, 3400);
  }

  const lines = [
    `${activity.status === 'failed' ? '❌' : activity.status === 'done' ? '✅' : activity.status === 'running' ? '🔧' : '⏳'} ${activityTitle(activity)}`,
    '',
    `🤖 ${t(activity.lang, 'control.activity.provider')}: ${activity.provider || '-'}`,
    `📁 ${t(activity.lang, 'control.activity.project')}: ${compact(activity.project, 90)}`,
  ];

  if (activity.sessionId) lines.push(`🧵 ${t(activity.lang, 'control.activity.session')}: ${activity.sessionId}`);
  if (activity.runId) lines.push(`🧭 ${t(activity.lang, 'control.activity.run')}: ${activity.runId}`);
  if (activity.workflowId) lines.push(`🧩 ${t(activity.lang, 'control.activity.workflow')}: ${activity.workflowId}`);
  lines.push(`⏱ ${t(activity.lang, 'control.activity.elapsed')}: ${formatElapsed(activity.startedAt)}`);
  lines.push(`📌 ${t(activity.lang, 'control.activity.status')}: ${activity.phase}`);

  const visibleEvents = activity.mode === 'final'
    ? activity.events.slice(-4)
    : activity.events;
  if (visibleEvents.length > 0) {
    lines.push('', `🛠 ${t(activity.lang, 'control.activity.work')}:`);
    for (const event of visibleEvents) lines.push(`• ${event}`);
  }

  if (activity.error) {
    lines.push('', `⚠️ ${truncate(activity.error, 700)}`);
  } else if (output) {
    lines.push('', `💬 ${t(activity.lang, 'control.activity.output')}:`);
    lines.push(truncate(output, 1800));
  } else if (activity.prompt) {
    lines.push('', `📝 ${compact(activity.prompt, 220)}`);
  }

  return truncate(lines.join('\n'), 3400);
}

async function createTelegramActivity({ bot, chatId, link, type = 'agent', prompt = '', phase = null }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const activity = createActivityState({
    lang,
    type,
    provider: resolveTelegramProvider(state),
    project: projectLabel(state),
    prompt,
    mode: state.progressMode,
  });
  if (phase) activity.phase = phase;
  const sent = await send(bot, chatId, renderActivity(activity), { parse_mode: undefined });
  activity.messageId = sent?.message_id || sent?.message?.message_id || null;
  activity.lastEditAt = Date.now();
  return activity;
}

async function editTelegramActivity({ bot, chatId, activity, force = false, reply_markup }) {
  if (!activity) return null;
  const now = Date.now();
  if (!force && now - activity.lastEditAt < ACTIVITY_EDIT_THROTTLE_MS) return null;
  const sent = await send(bot, chatId, renderActivity(activity), {
    editMessageId: activity.messageId,
    parse_mode: undefined,
    reply_markup,
  });
  activity.messageId = sent?.message_id || sent?.message?.message_id || activity.messageId;
  activity.lastEditAt = now;
  return sent;
}

function startActivityHeartbeat({ bot, chatId, activity }) {
  return setInterval(() => {
    if (!activity || activity.status === 'done' || activity.status === 'failed') return;
    if (activity.status === 'starting') {
      activity.status = 'running';
      activity.phase = t(activity.lang, 'control.activity.thinking');
    }
    editTelegramActivity({ bot, chatId, activity }).catch((error) => {
      console.warn('[telegram-control] activity heartbeat failed:', error?.message || error);
    });
  }, ACTIVITY_HEARTBEAT_MS);
}

function stateSummary(lang, state) {
  const lines = [
    `${t(lang, 'control.summary.project')}: ${state.selectedProjectName || t(lang, 'control.notSelected')}`,
    `${t(lang, 'control.summary.provider')}: ${state.selectedProvider}${state.selectedModel ? ` / ${state.selectedModel}` : ''}`,
    `${t(lang, 'control.summary.workflow')}: ${state.selectedWorkflowId || t(lang, 'control.notSelected')}`,
    `${t(lang, 'control.summary.progress')}: ${state.progressMode}`,
  ];
  if (state.activeTerminal) {
    lines.push(`${t(lang, 'control.summary.terminal')}: ${state.activeTerminal.provider} / ${state.activeTerminal.projectLabel || state.activeTerminal.projectName || compact(state.activeTerminal.projectPath, 50)}`);
  }
  return lines.join('\n');
}

function terminalControlKeyboard(lang) {
  return [
    [button(t(lang, 'control.button.terminalRefresh'), 'terminal_status'), button(t(lang, 'control.button.detachTerminal'), 'detach_terminal')],
    [button(t(lang, 'control.button.mainMenu'), 'menu')],
  ];
}

function mainMenuKeyboard(lang, state = null) {
  const keyboard = [
    [button(t(lang, 'control.button.projects'), 'projects'), button(t(lang, 'control.button.provider'), 'providers')],
    [button(t(lang, 'control.button.models'), 'models'), button(t(lang, 'control.button.workflows'), 'workflows')],
    [button(t(lang, 'control.button.runs'), 'runs'), button(t(lang, 'control.button.approvals'), 'approvals')],
    [button(t(lang, 'control.button.controlRoom'), 'control_room'), button(t(lang, 'control.button.webhooks'), 'webhooks')],
    [button(t(lang, 'control.button.sessions'), 'sessions'), button(t(lang, 'control.button.newChat'), 'new_chat')],
    [button(t(lang, 'control.button.install'), 'install_menu'), button(t(lang, 'control.button.auth'), 'auth_menu')],
    [button(t(lang, 'control.button.settings'), 'settings')],
  ];
  if (state?.activeTerminal) {
    keyboard.splice(1, 0, [button(t(lang, 'control.button.terminal'), 'terminal_status'), button(t(lang, 'control.button.detachTerminal'), 'detach_terminal')]);
  }
  return keyboard;
}

export async function showMainMenu({ bot, chatId, link, editMessageId, notice }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const prefix = notice ? `${notice}\n\n` : '';
  await send(bot, chatId, `${prefix}${t(lang, 'control.menu')}\n\n${stateSummary(lang, state)}`, {
    editMessageId,
    reply_markup: { inline_keyboard: mainMenuKeyboard(lang, state) },
  });
}

async function showHelp({ bot, chatId, link }) {
  const lang = languageFor(link);
  await send(bot, chatId, t(lang, 'control.help'));
}

async function showCommandPalette({ bot, chatId, link, editMessageId, unknown = false }) {
  const lang = languageFor(link);
  const prefix = unknown ? `${t(lang, 'control.unknownCommand')}\n\n` : '';
  await send(bot, chatId, `${prefix}${t(lang, 'control.help')}\n\n${t(lang, 'control.examples')}`, {
    editMessageId,
    reply_markup: { inline_keyboard: mainMenuKeyboard(lang, getState(link.user_id)) },
  });
}

function getActiveTerminal(state) {
  const terminal = state?.activeTerminal;
  if (
    !terminal ||
    !PROVIDERS.includes(terminal.provider) ||
    typeof terminal.projectPath !== 'string' ||
    !terminal.projectPath.trim()
  ) {
    return null;
  }
  return terminal;
}

function terminalProjectLabel(terminal) {
  return terminal?.projectLabel || terminal?.projectName || terminal?.projectPath || '-';
}

function terminalOutputUrl(terminal, maxChars = 3200, sinceCursor = null) {
  const params = new URLSearchParams({
    provider: terminal.provider,
    projectPath: terminal.projectPath,
    maxChars: String(maxChars),
  });
  if (terminal.tabId) params.set('tabId', terminal.tabId);
  if (terminal.sessionId) params.set('sessionId', terminal.sessionId);
  if (Number.isFinite(sinceCursor)) params.set('sinceCursor', String(sinceCursor));
  return `/api/shell/sessions/provider-output?${params.toString()}`;
}

function renderTerminalSnapshot(lang, terminal, data, { prefix = '', includeOutput = false } = {}) {
  const active = data?.active !== false;
  const lifecycle = data?.terminalState || data?.lifecycleState || (active ? 'running' : 'not running');
  const output = String(data?.output || '').trim();
  const lines = [
    prefix || t(lang, active ? 'control.terminalAttached' : 'control.terminalNotRunning'),
    '',
    `🤖 ${t(lang, 'control.activity.provider')}: ${terminal.provider}`,
    `📁 ${t(lang, 'control.activity.project')}: ${compact(terminalProjectLabel(terminal), 90)}`,
    `📌 ${t(lang, 'control.activity.status')}: ${lifecycle}`,
  ];
  if (terminal.sessionId || data?.sessionId) {
    lines.push(`🧵 ${t(lang, 'control.activity.session')}: ${terminal.sessionId || data.sessionId}`);
  }
  if (includeOutput && output) {
    lines.push('', `💬 ${t(lang, 'control.activity.output')}:`);
    lines.push(truncate(output, 2400));
  } else {
    lines.push('', t(lang, 'control.terminalOutputHidden'));
  }
  return truncate(lines.join('\n'), 3400);
}

function terminalBridgeMonitorKey(chatId, terminal) {
  return [
    chatId,
    terminal.provider,
    terminal.projectPath,
    terminal.tabId || '-',
    terminal.sessionId || '-',
  ].join(':');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function terminalBridgeInput(text, lang) {
  const prompt = String(text || '').trim();
  const instruction = lang === 'tr'
    ? `Pixcode Telegram senkronu: Yanıtının sonunda Telegram için okunabilir ve eksiksiz final cevabını ${TERMINAL_BRIDGE_FINAL_OPEN} ve ${TERMINAL_BRIDGE_FINAL_CLOSE} etiketleri arasına yaz. Etiketlerin içine spinner, terminal ekranı veya tekrar eden durum satırı koyma.`
    : `Pixcode Telegram sync: At the end of your response, write the readable complete final answer for Telegram between ${TERMINAL_BRIDGE_FINAL_OPEN} and ${TERMINAL_BRIDGE_FINAL_CLOSE}. Do not put spinners, terminal screen text, or repeated status lines inside the tags.`;
  return `${prompt}\n\n${instruction}`;
}

function normalizeBridgeLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function terminalBridgeLabels(terminal) {
  const labels = new Set();
  for (const value of [
    terminal?.provider,
    terminal?.projectName,
    terminal?.projectLabel,
    terminal?.projectPath,
  ]) {
    const normalized = normalizeBridgeLine(value);
    if (!normalized) continue;
    labels.add(normalized);
    const pathParts = normalized.split(/[\\/]/u).filter(Boolean);
    const basename = pathParts.at(-1);
    if (basename) labels.add(basename);
  }
  return [...labels]
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);
}

function stripTerminalBridgeFragments(value, terminal) {
  let text = String(value || '');
  text = text.replace(/\[[0-?]{1,32}[ -/]*[@-~]/gu, ' ');
  text = text.replace(/\b\d{1,3}(?:;\d{1,3}){1,8}[A-Za-z]/gu, ' ');
  text = text.replace(/\b[012];[^\n\r]{0,100}[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳][^\n\r]{0,100}/gu, ' ');

  for (const label of terminalBridgeLabels(terminal)) {
    const labelPattern = escapeRegExp(label).replace(/\s+/gu, '\\s+');
    const titlePattern = new RegExp(
      String.raw`\b(?:\d+[a-z])?[012];[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳•*·\s-]*${labelPattern}(?:\d+;?)?`,
      'giu',
    );
    text = text.replace(titlePattern, ' ');
  }

  return text
    .replace(/[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳]+/gu, ' ')
    .replace(/\b(?:Working|Determining|Thinking|Running)(?:\s*•\s*(?:Working|Determining|Thinking|Running))+\b/giu, ' ');
}

function extractTerminalBridgeFinalBlock(text) {
  const blocks = [];
  const blockPattern = /(?:<|\[)\s*PIXCODE_TELEGRAM_FINAL\s*(?:>|\])([\s\S]*?)(?:<|\[)\s*\/\s*PIXCODE_TELEGRAM_FINAL\s*(?:>|\])/giu;
  for (const match of text.matchAll(blockPattern)) {
    const block = String(match[1] || '').trim();
    if (block) blocks.push(block);
  }
  if (blocks.length > 0) return blocks.at(-1);

  const openPattern = /(?:<|\[)\s*PIXCODE_TELEGRAM_FINAL\s*(?:>|\])/giu;
  let lastOpen = null;
  for (const match of text.matchAll(openPattern)) lastOpen = match;
  if (!lastOpen) return '';
  return text.slice((lastOpen.index || 0) + lastOpen[0].length).trim();
}

function isNoisyTerminalBridgeLine(line, prompt, terminal) {
  const normalized = normalizeBridgeLine(line);
  if (!normalized || normalized.length <= 1) return true;
  if (/PIXCODE_TELEGRAM_FINAL/iu.test(normalized)) return true;
  if (/Pixcode Telegram (?:sync|senkronu)/iu.test(normalized)) return true;
  if (/^[╭╮╰╯│─═┌┐└┘├┤┬┴┼\s]+$/u.test(normalized)) return true;
  if (/^[●✶✻✽✢✳⠂⠐⏵·\s0;:()\-|/\\]+$/u.test(normalized)) return true;
  if (/^\[[0-?]{1,32}[ -/]*[@-~]/u.test(normalized)) return true;
  if (/^(?:\d+[a-z])?[012];/iu.test(normalized) && /[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳]/u.test(normalized)) return true;
  if ((normalized.match(/[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳]/gu) || []).length >= 2) return true;

  const lower = normalized.toLowerCase();
  const promptNeedle = normalizeBridgeLine(prompt).toLowerCase();
  if (promptNeedle && lower.includes(promptNeedle.slice(0, 120))) return true;
  if (/^[›❯>]\s*/u.test(normalized)) return true;
  if (lower.includes('welcome back')) return true;
  if (lower.includes('api usage billing')) return true;
  if (lower.includes('bypass permissions')) return true;
  if (lower.includes('try "')) return true;
  if (lower.includes('esc to interrupt') || lower.includes('press esc')) return true;
  if (lower.includes('/effort')) return true;
  if (lower.includes('determining')) return true;
  if (/^(?:claude code|codex)\b/i.test(normalized) && normalized.length < 80) return true;
  if (/^\(?\d+s\s*·\s*[↓↑]?\d*\s*tokens?\)?$/iu.test(normalized)) return true;
  for (const label of terminalBridgeLabels(terminal)) {
    if (
      lower.includes(label.toLowerCase())
      && /(?:^[012];|[⠂⠐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✶✻✽✢✳]|working|determining)/iu.test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

export function cleanTerminalBridgeOutput(output, prompt, terminal = null) {
  const text = stripTerminalBridgeFragments(String(output || ''), terminal)
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .replace(/\u00a0/g, ' ');
  const finalBlock = extractTerminalBridgeFinalBlock(text);
  const source = finalBlock || text;
  const lines = source
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => !isNoisyTerminalBridgeLine(line, prompt, terminal));
  const deduped = [];
  for (const line of lines) {
    if (deduped.at(-1) === line) continue;
    deduped.push(line);
  }
  return deduped.join('\n').trim();
}

function renderTerminalBridgeProgress(lang, terminal, {
  output = '',
  statusKey = 'control.terminalWaiting',
  startedAt = Date.now(),
  final = false,
  terminalState = null,
} = {}) {
  const lines = [
    `${final ? '✅' : '⏳'} ${t(lang, statusKey)}`,
    '',
    `🤖 ${t(lang, 'control.activity.provider')}: ${terminal.provider}`,
    `📁 ${t(lang, 'control.activity.project')}: ${compact(terminalProjectLabel(terminal), 90)}`,
  ];
  if (terminal.sessionId) {
    lines.push(`🧵 ${t(lang, 'control.activity.session')}: ${terminal.sessionId}`);
  }
  if (terminalState && terminalState !== 'unknown') {
    lines.push(`📌 ${t(lang, 'control.activity.status')}: ${terminalState}`);
  }
  if (output) {
    lines.push('', `💬 ${t(lang, 'control.activity.output')}:`);
    lines.push(truncate(output, final ? 3100 : 2200));
  } else {
    lines.push('', t(lang, 'control.terminalWaitingHint'));
  }
  if (!final) {
    lines.push('', `⏱ ${t(lang, 'control.activity.elapsed')}: ${formatElapsed(startedAt)}`);
  }
  return truncate(lines.join('\n'), 3400);
}

async function monitorTerminalBridgeResponse({
  bot,
  chatId,
  link,
  terminal,
  prompt,
  sinceCursor,
  editMessageId,
  monitorKey,
  monitorToken,
}) {
  const lang = languageFor(link);
  const startedAt = Date.now();
  let lastCleanOutput = '';
  let lastOutputChangeAt = startedAt;
  let lastEditAt = 0;

  const isCurrent = () => terminalBridgeMonitors.get(monitorKey) === monitorToken;

  try {
    while (isCurrent() && Date.now() - startedAt < TERMINAL_BRIDGE_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, TERMINAL_BRIDGE_POLL_MS));
      if (!isCurrent()) return;

      const data = await localApi(
        link.user_id,
        terminalOutputUrl(terminal, 12000, sinceCursor),
        { timeoutMs: 12_000 },
      );
      if (data?.active === false) {
        await send(bot, chatId, renderTerminalBridgeProgress(lang, terminal, {
          output: lastCleanOutput,
          statusKey: 'control.terminalNotRunning',
          startedAt,
          final: true,
          terminalState: 'not running',
        }), {
          editMessageId,
          parse_mode: undefined,
          reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
        });
        return;
      }
      const cleanOutput = cleanTerminalBridgeOutput(data?.output, prompt, terminal);
      const terminalState = data?.terminalState || data?.lifecycleState || 'unknown';
      const now = Date.now();

      if (cleanOutput && cleanOutput !== lastCleanOutput) {
        lastCleanOutput = cleanOutput;
        lastOutputChangeAt = now;
      }

      const finishedByState = ['idle', 'completed', 'failed', 'exited'].includes(terminalState);
      const finishedByQuietOutput = Boolean(lastCleanOutput) && now - lastOutputChangeAt >= TERMINAL_BRIDGE_SETTLE_MS;
      const shouldFinish = Boolean(lastCleanOutput) && (finishedByState || finishedByQuietOutput);

      if (shouldFinish) {
        await send(bot, chatId, renderTerminalBridgeProgress(lang, terminal, {
          output: lastCleanOutput,
          statusKey: 'control.terminalResponseReady',
          startedAt,
          final: true,
          terminalState,
        }), {
          editMessageId,
          parse_mode: undefined,
          reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
        });
        return;
      }

      if (now - lastEditAt >= TERMINAL_BRIDGE_EDIT_THROTTLE_MS) {
        lastEditAt = now;
        await send(bot, chatId, renderTerminalBridgeProgress(lang, terminal, {
          output: lastCleanOutput,
          statusKey: lastCleanOutput ? 'control.terminalResponding' : 'control.terminalWaiting',
          startedAt,
          terminalState,
        }), {
          editMessageId,
          parse_mode: undefined,
          reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
        });
      }
    }

    if (!isCurrent()) return;
    await send(bot, chatId, renderTerminalBridgeProgress(lang, terminal, {
      output: lastCleanOutput,
      statusKey: lastCleanOutput ? 'control.terminalStillRunning' : 'control.terminalNoReadableOutput',
      startedAt,
      final: Boolean(lastCleanOutput),
      terminalState: 'running',
    }), {
      editMessageId,
      parse_mode: undefined,
      reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
    });
  } finally {
    if (isCurrent()) terminalBridgeMonitors.delete(monitorKey);
  }
}

export async function sendActiveTerminalAttachedNotice({ bot, chatId, link, terminal }) {
  const lang = languageFor(link);
  const lines = [
    t(lang, 'control.terminalAttached'),
    '',
    `🤖 ${t(lang, 'control.activity.provider')}: ${terminal.provider}`,
    `📁 ${t(lang, 'control.activity.project')}: ${compact(terminalProjectLabel(terminal), 90)}`,
    `📌 ${t(lang, 'control.activity.status')}: ${t(lang, 'control.terminalReadyStatus')}`,
  ];
  if (terminal.sessionId) {
    lines.push(`🧵 ${t(lang, 'control.activity.session')}: ${terminal.sessionId}`);
  }
  lines.push('', t(lang, 'control.terminalReadyPrompt'));
  await send(bot, chatId, truncate(lines.join('\n'), 3400), {
    parse_mode: undefined,
    reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
  });
}

async function showActiveTerminalStatus({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const terminal = getActiveTerminal(state);
  if (!terminal) {
    await send(bot, chatId, t(lang, 'control.noActiveTerminal'), {
      editMessageId,
      reply_markup: { inline_keyboard: [[button(t(lang, 'control.button.mainMenu'), 'menu')]] },
    });
    return;
  }
  try {
    const data = await localApi(link.user_id, terminalOutputUrl(terminal), { timeoutMs: 12_000 });
    await send(bot, chatId, renderTerminalSnapshot(lang, terminal, data), {
      editMessageId,
      parse_mode: undefined,
      reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
    });
  } catch (error) {
    await send(bot, chatId, t(lang, 'control.terminalStatusFailed', { error: error?.message || String(error) }), {
      editMessageId,
      reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
    });
  }
}

async function detachActiveTerminal({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  updateTelegramControlState(link.user_id, { activeTerminal: null });
  await send(bot, chatId, t(lang, 'control.terminalDetached'), {
    editMessageId,
    reply_markup: { inline_keyboard: [[button(t(lang, 'control.button.mainMenu'), 'menu')]] },
  });
}

async function sendToActiveTerminal({ bot, chatId, link, text }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const terminal = getActiveTerminal(state);
  if (!terminal) return false;
  if (state.remoteControlEnabled === false) {
    await send(bot, chatId, t(lang, 'control.disabled'));
    return true;
  }

  const sent = await send(bot, chatId, t(lang, 'control.terminalSending', {
    provider: terminal.provider,
    project: terminalProjectLabel(terminal),
  }), {
    parse_mode: undefined,
    reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
  });
  const editMessageId = sent?.message_id || sent?.message?.message_id || null;

  try {
    const terminalPrompt = terminalBridgeInput(text, lang);
    const inputResult = await localApi(link.user_id, '/api/shell/sessions/provider-input', {
      method: 'POST',
      timeoutMs: 15_000,
      body: {
        provider: terminal.provider,
        projectPath: terminal.projectPath,
        tabId: terminal.tabId,
        sessionId: terminal.sessionId,
        input: terminalPrompt,
        submit: true,
        submitMode: 'deferred-enter',
      },
    });
    const sinceCursor = Number.isFinite(inputResult?.outputCursorBefore)
      ? inputResult.outputCursorBefore
      : null;
    const monitorKey = terminalBridgeMonitorKey(chatId, terminal);
    const monitorToken = crypto.randomUUID();
    terminalBridgeMonitors.set(monitorKey, monitorToken);

    await send(bot, chatId, renderTerminalBridgeProgress(lang, terminal, {
      statusKey: 'control.terminalWaiting',
      startedAt: Date.now(),
      terminalState: 'running',
    }), {
      editMessageId,
      parse_mode: undefined,
      reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
    });
    monitorTerminalBridgeResponse({
      bot,
      chatId,
      link,
      terminal,
      prompt: terminalPrompt,
      sinceCursor,
      editMessageId,
      monitorKey,
      monitorToken,
    }).catch((error) => {
      console.warn('[telegram-control] terminal bridge monitor failed:', error?.message || error);
    });
  } catch (error) {
    await send(bot, chatId, t(lang, 'control.terminalSendFailed', {
      error: error?.message || String(error),
    }), {
      editMessageId,
      reply_markup: { inline_keyboard: terminalControlKeyboard(lang) },
    });
  }
  return true;
}

async function listProjects() {
  const projects = await getProjects();
  return projects.slice(0, 20);
}

async function showProjectMenu({ bot, chatId, link, editMessageId, notice }) {
  const lang = languageFor(link);
  const projects = await listProjects();
  if (projects.length === 0) {
    const prefix = notice ? `${notice}\n\n` : '';
    await send(bot, chatId, `${prefix}${t(lang, 'control.noProjects')}`, { editMessageId });
    return;
  }

  const buttons = projects.map((project, index) => button(
    `${index + 1}. ${compact(project.displayName || project.name, 34)}`,
    'project_select',
    {
      name: project.name,
      path: project.fullPath || project.path,
      displayName: project.displayName || project.name,
    },
  ));
  const prefix = notice ? `${notice}\n\n` : '';
  await send(bot, chatId, `${prefix}${t(lang, 'control.pickProject')}`, {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 1) },
  });
}

export async function showProviderMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const buttons = PROVIDERS.map((provider) => button(
    provider === state.selectedProvider ? checked(provider) : provider,
    'provider_select',
    { provider },
  ));
  await send(bot, chatId, t(lang, 'control.pickProvider'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 2) },
  });
}

async function readProviderModels(userId, provider, refresh = false) {
  try {
    const data = await localApi(userId, `/api/providers/${provider}/models${refresh ? '?refresh=1' : ''}`);
    const models = Array.isArray(data?.models) ? data.models : [];
    return models.length > 0 ? models : MODEL_FALLBACKS[provider] || [];
  } catch {
    return MODEL_FALLBACKS[provider] || [];
  }
}

export async function showModelMenu({ bot, chatId, link, refresh = false, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const models = await readProviderModels(link.user_id, state.selectedProvider, refresh);
  const modelButtons = models.slice(0, 18).map((model) => {
    const value = model.value || model.id || model.label;
    const label = compact(model.label || value, 38);
    return button(value === state.selectedModel ? checked(label) : label, 'model_select', { model: value });
  });
  modelButtons.push(button(t(lang, 'control.button.refreshModels'), 'models_refresh'));
  modelButtons.push(button(t(lang, 'control.button.clearModel'), 'model_select', { model: null }));
  await send(bot, chatId, t(lang, 'control.modelsFor', { provider: state.selectedProvider }), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(modelButtons, 1) },
  });
}

export async function showWorkflowMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const workflows = await localApi(link.user_id, '/api/tasks');
  const list = Array.isArray(workflows?.workflows) ? workflows.workflows : [];
  const state = getState(link.user_id);
  const workflowButtons = list.map((workflow) => button(
    workflow.id === state.selectedWorkflowId ? checked(compact(workflow.name || workflow.id, 34)) : compact(workflow.name || workflow.id, 34),
    'workflow_select',
    { workflowId: workflow.id, name: workflow.name || workflow.id },
  ));
  workflowButtons.push(button(t(lang, 'control.button.runWorkflow'), 'workflow_prompt'));
  await send(bot, chatId, t(lang, 'control.pickWorkflow'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(workflowButtons, 1) },
  });
}

async function showRuns({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const data = await localApi(link.user_id, '/api/tasks/runs?limit=10');
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  if (runs.length === 0) {
    await send(bot, chatId, t(lang, 'control.noRuns'), { editMessageId });
    return;
  }
  const buttons = runs.map((run) => button(
    `${run.status} ${compact(run.workflowId || run.id, 28)}`,
    'run_detail',
    { runId: run.id },
  ));
  await send(bot, chatId, t(lang, 'control.recentRuns'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 1) },
  });
}

async function showApprovalQueue({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const data = await localApi(link.user_id, '/api/tasks/approvals');
  const approvals = Array.isArray(data?.pendingApprovals) ? data.pendingApprovals : [];
  if (approvals.length === 0) {
    await send(bot, chatId, t(lang, 'control.noApprovals'), { editMessageId });
    return;
  }

  const keyboard = [];
  const lines = approvals.slice(0, 8).map((approval, index) => {
    const label = compact(approval.summary || approval.reason || approval.id, 70);
    keyboard.push([
      button(t(lang, 'control.button.approve'), 'approval_decide', { approvalId: approval.id, allow: true }),
      button(t(lang, 'control.button.deny'), 'approval_decide', { approvalId: approval.id, allow: false }),
    ]);
    return `${index + 1}. ${label}\nRun: ${approval.runId}`;
  });
  keyboard.push([button(t(lang, 'control.button.refresh'), 'approvals'), button(t(lang, 'control.button.mainMenu'), 'menu')]);
  await send(bot, chatId, `${t(lang, 'control.approvalQueue')}\n\n${lines.join('\n\n')}`, {
    editMessageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showControlRoom({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const data = await localApi(link.user_id, '/api/remote/control-room');
  const snapshot = data?.controlRoom || data;
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  const totals = snapshot?.totals || {};
  const lines = projects.map((project, index) => [
    `${index + 1}. ${compact(project.name || project.id, 44)}`,
    `Runs: ${project.activeRunCount || 0} active / ${project.failedRunCount || 0} failed`,
    `Approvals: ${project.pendingApprovalCount || 0}`,
  ].join('\n'));
  await send(bot, chatId, [
    t(lang, 'control.controlRoomTitle'),
    '',
    `Projects: ${totals.projects || 0}`,
    `Active runs: ${totals.activeRuns || 0}`,
    `Pending approvals: ${totals.pendingApprovals || 0}`,
    '',
    lines.join('\n\n') || t(lang, 'control.noProjects'),
  ].join('\n'), {
    editMessageId,
    reply_markup: {
      inline_keyboard: [
        [button(t(lang, 'control.button.approvals'), 'approvals'), button(t(lang, 'control.button.runs'), 'runs')],
        [button(t(lang, 'control.button.mainMenu'), 'menu')],
      ],
    },
  });
}

async function showWebhookMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const data = await localApi(link.user_id, '/api/webhooks');
  const webhooks = Array.isArray(data?.webhooks) ? data.webhooks : [];
  const lines = webhooks.slice(0, 10).map((webhook, index) => (
    `${index + 1}. ${webhook.enabled ? 'on' : 'off'} ${compact(webhook.name || webhook.url, 50)}\n${compact(webhook.events?.join(', ') || webhook.url, 90)}`
  ));
  await send(bot, chatId, [
    t(lang, 'control.webhookTitle'),
    '',
    lines.join('\n\n') || t(lang, 'control.noWebhooks'),
  ].join('\n'), {
    editMessageId,
    reply_markup: {
      inline_keyboard: [
        [button(t(lang, 'control.button.refresh'), 'webhooks'), button(t(lang, 'control.button.mainMenu'), 'menu')],
      ],
    },
  });
}

async function showSessions({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  if (!state.selectedProjectName) {
    await send(bot, chatId, t(lang, 'control.selectProjectFirst'), { editMessageId });
    return;
  }

  const data = await localApi(link.user_id, `/api/projects/${encodeURIComponent(state.selectedProjectName)}/sessions?limit=10&offset=0`);
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  if (sessions.length === 0) {
    await send(bot, chatId, t(lang, 'control.noSessions'), { editMessageId });
    return;
  }

  const lines = sessions.slice(0, 10).map((session, index) =>
    `${index + 1}. ${compact(session.summary || session.id || session.sessionId, 70)}`
  );
  await send(bot, chatId, `${t(lang, 'control.recentSessions')}\n\n${lines.join('\n')}`, {
    editMessageId,
    reply_markup: {
      inline_keyboard: [
        [button(t(lang, 'control.button.newChat'), 'new_chat')],
        [button(t(lang, 'control.button.mainMenu'), 'menu')],
      ],
    },
  });
}

async function startNewChat({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  updateTelegramControlState(link.user_id, { awaiting: { type: 'agent_prompt' } });
  await send(bot, chatId, t(lang, 'control.newChatReady'), {
    editMessageId,
    reply_markup: { inline_keyboard: [[button(t(lang, 'control.button.mainMenu'), 'menu')]] },
  });
}

function extractAssistantText(response) {
  const messages = Array.isArray(response?.messages) ? response.messages : [];
  const chunks = [];
  for (const message of messages) {
    if (typeof message?.content === 'string') chunks.push(message.content);
    const content = message?.message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
      }
    }
  }
  return chunks.join('\n\n').trim();
}

function extractTextFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (typeof event.content === 'string') return event.content;
  if (Array.isArray(event.content)) {
    return event.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  const legacyContent = event.data?.message?.content || event.message?.content;
  if (Array.isArray(legacyContent)) {
    return legacyContent
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  if (typeof legacyContent === 'string') return legacyContent;
  return '';
}

function describeToolInput(toolName, input) {
  if (!input || typeof input !== 'object') return '';
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return compact(input.command, 110);
  }
  if (toolName === 'WebSearch' && typeof input.query === 'string') {
    return compact(input.query, 110);
  }
  if (toolName === 'FileChanges') {
    return compact(JSON.stringify(input), 110);
  }
  const keys = Object.keys(input).slice(0, 3);
  if (keys.length === 0) return '';
  return compact(keys.map((key) => `${key}: ${String(input[key])}`).join(', '), 110);
}

function applyAgentStreamEvent(activity, event) {
  if (!event || typeof event !== 'object') return;

  const sessionId = event.actualSessionId || event.newSessionId || event.sessionId || event.threadId;
  if (sessionId) activity.sessionId = sessionId;

  if (event.type === 'status' && event.message) {
    activity.status = 'running';
    activity.phase = compact(event.message, 120);
    pushActivityEvent(activity, `⏳ ${compact(event.message, 120)}`);
    return;
  }
  if (event.type === 'done' || event.kind === 'complete' || event.kind === 'stream_end') {
    activity.status = 'done';
    activity.phase = t(activity.lang, 'control.activity.done');
    return;
  }
  if (event.type === 'error' || event.kind === 'error') {
    activity.status = 'failed';
    activity.phase = t(activity.lang, 'control.activity.failed');
    activity.error = event.error || event.message || event.content || t(activity.lang, 'error.generic');
    pushActivityEvent(activity, `❌ ${compact(activity.error, 120)}`);
    return;
  }
  if (event.kind === 'session_created') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.sessionStarted');
    pushActivityEvent(activity, `🧵 ${t(activity.lang, 'control.activity.sessionStarted')}`);
    return;
  }
  if (event.kind === 'thinking') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.thinking');
    const thought = extractTextFromEvent(event);
    if (thought) pushActivityEvent(activity, `🧠 ${compact(thought, 120)}`);
    return;
  }
  if (event.kind === 'stream_delta' || event.kind === 'text') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.responding');
    appendActivityOutput(activity, extractTextFromEvent(event));
    return;
  }
  if (event.type === 'claude-response' && event.data?.type === 'assistant') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.responding');
    appendActivityOutput(activity, extractTextFromEvent(event));
    return;
  }
  if (event.kind === 'tool_use') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.working');
    const toolName = event.toolName || 'Tool';
    const input = describeToolInput(toolName, event.toolInput);
    const icon = toolName === 'Bash'
      ? '💻'
      : toolName === 'FileChanges'
        ? '📝'
        : toolName === 'WebSearch'
          ? '🔎'
          : '🔧';
    pushActivityEvent(activity, `${icon} ${toolName}${input ? `: ${input}` : ''}`);
    return;
  }
  if (event.kind === 'tool_result') {
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.working');
    const label = event.isError
      ? t(activity.lang, 'control.activity.toolFailed')
      : t(activity.lang, 'control.activity.toolDone');
    pushActivityEvent(activity, `${event.isError ? '⚠️' : '✅'} ${label}`);
    return;
  }
  if (event.kind === 'status' && event.text === 'token_budget') {
    const used = event.tokenBudget?.used;
    if (used) pushActivityEvent(activity, `📊 ${t(activity.lang, 'control.activity.tokens')}: ${used}`);
  }
}

function confirmationLabel(lang, action, payload = {}) {
  if (action === 'install_provider') {
    return t(lang, 'control.confirmInstall', { provider: payload.provider || '' });
  }
  if (action === 'run_cancel') {
    return t(lang, 'control.confirmCancelRun', { runId: payload.runId || '' });
  }
  return t(lang, 'control.confirmationRequired');
}

async function requestConfirmation({ bot, chatId, link, action, payload = {}, editMessageId }) {
  const lang = languageFor(link);
  const pending = createTelegramConfirmation(link.user_id, action, payload);
  await send(bot, chatId, confirmationLabel(lang, action, payload), {
    editMessageId,
    reply_markup: {
      inline_keyboard: [[
        button(t(lang, 'control.button.confirm'), 'confirm_action', { id: pending.id }),
        button(t(lang, 'control.button.cancel'), 'cancel_confirmation', { id: pending.id }),
      ]],
    },
  });
  return { ok: false, requiresConfirmation: true };
}

async function sendToolFailure({ bot, chatId, link, result, editMessageId }) {
  const lang = languageFor(link);
  const message = result?.message === 'REMOTE_CONTROL_DISABLED'
    ? t(lang, 'control.disabled')
    : (result?.message || t(lang, 'error.generic'));
  await send(bot, chatId, message, { editMessageId });
}

async function runAgent({ bot, chatId, link, prompt, activity = null }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(lang, 'control.disabled'), { editMessageId: activity?.messageId });
    return;
  }
  if (!state.selectedProjectPath) {
    await showProjectMenu({ bot, chatId, link, editMessageId: activity?.messageId, notice: t(lang, 'control.selectProjectFirst') });
    return;
  }

  const provider = resolveTelegramProvider(state);
  const model = resolveTelegramModel(state);
  const active = activity || await createTelegramActivity({
    bot,
    chatId,
    link,
    type: 'agent',
    prompt,
    phase: t(lang, 'control.activity.startingProvider', { provider }),
  });
  active.type = 'agent';
  active.provider = provider;
  active.project = projectLabel(state);
  active.status = 'running';
  active.phase = t(lang, 'control.activity.startingProvider', { provider });
  await editTelegramActivity({ bot, chatId, activity: active, force: true });

  const heartbeat = startActivityHeartbeat({ bot, chatId, activity: active });
  let streamFailed = null;
  try {
    await localAgentStream(link.user_id, {
      projectPath: state.selectedProjectPath,
      provider,
      model: model || undefined,
      message: buildTelegramAgentPrompt(prompt, state),
      cleanup: false,
      permissionMode: 'default',
      suppressNotifications: true,
    }, async (event) => {
      applyAgentStreamEvent(active, event);
      await editTelegramActivity({ bot, chatId, activity: active });
    });
  } catch (error) {
    streamFailed = error;
  } finally {
    clearInterval(heartbeat);
  }

  if (streamFailed) {
    active.status = 'failed';
    active.phase = t(lang, 'control.activity.failed');
    active.error = streamFailed.message || t(lang, 'error.generic');
    await editTelegramActivity({ bot, chatId, activity: active, force: true });
    return;
  }

  active.status = active.error ? 'failed' : 'done';
  active.phase = active.error ? t(lang, 'control.activity.failed') : t(lang, 'control.activity.done');
  if (!active.output && !active.error) active.output = t(lang, 'control.noAssistantText');
  await editTelegramActivity({ bot, chatId, activity: active, force: true });
}

function longTaskKey(chatId) {
  return String(chatId);
}

async function launchLongTelegramTask({ bot, chatId, link, kind, activity = null, task }) {
  const key = longTaskKey(chatId);
  const existing = activeLongTasks.get(key);
  const lang = languageFor(link);
  if (existing) {
    await send(bot, chatId, t(lang, 'control.longTaskRunning', {
      kind: existing.kind,
      elapsed: formatElapsed(existing.startedAt),
    }), {
      editMessageId: activity?.messageId,
      parse_mode: undefined,
    });
    return true;
  }

  const record = {
    kind,
    startedAt: Date.now(),
  };
  activeLongTasks.set(key, record);

  Promise.resolve()
    .then(task)
    .catch(async (error) => {
      console.error('[telegram-control] long task failed:', error);
      await send(bot, chatId, t(lang, 'control.longTaskFailed'), {
        editMessageId: activity?.messageId,
        parse_mode: undefined,
      }).catch(() => {});
    })
    .finally(() => {
      if (activeLongTasks.get(key) === record) activeLongTasks.delete(key);
    });

  return true;
}

export async function runWorkflow({ bot, chatId, link, input, activity = null }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const workflowId = state.selectedWorkflowId;
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(lang, 'control.disabled'), { editMessageId: activity?.messageId });
    return;
  }
  if (!workflowId) {
    await send(bot, chatId, t(lang, 'control.selectWorkflowFirst'), { editMessageId: activity?.messageId });
    await showWorkflowMenu({ bot, chatId, link, editMessageId: activity?.messageId });
    return;
  }
  if (!state.selectedProjectPath) {
    await showProjectMenu({ bot, chatId, link, editMessageId: activity?.messageId, notice: t(lang, 'control.selectProjectFirst') });
    return;
  }

  const provider = resolveTelegramProvider(state);
  const model = resolveTelegramModel(state);
  const active = activity || await createTelegramActivity({
    bot,
    chatId,
    link,
    type: 'workflow',
    prompt: input,
    phase: t(lang, 'control.activity.startingWorkflow'),
  });
  active.type = 'workflow';
  active.provider = provider;
  active.project = projectLabel(state);
  active.workflowId = workflowId;
  active.status = 'running';
  active.phase = t(lang, 'control.activity.startingWorkflow');
  await editTelegramActivity({ bot, chatId, activity: active, force: true });

  const result = await runTelegramTool({
    userId: link.user_id,
    action: 'run_workflow',
    execute: () => localApi(link.user_id, `/api/tasks/${workflowId}/runs`, {
      method: 'POST',
      body: {
        input,
        metadata: {
          projectId: state.selectedProjectName,
          projectName: state.selectedProjectName,
          projectPath: state.selectedProjectPath,
          workspaceTarget: 'selected_project',
          telegram: true,
          preferredProvider: provider,
          preferredModel: model,
        },
      },
    }),
  });
  if (!result.ok) {
    await sendToolFailure({ bot, chatId, link, result, editMessageId: active.messageId });
    return;
  }
  const run = result.data;
  active.runId = run.id;
  active.phase = t(lang, 'control.activity.workflowRunning');
  pushActivityEvent(active, `🧭 ${t(lang, 'control.workflowStarted', { runId: run.id, workflowId }).replace('\n', ' ')}`);
  await editTelegramActivity({ bot, chatId, activity: active, force: true });
  monitorWorkflowRun({ bot, chatId, link, runId: run.id, activity: active }).catch((error) => {
    console.warn('[telegram-control] workflow monitor failed:', error?.message || error);
  });
}

async function cancelRun({ bot, chatId, link, runId, editMessageId, confirmed = false }) {
  const lang = languageFor(link);
  if (!runId) {
    await send(bot, chatId, t(lang, 'control.cancelUsage'), { editMessageId });
    return;
  }
  const state = getState(link.user_id);
  if (state.remoteControlEnabled === false) {
    await send(bot, chatId, t(lang, 'control.disabled'), { editMessageId });
    return;
  }
  if (state.confirmationPolicy === 'strict' && !confirmed) {
    await requestConfirmation({
      bot,
      chatId,
      link,
      action: 'run_cancel',
      payload: { runId },
      editMessageId,
    });
    return;
  }

  const result = await runTelegramTool({
    userId: link.user_id,
    action: 'run_cancel',
    execute: () => localApi(link.user_id, `/api/tasks/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    }),
  });
  if (!result.ok) {
    await sendToolFailure({ bot, chatId, link, result, editMessageId });
    return;
  }
  const run = result.data;
  await send(bot, chatId, t(lang, 'control.runStatus', { runId: run.id, status: run.status }), { editMessageId });
}

async function executeConfirmedAction({ bot, chatId, link, confirmation, editMessageId }) {
  if (confirmation.action === 'install_provider') {
    await startCliInstall({
      bot,
      chatId,
      link,
      provider: confirmation.payload?.provider,
      editMessageId,
      confirmed: true,
    });
    return true;
  }
  if (confirmation.action === 'run_cancel') {
    await cancelRun({
      bot,
      chatId,
      link,
      runId: confirmation.payload?.runId,
      editMessageId,
      confirmed: true,
    });
    return true;
  }
  return false;
}

async function findProjectByQuery(query) {
  const projects = await listProjects();
  const needle = String(query || '').trim().toLocaleLowerCase('tr');
  if (!needle) return null;
  return projects.find((project) => {
    const candidates = [project.name, project.displayName, project.fullPath, project.path]
      .filter(Boolean)
      .map((value) => String(value).toLocaleLowerCase('tr'));
    return candidates.some((candidate) => candidate === needle || candidate.includes(needle));
  }) || null;
}

async function listWorkflowSummaries(userId) {
  try {
    const data = await localApi(userId, '/api/tasks', { timeoutMs: 10_000 });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.workflows)) return data.workflows;
  } catch {
    // Workflow context is helpful for routing but should never block chat input.
  }
  return [];
}

async function resolveTelegramAiIntent({ bot, chatId, link, text, activity }) {
  const state = getState(link.user_id);
  if (state.routerEnabled === false || state.routerMode !== 'hybrid') {
    return { action: 'agent_prompt', prompt: text, confidence: 1 };
  }

  const provider = resolveTelegramProvider(state);
  const model = resolveTelegramModel(state);
  if (activity) {
    activity.type = 'router';
    activity.provider = provider;
    activity.project = projectLabel(state);
    activity.status = 'running';
    activity.phase = t(activity.lang, 'control.activity.interpreting');
    pushActivityEvent(activity, `🧠 ${t(activity.lang, 'control.activity.interpreting')}`);
    await editTelegramActivity({ bot, chatId, activity, force: true });
  }

  try {
    const projects = await listProjects().catch(() => []);
    const workflows = await listWorkflowSummaries(link.user_id);
    const response = await localApi(link.user_id, '/api/agent', {
      method: 'POST',
      timeoutMs: INTENT_ROUTER_TIMEOUT_MS,
      body: {
        projectPath: state.selectedProjectPath || process.cwd(),
        provider,
        model: model || undefined,
        message: buildTelegramIntentPrompt(text, state, { projects, workflows }),
        cleanup: false,
        stream: false,
        permissionMode: 'plan',
        suppressNotifications: true,
      },
    });
    const assistantText = extractAssistantText(response);
    const intent = parseTelegramAiIntentResponse(assistantText, text);
    if (activity) {
      pushActivityEvent(activity, `🧭 ${intent.action} (${Math.round(intent.confidence * 100)}%)`);
      await editTelegramActivity({ bot, chatId, activity });
    }
    return intent;
  } catch (error) {
    if (activity) {
      pushActivityEvent(activity, `⚠️ ${t(activity.lang, 'control.activity.routerFallback')}`);
      await editTelegramActivity({ bot, chatId, activity });
    }
    console.warn('[telegram-control] AI intent router fallback:', error?.message || error);
    return { action: 'agent_prompt', prompt: text, confidence: 0 };
  }
}

async function handleRoutedIntent({ bot, chatId, link, text, activity }) {
  const intent = await resolveTelegramAiIntent({ bot, chatId, link, text, activity });
  const editMessageId = activity?.messageId;

  if (intent.action === 'agent_prompt') {
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'agent',
      activity,
      task: () => runAgent({ bot, chatId, link, prompt: intent.prompt || text, activity }),
    });
  }
  if (intent.action === 'show_menu') {
    await showMainMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'show_projects') {
    await showProjectMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'select_project') {
    const query = intent.projectQuery || intent.prompt || text;
    const project = await findProjectByQuery(query);
    const lang = languageFor(link);
    if (!project) {
      await showProjectMenu({
        bot,
        chatId,
        link,
        editMessageId,
        notice: t(lang, 'control.projectNotFound', { query }),
      });
      return true;
    }
    updateTelegramControlState(link.user_id, {
      selectedProjectName: project.name,
      selectedProjectPath: project.fullPath || project.path,
    });
    await showMainMenu({
      bot,
      chatId,
      link,
      editMessageId,
      notice: t(lang, 'control.projectSelected', {
        project: project.displayName || project.name,
        path: project.fullPath || project.path,
      }),
    });
    return true;
  }
  if (intent.action === 'show_provider_menu') {
    await showProviderMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'select_provider' && intent.provider) {
    updateTelegramControlState(link.user_id, { selectedProvider: intent.provider, selectedModel: null });
    await showModelMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'show_model_menu') {
    await showModelMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'select_model' && intent.model) {
    updateTelegramControlState(link.user_id, { selectedModel: intent.model });
    await showMainMenu({
      bot,
      chatId,
      link,
      editMessageId,
      notice: t(languageFor(link), 'control.modelSelected', { model: intent.model }),
    });
    return true;
  }
  if (intent.action === 'show_runs') {
    await showRuns({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'show_approvals') {
    await showApprovalQueue({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'show_workflows') {
    await showWorkflowMenu({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'run_workflow') {
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'workflow',
      activity,
      task: () => runWorkflow({ bot, chatId, link, input: intent.workflowInput || text, activity }),
    });
  }
  if (intent.action === 'show_sessions') {
    await showSessions({ bot, chatId, link, editMessageId });
    return true;
  }
  if (intent.action === 'new_chat') {
    await startNewChat({ bot, chatId, link, editMessageId });
    return true;
  }
  return launchLongTelegramTask({
    bot,
    chatId,
    link,
    kind: 'agent',
    activity,
    task: () => runAgent({ bot, chatId, link, prompt: text, activity }),
  });
}

async function fetchRun(userId, runId) {
  return localApi(userId, `/api/tasks/runs/${runId}`);
}

function summarizeRun(run, mode) {
  const statusIcon = run.status === 'completed'
    ? '✅'
    : run.status === 'failed'
      ? '❌'
      : run.status === 'canceled'
        ? '⏹'
        : '🔧';
  const lines = [
    `${statusIcon} Run ${run.id}`,
    `🧩 Workflow: ${run.workflowId}`,
    `📌 Status: ${run.status}`,
  ];
  const nodeRuns = Array.isArray(run.nodeRuns) ? run.nodeRuns : [];
  if (mode !== 'final') {
    const visibleNodes = mode === 'errors'
      ? nodeRuns.filter((node) => node.error || node.status === 'failed')
      : nodeRuns;
    for (const node of visibleNodes) {
      const nodeIcon = node.status === 'completed'
        ? '✅'
        : node.status === 'failed'
          ? '❌'
          : node.status === 'running'
            ? '🔧'
            : '⏳';
      lines.push(`${nodeIcon} ${node.status}: ${node.agentLabel || node.nodeId}${node.error ? ` - ${node.error}` : ''}`);
    }
  }
  const outputs = nodeRuns
    .filter((node) => node.outputText)
    .slice(-3)
    .map((node) => `\n${node.agentLabel || node.nodeId}:\n${node.outputText}`);
  return truncate(`${lines.join('\n')}${outputs.join('\n')}`);
}

async function monitorWorkflowRun({ bot, chatId, link, runId, activity = null }) {
  if (runMonitors.has(runId)) return;
  runMonitors.set(runId, true);
  const state = getState(link.user_id);
  const seenNodeStatus = new Map();
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const run = await fetchRun(link.user_id, runId);
      const nodeRuns = Array.isArray(run.nodeRuns) ? run.nodeRuns : [];
      if (activity && !TERMINAL_RUN_STATES.has(run.status)) {
        activity.status = 'running';
        activity.phase = `${t(activity.lang, 'control.activity.workflowRunning')} (${run.status})`;
        await editTelegramActivity({ bot, chatId, activity });
      }
      if (state.progressMode === 'all') {
        for (const node of nodeRuns) {
          const key = `${node.nodeId}:${node.status}`;
          if (!seenNodeStatus.has(key)) {
            seenNodeStatus.set(key, true);
            if (activity) {
              pushActivityEvent(activity, `${node.status === 'completed' ? '✅' : node.status === 'failed' ? '❌' : '🔧'} ${node.agentLabel || node.nodeId}: ${node.status}${node.error ? ` - ${node.error}` : ''}`);
              activity.phase = t(activity.lang, 'control.activity.workflowRunning');
              await editTelegramActivity({ bot, chatId, activity });
            } else {
              await send(bot, chatId, `${node.agentLabel || node.nodeId}: ${node.status}${node.error ? `\n${node.error}` : ''}`);
            }
          }
        }
      }
      if (state.progressMode === 'errors') {
        for (const node of nodeRuns.filter((candidate) => candidate.error || candidate.status === 'failed')) {
          const key = `${node.nodeId}:${node.status}:${node.error || ''}`;
          if (!seenNodeStatus.has(key)) {
            seenNodeStatus.set(key, true);
            if (activity) {
              pushActivityEvent(activity, `❌ ${node.agentLabel || node.nodeId}: ${node.status}${node.error ? ` - ${node.error}` : ''}`);
              activity.phase = t(activity.lang, 'control.activity.workflowRunning');
              await editTelegramActivity({ bot, chatId, activity });
            } else {
              await send(bot, chatId, `${node.agentLabel || node.nodeId}: ${node.status}\n${node.error || ''}`);
            }
          }
        }
      }
      if (TERMINAL_RUN_STATES.has(run.status)) {
        if (activity) {
          activity.status = run.status === 'completed' ? 'done' : 'failed';
          activity.phase = run.status === 'completed'
            ? t(activity.lang, 'control.activity.done')
            : t(activity.lang, 'control.activity.failed');
          activity.output = summarizeRun(run, state.progressMode);
          await editTelegramActivity({ bot, chatId, activity, force: true });
        } else {
          await send(bot, chatId, summarizeRun(run, state.progressMode));
        }
        return;
      }
    }
  } finally {
    runMonitors.delete(runId);
  }
}

export async function startCliInstall({ bot, chatId, link, provider, editMessageId, confirmed = false }) {
  const lang = languageFor(link);
  if (!PROVIDERS.includes(provider)) {
    await send(bot, chatId, t(lang, 'control.providerAuthFallback'), { editMessageId });
    return;
  }
  const state = getState(link.user_id);
  if (state.remoteControlEnabled === false) {
    await send(bot, chatId, t(lang, 'control.disabled'), { editMessageId });
    return;
  }
  if (state.confirmationPolicy === 'strict' && !confirmed) {
    await requestConfirmation({
      bot,
      chatId,
      link,
      action: 'install_provider',
      payload: { provider },
      editMessageId,
    });
    return;
  }

  const result = await runTelegramTool({
    userId: link.user_id,
    action: 'install_provider',
    execute: () => localApi(link.user_id, `/api/providers/${provider}/install`, { method: 'POST' }),
  });
  if (!result.ok) {
    await sendToolFailure({ bot, chatId, link, result, editMessageId });
    return;
  }

  const data = result.data;
  if (data?.manual) {
    await send(bot, chatId, t(lang, 'control.manualInstall', { provider, manual: data.manual }), { editMessageId });
    return;
  }
  await send(bot, chatId, t(lang, 'control.installStarted', {
    provider,
    jobId: data.jobId,
    command: data.installCmd || 'internal installer',
  }), { editMessageId });
}

async function showInstallMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const buttons = PROVIDERS.map((provider) => button(provider, 'install_provider', { provider }));
  await send(bot, chatId, t(lang, 'control.installMenu'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 2) },
  });
}

async function showAuthMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const buttons = PROVIDERS.map((provider) => button(provider, 'auth_provider', { provider }));
  await send(bot, chatId, t(lang, 'control.authMenu'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 2) },
  });
}

async function showSettings({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const keyboard = [
    [
      button(
        state.remoteControlEnabled
          ? checked(t(lang, 'control.button.remoteOn'))
          : t(lang, 'control.button.remoteOff'),
        'toggle_control',
      ),
    ],
    [
      button(state.progressMode === 'final' ? checked(t(lang, 'control.button.progressFinal')) : t(lang, 'control.button.progressFinal'), 'progress_mode', { progressMode: 'final' }),
      button(state.progressMode === 'steps' ? checked(t(lang, 'control.button.progressSteps')) : t(lang, 'control.button.progressSteps'), 'progress_mode', { progressMode: 'steps' }),
      button(state.progressMode === 'errors' ? checked(t(lang, 'control.button.progressErrors')) : t(lang, 'control.button.progressErrors'), 'progress_mode', { progressMode: 'errors' }),
      button(state.progressMode === 'all' ? checked(t(lang, 'control.button.progressAll')) : t(lang, 'control.button.progressAll'), 'progress_mode', { progressMode: 'all' }),
    ],
    [
      button(t(lang, 'control.button.language'), 'language_menu'),
      button(t(lang, 'control.button.mainMenu'), 'menu'),
    ],
  ];
  await send(bot, chatId, `${t(lang, 'control.settingsTitle')}\n\n${stateSummary(lang, state)}`, {
    editMessageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showLanguageMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const buttons = SUPPORTED_LANGUAGES.map((language) => button(language, 'language_select', { language }));
  await send(bot, chatId, t(lang, 'control.pickLanguage'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 3) },
  });
}

async function handleAwaitingInput({ bot, chatId, link, text }) {
  const state = getState(link.user_id);
  const awaiting = state.awaiting;
  if (!awaiting?.type) return false;
  updateTelegramControlState(link.user_id, { awaiting: null });

  if (awaiting.type === 'agent_prompt') {
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'agent',
      task: () => runAgent({ bot, chatId, link, prompt: text }),
    });
  }
  if (awaiting.type === 'workflow_prompt') {
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'workflow',
      task: () => runWorkflow({ bot, chatId, link, input: text }),
    });
  }
  return false;
}

async function handleCommand({ bot, chatId, link, text }) {
  const [commandRaw, ...rest] = text.split(/\s+/);
  const command = normalizeCommandToken(commandRaw);
  const argText = rest.join(' ').trim();
  const lang = languageFor(link);

  if (command === '/menu' || command === '/start' || command === 'menu') {
    await showMainMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/help') {
    await showHelp({ bot, chatId, link });
    return true;
  }
  if (command === '/projects') {
    await showProjectMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/provider') {
    await showProviderMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/model' || command === '/models') {
    await showModelMenu({ bot, chatId, link, refresh: command === '/models' && argText === 'refresh' });
    return true;
  }
  if (command === '/workflows' || command === '/tasks') {
    await showWorkflowMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/runs') {
    await showRuns({ bot, chatId, link });
    return true;
  }
  if (command === '/approvals') {
    await showApprovalQueue({ bot, chatId, link });
    return true;
  }
  if (command === '/controlroom' || command === '/control-room') {
    await showControlRoom({ bot, chatId, link });
    return true;
  }
  if (command === '/webhooks') {
    await showWebhookMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/sessions') {
    await showSessions({ bot, chatId, link });
    return true;
  }
  if (command === '/terminal') {
    await showActiveTerminalStatus({ bot, chatId, link });
    return true;
  }
  if (command === '/detach') {
    await detachActiveTerminal({ bot, chatId, link });
    return true;
  }
  if (command === '/newchat') {
    await startNewChat({ bot, chatId, link });
    return true;
  }
  if (command === '/settings') {
    await showSettings({ bot, chatId, link });
    return true;
  }
  if (command === '/install') {
    if (PROVIDERS.includes(argText)) await startCliInstall({ bot, chatId, link, provider: argText });
    else await showInstallMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/auth') {
    if (PROVIDERS.includes(argText)) await send(bot, chatId, `${argText} login:\n${AUTH_HELP[argText]}`);
    else await showAuthMenu({ bot, chatId, link });
    return true;
  }
  if (command === '/control') {
    const enabled = argText !== 'off';
    updateTelegramControlState(link.user_id, { remoteControlEnabled: enabled });
    await send(bot, chatId, enabled ? t(lang, 'control.remoteEnabled') : t(lang, 'control.remoteDisabled'));
    return true;
  }
  if (command === '/progress') {
    if (!['final', 'steps', 'all', 'errors'].includes(argText)) {
      await send(bot, chatId, t(lang, 'control.progressUsage'));
      return true;
    }
    updateTelegramControlState(link.user_id, { progressMode: argText });
    await send(bot, chatId, t(lang, 'control.progressSet', { mode: argText }));
    return true;
  }
  if (command === '/chat') {
    if (!argText) {
      updateTelegramControlState(link.user_id, { awaiting: { type: 'agent_prompt' } });
      await send(bot, chatId, t(lang, 'control.sendAgentPrompt'));
      return true;
    }
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'agent',
      task: () => runAgent({ bot, chatId, link, prompt: argText }),
    });
  }
  if (command === '/workflow' || command === '/orchestrate') {
    if (!argText) {
      updateTelegramControlState(link.user_id, { awaiting: { type: 'workflow_prompt' } });
      await send(bot, chatId, t(lang, 'control.sendWorkflowPrompt'));
      return true;
    }
    return launchLongTelegramTask({
      bot,
      chatId,
      link,
      kind: 'workflow',
      task: () => runWorkflow({ bot, chatId, link, input: argText }),
    });
  }
  if (command === '/cancel') {
    if (!argText) {
      await send(bot, chatId, t(lang, 'control.cancelUsage'));
      return true;
    }
    await cancelRun({ bot, chatId, link, runId: argText });
    return true;
  }
  return false;
}

async function handleTelegramControlMessageInternal({ bot, msg, link }) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  if (!text) return false;

  if (text === '/') {
    await showCommandPalette({ bot, chatId, link });
    return true;
  }
  if (text.startsWith('/') && !getTelegramControlCommand(text)) {
    await showCommandPalette({ bot, chatId, link, unknown: true });
    return true;
  }

  if (await handleAwaitingInput({ bot, chatId, link, text })) return true;
  if (await handleCommand({ bot, chatId, link, text })) return true;

  const state = getState(link.user_id);
  if (getActiveTerminal(state)) {
    return sendToActiveTerminal({ bot, chatId, link, text });
  }
  if (state.routerEnabled === false) return false;
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(languageFor(link), 'control.disabled'));
    return true;
  }

  const activity = await createTelegramActivity({
    bot,
    chatId,
    link,
    type: 'router',
    prompt: text,
    phase: t(languageFor(link), 'control.activity.interpreting'),
  });
  return handleRoutedIntent({ bot, chatId, link, text, activity });
}

export async function handleTelegramControlMessage(args) {
  const chatId = args?.msg?.chat?.id;
  if (!chatId) return false;
  return enqueueTelegramJob(chatId, async () => {
    try {
      return await handleTelegramControlMessageInternal(args);
    } catch (error) {
      console.error('[telegram-control] message handler failed:', error);
      await send(args.bot, chatId, t(languageFor(args.link), 'error.generic')).catch(() => {});
      return true;
    }
  }).catch(async (error) => {
    console.error('[telegram-control] message job failed:', error);
    await send(args.bot, chatId, t(languageFor(args.link), 'error.generic')).catch(() => {});
    return true;
  });
}

async function showRunDetail({ bot, chatId, link, runId, editMessageId }) {
  const lang = languageFor(link);
  const run = await fetchRun(link.user_id, runId);
  await send(bot, chatId, summarizeRun(run, 'all'), {
    editMessageId,
    reply_markup: {
      inline_keyboard: [
        [button(t(lang, 'control.button.cancelRun'), 'run_cancel', { runId }), button(t(lang, 'control.button.refresh'), 'run_detail', { runId })],
        [button(t(lang, 'control.button.runs'), 'runs'), button(t(lang, 'control.button.mainMenu'), 'menu')],
      ],
    },
  });
}

async function handleTelegramControlCallbackInternal({ bot, query, link }) {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;
  const editMessageId = query.message?.message_id;
  const entry = readAction(query.data);
  if (!entry) {
    const lang = languageFor(link);
    await bot.answerCallbackQuery(query.id, { text: t(lang, 'control.menuExpired') }).catch(() => {});
    await send(bot, chatId, t(lang, 'control.menuExpiredLong'));
    return;
  }
  await bot.answerCallbackQuery(query.id).catch(() => {});

  const { action, payload } = entry;
  if (action === 'confirm_action') {
    forgetAction(entry.id);
    const lang = languageFor(link);
    const result = consumeTelegramConfirmation(link.user_id, payload.id);
    if (!result.ok) {
      await send(bot, chatId, t(lang, result.reason === 'expired'
        ? 'control.confirmationExpired'
        : 'control.confirmationMissing'), { editMessageId });
      return;
    }
    if (await executeConfirmedAction({
      bot,
      chatId,
      link,
      confirmation: result.confirmation,
      editMessageId,
    })) return;
    await send(bot, chatId, t(lang, 'error.generic'), { editMessageId });
    return;
  }
  if (action === 'cancel_confirmation') {
    forgetAction(entry.id);
    clearTelegramConfirmation(link.user_id, payload.id);
    await send(bot, chatId, t(languageFor(link), 'control.confirmationCanceled'), { editMessageId });
    return;
  }
  if (action === 'menu') return showMainMenu({ bot, chatId, link, editMessageId });
  if (action === 'projects') return showProjectMenu({ bot, chatId, link, editMessageId });
  if (action === 'providers') return showProviderMenu({ bot, chatId, link, editMessageId });
  if (action === 'models') return showModelMenu({ bot, chatId, link, editMessageId });
  if (action === 'models_refresh') return showModelMenu({ bot, chatId, link, refresh: true, editMessageId });
  if (action === 'workflows') return showWorkflowMenu({ bot, chatId, link, editMessageId });
  if (action === 'runs') return showRuns({ bot, chatId, link, editMessageId });
  if (action === 'approvals') return showApprovalQueue({ bot, chatId, link, editMessageId });
  if (action === 'control_room') return showControlRoom({ bot, chatId, link, editMessageId });
  if (action === 'webhooks') return showWebhookMenu({ bot, chatId, link, editMessageId });
  if (action === 'sessions') return showSessions({ bot, chatId, link, editMessageId });
  if (action === 'terminal_status') return showActiveTerminalStatus({ bot, chatId, link, editMessageId });
  if (action === 'detach_terminal') return detachActiveTerminal({ bot, chatId, link, editMessageId });
  if (action === 'new_chat') return startNewChat({ bot, chatId, link, editMessageId });
  if (action === 'install_menu') return showInstallMenu({ bot, chatId, link, editMessageId });
  if (action === 'auth_menu') return showAuthMenu({ bot, chatId, link, editMessageId });
  if (action === 'settings') return showSettings({ bot, chatId, link, editMessageId });
  if (action === 'language_menu') return showLanguageMenu({ bot, chatId, link, editMessageId });
  if (action === 'project_select') {
    updateTelegramControlState(link.user_id, {
      selectedProjectName: payload.name,
      selectedProjectPath: payload.path,
    });
    const lang = languageFor(link);
    return showMainMenu({
      bot,
      chatId,
      link,
      editMessageId,
      notice: t(lang, 'control.projectSelected', { project: payload.displayName || payload.name, path: payload.path }),
    });
  }
  if (action === 'provider_select') {
    updateTelegramControlState(link.user_id, { selectedProvider: payload.provider, selectedModel: null });
    return showModelMenu({ bot, chatId, link, editMessageId });
  }
  if (action === 'model_select') {
    updateTelegramControlState(link.user_id, { selectedModel: payload.model || null });
    const lang = languageFor(link);
    return showMainMenu({
      bot,
      chatId,
      link,
      editMessageId,
      notice: payload.model
        ? t(lang, 'control.modelSelected', { model: payload.model })
        : t(lang, 'control.modelCleared'),
    });
  }
  if (action === 'workflow_select') {
    updateTelegramControlState(link.user_id, { selectedWorkflowId: payload.workflowId });
    const lang = languageFor(link);
    return showMainMenu({
      bot,
      chatId,
      link,
      editMessageId,
      notice: t(lang, 'control.workflowSelected', { workflow: payload.name || payload.workflowId }),
    });
  }
  if (action === 'workflow_prompt') {
    updateTelegramControlState(link.user_id, { awaiting: { type: 'workflow_prompt' } });
    await send(bot, chatId, t(languageFor(link), 'control.sendWorkflowPrompt'), { editMessageId });
    return;
  }
  if (action === 'run_detail') return showRunDetail({ bot, chatId, link, runId: payload.runId, editMessageId });
  if (action === 'run_cancel') {
    await cancelRun({ bot, chatId, link, runId: payload.runId, editMessageId });
    return;
  }
  if (action === 'approval_decide') {
    const toolResult = await runTelegramTool({
      userId: link.user_id,
      action: 'approval_decide',
      execute: () => localApi(link.user_id, `/api/tasks/approvals/${encodeURIComponent(payload.approvalId)}`, {
        method: 'POST',
        body: {
          allow: payload.allow === true,
          source: 'telegram',
        },
      }),
    });
    if (!toolResult.ok) {
      await sendToolFailure({ bot, chatId, link, result: toolResult, editMessageId });
      return;
    }
    const result = toolResult.data;
    const lang = languageFor(link);
    await send(bot, chatId, t(lang, 'control.approvalDecided', {
      approvalId: payload.approvalId,
      status: payload.allow === true ? 'approved' : 'denied',
      runId: result?.runId || '',
    }), { editMessageId });
    return showApprovalQueue({ bot, chatId, link });
  }
  if (action === 'install_provider') return startCliInstall({ bot, chatId, link, provider: payload.provider, editMessageId });
  if (action === 'auth_provider') {
    await send(bot, chatId, `${payload.provider} login:\n${AUTH_HELP[payload.provider] || t(languageFor(link), 'control.providerAuthFallback')}`, { editMessageId });
    return;
  }
  if (action === 'toggle_control') {
    const state = getState(link.user_id);
    updateTelegramControlState(link.user_id, { remoteControlEnabled: !state.remoteControlEnabled });
    return showSettings({ bot, chatId, link, editMessageId });
  }
  if (action === 'progress_mode') {
    updateTelegramControlState(link.user_id, { progressMode: payload.progressMode });
    return showSettings({ bot, chatId, link, editMessageId });
  }
  if (action === 'language_select') {
    telegramLinksDb.updatePreferences(link.user_id, { language: payload.language });
    return showMainMenu({
      bot,
      chatId,
      link: { ...link, language: payload.language },
      editMessageId,
      notice: t(payload.language, 'control.languageSet', { language: payload.language }),
    });
  }
}

export async function handleTelegramControlCallback(args) {
  const chatId = args?.query?.message?.chat?.id;
  if (!chatId) return;
  return enqueueTelegramJob(chatId, async () => {
    try {
      await handleTelegramControlCallbackInternal(args);
    } catch (error) {
      console.error('[telegram-control] callback failed:', error);
      const lang = languageFor(args.link);
      await args.bot?.answerCallbackQuery(args.query?.id, { text: t(lang, 'error.generic') }).catch(() => {});
      await send(args.bot, chatId, t(lang, 'error.generic')).catch(() => {});
    }
  }).catch(async (error) => {
    console.error('[telegram-control] callback job failed:', error);
    const lang = languageFor(args.link);
    await args.bot?.answerCallbackQuery(args.query?.id, { text: t(lang, 'error.generic') }).catch(() => {});
    await send(args.bot, chatId, t(lang, 'error.generic')).catch(() => {});
  });
}
