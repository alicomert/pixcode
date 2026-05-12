import crypto from 'node:crypto';

import { apiKeysDb, telegramLinksDb } from '../../database/db.js';
import { getProjects } from '../../projects.js';
import { getStaticProviderModels } from '../model-registry.js';

import { SUPPORTED_LANGUAGES, t } from './translations.js';

const PROVIDERS = ['claude', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'];
const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'canceled']);
const CALLBACK_TTL_MS = 10 * 60 * 1000;
const MAX_TELEGRAM_TEXT = 3600;
const callbackActions = new Map();
const runMonitors = new Map();

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
  '/orchestration',
  '/runs',
  '/approvals',
  '/controlroom',
  '/control-room',
  '/webhooks',
  '/sessions',
  '/newchat',
  '/tasks',
  '/task',
  '/settings',
  '/install',
  '/auth',
  '/control',
  '/progress',
  '/chat',
  '/workflow',
  '/orchestrate',
  '/cancel',
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

function registerAction(action, payload = {}) {
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
  return entry;
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
  const messageText = truncate(text);
  if (editMessageId && typeof bot.editMessageText === 'function') {
    try {
      return await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: editMessageId,
        ...extra,
      });
    } catch (err) {
      const description = err?.response?.body?.description || err?.message || '';
      if (/message is not modified/i.test(description)) return null;
      console.warn('[telegram-control] editMessageText failed:', description || err);
    }
  }
  try {
    return await bot.sendMessage(chatId, messageText, extra);
  } catch {
    const fallback = { ...extra };
    delete fallback.parse_mode;
    return bot.sendMessage(chatId, messageText, fallback);
  }
}

function localApiBase() {
  const port = process.env.SERVER_PORT || process.env.PORT || '3001';
  return `http://127.0.0.1:${port}`;
}

function getOrCreateTelegramApiKey(userId) {
  const existing = apiKeysDb
    .getApiKeys(userId)
    .find((key) => key.key_name === 'Telegram Control' && Boolean(key.is_active));
  if (existing?.api_key) return existing.api_key;
  return apiKeysDb.createApiKey(userId, 'Telegram Control').apiKey;
}

