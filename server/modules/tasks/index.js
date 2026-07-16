import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';

import { providerAuthService } from '../providers/index.js';
import { resolveToolApproval } from '../../claude-sdk.js';
import { extractProjectDirectory } from '../../projects.js';
import { userHasProjectPathAccess } from '../../services/platformization.js';
import {
  abortTaskProviderRun,
  executeTaskWithProvider,
  getTaskProviderId,
} from '../../services/task-runtime.js';

/**
 * PixBot — Tasks module reborn as a chat-first local agent operator.
 *
 * Scope (intentional): only this module + Tasks UI. Rest of Pixcode is untouched.
 * Flow: user chats → bot proposes task/cron → user approves → CLI runs in background
 * → status/logs persist → bot reports analysis when done → crons auto-fire.
 */

const TASKS_FILE = process.env.PIXCODE_TASKS_PATH || path.join(os.homedir(), '.pixcode', 'tasks.json');
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ACTIVE_STATES = new Set(['RUNNING', 'AWAITING_INPUT']);
const VALID_AGENTS = new Set(['claude-code', 'cursor', 'codex', 'gemini', 'qwen', 'opencode']);
const VALID_ROLES = new Set(['backend', 'frontend', 'fullstack', 'reviewer', 'tester', 'custom']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_RECURRENCES = new Set(['none', 'hourly', 'daily', 'weekly']);
const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const MAX_LOGS_PER_TASK = 2000;
const MAX_MESSAGES_PER_CONVERSATION = 400;

const ROLES = [
  { value: 'fullstack', label: 'Full stack', description: 'Plan and implement across the workspace.', defaultAgent: 'opencode' },
  { value: 'backend', label: 'Backend', description: 'Focus on server, data, and API work.', defaultAgent: 'codex' },
  { value: 'frontend', label: 'Frontend', description: 'Focus on UI, accessibility, and responsive behavior.', defaultAgent: 'claude-code' },
  { value: 'reviewer', label: 'Reviewer', description: 'Inspect changes and report risks.', defaultAgent: 'codex' },
  { value: 'tester', label: 'Tester', description: 'Run checks and repair failures.', defaultAgent: 'gemini' },
  { value: 'custom', label: 'Custom', description: 'Follow the task prompt without a preset specialty.', defaultAgent: 'opencode' },
];

const AGENTS = [
  { value: 'claude-code', provider: 'claude', label: 'Claude Code' },
  { value: 'codex', provider: 'codex', label: 'OpenAI Codex' },
  { value: 'cursor', provider: 'cursor', label: 'Cursor CLI' },
  { value: 'gemini', provider: 'gemini', label: 'Gemini CLI' },
  { value: 'qwen', provider: 'qwen', label: 'Qwen Code' },
  { value: 'opencode', provider: 'opencode', label: 'OpenCode' },
];

let state = loadState();
let schedulerTimer = null;
let schedulerBusy = false;
const eventClients = new Set();

function emptyState() {
  return {
    version: 2,
    tasks: [],
    logs: [],
    interactions: [],
    conversations: [],
    messages: [],
    proposals: [],
    crons: [],
  };
}

function loadState() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const loaded = {
      version: 2,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      crons: Array.isArray(parsed.crons) ? parsed.crons : [],
    };
    const now = new Date().toISOString();
    for (const task of loaded.tasks) {
      if (ACTIVE_STATES.has(task.status)) {
        task.status = 'FAILED';
        task.error = 'Pixcode restarted while this task was running.';
        task.completedAt = now;
      }
    }
    return loaded;
  } catch (error) {
    console.error('[PixBot] Failed to load state:', error?.message || error);
    return emptyState();
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
  const temporaryPath = `${TASKS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
  try {
    fs.renameSync(temporaryPath, TASKS_FILE);
  } catch {
    fs.copyFileSync(temporaryPath, TASKS_FILE);
    try { fs.unlinkSync(temporaryPath); } catch { /* ignore */ }
  }
}

function publicTask(task) {
  const visible = { ...task };
  delete visible.userId;
  delete visible.projectPath;
  delete visible.recurrenceSpawned;
  return visible;
}

function publicProposal(proposal) {
  const visible = { ...proposal };
  delete visible.userId;
  delete visible.projectPath;
  return visible;
}

function publicCron(cron) {
  const visible = { ...cron };
  delete visible.userId;
  delete visible.projectPath;
  return visible;
}

function publicConversation(conversation) {
  const visible = { ...conversation };
  delete visible.userId;
  return visible;
}

function publicMessage(message) {
  return { ...message };
}

function taskForUser(taskId, userId) {
  return state.tasks.find((task) => task.id === taskId && String(task.userId) === String(userId)) || null;
}

function conversationForUser(conversationId, userId) {
  return state.conversations.find((entry) => entry.id === conversationId && String(entry.userId) === String(userId)) || null;
}

function emitUserEvent(userId, type, payload = {}) {
  const body = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const client of eventClients) {
    if (String(client.userId) !== String(userId)) continue;
    try {
      client.response.write(body);
    } catch {
      // drop broken SSE clients
    }
  }
}

function emitTaskEvent(type, taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  emitUserEvent(task.userId, type, { task: publicTask(task) });
}

function updateTask(task, patch, eventType = 'task:status') {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  saveState();
  emitTaskEvent(eventType, task.id);
}

function addLog(taskId, level, message) {
  const log = {
    id: crypto.randomUUID(),
    taskId,
    level,
    message: String(message || ''),
    timestamp: new Date().toISOString(),
  };
  state.logs.push(log);
  const taskLogs = state.logs.filter((entry) => entry.taskId === taskId);
  if (taskLogs.length > MAX_LOGS_PER_TASK) {
    const removeIds = new Set(taskLogs.slice(0, taskLogs.length - MAX_LOGS_PER_TASK).map((entry) => entry.id));
    state.logs = state.logs.filter((entry) => !removeIds.has(entry.id));
  }
  saveState();
  emitTaskEvent('task:log', taskId);
  return log;
}

function nextScheduledAt(value, recurrence) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  if (recurrence === 'hourly') date.setHours(date.getHours() + 1);
  if (recurrence === 'daily') date.setDate(date.getDate() + 1);
  if (recurrence === 'weekly') date.setDate(date.getDate() + 7);
  return date.toISOString();
}

function enqueueRecurringCopy(task) {
  if (!task.recurrence || task.recurrence === 'none' || task.recurrenceSpawned) return;
  if (task.status === 'FAILED' || task.status === 'CANCELLED') return;
  const scheduledAt = nextScheduledAt(task.scheduledAt || task.createdAt, task.recurrence);
  if (!scheduledAt) return;
  task.recurrenceSpawned = true;
  state.tasks.push({
    ...task,
    id: crypto.randomUUID(),
    status: 'PENDING',
    scheduledAt,
    sessionId: task.continueSession ? task.sessionId : undefined,
    result: undefined,
    summary: undefined,
    error: undefined,
    costUsd: 0,
    tokenCount: { input: 0, output: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: undefined,
    completedAt: undefined,
    recurrenceSpawned: false,
  });
  saveState();
}

function pushBotMessage(conversation, content, extra = {}) {
  const message = {
    id: crypto.randomUUID(),
    conversationId: conversation.id,
    role: 'assistant',
    content: String(content || ''),
    createdAt: new Date().toISOString(),
    ...extra,
  };
  state.messages.push(message);
  const convMessages = state.messages.filter((entry) => entry.conversationId === conversation.id);
  if (convMessages.length > MAX_MESSAGES_PER_CONVERSATION) {
    const keep = new Set(convMessages.slice(-MAX_MESSAGES_PER_CONVERSATION).map((entry) => entry.id));
    state.messages = state.messages.filter((entry) => entry.conversationId !== conversation.id || keep.has(entry.id));
  }
  conversation.updatedAt = message.createdAt;
  saveState();
  emitUserEvent(conversation.userId, 'bot:message', {
    conversation: publicConversation(conversation),
    message: publicMessage(message),
  });
  return message;
}

function analyzeTaskOutcome(task) {
  const lines = [];
  lines.push(`**${task.title}** → \`${task.status}\``);
  lines.push(`CLI: \`${task.agentType}\`${task.model ? ` · model \`${task.model}\`` : ''}`);
  if (task.status === 'COMPLETED') {
    lines.push('Outcome: finished successfully. I reviewed the agent transcript end-state.');
    const summary = String(task.summary || task.result || '').trim();
    if (summary) {
      const clipped = summary.length > 1200 ? `${summary.slice(0, 1200)}…` : summary;
      lines.push('');
      lines.push(clipped);
    } else {
      lines.push('No text summary was returned by the CLI; check activity logs for tool output.');
    }
    lines.push('');
    lines.push('Next: ask me to retry, open a follow-up, or schedule this as a cron.');
  } else if (task.status === 'FAILED') {
    lines.push(`Failure: ${task.error || 'unknown error'}`);
    lines.push('I did **not** mark this as done. Say “retry” to re-queue, or describe a fix and I will propose a follow-up task.');
  } else if (task.status === 'CANCELLED') {
    lines.push('Cancelled by user. Nothing else will run for this job unless you ask again.');
  }
  return lines.join('\n');
}

function notifyConversationAboutTask(task) {
  if (!task.conversationId) return;
  const conversation = state.conversations.find((entry) => entry.id === task.conversationId);
  if (!conversation) return;
  pushBotMessage(conversation, analyzeTaskOutcome(task), {
    kind: 'task-report',
    taskId: task.id,
    taskStatus: task.status,
  });
}

async function runTask(task) {
  updateTask(task, { status: 'RUNNING', startedAt: new Date().toISOString(), error: undefined });
  addLog(
    task.id,
    'info',
    `Task started · workspace=${task.projectId} · cli=${task.agentType}`
      + (task.model ? ` · model=${task.model}` : ' · model=auto')
      + ` · path=${task.projectPath}`,
  );

  try {
    const result = await executeTaskWithProvider(task, {
      onSession: (sessionId) => updateTask(task, { sessionId }),
      onLog: (level, message) => addLog(task.id, level, message),
      onInteraction: (input) => {
        const interaction = {
          id: crypto.randomUUID(),
          taskId: task.id,
          requestId: input.requestId || null,
          type: input.type || 'question',
          question: input.question,
          options: input.options || [],
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        state.interactions.push(interaction);
        updateTask(task, { status: 'AWAITING_INPUT' }, 'task:interaction');
        if (task.conversationId) {
          const conversation = state.conversations.find((entry) => entry.id === task.conversationId);
          if (conversation) {
            pushBotMessage(conversation, `Needs your input for **${task.title}**:\n${input.question}`, {
              kind: 'task-input',
              taskId: task.id,
              interactionId: interaction.id,
            });
          }
        }
      },
    });

    if (task.status === 'CANCELLED') {
      notifyConversationAboutTask(task);
      return;
    }
    if (result?.model && !task.model) {
      task.model = result.model;
    }
    updateTask(task, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      sessionId: result.sessionId || task.sessionId,
      model: result.model || task.model,
      result: result.result,
      summary: result.summary,
      tokenCount: result.tokenCount,
    }, 'task:completed');
    addLog(task.id, 'info', 'Task completed.');
    enqueueRecurringCopy(task);
    notifyConversationAboutTask(task);
  } catch (error) {
    if (task.status === 'CANCELLED') {
      notifyConversationAboutTask(task);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    updateTask(task, {
      status: 'FAILED',
      error: message,
      completedAt: new Date().toISOString(),
    }, 'task:failed');
    addLog(task.id, 'error', message);
    notifyConversationAboutTask(task);
  }
}

async function createTaskRecord(user, input, extras = {}) {
  const projectPath = extras.projectPath
    || await extractProjectDirectory(input.projectId).catch(() => null);
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw Object.assign(new Error('Project workspace could not be resolved. Select a workspace first.'), { status: 404 });
  }
  // Cron firings reuse a path already approved at schedule-time; skip live ACL when flagged.
  if (!extras.skipAccessCheck) {
    if (!userHasProjectPathAccess(user, { name: input.projectId, path: projectPath, fullPath: projectPath }, projectPath, 'chatAgents')) {
      throw Object.assign(new Error('Project access denied.'), { status: 403 });
    }
  }
  const { skipAccessCheck: _skipAccessCheck, projectPath: _projectPathExtra, ...safeExtras } = extras;
  extras = safeExtras;

  try {
    const status = await providerAuthService.getProviderAuthStatus(getTaskProviderId(input.agentType));
    if (status && status.installed === false) {
      throw Object.assign(
        new Error(`${input.agentType} CLI is not installed on this machine. Install it or pick another CLI.`),
        { status: 400 },
      );
    }
  } catch (error) {
    if (error?.status) throw error;
  }

  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    userId: user.id,
    projectPath,
    ...input,
    status: input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now() ? 'PENDING' : 'QUEUED',
    provider: getTaskProviderId(input.agentType),
    costUsd: 0,
    tokenCount: { input: 0, output: 0 },
    createdAt: now,
    updatedAt: now,
    ...safeExtras,
  };
  state.tasks.push(task);
  saveState();
  addLog(
    task.id,
    'info',
    (task.status === 'PENDING' ? `Scheduled for ${task.scheduledAt}. ` : 'Task queued. ')
      + `cli=${task.agentType}`
      + (task.model ? ` model=${task.model}` : ' model=auto')
      + (task.trigger ? ` trigger=${task.trigger}` : '')
      + '.',
  );
  emitTaskEvent('task:created', task.id);
  void schedulerTick();
  return task;
}

function detectRecurrence(text) {
  const lower = text.toLowerCase();
  if (/\b(every hour|hourly|her saat|saatlik)\b/i.test(lower)) return 'hourly';
  if (/\b(every day|daily|her gün|her gun|günlük|gunluk)\b/i.test(lower)) return 'daily';
  if (/\b(every week|weekly|her hafta|haftalık|haftalik)\b/i.test(lower)) return 'weekly';
  if (/\b(cron|schedule|zamanla|otomatik|automation|tekrar)\b/i.test(lower)) return 'daily';
  return 'none';
}

function detectAgent(text, fallback = 'opencode') {
  const lower = text.toLowerCase();
  if (/\b(claude|claude code)\b/.test(lower)) return 'claude-code';
  if (/\bcodex\b/.test(lower)) return 'codex';
  if (/\bcursor\b/.test(lower)) return 'cursor';
  if (/\bgemini\b/.test(lower)) return 'gemini';
  if (/\bqwen\b/.test(lower)) return 'qwen';
  if (/\b(opencode|open code|free model|zen)\b/.test(lower)) return 'opencode';
  return VALID_AGENTS.has(fallback) ? fallback : 'opencode';
}

function detectRole(text) {
  const lower = text.toLowerCase();
  if (/\b(frontend|ui|css|react|tailwind)\b/.test(lower)) return 'frontend';
  if (/\b(backend|api|server|database|db)\b/.test(lower)) return 'backend';
  if (/\b(review|audit|inspect)\b/.test(lower)) return 'reviewer';
  if (/\b(test|qa|spec|e2e)\b/.test(lower)) return 'tester';
  return 'fullstack';
}

function titleFromPrompt(prompt) {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled job';
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}…` : cleaned;
}

