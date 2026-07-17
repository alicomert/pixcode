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
import {
  buildAdaptiveRecoveryStep,
  buildAutoPlan,
  detectAgent,
  detectRole,
  formatPlanPreview,
  titleFromPrompt,
  VALID_AGENTS as PLAN_AGENTS,
} from './auto-plan.js';
import {
  cronMatches,
  describeCron,
  detectScheduleIntent,
  isValidCronExpression,
  nextCronOccurrence,
  recurrenceToCron,
} from './cron-engine.js';

/**
 * PixBot — full-screen auto-planner + cron scheduler.
 * Chat → multi-step plan (+ optional cron) → approve → DAG of CLI tasks via task-runtime.
 */

const TASKS_FILE = process.env.PIXCODE_TASKS_PATH || path.join(os.homedir(), '.pixcode', 'tasks.json');
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ACTIVE_STATES = new Set(['RUNNING', 'AWAITING_INPUT']);
const VALID_AGENTS = PLAN_AGENTS;
const VALID_ROLES = new Set(['backend', 'frontend', 'fullstack', 'reviewer', 'tester', 'custom']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_RECURRENCES = new Set(['none', 'hourly', 'daily', 'weekly']);
const VALID_AUTONOMY = new Set(['supervised', 'auto']);
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
    version: 3,
    tasks: [],
    logs: [],
    interactions: [],
    conversations: [],
    messages: [],
    proposals: [],
    crons: [],
    plans: [],
  };
}