async function localApi(userId, path, { method = 'GET', body } = {}) {
  const apiKey = getOrCreateTelegramApiKey(userId);
  const response = await fetch(`${localApiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
  }
  return data?.data ?? data;
}

function checked(label) {
  return `${label} ✓`;
}

function stateSummary(lang, state) {
  return [
    `${t(lang, 'control.summary.project')}: ${state.selectedProjectName || t(lang, 'control.notSelected')}`,
    `${t(lang, 'control.summary.provider')}: ${state.selectedProvider}${state.selectedModel ? ` / ${state.selectedModel}` : ''}`,
    `${t(lang, 'control.summary.workflow')}: ${state.selectedWorkflowId || t(lang, 'control.notSelected')}`,
    `${t(lang, 'control.summary.progress')}: ${state.progressMode}`,
  ].join('\n');
}

function mainMenuKeyboard(lang) {
  return [
    [button(t(lang, 'control.button.projects'), 'projects'), button(t(lang, 'control.button.provider'), 'providers')],
    [button(t(lang, 'control.button.models'), 'models'), button(t(lang, 'control.button.workflows'), 'workflows')],
    [button(t(lang, 'control.button.tasks'), 'tasks'), button(t(lang, 'control.button.runs'), 'runs')],
    [button(t(lang, 'control.button.approvals'), 'approvals'), button(t(lang, 'control.button.controlRoom'), 'control_room')],
    [button(t(lang, 'control.button.webhooks'), 'webhooks')],
    [button(t(lang, 'control.button.sessions'), 'sessions'), button(t(lang, 'control.button.newChat'), 'new_chat')],
    [button(t(lang, 'control.button.install'), 'install_menu'), button(t(lang, 'control.button.auth'), 'auth_menu')],
    [button(t(lang, 'control.button.settings'), 'settings')],
  ];
}

export async function showMainMenu({ bot, chatId, link, editMessageId, notice }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const prefix = notice ? `${notice}\n\n` : '';
  await send(bot, chatId, `${prefix}${t(lang, 'control.menu')}\n\n${stateSummary(lang, state)}`, {
    editMessageId,
    reply_markup: { inline_keyboard: mainMenuKeyboard(lang) },
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
    reply_markup: { inline_keyboard: mainMenuKeyboard(lang) },
  });
}

async function listProjects() {
  const projects = await getProjects();
  return projects.slice(0, 20);
}

async function showProjectMenu({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const projects = await listProjects();
  if (projects.length === 0) {
    await send(bot, chatId, t(lang, 'control.noProjects'), { editMessageId });
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
  await send(bot, chatId, t(lang, 'control.pickProject'), {
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
  const workflows = await localApi(link.user_id, '/api/orchestration/workflows');
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
  const data = await localApi(link.user_id, '/api/orchestration/workflows/runs?limit=10');
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
  const data = await localApi(link.user_id, '/api/orchestration/workflows/approvals');
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

async function showTaskMasterTasks({ bot, chatId, link, editMessageId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  if (!state.selectedProjectName) {
    await send(bot, chatId, t(lang, 'control.selectProjectFirst'), { editMessageId });
    await showProjectMenu({ bot, chatId, link });
    return;
  }

  const data = await localApi(link.user_id, `/api/taskmaster/tasks/${encodeURIComponent(state.selectedProjectName)}`);
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const activeTasks = tasks.filter((task) => !['done', 'completed', 'cancelled', 'canceled'].includes(String(task.status || '').toLowerCase()));
  if (activeTasks.length === 0) {
    await send(bot, chatId, t(lang, 'control.noTaskMasterTasks'), {
      editMessageId,
      reply_markup: { inline_keyboard: [[button(t(lang, 'control.button.mainMenu'), 'menu')]] },
    });
    return;
  }

  const buttons = activeTasks.slice(0, 12).map((task) => button(
    `#${task.id} ${compact(task.title, 38)}`,
    'task_run',
    { taskId: String(task.id) },
  ));
  await send(bot, chatId, t(lang, 'control.pickTaskMasterTask'), {
    editMessageId,
    reply_markup: { inline_keyboard: rows(buttons, 1) },
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

async function runAgent({ bot, chatId, link, prompt }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(lang, 'control.disabled'));
    return;
  }
  if (!state.selectedProjectPath) {
    await send(bot, chatId, t(lang, 'control.selectProjectFirst'));
    await showProjectMenu({ bot, chatId, link });
    return;
  }

  if (state.progressMode !== 'final') {
    await send(bot, chatId, t(lang, 'control.agentStarted', {
      provider: state.selectedProvider,
      project: state.selectedProjectName || state.selectedProjectPath,
    }));
  }

  const response = await localApi(link.user_id, '/api/agent', {
    method: 'POST',
    body: {
      projectPath: state.selectedProjectPath,
      provider: state.selectedProvider,
      model: state.selectedModel || undefined,
      message: prompt,
      cleanup: false,
      stream: false,
    },
  });
  const assistantText = extractAssistantText(response);
  const statusLine = response.success === false
    ? t(lang, 'control.agentFailed', { error: response.error || 'provider returned no answer' })
    : t(lang, 'control.agentDone', { provider: state.selectedProvider, session: response.sessionId ? ` (${response.sessionId})` : '' });
  await send(bot, chatId, `${statusLine}\n\n${assistantText || response.error || t(lang, 'control.noAssistantText')}`);
}

export async function runWorkflow({ bot, chatId, link, input }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  const workflowId = state.selectedWorkflowId;
  if (!workflowId) {
    await send(bot, chatId, t(lang, 'control.selectWorkflowFirst'));
    await showWorkflowMenu({ bot, chatId, link });
    return;
  }
  if (!state.selectedProjectPath) {
    await send(bot, chatId, t(lang, 'control.selectProjectFirst'));
    await showProjectMenu({ bot, chatId, link });
    return;
  }

  const run = await localApi(link.user_id, `/api/orchestration/workflows/${workflowId}/runs`, {
    method: 'POST',
    body: {
      input,
      metadata: {
        projectId: state.selectedProjectName,
        projectName: state.selectedProjectName,
        projectPath: state.selectedProjectPath,
        workspaceTarget: 'selected_project',
        telegram: true,
        preferredProvider: state.selectedProvider,
        preferredModel: state.selectedModel,
      },
    },
  });
  await send(bot, chatId, t(lang, 'control.workflowStarted', { runId: run.id, workflowId }));
  monitorWorkflowRun({ bot, chatId, link, runId: run.id }).catch((error) => {
    console.warn('[telegram-control] workflow monitor failed:', error?.message || error);
  });
}

async function fetchRun(userId, runId) {
  return localApi(userId, `/api/orchestration/workflows/runs/${runId}`);
}

async function fetchA2ATask(userId, taskId) {
  return localApi(userId, `/a2a/tasks/${encodeURIComponent(taskId)}`);
}