function buildProposalsFromMessage({ userId, conversationId, projectId, projectPath, text, agentType, model }) {
  const recurrence = detectRecurrence(text);
  const agent = detectAgent(text, agentType);
  const role = detectRole(text);
  const title = titleFromPrompt(text);
  const proposals = [];

  const wantsCronOnly = /\b(sadece cron|only cron|sadece zamanla|just schedule)\b/i.test(text);
  const wantsTask = !wantsCronOnly;

  if (wantsTask) {
    proposals.push({
      id: crypto.randomUUID(),
      userId,
      conversationId,
      projectId,
      projectPath,
      kind: 'task',
      status: 'pending',
      title,
      prompt: text,
      agentType: agent,
      model: model || undefined,
      role,
      priority: 'normal',
      permissionMode: 'acceptEdits',
      recurrence: 'none',
      createdAt: new Date().toISOString(),
    });
  }

  if (recurrence !== 'none') {
    proposals.push({
      id: crypto.randomUUID(),
      userId,
      conversationId,
      projectId,
      projectPath,
      kind: 'cron',
      status: 'pending',
      title: `Cron: ${title}`,
      prompt: text,
      agentType: agent,
      model: model || undefined,
      role,
      priority: 'normal',
      permissionMode: 'acceptEdits',
      recurrence,
      createdAt: new Date().toISOString(),
    });
  }

  if (proposals.length === 0) {
    proposals.push({
      id: crypto.randomUUID(),
      userId,
      conversationId,
      projectId,
      projectPath,
      kind: 'task',
      status: 'pending',
      title,
      prompt: text,
      agentType: agent,
      model: model || undefined,
      role,
      priority: 'normal',
      permissionMode: 'acceptEdits',
      recurrence: 'none',
      createdAt: new Date().toISOString(),
    });
  }

  return proposals;
}

