// server/modules/orchestration/a2a/routes.ts
// HTTP surface for A2A v0.2. Mounted at /a2a in server/index.js.

import crypto from 'node:crypto';

import type { Request, Response, Router } from 'express';
import express from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { buildPixcodeAgentCard } from '@/modules/orchestration/a2a/agent-card.js';
import { a2aAuth } from '@/modules/orchestration/a2a/auth.middleware.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import { A2ATaskStore } from '@/modules/orchestration/a2a/task-store.js';
import type {
  BusEvent,
  Message,
  Task,
  TaskState,
} from '@/modules/orchestration/a2a/types.js';
import {
  A2AValidationError,
  assertMessage,
  assertSubmitTaskInput,
} from '@/modules/orchestration/a2a/validator.js';
import { portWatcher } from '@/modules/orchestration/preview/port-watcher.js';
import type { PreviewArtifactData } from '@/modules/orchestration/preview/types.js';
import { workspaceManager } from '@/modules/orchestration/workspace/workspace-manager.js';
import type {
  WorkspaceHandle,
  WorkspaceKind,
  WorkspaceMetadata,
} from '@/modules/orchestration/workspace/types.js';
import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';

type RoutingHints = {
  preferredAdapterId?: string;
  preferredProvider?: string;
  preferredSkillId?: string;
};

function readRoutingHints(value: unknown): RoutingHints {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  return {
    preferredAdapterId:
      typeof source.preferredAdapterId === 'string' ? source.preferredAdapterId : undefined,
    preferredProvider:
      typeof source.preferredProvider === 'string' ? source.preferredProvider : undefined,
    preferredSkillId:
      typeof source.preferredSkillId === 'string' ? source.preferredSkillId : undefined,
  };
}

const TERMINAL: TaskState[] = ['completed', 'canceled', 'failed'];
// Per-task bus unsubscribe handles; called on terminal state.
const taskUnsubs = new Map<string, () => void>();
// Eviction timeouts (terminal tasks live for 1 hour before being purged).
const taskEvictions = new Map<string, NodeJS.Timeout>();
const TERMINAL_TASK_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_TASKS = 1000;
const taskStore = new A2ATaskStore({ terminalTaskTtlMs: TERMINAL_TASK_TTL_MS });
const activeWorkspaces = new Map<string, WorkspaceHandle>();
const previewStops = new Map<string, () => void>();
const finalizingTasks = new Set<string>();

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isTerminalTaskState(state: TaskState): boolean {
  return TERMINAL.includes(state);
}

function getBaseUrl(req: Request): string {
  // TODO: this trusts X-Forwarded-Proto/Host without checking app's
  // trust-proxy setting. Same posture as auth.middleware.ts; revisit
  // when project-wide trust-proxy decision lands.
  const proto = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host');
  return `${proto}://${host}`;
}

function scheduleTaskEviction(taskId: string): void {
  const existingTimeout = taskEvictions.get(taskId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const task = taskStore.get(taskId);
  if (!task) {
    taskEvictions.delete(taskId);
    return;
  }

  const remainingMs = Math.max(0, task.updatedAt + TERMINAL_TASK_TTL_MS - Date.now());
  taskEvictions.set(
    taskId,
    setTimeout(() => {
      taskStore.delete(taskId);
      taskEvictions.delete(taskId);
    }, remainingMs),
  );
}

function parseTaskState(value: unknown): TaskState | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized === 'submitted' ||
    normalized === 'working' ||
    normalized === 'input-required' ||
    normalized === 'completed' ||
    normalized === 'canceled' ||
    normalized === 'failed'
  ) {
    return normalized;
  }

  return undefined;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readWorkspaceKind(value: unknown): WorkspaceKind | undefined {
  return value === 'host' || value === 'worktree' || value === 'docker' ? value : undefined;
}

function workspaceMetadata(workspace: WorkspaceHandle, keepAfterCompletion?: boolean): WorkspaceMetadata {
  return {
    id: workspace.id,
    kind: workspace.kind,
    path: workspace.path,
    baseRef: workspace.baseRef,
    branchName: workspace.branchName,
    keepAfterCompletion,
  };
}