function summarizeRun(run, mode) {
  const lines = [
    `Run ${run.id}`,
    `Workflow: ${run.workflowId}`,
    `Status: ${run.status}`,
  ];
  const nodeRuns = Array.isArray(run.nodeRuns) ? run.nodeRuns : [];
  if (mode !== 'final') {
    const visibleNodes = mode === 'errors'
      ? nodeRuns.filter((node) => node.error || node.status === 'failed')
      : nodeRuns;
    for (const node of visibleNodes) {
      lines.push(`- ${node.status}: ${node.agentLabel || node.nodeId}${node.error ? ` — ${node.error}` : ''}`);
    }
  }
  const outputs = nodeRuns
    .filter((node) => node.outputText)
    .slice(-3)
    .map((node) => `\n${node.agentLabel || node.nodeId}:\n${node.outputText}`);
  return truncate(`${lines.join('\n')}${outputs.join('\n')}`);
}

async function monitorWorkflowRun({ bot, chatId, link, runId }) {
  if (runMonitors.has(runId)) return;
  runMonitors.set(runId, true);
  const state = getState(link.user_id);
  const seenNodeStatus = new Map();
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const run = await fetchRun(link.user_id, runId);
      const nodeRuns = Array.isArray(run.nodeRuns) ? run.nodeRuns : [];
      if (state.progressMode === 'all') {
        for (const node of nodeRuns) {
          const key = `${node.nodeId}:${node.status}`;
          if (!seenNodeStatus.has(key)) {
            seenNodeStatus.set(key, true);
            await send(bot, chatId, `${node.agentLabel || node.nodeId}: ${node.status}${node.error ? `\n${node.error}` : ''}`);
          }
        }
      }
      if (state.progressMode === 'errors') {
        for (const node of nodeRuns.filter((candidate) => candidate.error || candidate.status === 'failed')) {
          const key = `${node.nodeId}:${node.status}:${node.error || ''}`;
          if (!seenNodeStatus.has(key)) {
            seenNodeStatus.set(key, true);
            await send(bot, chatId, `${node.agentLabel || node.nodeId}: ${node.status}\n${node.error || ''}`);
          }
        }
      }
      if (TERMINAL_RUN_STATES.has(run.status)) {
        await send(bot, chatId, summarizeRun(run, state.progressMode));
        return;
      }
    }
  } finally {
    runMonitors.delete(runId);
  }
}

function extractA2ATaskText(task) {
  const chunks = [];
  const artifacts = Array.isArray(task?.artifacts) ? task.artifacts : [];
  for (const artifact of artifacts) {
    for (const part of Array.isArray(artifact?.parts) ? artifact.parts : []) {
      if (part?.kind === 'text' && typeof part.text === 'string') chunks.push(part.text);
      if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  const history = Array.isArray(task?.history) ? task.history : [];
  for (const message of history) {
    if (message?.role !== 'assistant') continue;
    for (const part of Array.isArray(message?.parts) ? message.parts : []) {
      if (part?.kind === 'text' && typeof part.text === 'string') chunks.push(part.text);
      if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n\n').trim();
}

function summarizeA2ATask(task) {
  const text = extractA2ATaskText(task);
  const error = task?.error?.message || task?.metadata?.error?.message || '';
  return truncate([
    `Task ${task?.id || ''}`,
    `Status: ${task?.state || 'unknown'}`,
    error ? `Error: ${error}` : '',
    text,
  ].filter(Boolean).join('\n\n'));
}

async function monitorA2ATask({ bot, chatId, link, taskId }) {
  const key = `a2a:${taskId}`;
  if (runMonitors.has(key)) return;
  runMonitors.set(key, true);
  const lang = languageFor(link);
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const task = await fetchA2ATask(link.user_id, taskId);
      if (TERMINAL_RUN_STATES.has(task?.state)) {
        await send(bot, chatId, t(lang, 'control.taskFinished', {
          taskId,
          status: task.state,
          summary: summarizeA2ATask(task),
        }));
        return;
      }
    }
  } finally {
    runMonitors.delete(key);
  }
}

async function runTaskMasterTask({ bot, chatId, link, taskId }) {
  const lang = languageFor(link);
  const state = getState(link.user_id);
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(lang, 'control.disabled'));
    return;
  }
  if (!state.selectedProjectName) {
    await send(bot, chatId, t(lang, 'control.selectProjectFirst'));
    await showProjectMenu({ bot, chatId, link });
    return;
  }

  const result = await localApi(
    link.user_id,
    `/api/taskmaster/execute/${encodeURIComponent(state.selectedProjectName)}/${encodeURIComponent(taskId)}`,
    {
      method: 'POST',
      body: {
        projectId: state.selectedProjectName,
        adapterId: state.selectedProvider,
        model: state.selectedModel || undefined,
        isolation: 'worktree',
      },
    },
  );
  const a2aTaskId = result?.task?.a2aTaskId;
  await send(bot, chatId, t(lang, 'control.taskStarted', {
    taskId,
    provider: state.selectedProvider,
    a2aTaskId: a2aTaskId || result?.task?.id || 'unknown',
  }));

  if (a2aTaskId) {
    monitorA2ATask({ bot, chatId, link, taskId: a2aTaskId }).catch((error) => {
      console.warn('[telegram-control] task monitor failed:', error?.message || error);
    });
  }
}