function botReplyForProposals(proposals, projectId) {
  const lines = [
    'I drafted work for your approval. Nothing runs until you accept.',
    `Workspace: \`${projectId || 'none'}\``,
    '',
  ];
  for (const proposal of proposals) {
    if (proposal.kind === 'cron') {
      lines.push(`• **Cron** (${proposal.recurrence}) — ${proposal.title}`);
      lines.push(`  CLI \`${proposal.agentType}\` · role \`${proposal.role}\``);
    } else {
      lines.push(`• **Task** — ${proposal.title}`);
      lines.push(`  CLI \`${proposal.agentType}\` · role \`${proposal.role}\``);
    }
  }
  lines.push('');
  lines.push('Approve to queue, or reject / edit by telling me what to change.');
  lines.push('Tips: “retry last”, “cancel running”, “list crons”, “status”.');
  return lines.join('\n');
}

function handleMetaCommand(text, userId, conversation, projectId) {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;

  if (/^(status|durum|ne oluyor|what('?s| is) running)\b/.test(lower)) {
    const mine = state.tasks.filter((task) => String(task.userId) === String(userId));
    const active = mine.filter((task) => !TERMINAL_STATES.has(task.status));
    const recent = mine.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 8);
    const lines = [
      `Active jobs: **${active.length}**`,
      ...active.map((task) => `• \`${task.status}\` ${task.title} (${task.agentType})`),
      '',
      'Recent:',
      ...recent.map((task) => `• \`${task.status}\` ${task.title}`),
    ];
    return lines.join('\n');
  }

  if (/^(list crons|cronlar|crons)\b/.test(lower)) {
    const crons = state.crons.filter((cron) => String(cron.userId) === String(userId) && (!projectId || cron.projectId === projectId));
    if (crons.length === 0) return 'No crons yet. Ask me to schedule something (e.g. “every day run tests”).';
    return crons.map((cron) => `• ${cron.enabled ? 'ON' : 'OFF'} \`${cron.recurrence}\` ${cron.title} → next ${cron.nextRunAt || '—'}`).join('\n');
  }

  if (/^(cancel running|iptal|stop all)\b/.test(lower)) {
    const active = state.tasks.filter((task) => String(task.userId) === String(userId) && !TERMINAL_STATES.has(task.status));
    for (const task of active) {
      updateTask(task, { status: 'CANCELLED', completedAt: new Date().toISOString() }, 'task:cancelled');
      void abortTaskProviderRun(task.id).catch(() => false);
      addLog(task.id, 'warn', 'Cancelled via PixBot chat command.');
    }
    return active.length ? `Cancelled ${active.length} active job(s).` : 'Nothing active to cancel.';
  }

  if (/^(retry|tekrar|yeniden dene)\b/.test(lower)) {
    const failed = state.tasks
      .filter((task) => String(task.userId) === String(userId) && task.status === 'FAILED' && (!projectId || task.projectId === projectId))
      .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))[0];
    if (!failed) return 'No failed job to retry in this workspace.';
    const proposal = {
      id: crypto.randomUUID(),
      userId,
      conversationId: conversation.id,
      projectId: failed.projectId,
      projectPath: failed.projectPath,
      kind: 'task',
      status: 'pending',
      title: `Retry: ${failed.title}`,
      prompt: failed.prompt,
      agentType: failed.agentType,
      model: failed.model,
      role: failed.role || 'fullstack',
      priority: failed.priority || 'normal',
      permissionMode: failed.permissionMode || 'acceptEdits',
      recurrence: 'none',
      createdAt: new Date().toISOString(),
    };
    state.proposals.push(proposal);
    saveState();
    emitUserEvent(userId, 'bot:proposal', { proposal: publicProposal(proposal) });
    return `Proposed a retry for **${failed.title}**. Approve to re-queue.`;
  }

  if (/^(help|yardım|yardim|\?)$/.test(lower)) {
    return [
      'I am **PixBot** — your local CLI operator inside Tasks.',
      '',
      '• Describe work → I propose a task (and cron if you mention schedule)',
      '• Approve / reject proposals in the side panel or say “approve all”',
      '• I run Claude/Codex/OpenCode/Gemini/Qwen/Cursor in the background',
      '• When a job ends I report success/failure and keep following up',
      '• Commands: `status`, `list crons`, `cancel running`, `retry`, `approve all`, `reject all`',
    ].join('\n');
  }

  return null;
}

