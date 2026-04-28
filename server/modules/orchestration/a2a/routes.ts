// server/modules/orchestration/a2a/routes.ts
// HTTP surface for A2A v0.2. Mounted at /a2a in server/index.js.

import crypto from 'node:crypto';

import type { Request, Response, Router } from 'express';
import express from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { buildPixcodeAgentCard } from '@/modules/orchestration/a2a/agent-card.js';
import { a2aAuth } from '@/modules/orchestration/a2a/auth.middleware.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
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

// In-memory task store. Persistence is out of scope for the foundation;
// a follow-on plan adds SQLite-backed storage.
const tasks = new Map<string, Task>();

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function getBaseUrl(req: Request): string {
  // Honour the standard reverse-proxy headers when present.
  const proto = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host');
  return `${proto}://${host}`;
}

function attachBusToTask(task: Task): () => void {
  return a2aBus.subscribe(task.id, (event: BusEvent) => {
    if (event.kind === 'task-state') {
      task.state = event.state;
      if (event.error) task.error = event.error;
      task.updatedAt = Date.now();
    } else if (event.kind === 'message') {
      task.history.push(event.message);
      task.updatedAt = Date.now();
    } else if (event.kind === 'artifact') {
      task.artifacts.push(event.artifact);
      task.updatedAt = Date.now();
    }
  });
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

  // Task lifecycle
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      assertSubmitTaskInput(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
      return;
    }

    const adapter = adapterRegistry.get(req.body.adapterId);
    if (!adapter) {
      res.status(404).json({
        error: { code: 'ADAPTER_NOT_FOUND', message: req.body.adapterId },
      });
      return;
    }

    const userMessage: Message = req.body.message;
    const task: Task = {
      id: newId('task'),
      contextId: req.body.contextId,
      state: 'submitted',
      history: [userMessage],
      artifacts: [],
      metadata: req.body.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tasks.set(task.id, task);
    // Persist adapterId in metadata so cancel can resolve the owning adapter
    // even when the original request body is no longer available.
    task.metadata = { ...task.metadata, adapterId: req.body.adapterId };
    attachBusToTask(task);

    try {
      await adapter.submitTask(task, { cwd: process.cwd() });
    } catch (err) {
      task.state = 'failed';
      task.error = {
        code: 'ADAPTER_SUBMIT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    res.status(202).json(task);
  });

  router.get('/tasks/:id', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json(task);
  });

  router.get('/tasks/:id/stream', (req, res) => {
    const task = tasks.get(req.params.id);
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

    const TERMINAL: TaskState[] = ['completed', 'canceled', 'failed'];
    const unsubscribe = a2aBus.subscribe(task.id, (event) => {
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.kind === 'task-state' && TERMINAL.includes(event.state)) {
        res.end();
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  router.post('/tasks/:id/cancel', async (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    // Look up the adapter that owns this task. We stored adapterId in metadata.
    const adapterId = req.body?.adapterId ?? task.metadata?.adapterId;
    const adapter = typeof adapterId === 'string' ? adapterRegistry.get(adapterId) : undefined;
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
    res.json(tasks.get(task.id));
  });

  router.post('/messages', (req, res) => {
    try {
      assertMessage(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
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
