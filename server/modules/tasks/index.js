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

const TASKS_FILE = process.env.PIXCODE_TASKS_PATH || path.join(os.homedir(), '.pixcode', 'tasks.json');
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ACTIVE_STATES = new Set(['RUNNING', 'AWAITING_INPUT']);
const VALID_AGENTS = new Set(['claude-code', 'cursor', 'codex', 'gemini', 'qwen', 'opencode']);
const VALID_ROLES = new Set(['backend', 'frontend', 'fullstack', 'reviewer', 'tester', 'custom']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_RECURRENCES = new Set(['none', 'hourly', 'daily', 'weekly']);
const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const MAX_LOGS_PER_TASK = 2000;

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
  return { version: 1, tasks: [], logs: [], interactions: [] };
}

function loadState() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const loaded = {
      version: 1,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
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
    console.error('[Tasks] Failed to load task state:', error?.message || error);
    return emptyState();
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
  const temporaryPath = `${TASKS_FILE}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temporaryPath, TASKS_FILE);
}

function publicTask(task) {
  const visible = { ...task };
  delete visible.userId;
  delete visible.projectPath;
  delete visible.recurrenceSpawned;
  return visible;
}

function taskForUser(taskId, userId) {
  return state.tasks.find((task) => task.id === taskId && String(task.userId) === String(userId)) || null;
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

function emitTaskEvent(type, taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  const payload = `data: ${JSON.stringify({ type, task: publicTask(task) })}\n\n`;
  for (const client of eventClients) {
    if (String(client.userId) !== String(task.userId)) continue;
    client.response.write(payload);
  }
}

function updateTask(task, patch, eventType = 'task:status') {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  saveState();
  emitTaskEvent(eventType, task.id);
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

async function runTask(task) {
  updateTask(task, { status: 'RUNNING', startedAt: new Date().toISOString(), error: undefined });
  addLog(task.id, 'info', `Task started in ${task.projectId}.`);

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
      },
    });

    if (task.status === 'CANCELLED') return;
    updateTask(task, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      sessionId: result.sessionId || task.sessionId,
      result: result.result,
      summary: result.summary,
      tokenCount: result.tokenCount,
    }, 'task:completed');
    addLog(task.id, 'info', 'Task completed.');
    enqueueRecurringCopy(task);
  } catch (error) {
    if (task.status === 'CANCELLED') return;
    const message = error instanceof Error ? error.message : String(error);
    updateTask(task, {
      status: 'FAILED',
      error: message,
      completedAt: new Date().toISOString(),
    }, 'task:failed');
    addLog(task.id, 'error', message);
    enqueueRecurringCopy(task);
  }
}

async function schedulerTick() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const now = Date.now();
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

  router.get('/', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '100'), 10) || 100));
    const tasks = state.tasks
      .filter((task) => String(task.userId) === String(req.user.id) && (!projectId || task.projectId === projectId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map(publicTask);
    res.json({ tasks, pendingApprovals: [] });
  });

  router.post('/', async (req, res) => {
    try {
      const input = parseCreateInput(req.body);
      const projectPath = await extractProjectDirectory(input.projectId).catch(() => null);
      if (!projectPath || !fs.existsSync(projectPath)) {
        return res.status(404).json({ error: 'Project workspace could not be resolved.' });
      }
      if (!userHasProjectPathAccess(req.user, { name: input.projectId, path: projectPath, fullPath: projectPath }, projectPath, 'chatAgents')) {
        return res.status(403).json({ error: 'Project access denied.' });
      }

      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        projectPath,
        ...input,
        status: input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now() ? 'PENDING' : 'QUEUED',
        provider: getTaskProviderId(input.agentType),
        costUsd: 0,
        tokenCount: { input: 0, output: 0 },
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.push(task);
      saveState();
      addLog(task.id, 'info', task.status === 'PENDING' ? `Scheduled for ${task.scheduledAt}.` : 'Task queued.');
      emitTaskEvent('task:created', task.id);
      res.status(201).json({ task: publicTask(task) });
      void schedulerTick();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
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
    res.json({ task: publicTask(task) });
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