async function approveProposal(proposal, user) {
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error('Proposal is already resolved.'), { status: 409 });
  }

  if (proposal.kind === 'cron') {
    const now = new Date().toISOString();
    const cron = {
      id: crypto.randomUUID(),
      userId: user.id,
      conversationId: proposal.conversationId,
      projectId: proposal.projectId,
      projectPath: proposal.projectPath,
      title: proposal.title,
      prompt: proposal.prompt,
      agentType: proposal.agentType,
      model: proposal.model,
      role: proposal.role || 'fullstack',
      priority: proposal.priority || 'normal',
      permissionMode: proposal.permissionMode || 'acceptEdits',
      recurrence: proposal.recurrence || 'daily',
      enabled: true,
      nextRunAt: nextScheduledAt(now, proposal.recurrence || 'daily'),
      lastRunAt: null,
      lastTaskId: null,
      createdAt: now,
      updatedAt: now,
    };
    state.crons.push(cron);
    proposal.status = 'approved';
    proposal.resolvedAt = now;
    proposal.cronId = cron.id;
    saveState();
    emitUserEvent(user.id, 'bot:cron', { cron: publicCron(cron) });
    emitUserEvent(user.id, 'bot:proposal', { proposal: publicProposal(proposal) });
    return { type: 'cron', cron, proposal };
  }

  const task = await createTaskRecord(user, {
    projectId: proposal.projectId,
    title: proposal.title,
    prompt: proposal.prompt,
    agentType: proposal.agentType,
    model: proposal.model,
    role: proposal.role || 'fullstack',
    priority: proposal.priority || 'normal',
    permissionMode: proposal.permissionMode || 'acceptEdits',
    recurrence: 'none',
  }, {
    conversationId: proposal.conversationId,
    proposalId: proposal.id,
    trigger: 'pixbot',
  });

  proposal.status = 'approved';
  proposal.resolvedAt = new Date().toISOString();
  proposal.taskId = task.id;
  saveState();
  emitUserEvent(user.id, 'bot:proposal', { proposal: publicProposal(proposal) });
  return { type: 'task', task, proposal };
}