async function finalizeTerminalTask(task: Task): Promise<void> {
  if (finalizingTasks.has(task.id)) return;
  finalizingTasks.add(task.id);

  const stopPreview = previewStops.get(task.id);
  if (stopPreview) {
    stopPreview();
    previewStops.delete(task.id);
  }

  const workspace = activeWorkspaces.get(task.id);
  try {
    if (workspace) {
      const diff = await workspace.diff();
      a2aBus.publish({
        kind: 'artifact',
        taskId: task.id,
        artifact: {
          artifactId: newId('art'),
          type: 'file-diff',
          parts: [{ kind: 'text', text: diff }],
          metadata: {
            source: 'workspace-diff',
            workspaceId: workspace.id,
            workspaceKind: workspace.kind,
            baseRef: workspace.baseRef,
          },
        },
      });

      const keepAfterCompletion = task.metadata?.workspace &&
        typeof task.metadata.workspace === 'object' &&
        readBoolean((task.metadata.workspace as Record<string, unknown>).keepAfterCompletion);
      if (workspace.kind !== 'host' && keepAfterCompletion !== true) {
        await workspace.destroy();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    task.metadata = {
      ...task.metadata,
      workspaceFinalizationError: message,
    };
    task.updatedAt = Date.now();
    taskStore.set(task);
  } finally {
    activeWorkspaces.delete(task.id);
    const unsub = taskUnsubs.get(task.id);
    if (unsub) {
      unsub();
      taskUnsubs.delete(task.id);
    }
    scheduleTaskEviction(task.id);
    finalizingTasks.delete(task.id);
  }
}

function attachBusToTask(task: Task): void {
  const unsubscribe = a2aBus.subscribe(task.id, (event: BusEvent) => {
    if (event.kind === 'task-state') {
      task.state = event.state;
      if (event.error) task.error = event.error;
      task.updatedAt = Date.now();
      taskStore.set(task);
      if (isTerminalTaskState(event.state)) {
        void finalizeTerminalTask(task);
      }
    } else if (event.kind === 'message') {
      task.history.push(event.message);
      task.updatedAt = Date.now();
      taskStore.set(task);
    } else if (event.kind === 'artifact') {
      task.artifacts.push(event.artifact);
      task.updatedAt = Date.now();
      taskStore.set(task);
    }
  });
  taskUnsubs.set(task.id, unsubscribe);
}

for (const task of taskStore.values()) {
  if (isTerminalTaskState(task.state)) {
    scheduleTaskEviction(task.id);
  }
}

export function createA2ARouter(): Router {
  const router: Router = express.Router();

  router.use(express.json({ limit: '5mb' }));
  router.use(a2aAuth);

  // Discovery
  router.get('/.well-known/agent-card.json', (req, res) => {
    res.json(buildPixcodeAgentCard(getBaseUrl(req)));
  });

  router.get('/agents', (_req, res) => {
    res.json({ agents: adapterRegistry.agentCards() });
  });

  router.get('/agents/:id/agent-card', (req, res) => {
    const adapter = adapterRegistry.get(req.params.id);
    if (!adapter) {
      res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json(adapter.agentCard);
  });

  router.post('/adapters/resolve', (req, res) => {
    const selector = typeof req.body?.adapterId === 'string' ? req.body.adapterId : '';
    if (!selector.trim()) {
      res.status(400).json({
        error: { code: 'ADAPTER_ID_REQUIRED', message: 'adapterId is required.' },
      });
      return;
    }

    const routing = readRoutingHints(req.body?.routing);
    const adapter = adapterRegistry.resolve(selector, routing);
    if (!adapter) {
      res.status(404).json({
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: selector,
          availableAdapters: adapterRegistry.list().map((candidate) => candidate.id),
        },
      });
      return;
    }

    res.json({
      selector,
      resolvedAdapterId: adapter.id,
      agentCard: adapter.agentCard,
    });
  });

  router.get('/tasks', (req, res) => {
    const state = parseTaskState(req.query.state);
    const contextId = typeof req.query.contextId === 'string' ? req.query.contextId : undefined;
    const adapterId = typeof req.query.adapterId === 'string' ? req.query.adapterId : undefined;
    const limit = parsePositiveInt(req.query.limit, 50);

    const tasks = taskStore
      .list({ state, contextId, adapterId, limit })
      .map((task) => taskStore.summarize(task));

    res.json({
      tasks,
      count: tasks.length,
      filters: {
        state,
        contextId,
        adapterId,
        limit,
      },
    });
  });

  // Task lifecycle
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      assertSubmitTaskInput(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
      return;
    }

    const metadata = req.body.metadata as Record<string, unknown> | undefined;
    const routing = readRoutingHints(metadata?.routing);

    const adapter = adapterRegistry.resolve(req.body.adapterId, routing);
    if (!adapter) {
      res.status(404).json({
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: req.body.adapterId,
          availableAdapters: adapterRegistry.list().map((candidate) => candidate.id),
        },
      });
      return;
    }

    // Enforce MAX_TASKS cap. Evict the oldest terminal task first; if all
    // active, fail closed with 503.
    if (taskStore.size >= MAX_TASKS) {
      let evicted = false;
      for (const [tid, t] of taskStore.entries()) {
        if (isTerminalTaskState(t.state)) {
          const timeout = taskEvictions.get(tid);
          if (timeout) clearTimeout(timeout);
          taskEvictions.delete(tid);
          const unsub = taskUnsubs.get(tid);
          if (unsub) {
            unsub();
            taskUnsubs.delete(tid);
          }
          taskStore.delete(tid);
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        res.status(503).json({
          error: { code: 'TASK_LIMIT', message: `task store at capacity (${MAX_TASKS})` },
        });
        return;
      }
    }

    const userMessage: Message = req.body.message;
    const task: Task = {
      id: newId('task'),
      contextId: req.body.contextId,
      state: 'submitted',
      history: [],
      artifacts: [],
      metadata: req.body.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    task.history.push({ ...userMessage, taskId: task.id });
    const workspaceOptions = (metadata?.workspace && typeof metadata.workspace === 'object'
      ? metadata.workspace
      : {}) as Record<string, unknown>;
    // Persist adapterId in metadata so cancel can resolve the owning adapter
    // even when the original request body is no longer available.
    task.metadata = {
      ...task.metadata,
      adapterId: adapter.id,
      adapterSelector: req.body.adapterId,
    };
    taskStore.set(task);
    attachBusToTask(task);

    let workspace: WorkspaceHandle;
    try {
      workspace = await workspaceManager.create({
        taskId: task.id,
        projectPath: readString(workspaceOptions.projectPath) ?? process.cwd(),
        kind: readWorkspaceKind(workspaceOptions.kind) ?? readWorkspaceKind(metadata?.isolation),
        baseRef: readString(workspaceOptions.baseRef) ?? readString(metadata?.baseRef) ?? 'HEAD',
        keepAfterCompletion: readBoolean(workspaceOptions.keepAfterCompletion),
        metadata: workspaceOptions,
      });
    } catch (err) {
      const workspaceError = err instanceof WorkspaceError ? err : undefined;
      a2aBus.publish({
        kind: 'task-state',
        taskId: task.id,
        state: 'failed',
        error: {
          code: workspaceError?.code ?? 'WORKSPACE_CREATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
          details: workspaceError?.details,
        },
      });
      res.status(202).json(task);
      return;
    }

    activeWorkspaces.set(task.id, workspace);
    task.metadata = {
      ...task.metadata,
      workspace: workspaceMetadata(workspace, readBoolean(workspaceOptions.keepAfterCompletion)),
    };
    taskStore.set(task);

    previewStops.set(
      task.id,
      portWatcher.watch({
        taskId: task.id,
        workspace,
        onPort: (event) => {
          const data: PreviewArtifactData = {
            url: event.url,
            proxiedUrl: `/preview/${event.port}/`,
            port: event.port,
            host: event.host,
            processName: event.processName,
            confidence: event.confidence,
          };
          a2aBus.publish({
            kind: 'artifact',
            taskId: task.id,
            artifact: {
              artifactId: newId('art'),
              type: 'preview-url',
              parts: [{ kind: 'data', data: { ...data } }],
              metadata: {
                source: 'port-watcher',
                workspaceId: workspace.id,
              },
            },
          });
        },
      }),
    );

    try {
      await adapter.submitTask(task, {
        cwd: workspace.path,
        workspace,
        model: readString(metadata?.model),
        permissionMode: readString(metadata?.permissionMode),
        toolsSettings: readObject(metadata?.toolsSettings),
      });
    } catch (err) {
      // Publish to bus so SSE subscribers and the attachBusToTask listener
      // both see the failure transition. The listener mutates the stored
      // task in place, so the 202 body still reflects the failed state.
      a2aBus.publish({
        kind: 'task-state',
        taskId: task.id,
        state: 'failed',
        error: {
          code: 'ADAPTER_SUBMIT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }

    res.status(202).json(task);
  });

  router.get('/tasks/:id', (req, res) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json(task);
  });

  router.get('/tasks/:id/stream', (req, res) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Replay current state once so late subscribers see history.
    const initial = { kind: 'task-snapshot' as const, task };
    res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);

    const unsubscribe = a2aBus.subscribe(task.id, (event) => {
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.kind === 'task-state' && TERMINAL.includes(event.state)) {
        setTimeout(() => res.end(), 1500);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  router.post('/tasks/:id/cancel', async (req, res) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    // Look up the adapter that owns this task. We stored adapterId in metadata.
    const adapterId = req.body?.adapterId ?? task.metadata?.adapterId;
    const adapter = typeof adapterId === 'string' ? adapterRegistry.resolve(adapterId) : undefined;
    if (!adapter) {
      res.status(400).json({
        error: {
          code: 'ADAPTER_REQUIRED',
          message: 'Provide adapterId to cancel a task whose adapter is unknown',
        },
      });
      return;
    }
    await adapter.cancelTask(task.id);
    res.json(taskStore.get(task.id));
  });

  router.post('/messages', (req, res) => {
    try {
      assertMessage(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
      return;
    }
    if (typeof req.body.taskId === 'string' && !taskStore.get(req.body.taskId)) {
      res.status(404).json({
        error: { code: 'TASK_NOT_FOUND', message: req.body.taskId },
      });
      return;
    }
    a2aBus.publish({
      kind: 'message',
      taskId: req.body.taskId ?? 'broadcast',
      message: req.body,
    });
    res.status(202).json({ accepted: true });
  });

  return router;
}