export async function startCliInstall({ bot, chatId, link, provider }) {
  const lang = languageFor(link);
  const data = await localApi(link.user_id, `/api/providers/${provider}/install`, { method: 'POST' });
  if (data?.manual) {
    await send(bot, chatId, t(lang, 'control.manualInstall', { provider, manual: data.manual }));
    return;
  }
  await send(bot, chatId, t(lang, 'control.installStarted', {
    provider,
    jobId: data.jobId,
    command: data.installCmd || 'internal installer',
  }));
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
    await runAgent({ bot, chatId, link, prompt: text });
    return true;
  }
  if (awaiting.type === 'workflow_prompt') {
    await runWorkflow({ bot, chatId, link, input: text });
    return true;
  }
  if (awaiting.type === 'task_id') {
    await runTaskMasterTask({ bot, chatId, link, taskId: text });
    return true;
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
  if (command === '/workflows' || command === '/orchestration') {
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
  if (command === '/newchat') {
    await startNewChat({ bot, chatId, link });
    return true;
  }
  if (command === '/tasks') {
    await showTaskMasterTasks({ bot, chatId, link });
    return true;
  }
  if (command === '/task') {
    if (!argText) {
      updateTelegramControlState(link.user_id, { awaiting: { type: 'task_id' } });
      await send(bot, chatId, t(lang, 'control.sendTaskId'));
      return true;
    }
    await runTaskMasterTask({ bot, chatId, link, taskId: argText });
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
    await runAgent({ bot, chatId, link, prompt: argText });
    return true;
  }
  if (command === '/workflow' || command === '/orchestrate') {
    if (!argText) {
      updateTelegramControlState(link.user_id, { awaiting: { type: 'workflow_prompt' } });
      await send(bot, chatId, t(lang, 'control.sendWorkflowPrompt'));
      return true;
    }
    await runWorkflow({ bot, chatId, link, input: argText });
    return true;
  }
  if (command === '/cancel') {
    if (!argText) {
      await send(bot, chatId, t(lang, 'control.cancelUsage'));
      return true;
    }
    const run = await localApi(link.user_id, `/api/orchestration/workflows/runs/${encodeURIComponent(argText)}/cancel`, {
      method: 'POST',
    });
    await send(bot, chatId, t(lang, 'control.runStatus', { runId: run.id, status: run.status }));
    return true;
  }
  return false;
}

export async function handleTelegramControlMessage({ bot, msg, link }) {
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
  if (!state.remoteControlEnabled) {
    await send(bot, chatId, t(languageFor(link), 'control.disabled'));
    return true;
  }

  await runAgent({ bot, chatId, link, prompt: text });
  return true;
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

export async function handleTelegramControlCallback({ bot, query, link }) {
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
  if (action === 'new_chat') return startNewChat({ bot, chatId, link, editMessageId });
  if (action === 'tasks') return showTaskMasterTasks({ bot, chatId, link, editMessageId });
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
    const run = await localApi(link.user_id, `/api/orchestration/workflows/runs/${encodeURIComponent(payload.runId)}/cancel`, {
      method: 'POST',
    });
    await send(bot, chatId, t(languageFor(link), 'control.runStatus', { runId: run.id, status: run.status }), { editMessageId });
    return;
  }
  if (action === 'approval_decide') {
    const result = await localApi(link.user_id, `/api/orchestration/workflows/approvals/${encodeURIComponent(payload.approvalId)}`, {
      method: 'POST',
      body: {
        allow: payload.allow === true,
        source: 'telegram',
      },
    });
    const lang = languageFor(link);
    await send(bot, chatId, t(lang, 'control.approvalDecided', {
      approvalId: payload.approvalId,
      status: payload.allow === true ? 'approved' : 'denied',
      runId: result?.runId || '',
    }), { editMessageId });
    return showApprovalQueue({ bot, chatId, link });
  }
  if (action === 'task_run') return runTaskMasterTask({ bot, chatId, link, taskId: payload.taskId });
  if (action === 'install_provider') return startCliInstall({ bot, chatId, link, provider: payload.provider });
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