function rejectProposal(proposal, reason = '') {
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error('Proposal is already resolved.'), { status: 409 });
  }
  proposal.status = 'rejected';
  proposal.resolvedAt = new Date().toISOString();
  proposal.rejectReason = reason || undefined;
  saveState();
  emitUserEvent(proposal.userId, 'bot:proposal', { proposal: publicProposal(proposal) });
  return proposal;
}

async function fireDueCrons(nowMs) {
  const due = state.crons.filter((cron) => cron.enabled && cron.nextRunAt && new Date(cron.nextRunAt).getTime() <= nowMs);
  for (const cron of due) {
    try {
      const user = { id: cron.userId };
      const task = await createTaskRecord(user, {
        projectId: cron.projectId,
        title: cron.title,
        prompt: cron.prompt,
        agentType: cron.agentType,
        model: cron.model,
        role: cron.role || 'fullstack',
        priority: cron.priority || 'normal',
        permissionMode: cron.permissionMode || 'acceptEdits',
        recurrence: 'none',
      }, {
        conversationId: cron.conversationId,
        cronId: cron.id,
        trigger: 'cron',
        projectPath: cron.projectPath,
        skipAccessCheck: true,
      });
      cron.lastRunAt = new Date().toISOString();
      cron.lastTaskId = task.id;
      cron.nextRunAt = nextScheduledAt(cron.lastRunAt, cron.recurrence);
      cron.updatedAt = cron.lastRunAt;
      saveState();
      emitUserEvent(cron.userId, 'bot:cron', { cron: publicCron(cron) });
      if (cron.conversationId) {
        const conversation = state.conversations.find((entry) => entry.id === cron.conversationId);
        if (conversation) {
          pushBotMessage(conversation, `Cron fired: **${cron.title}** → task queued (\`${task.id.slice(0, 8)}\`).`, {
            kind: 'cron-fire',
            cronId: cron.id,
            taskId: task.id,
          });
        }
      }
    } catch (error) {
      cron.updatedAt = new Date().toISOString();
      cron.lastError = error instanceof Error ? error.message : String(error);
      // push next slot so a broken cron does not tight-loop
      cron.nextRunAt = nextScheduledAt(new Date().toISOString(), cron.recurrence || 'hourly');
      saveState();
      console.error('[PixBot] cron fire failed:', cron.id, cron.lastError);
    }
  }
}

async function schedulerTick() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const now = Date.now();
    await fireDueCrons(now);

    for (const task of state.tasks) {
      if (task.status === 'PENDING' && (!task.scheduledAt || new Date(task.scheduledAt).getTime() <= now)) {
        updateTask(task, { status: 'QUEUED' });
      }
    }

    const maxParallel = Math.max(1, Number.parseInt(process.env.PIXCODE_TASK_CONCURRENCY || '2', 10) || 2);
    const running = state.tasks.filter((task) => ACTIVE_STATES.has(task.status)).length;
    const available = Math.max(0, maxParallel - running);
    const queued = state.tasks
      .filter((task) => task.status === 'QUEUED')
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const task of queued.slice(0, available)) {
      if (task.predecessorTaskId) {
        const predecessor = state.tasks.find((entry) => entry.id === task.predecessorTaskId);
        if (predecessor && !TERMINAL_STATES.has(predecessor.status)) continue;
        if (predecessor && predecessor.status !== 'COMPLETED') {
          updateTask(task, {
            status: 'FAILED',
            completedAt: new Date().toISOString(),
            error: `Predecessor task ended with ${predecessor.status}.`,
          }, 'task:failed');
          notifyConversationAboutTask(task);
          continue;
        }
        if (task.continueSession && predecessor?.sessionId) task.sessionId = predecessor.sessionId;
      }
      void runTask(task);
    }
  } finally {
    schedulerBusy = false;
  }
}