function loadState() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const loaded = {
      version: 3,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      crons: Array.isArray(parsed.crons) ? parsed.crons : [],
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
    };
    const now = new Date().toISOString();
    for (const task of loaded.tasks) {
      if (ACTIVE_STATES.has(task.status)) {
        task.status = 'FAILED';
        task.error = 'Pixcode restarted while this task was running.';
        task.completedAt = now;
      }
      if (!Array.isArray(task.dependsOnTaskIds)) task.dependsOnTaskIds = [];
    }
    for (const cron of loaded.crons) {
      if (!cron.cronExpression) {
        cron.cronExpression = recurrenceToCron(cron.recurrence) || '0 9 * * *';
      }
      if (!VALID_AUTONOMY.has(cron.autonomyLevel)) cron.autonomyLevel = 'supervised';
      if (!cron.nextRunAt && cron.enabled) {
        cron.nextRunAt = nextCronOccurrence(cron.cronExpression, new Date());
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

function publicPlan(plan) {
  const visible = { ...plan };
  delete visible.userId;
  delete visible.projectPath;
  return visible;
}

function taskForUser(taskId, userId) {
  return state.tasks.find((task) => task.id === taskId && String(task.userId) === String(userId)) || null;
}

function conversationForUser(conversationId, userId) {
  return state.conversations.find((entry) => entry.id === conversationId && String(entry.userId) === String(userId)) || null;
}

function planForUser(planId, userId) {
  return state.plans.find((entry) => entry.id === planId && String(entry.userId) === String(userId)) || null;
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
  if (task.planId) lines.push(`Plan step: \`${task.planStepId || '?'}\` · plan \`${task.planId.slice(0, 8)}\``);
  if (task.status === 'COMPLETED') {
    lines.push('Outcome: finished successfully.');
    const summary = String(task.summary || task.result || '').trim();
    if (summary) {
      const clipped = summary.length > 1200 ? `${summary.slice(0, 1200)}…` : summary;
      lines.push('');
      lines.push(clipped);
    }
  } else if (task.status === 'FAILED') {
    lines.push(`Failure: ${task.error || 'unknown error'}`);
    lines.push('Say “retry” or describe a fix — I can adapt the remaining plan.');
  } else if (task.status === 'CANCELLED') {
    lines.push('Cancelled by user.');
  }
  return lines.join('\n');
}

function refreshPlanStatus(planId) {
  const plan = state.plans.find((entry) => entry.id === planId);
  if (!plan) return;
  const planTasks = state.tasks.filter((task) => task.planId === planId);
  for (const step of plan.steps) {
    const task = planTasks.find((entry) => entry.planStepId === step.id);
    if (!task) continue;
    if (task.status === 'COMPLETED') step.status = 'completed';
    else if (task.status === 'FAILED') step.status = 'failed';
    else if (task.status === 'CANCELLED') step.status = 'skipped';
    else if (ACTIVE_STATES.has(task.status) || task.status === 'QUEUED' || task.status === 'PENDING') step.status = 'running';
    step.taskId = task.id;
  }
  const statuses = plan.steps.map((step) => step.status);
  if (statuses.every((status) => status === 'completed')) {
    plan.status = 'completed';
    plan.finishedAt = new Date().toISOString();
  } else if (statuses.some((status) => status === 'failed') && !statuses.some((status) => status === 'running' || status === 'pending')) {
    plan.status = 'failed';
    plan.finishedAt = new Date().toISOString();
  } else if (statuses.some((status) => status === 'running' || status === 'completed')) {
    plan.status = 'running';
  }
  plan.updatedAt = new Date().toISOString();
  saveState();
  emitUserEvent(plan.userId, 'bot:plan', { plan: publicPlan(plan) });
}

function maybeReportPlanComplete(plan) {
  if (!plan || (plan.status !== 'completed' && plan.status !== 'failed')) return;
  if (plan.reportSent) return;
  plan.reportSent = true;
  saveState();
  const planTasks = state.tasks.filter((task) => task.planId === plan.id);
  const lines = [
    `## Plan report: **${plan.title}**`,
    `Status: \`${plan.status}\``,
    '',
  ];
  for (const step of plan.steps) {
    const task = planTasks.find((entry) => entry.planStepId === step.id);
    const duration = task?.startedAt && task?.completedAt
      ? `${Math.round((new Date(task.completedAt) - new Date(task.startedAt)) / 1000)}s`
      : '—';
    lines.push(`• **${step.id}** ${step.title} → \`${step.status}\` · \`${step.agentType}\` · ${duration}`);
    if (task?.error) lines.push(`  error: ${task.error}`);
  }
  if (plan.conversationId) {
    const conversation = state.conversations.find((entry) => entry.id === plan.conversationId);
    if (conversation) {
      pushBotMessage(conversation, lines.join('\n'), {
        kind: 'plan-report',
        planId: plan.id,
      });
    }
  }
}

function notifyConversationAboutTask(task) {
  if (task.planId) {
    refreshPlanStatus(task.planId);
    const plan = state.plans.find((entry) => entry.id === task.planId);
    if (task.status === 'FAILED' && plan && plan.autonomyLevel === 'supervised' && plan.conversationId) {
      const conversation = state.conversations.find((entry) => entry.id === plan.conversationId);
      if (conversation) {
        const recovery = buildAdaptiveRecoveryStep(
          plan.steps.find((step) => step.id === task.planStepId) || {
            id: task.planStepId || 'step',
            title: task.title,
            description: task.prompt,
            agentType: task.agentType,
            role: task.role,
          },
          task.error,
        );
        const proposal = {
          id: crypto.randomUUID(),
          userId: task.userId,
          conversationId: plan.conversationId,
          projectId: task.projectId,
          projectPath: task.projectPath,
          kind: 'plan',
          status: 'pending',
          title: recovery.title,
          prompt: recovery.description,
          agentType: recovery.agentType,
          model: recovery.model,
          role: recovery.role,
          priority: 'high',
          permissionMode: task.permissionMode || 'acceptEdits',
          autonomyLevel: 'supervised',
          planSteps: [recovery],
          adaptiveForPlanId: plan.id,
          createdAt: new Date().toISOString(),
        };
        state.proposals.push(proposal);
        saveState();
        emitUserEvent(task.userId, 'bot:proposal', { proposal: publicProposal(proposal) });
        pushBotMessage(conversation, [
          analyzeTaskOutcome(task),
          '',
          'I drafted an **adaptive recovery step**. Approve to continue the plan, or tell me a different fix.',
        ].join('\n'), {
          kind: 'task-report',
          taskId: task.id,
          taskStatus: task.status,
          proposalIds: [proposal.id],
        });
        maybeReportPlanComplete(plan);
        return;
      }
    }
    if (plan) maybeReportPlanComplete(plan);
  }

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
  if (!extras.skipAccessCheck) {
    if (!userHasProjectPathAccess(user, { name: input.projectId, path: projectPath, fullPath: projectPath }, projectPath, 'chatAgents')) {
      throw Object.assign(new Error('Project access denied.'), { status: 403 });
    }
  }
  const { skipAccessCheck: _skipAccessCheck, projectPath: _projectPathExtra, ...safeExtras } = extras;

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
    dependsOnTaskIds: Array.isArray(input.dependsOnTaskIds) ? input.dependsOnTaskIds : [],
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
      + (task.planId ? ` plan=${task.planId.slice(0, 8)}` : '')
      + '.',
  );
  emitTaskEvent('task:created', task.id);
  void schedulerTick();
  return task;
}

function dependenciesSatisfied(task) {
  const deps = Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : [];
  if (task.predecessorTaskId && !deps.includes(task.predecessorTaskId)) {
    deps.push(task.predecessorTaskId);
  }
  for (const depId of deps) {
    const predecessor = state.tasks.find((entry) => entry.id === depId);
    if (!predecessor) continue;
    if (!TERMINAL_STATES.has(predecessor.status)) return false;
    if (predecessor.status !== 'COMPLETED') {
      return 'failed';
    }
  }
  return true;
}

function buildProposalsFromMessage({
  userId,
  conversationId,
  projectId,
  projectPath,
  text,
  agentType,
  model,
  autonomyLevel,
}) {
  const schedule = detectScheduleIntent(text);
  const plan = buildAutoPlan(text, {
    defaultAgent: agentType,
    defaultModel: model,
    autonomyLevel: autonomyLevel || 'supervised',
  });
  const proposals = [];

  const wantsCronOnly = /\b(sadece cron|only cron|sadece zamanla|just schedule)\b/i.test(text);
  if (!wantsCronOnly) {
    proposals.push({
      id: crypto.randomUUID(),
      userId,
      conversationId,
      projectId,
      projectPath,
      kind: 'plan',
      status: 'pending',
      title: plan.title,
      prompt: plan.prompt,
      agentType: plan.defaultAgent,
      model: plan.defaultModel,
      role: detectRole(text),
      priority: 'normal',
      permissionMode: 'acceptEdits',
      autonomyLevel: plan.autonomyLevel,
      planSteps: plan.steps,
      createdAt: new Date().toISOString(),
    });
  }

  if (schedule.kind === 'cron') {
    proposals.push({
      id: crypto.randomUUID(),
      userId,
      conversationId,
      projectId,
      projectPath,
      kind: 'cron',
      status: 'pending',
      title: `Schedule: ${plan.title}`,
      prompt: text,
      agentType: plan.defaultAgent,
      model: plan.defaultModel,
      role: detectRole(text),
      priority: 'normal',
      permissionMode: 'acceptEdits',
      cronExpression: schedule.cronExpression,
      recurrence: schedule.label,
      autonomyLevel: schedule.autonomyLevel || 'supervised',
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
      lines.push(`• **Schedule** \`${proposal.cronExpression}\` (${describeCron(proposal.cronExpression)}) — ${proposal.title}`);
      lines.push(`  autonomy \`${proposal.autonomyLevel || 'supervised'}\` · CLI \`${proposal.agentType}\``);
    } else if (proposal.kind === 'plan') {
      lines.push(formatPlanPreview({
        title: proposal.title,
        steps: proposal.planSteps || [],
        autonomyLevel: proposal.autonomyLevel,
      }));
    } else {
      lines.push(`• **Task** — ${proposal.title}`);
      lines.push(`  CLI \`${proposal.agentType}\``);
    }
  }
  lines.push('');
  lines.push('Approve to execute, or reject / edit by telling me what to change.');
  lines.push('Tips: `status`, `list crons`, `cancel running`, `retry`, `approve all`.');
  return lines.join('\n');
}

function handleMetaCommand(text, userId, conversation, projectId) {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;

  if (/^(status|durum|ne oluyor|what('?s| is) running)\b/.test(lower)) {
    const mine = state.tasks.filter((task) => String(task.userId) === String(userId));
    const active = mine.filter((task) => !TERMINAL_STATES.has(task.status));
    const plans = state.plans.filter((plan) => String(plan.userId) === String(userId) && plan.status === 'running');
    const recent = mine.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 8);
    return [
      `Active jobs: **${active.length}** · running plans: **${plans.length}**`,
      ...active.map((task) => `• \`${task.status}\` ${task.title} (${task.agentType})`),
      '',
      'Recent:',
      ...recent.map((task) => `• \`${task.status}\` ${task.title}`),
    ].join('\n');
  }

  if (/^(list crons|cronlar|crons|schedules)\b/.test(lower)) {
    const crons = state.crons.filter((cron) => String(cron.userId) === String(userId) && (!projectId || cron.projectId === projectId));
    if (crons.length === 0) return 'No schedules yet. Example: “every day at 9 run tests” (supervised) or “auto every hour…”';
    return crons.map((cron) => {
      const expr = cron.cronExpression || recurrenceToCron(cron.recurrence) || '?';
      return `• ${cron.enabled ? 'ON' : 'OFF'} \`${expr}\` ${cron.title} · next ${cron.nextRunAt || '—'} · ${cron.autonomyLevel || 'supervised'}`;
    }).join('\n');
  }

  if (/^(cancel running|iptal|stop all)\b/.test(lower)) {
    const active = state.tasks.filter((task) => String(task.userId) === String(userId) && !TERMINAL_STATES.has(task.status));
    for (const task of active) {
      updateTask(task, { status: 'CANCELLED', completedAt: new Date().toISOString() }, 'task:cancelled');
      void abortTaskProviderRun(task.id).catch(() => false);
      addLog(task.id, 'warn', 'Cancelled via PixBot chat command.');
      if (task.planId) refreshPlanStatus(task.planId);
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
      kind: 'plan',
      status: 'pending',
      title: `Retry: ${failed.title}`,
      prompt: failed.prompt,
      agentType: failed.agentType,
      model: failed.model,
      role: failed.role || 'fullstack',
      priority: failed.priority || 'normal',
      permissionMode: failed.permissionMode || 'acceptEdits',
      autonomyLevel: 'supervised',
      planSteps: [{
        id: 's1',
        title: failed.title,
        description: failed.prompt,
        agentType: failed.agentType,
        assignedProvider: failed.agentType,
        model: failed.model,
        role: failed.role || 'fullstack',
        dependsOn: [],
        status: 'pending',
      }],
      createdAt: new Date().toISOString(),
    };
    state.proposals.push(proposal);
    saveState();
    emitUserEvent(userId, 'bot:proposal', { proposal: publicProposal(proposal) });
    return `Proposed a retry for **${failed.title}**. Approve to re-queue.`;
  }

  if (/^(help|yardım|yardim|\?)$/.test(lower)) {
    return [
      'I am **PixBot** — full-screen auto-planner for local CLIs.',
      '',
      '1. Bind a workspace',
      '2. Describe work in natural language',
      '3. I build a multi-step plan (providers + dependsOn)',
      '4. You approve → CLI graph runs in the background',
      '5. Mention schedule (“every day at 9…”) for cron · `supervised` or `auto`',
      '',
      'Commands: `status`, `list crons`, `cancel running`, `retry`, `approve all`, `reject all`',
    ].join('\n');
  }

  return null;
}

async function materializePlan(proposal, user, { autoStart = true } = {}) {
  const steps = Array.isArray(proposal.planSteps) ? proposal.planSteps : [];
  if (steps.length === 0) {
    throw Object.assign(new Error('Plan has no steps.'), { status: 400 });
  }

  const now = new Date().toISOString();
  const plan = {
    id: crypto.randomUUID(),
    userId: user.id,
    conversationId: proposal.conversationId,
    projectId: proposal.projectId,
    projectPath: proposal.projectPath,
    title: proposal.title,
    prompt: proposal.prompt,
    status: autoStart ? 'running' : 'approved',
    autonomyLevel: VALID_AUTONOMY.has(proposal.autonomyLevel) ? proposal.autonomyLevel : 'supervised',
    steps: steps.map((step) => ({
      ...step,
      status: 'pending',
      taskId: null,
    })),
    parentPlanId: proposal.adaptiveForPlanId || null,
    createdAt: now,
    updatedAt: now,
  };

  const stepIdToTaskId = new Map();
  const createdTasks = [];

  for (const step of plan.steps) {
    const agentType = VALID_AGENTS.has(step.agentType || step.assignedProvider)
      ? (step.agentType || step.assignedProvider)
      : (proposal.agentType || 'opencode');
    const task = await createTaskRecord(user, {
      projectId: proposal.projectId,
      title: step.title,
      prompt: step.description || step.title,
      agentType,
      model: step.model || proposal.model,
      role: VALID_ROLES.has(step.role) ? step.role : (proposal.role || 'fullstack'),
      priority: proposal.priority || 'normal',
      permissionMode: proposal.permissionMode || 'acceptEdits',
      recurrence: 'none',
      dependsOnTaskIds: [],
    }, {
      conversationId: proposal.conversationId,
      proposalId: proposal.id,
      planId: plan.id,
      planStepId: step.id,
      trigger: proposal.adaptiveForPlanId ? 'adaptive' : 'auto_plan',
      projectPath: proposal.projectPath,
      skipAccessCheck: Boolean(proposal.projectPath),
      // Hold in PENDING until dependencies resolved — scheduler promotes to QUEUED
      scheduledAt: undefined,
    });
    // Force PENDING until deps checked (createTaskRecord defaults QUEUED)
    if (task.status === 'QUEUED') {
      task.status = 'PENDING';
      task.updatedAt = new Date().toISOString();
    }
    step.taskId = task.id;
    stepIdToTaskId.set(step.id, task.id);
    createdTasks.push(task);
  }

  for (const step of plan.steps) {
    const task = createdTasks.find((entry) => entry.planStepId === step.id);
    if (!task) continue;
    const depStepIds = Array.isArray(step.dependsOn) ? step.dependsOn : [];
    task.dependsOnTaskIds = depStepIds
      .map((stepId) => stepIdToTaskId.get(stepId))
      .filter(Boolean);
    if (task.dependsOnTaskIds.length === 0) {
      task.status = 'QUEUED';
    }
  }

  state.plans.push(plan);
  saveState();
  emitUserEvent(user.id, 'bot:plan', { plan: publicPlan(plan) });
  void schedulerTick();
  return { plan, tasks: createdTasks };
}

async function approveProposal(proposal, user) {
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error('Proposal is already resolved.'), { status: 409 });
  }

  if (proposal.kind === 'cron') {
    const now = new Date().toISOString();
    const cronExpression = isValidCronExpression(proposal.cronExpression)
      ? proposal.cronExpression
      : (recurrenceToCron(proposal.recurrence) || '0 9 * * *');
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
      cronExpression,
      recurrence: proposal.recurrence || describeCron(cronExpression),
      autonomyLevel: VALID_AUTONOMY.has(proposal.autonomyLevel) ? proposal.autonomyLevel : 'supervised',
      enabled: true,
      nextRunAt: nextCronOccurrence(cronExpression, new Date()),
      lastRunAt: null,
      lastTaskId: null,
      lastPlanId: null,
      lastRunStatus: null,
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

  if (proposal.kind === 'plan' || (proposal.planSteps && proposal.planSteps.length)) {
    const { plan, tasks } = await materializePlan(proposal, user);
    proposal.status = 'approved';
    proposal.resolvedAt = new Date().toISOString();
    proposal.planId = plan.id;
    proposal.taskId = tasks[0]?.id;
    saveState();
    emitUserEvent(user.id, 'bot:proposal', { proposal: publicProposal(proposal) });
    return { type: 'plan', plan, tasks, proposal };
  }

  // Legacy single task proposal
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
    projectPath: proposal.projectPath,
    skipAccessCheck: Boolean(proposal.projectPath),
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

async function fireCron(cron, { manual = false } = {}) {
  const user = { id: cron.userId };
  const scheduleLabel = cron.cronExpression || recurrenceToCron(cron.recurrence) || '0 9 * * *';
  const planDraft = buildAutoPlan(cron.prompt, {
    defaultAgent: cron.agentType || 'opencode',
    defaultModel: cron.model,
    autonomyLevel: cron.autonomyLevel || 'supervised',
  });

  const now = new Date().toISOString();

  if (cron.autonomyLevel === 'auto') {
    const synthetic = {
      id: crypto.randomUUID(),
      userId: cron.userId,
      conversationId: cron.conversationId,
      projectId: cron.projectId,
      projectPath: cron.projectPath,
      kind: 'plan',
      status: 'pending',
      title: cron.title,
      prompt: cron.prompt,
      agentType: cron.agentType || planDraft.defaultAgent,
      model: cron.model,
      role: cron.role || 'fullstack',
      priority: cron.priority || 'normal',
      permissionMode: cron.permissionMode || 'acceptEdits',
      autonomyLevel: 'auto',
      planSteps: planDraft.steps,
      createdAt: now,
    };
    const { plan, tasks } = await materializePlan(synthetic, user);
    cron.lastRunAt = now;
    cron.lastPlanId = plan.id;
    cron.lastTaskId = tasks[0]?.id || null;
    cron.lastRunStatus = 'running';
    cron.updatedAt = now;
    if (!manual) {
      cron.nextRunAt = nextCronOccurrence(scheduleLabel, new Date(now));
    }
    saveState();
    emitUserEvent(cron.userId, 'bot:cron', { cron: publicCron(cron) });
    if (cron.conversationId) {
      const conversation = state.conversations.find((entry) => entry.id === cron.conversationId);
      if (conversation) {
        pushBotMessage(conversation, `Cron **auto-ran** **${cron.title}** → plan \`${plan.id.slice(0, 8)}\` (${tasks.length} steps).`, {
          kind: 'cron-fire',
          cronId: cron.id,
          planId: plan.id,
        });
      }
    }
    return { type: 'auto', plan, tasks };
  }

  // supervised: create pending plan proposal
  const proposal = {
    id: crypto.randomUUID(),
    userId: cron.userId,
    conversationId: cron.conversationId,
    projectId: cron.projectId,
    projectPath: cron.projectPath,
    kind: 'plan',
    status: 'pending',
    title: `[Cron] ${cron.title}`,
    prompt: cron.prompt,
    agentType: cron.agentType || planDraft.defaultAgent,
    model: cron.model,
    role: cron.role || 'fullstack',
    priority: cron.priority || 'normal',
    permissionMode: cron.permissionMode || 'acceptEdits',
    autonomyLevel: 'supervised',
    planSteps: planDraft.steps,
    cronId: cron.id,
    createdAt: now,
  };
  state.proposals.push(proposal);
  cron.lastRunAt = now;
  cron.lastRunStatus = 'awaiting_approval';
  cron.updatedAt = now;
  if (!manual) {
    cron.nextRunAt = nextCronOccurrence(scheduleLabel, new Date(now));
  }
  saveState();
  emitUserEvent(cron.userId, 'bot:proposal', { proposal: publicProposal(proposal) });
  emitUserEvent(cron.userId, 'bot:cron', { cron: publicCron(cron) });
  if (cron.conversationId) {
    const conversation = state.conversations.find((entry) => entry.id === cron.conversationId);
    if (conversation) {
      pushBotMessage(conversation, [
        `Cron fired: **${cron.title}** (\`${scheduleLabel}\`).`,
        'Plan is ready — **approve** to run (supervised mode).',
        formatPlanPreview(planDraft),
      ].join('\n\n'), {
        kind: 'cron-fire',
        cronId: cron.id,
        proposalIds: [proposal.id],
      });
    }
  }
  return { type: 'supervised', proposal };
}

async function fireDueCrons(nowMs) {
  const due = state.crons.filter((cron) => {
    if (!cron.enabled) return false;
    if (cron.nextRunAt) return new Date(cron.nextRunAt).getTime() <= nowMs;
    // Fallback: expression match on current minute
    const expr = cron.cronExpression || recurrenceToCron(cron.recurrence);
    if (!expr) return false;
    return cronMatches(expr, new Date(nowMs));
  });

  for (const cron of due) {
    try {
      await fireCron(cron, { manual: false });
    } catch (error) {
      cron.updatedAt = new Date().toISOString();
      cron.lastError = error instanceof Error ? error.message : String(error);
      cron.lastRunStatus = 'failed';
      const expr = cron.cronExpression || recurrenceToCron(cron.recurrence) || '0 * * * *';
      cron.nextRunAt = nextCronOccurrence(expr, new Date());
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
      if (task.status !== 'PENDING') continue;
      if (task.scheduledAt && new Date(task.scheduledAt).getTime() > now) continue;
      const dep = dependenciesSatisfied(task);
      if (dep === true) {
        updateTask(task, { status: 'QUEUED' });
      } else if (dep === 'failed') {
        updateTask(task, {
          status: 'FAILED',
          completedAt: new Date().toISOString(),
          error: 'A dependency task failed or was cancelled.',
        }, 'task:failed');
        notifyConversationAboutTask(task);
      }
    }

    const maxParallel = Math.max(1, Number.parseInt(process.env.PIXCODE_TASK_CONCURRENCY || '2', 10) || 2);
    const running = state.tasks.filter((task) => ACTIVE_STATES.has(task.status)).length;
    const available = Math.max(0, maxParallel - running);
    const queued = state.tasks
      .filter((task) => task.status === 'QUEUED')
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const task of queued.slice(0, available)) {
      const dep = dependenciesSatisfied(task);
      if (dep === true) {
        void runTask(task);
      } else if (dep === 'failed') {
        updateTask(task, {
          status: 'FAILED',
          completedAt: new Date().toISOString(),
          error: 'A dependency task failed or was cancelled.',
        }, 'task:failed');
        notifyConversationAboutTask(task);
      }
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
    dependsOnTaskIds: Array.isArray(body.dependsOnTaskIds) ? body.dependsOnTaskIds.filter((id) => typeof id === 'string') : [],
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
      'Hey — I am **PixBot**, your full-screen auto-planner.',
      '',
      'Describe multi-step work in natural language. I will draft a plan with CLI assignments and dependencies.',
      'Approve to run. Add schedule language (“every day at 9…”) for cron · use “auto” for unattended runs.',
      '',
      'Example: “Frontend with Claude, backend with Codex. First login UI, then API, then connect them.”',
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
        return res.status(400).json({ error: 'Bind a workspace first, then chat with PixBot.' });
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
          ? `Approved ${pending.length} proposal(s). Plans/jobs are queued; I will report as CLIs finish.`
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
      const autonomyLevel = VALID_AUTONOMY.has(req.body?.autonomyLevel) ? req.body.autonomyLevel : undefined;
      const proposals = buildProposalsFromMessage({
        userId: req.user.id,
        conversationId: conversation.id,
        projectId,
        projectPath,
        text,
        agentType,
        model,
        autonomyLevel,
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
          let text;
          if (result.type === 'cron') {
            text = `Schedule **${result.cron.title}** is ON (\`${result.cron.cronExpression}\`, ${result.cron.autonomyLevel}). Next: ${result.cron.nextRunAt}.`;
          } else if (result.type === 'plan') {
            text = `Plan **${result.plan.title}** approved · **${result.tasks.length}** CLI steps queued. I will stream progress and send a final report.`;
          } else {
            text = `Task **${result.task.title}** queued. I will watch the CLI and report when it finishes.`;
          }
          pushBotMessage(conversation, text, {
            kind: 'proposal-approved',
            proposalId: proposal.id,
            taskId: result.task?.id || result.tasks?.[0]?.id,
            planId: result.plan?.id,
            cronId: result.cron?.id,
          });
        }
      }
      res.json({
        proposal: publicProposal(proposal),
        task: result.task ? publicTask(result.task) : undefined,
        tasks: result.tasks ? result.tasks.map(publicTask) : undefined,
        plan: result.plan ? publicPlan(result.plan) : undefined,
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

  router.get('/bot/plans', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const plans = state.plans
      .filter((plan) => String(plan.userId) === String(req.user.id) && (!projectId || plan.projectId === projectId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 50)
      .map(publicPlan);
    res.json({ plans });
  });

  router.get('/bot/plans/:planId', (req, res) => {
    const plan = planForUser(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    const tasks = state.tasks.filter((task) => task.planId === plan.id).map(publicTask);
    res.json({ plan: publicPlan(plan), tasks });
  });

  router.get('/bot/crons', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const crons = state.crons
      .filter((cron) => String(cron.userId) === String(req.user.id) && (!projectId || cron.projectId === projectId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .map(publicCron);
    res.json({ crons });
  });

  router.post('/bot/crons', async (req, res) => {
    try {
      const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : titleFromPrompt(prompt);
      let cronExpression = typeof req.body?.cronExpression === 'string' ? req.body.cronExpression.trim() : '';
      if (!projectId || !prompt) return res.status(400).json({ error: 'projectId and prompt are required.' });
      if (!cronExpression) {
        const detected = detectScheduleIntent(typeof req.body?.scheduleText === 'string' ? req.body.scheduleText : prompt);
        if (detected.kind === 'cron') cronExpression = detected.cronExpression;
      }
      if (!isValidCronExpression(cronExpression)) {
        return res.status(400).json({ error: 'Valid cronExpression is required (5 fields) or a schedule phrase.' });
      }
      const projectPath = await extractProjectDirectory(projectId).catch(() => null);
      if (!projectPath || !fs.existsSync(projectPath)) {
        return res.status(404).json({ error: 'Project workspace could not be resolved.' });
      }
      if (!userHasProjectPathAccess(req.user, { name: projectId, path: projectPath, fullPath: projectPath }, projectPath, 'chatAgents')) {
        return res.status(403).json({ error: 'Project access denied.' });
      }
      const now = new Date().toISOString();
      const cron = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        conversationId: typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined,
        projectId,
        projectPath,
        title,
        prompt,
        agentType: VALID_AGENTS.has(req.body?.agentType) ? req.body.agentType : 'opencode',
        model: typeof req.body?.model === 'string' ? req.body.model : undefined,
        role: VALID_ROLES.has(req.body?.role) ? req.body.role : 'fullstack',
        priority: 'normal',
        permissionMode: 'acceptEdits',
        cronExpression,
        recurrence: describeCron(cronExpression),
        autonomyLevel: VALID_AUTONOMY.has(req.body?.autonomyLevel) ? req.body.autonomyLevel : 'supervised',
        enabled: true,
        nextRunAt: nextCronOccurrence(cronExpression, new Date()),
        lastRunAt: null,
        lastTaskId: null,
        lastPlanId: null,
        lastRunStatus: null,
        createdAt: now,
        updatedAt: now,
      };
      state.crons.push(cron);
      saveState();
      emitUserEvent(req.user.id, 'bot:cron', { cron: publicCron(cron) });
      res.status(201).json({ cron: publicCron(cron) });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/crons/:cronId/toggle', (req, res) => {
    const cron = state.crons.find((entry) => entry.id === req.params.cronId && String(entry.userId) === String(req.user.id));
    if (!cron) return res.status(404).json({ error: 'Cron not found.' });
    cron.enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !cron.enabled;
    cron.updatedAt = new Date().toISOString();
    const expr = cron.cronExpression || recurrenceToCron(cron.recurrence) || '0 9 * * *';
    if (cron.enabled && !cron.nextRunAt) {
      cron.nextRunAt = nextCronOccurrence(expr, new Date());
    }
    saveState();
    emitUserEvent(req.user.id, 'bot:cron', { cron: publicCron(cron) });
    res.json({ cron: publicCron(cron) });
  });

  router.post('/bot/crons/:cronId/run-now', async (req, res) => {
    try {
      const cron = state.crons.find((entry) => entry.id === req.params.cronId && String(entry.userId) === String(req.user.id));
      if (!cron) return res.status(404).json({ error: 'Cron not found.' });
      const result = await fireCron(cron, { manual: true });
      res.json({
        cron: publicCron(cron),
        proposal: result.proposal ? publicProposal(result.proposal) : undefined,
        plan: result.plan ? publicPlan(result.plan) : undefined,
      });
    } catch (error) {
      res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : String(error) });
    }
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
    const plans = state.plans
      .filter((plan) => String(plan.userId) === String(req.user.id) && (!projectId || plan.projectId === projectId))
      .slice(0, 20)
      .map(publicPlan);
    res.json({ tasks, pendingApprovals, plans });
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