export const taskScheduler = {
  start() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => void schedulerTick(), 750);
    schedulerTimer.unref?.();
    void schedulerTick();
  },
  stop() {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
  },
};

function parseCreateInput(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
  const agentType = VALID_AGENTS.has(body?.agentType) ? body.agentType : 'opencode';
  if (!title || !prompt || !projectId) throw new Error('projectId, title, and prompt are required.');
  if (title.length > 200 || prompt.length > 100_000) throw new Error('Task title or prompt is too long.');

  const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledDate && Number.isNaN(scheduledDate.getTime())) throw new Error('scheduledAt is invalid.');

  return {
    projectId,
    title,
    prompt,
    agentType,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined,
    role: VALID_ROLES.has(body.role) ? body.role : 'fullstack',
    priority: VALID_PRIORITIES.has(body.priority) ? body.priority : 'normal',
    predecessorTaskId: typeof body.predecessorTaskId === 'string' ? body.predecessorTaskId : undefined,
    continueSession: Boolean(body.continueSession),
    maxBudgetUsd: Number.isFinite(Number(body.maxBudgetUsd)) ? Number(body.maxBudgetUsd) : undefined,
    thinkingEnabled: Boolean(body.thinkingEnabled),
    permissionMode: ['default', 'plan', 'acceptEdits', 'bypassPermissions', 'yolo', 'auto_edit'].includes(body.permissionMode)
      ? body.permissionMode
      : 'acceptEdits',
    scheduledAt: scheduledDate?.toISOString(),
    recurrence: VALID_RECURRENCES.has(body.recurrence) ? body.recurrence : 'none',
  };
}

export function taskRouter() {
  const router = express.Router();

  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const client = { userId: req.user.id, response: res };
    eventClients.add(client);
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    req.on('close', () => eventClients.delete(client));
  });

  router.get('/meta/roles', (_req, res) => res.json({ roles: ROLES }));
  router.get('/meta/agents', async (_req, res) => {
    const agents = await Promise.all(AGENTS.map(async (agent) => {
      try {
        const status = await providerAuthService.getProviderAuthStatus(agent.provider);
        return { ...agent, installed: status.installed, authenticated: status.authenticated };
      } catch {
        return { ...agent, installed: false, authenticated: false };
      }
    }));
    res.json({ agents });
  });

  // ── PixBot chat surface ──────────────────────────────────────────────
  router.get('/bot/conversations', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const conversations = state.conversations
      .filter((entry) => String(entry.userId) === String(req.user.id) && (!projectId || entry.projectId === projectId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .map(publicConversation);
    res.json({ conversations });
  });

  router.post('/bot/conversations', (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    if (!projectId) return res.status(400).json({ error: 'projectId is required.' });
    const now = new Date().toISOString();
    const conversation = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      projectId,
      title: typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : 'PixBot',
      createdAt: now,
      updatedAt: now,
    };
    state.conversations.push(conversation);
    saveState();
    pushBotMessage(conversation, [
      'Hey — I am **PixBot**, your local agent operator.',
      '',
      'Tell me what you need. I will propose tasks and crons; you approve before anything runs.',
      'I drive CLIs (OpenCode free, Claude, Codex, Gemini, Qwen, Cursor), watch them finish, and report back.',
      '',
      'Example: “every day run tests and summarize failures” or “fix the login bug with OpenCode”.',
    ].join('\n'), { kind: 'system' });
    res.status(201).json({ conversation: publicConversation(conversation) });
  });

  router.get('/bot/conversations/:conversationId/messages', (req, res) => {
    const conversation = conversationForUser(req.params.conversationId, req.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    const messages = state.messages
      .filter((entry) => entry.conversationId === conversation.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(publicMessage);
    res.json({ messages });
  });

  router.post('/bot/chat', async (req, res) => {
    try {
      const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!text) return res.status(400).json({ error: 'message is required.' });
      if (text.length > 100_000) return res.status(400).json({ error: 'message is too long.' });

      let conversation = req.body?.conversationId
        ? conversationForUser(req.body.conversationId, req.user.id)
        : null;

      const projectId = typeof req.body?.projectId === 'string' && req.body.projectId.trim()
        ? req.body.projectId.trim()
        : conversation?.projectId;

      if (!projectId) {
        return res.status(400).json({ error: 'Select a workspace, then chat with PixBot.' });
      }

      const projectPath = await extractProjectDirectory(projectId).catch(() => null);
      if (!projectPath || !fs.existsSync(projectPath)) {
        return res.status(404).json({ error: 'Project workspace could not be resolved.' });
      }
      if (!userHasProjectPathAccess(req.user, { name: projectId, path: projectPath, fullPath: projectPath }, projectPath, 'chatAgents')) {
        return res.status(403).json({ error: 'Project access denied.' });
      }

      if (!conversation) {
        const now = new Date().toISOString();
        conversation = {
          id: crypto.randomUUID(),
          userId: req.user.id,
          projectId,
          title: titleFromPrompt(text),
          createdAt: now,
          updatedAt: now,
        };
        state.conversations.push(conversation);
      }

      const userMessage = {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(userMessage);
      conversation.updatedAt = userMessage.createdAt;
      if (conversation.title === 'PixBot') conversation.title = titleFromPrompt(text);
      saveState();
      emitUserEvent(req.user.id, 'bot:message', {
        conversation: publicConversation(conversation),
        message: publicMessage(userMessage),
      });

      const lower = text.trim().toLowerCase();
      if (/^(approve all|hepsini onayla|onayla hepsi)\b/.test(lower)) {
        const pending = state.proposals.filter((entry) => entry.status === 'pending' && String(entry.userId) === String(req.user.id) && entry.conversationId === conversation.id);
        const results = [];
        for (const proposal of pending) {
          results.push(await approveProposal(proposal, req.user));
        }
        const reply = pending.length
          ? `Approved ${pending.length} proposal(s). Jobs are queued; I will report when each CLI finishes.`
          : 'No pending proposals to approve.';
        const botMessage = pushBotMessage(conversation, reply, { kind: 'system' });
        return res.json({
          conversation: publicConversation(conversation),
          messages: [publicMessage(userMessage), publicMessage(botMessage)],
          proposals: [],
        });
      }

      if (/^(reject all|hepsini reddet)\b/.test(lower)) {
        const pending = state.proposals.filter((entry) => entry.status === 'pending' && String(entry.userId) === String(req.user.id) && entry.conversationId === conversation.id);
        for (const proposal of pending) rejectProposal(proposal, 'bulk reject');
        const botMessage = pushBotMessage(conversation, pending.length ? `Rejected ${pending.length} proposal(s).` : 'No pending proposals.', { kind: 'system' });
        return res.json({
          conversation: publicConversation(conversation),
          messages: [publicMessage(userMessage), publicMessage(botMessage)],
          proposals: [],
        });
      }

      const meta = handleMetaCommand(text, req.user.id, conversation, projectId);
      if (meta) {
        const botMessage = pushBotMessage(conversation, meta, { kind: 'system' });
        return res.json({
          conversation: publicConversation(conversation),
          messages: [publicMessage(userMessage), publicMessage(botMessage)],
          proposals: [],
        });
      }

      const agentType = VALID_AGENTS.has(req.body?.agentType) ? req.body.agentType : 'opencode';
      const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : undefined;
      const proposals = buildProposalsFromMessage({
        userId: req.user.id,
        conversationId: conversation.id,
        projectId,
        projectPath,
        text,
        agentType,
        model,
      });
      state.proposals.push(...proposals);
      saveState();
      for (const proposal of proposals) {
        emitUserEvent(req.user.id, 'bot:proposal', { proposal: publicProposal(proposal) });
      }
      const botMessage = pushBotMessage(conversation, botReplyForProposals(proposals, projectId), {
        kind: 'proposals',
        proposalIds: proposals.map((entry) => entry.id),
      });

      res.json({
        conversation: publicConversation(conversation),
        messages: [publicMessage(userMessage), publicMessage(botMessage)],
        proposals: proposals.map(publicProposal),
      });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/proposals', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const proposals = state.proposals
      .filter((entry) => String(entry.userId) === String(req.user.id)
        && (status === 'all' || entry.status === status)
        && (!projectId || entry.projectId === projectId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(publicProposal);
    res.json({ proposals });
  });

  router.post('/bot/proposals/:proposalId/approve', async (req, res) => {
    try {
      const proposal = state.proposals.find((entry) => entry.id === req.params.proposalId && String(entry.userId) === String(req.user.id));
      if (!proposal) return res.status(404).json({ error: 'Proposal not found.' });
      const result = await approveProposal(proposal, req.user);
      if (proposal.conversationId) {
        const conversation = conversationForUser(proposal.conversationId, req.user.id);
        if (conversation) {
          const text = result.type === 'cron'
            ? `Cron **${result.cron.title}** is ON (\`${result.cron.recurrence}\`). Next run: ${result.cron.nextRunAt}.`
            : `Task **${result.task.title}** queued. I will watch the CLI and report when it finishes.`;
          pushBotMessage(conversation, text, {
            kind: 'proposal-approved',
            proposalId: proposal.id,
            taskId: result.task?.id,
            cronId: result.cron?.id,
          });
        }
      }
      res.json({
        proposal: publicProposal(proposal),
        task: result.task ? publicTask(result.task) : undefined,
        cron: result.cron ? publicCron(result.cron) : undefined,
      });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/proposals/:proposalId/reject', (req, res) => {
    try {
      const proposal = state.proposals.find((entry) => entry.id === req.params.proposalId && String(entry.userId) === String(req.user.id));
      if (!proposal) return res.status(404).json({ error: 'Proposal not found.' });
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      rejectProposal(proposal, reason);
      if (proposal.conversationId) {
        const conversation = conversationForUser(proposal.conversationId, req.user.id);
        if (conversation) {
          pushBotMessage(conversation, `Rejected proposal: **${proposal.title}**.${reason ? ` (${reason})` : ''}`, {
            kind: 'proposal-rejected',
            proposalId: proposal.id,
          });
        }
      }
      res.json({ proposal: publicProposal(proposal) });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/crons', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const crons = state.crons
      .filter((cron) => String(cron.userId) === String(req.user.id) && (!projectId || cron.projectId === projectId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .map(publicCron);
    res.json({ crons });
  });

  router.post('/bot/crons/:cronId/toggle', (req, res) => {
    const cron = state.crons.find((entry) => entry.id === req.params.cronId && String(entry.userId) === String(req.user.id));
    if (!cron) return res.status(404).json({ error: 'Cron not found.' });
    cron.enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !cron.enabled;
    cron.updatedAt = new Date().toISOString();
    if (cron.enabled && !cron.nextRunAt) {
      cron.nextRunAt = nextScheduledAt(new Date().toISOString(), cron.recurrence || 'daily');
    }
    saveState();
    emitUserEvent(req.user.id, 'bot:cron', { cron: publicCron(cron) });
    res.json({ cron: publicCron(cron) });
  });

  router.delete('/bot/crons/:cronId', (req, res) => {
    const cron = state.crons.find((entry) => entry.id === req.params.cronId && String(entry.userId) === String(req.user.id));
    if (!cron) return res.status(404).json({ error: 'Cron not found.' });
    state.crons = state.crons.filter((entry) => entry.id !== cron.id);
    saveState();
    emitUserEvent(req.user.id, 'bot:cron', { cron: { ...publicCron(cron), deleted: true } });
    res.status(204).end();
  });

  // ── Classic task REST (kept for compatibility) ───────────────────────
  router.get('/', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '100'), 10) || 100));
    const tasks = state.tasks
      .filter((task) => String(task.userId) === String(req.user.id) && (!projectId || task.projectId === projectId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map(publicTask);
    const pendingApprovals = state.proposals
      .filter((entry) => entry.status === 'pending' && String(entry.userId) === String(req.user.id) && (!projectId || entry.projectId === projectId))
      .map(publicProposal);
    res.json({ tasks, pendingApprovals });
  });

  router.post('/', async (req, res) => {
    try {
      const input = parseCreateInput(req.body);
      const task = await createTaskRecord(req.user, input, { trigger: 'api' });
      res.status(201).json({ task: publicTask(task) });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/:taskId', (req, res) => {
    const task = taskForUser(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json({ task: publicTask(task) });
  });

  router.get('/:taskId/logs', (req, res) => {
    const task = taskForUser(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const limit = Math.min(2000, Math.max(1, Number.parseInt(String(req.query.limit || '500'), 10) || 500));
    res.json({ logs: state.logs.filter((log) => log.taskId === task.id).slice(-limit) });
  });

  router.get('/:taskId/interactions', (req, res) => {
    const task = taskForUser(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json({ interactions: state.interactions.filter((interaction) => interaction.taskId === task.id && interaction.status === 'pending') });
  });

  router.post('/interactions/:interactionId/answer', (req, res) => {
    const interaction = state.interactions.find((entry) => entry.id === req.params.interactionId);
    const task = interaction ? taskForUser(interaction.taskId, req.user.id) : null;
    if (!interaction || !task) return res.status(404).json({ error: 'Interaction not found.' });
    if (interaction.status !== 'pending') return res.status(409).json({ error: 'Interaction is already resolved.' });
    const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
    if (!answer) return res.status(400).json({ error: 'answer is required.' });
    interaction.answer = answer;
    interaction.status = 'answered';
    interaction.answeredAt = new Date().toISOString();
    if (interaction.type === 'permission' && interaction.requestId) {
      resolveToolApproval(interaction.requestId, {
        allow: /^allow|yes|evet|izin/i.test(answer),
        message: answer,
      });
    }
    updateTask(task, { status: 'RUNNING' }, 'task:interaction-answered');
    res.json({ interaction });
  });

  router.post('/:taskId/cancel', async (req, res) => {
    const task = taskForUser(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (TERMINAL_STATES.has(task.status)) return res.status(409).json({ error: `Task is already ${task.status}.` });
    updateTask(task, { status: 'CANCELLED', completedAt: new Date().toISOString() }, 'task:cancelled');
    await abortTaskProviderRun(task.id).catch(() => false);
    addLog(task.id, 'warn', 'Task cancelled by user.');
    notifyConversationAboutTask(task);
    res.json({ task: publicTask(task) });
  });

  router.post('/:taskId/retry', async (req, res) => {
    try {
      const task = taskForUser(req.params.taskId, req.user.id);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (!TERMINAL_STATES.has(task.status)) return res.status(409).json({ error: 'Cancel or wait for the task to finish before retrying.' });
      const retry = await createTaskRecord(req.user, {
        projectId: task.projectId,
        title: task.title,
        prompt: task.prompt,
        agentType: task.agentType,
        model: task.model,
        role: task.role || 'fullstack',
        priority: task.priority || 'normal',
        permissionMode: task.permissionMode || 'acceptEdits',
        recurrence: 'none',
        continueSession: Boolean(req.body?.continueSession),
      }, {
        conversationId: task.conversationId,
        predecessorTaskId: task.id,
        trigger: 'retry',
      });
      res.status(201).json({ task: publicTask(retry) });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.delete('/:taskId', (req, res) => {
    const task = taskForUser(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (!TERMINAL_STATES.has(task.status)) return res.status(409).json({ error: 'Cancel the task before deleting it.' });
    state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
    state.logs = state.logs.filter((entry) => entry.taskId !== task.id);
    state.interactions = state.interactions.filter((entry) => entry.taskId !== task.id);
    saveState();
    res.status(204).end();
  });

  return router;
}
