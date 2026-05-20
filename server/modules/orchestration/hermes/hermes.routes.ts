import os from 'node:os';

import express, { type Request, type Response, type Router } from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { a2aTaskStore as hermesTaskStore } from '@/modules/orchestration/a2a/task-store.js';
import {
  cancelHermesInstallJob,
  createHermesInstallJob,
  getHermesInstallJob,
  readHermesInstallStatus,
  snapshotHermesInstallDonePayload,
} from '@/services/hermes-install-jobs.js';

const HERMES_TERMINAL_LAUNCH_LIMIT = 100;
const HERMES_TERMINAL_LAUNCH_PROVIDERS = new Set(['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode']);

type HermesTerminalLaunchEvent = {
  id: number;
  provider: string;
  projectPath: string | null;
  prompt: string | null;
  source: string;
  createdAt: string;
};

type HermesRouterOptions = {
  appRoot?: string;
  createHermesApiKey?: (userId: number | string | null | undefined) => string | null;
  resolvePublicBaseUrl?: (req: Request) => string;
};

type PixcodeRequest = Request & {
  user?: {
    id?: number | string;
    userId?: number | string;
  };
};

let nextHermesTerminalLaunchId = 1;
const hermesTerminalLaunches: HermesTerminalLaunchEvent[] = [];

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function readUserId(req: PixcodeRequest) {
  return req.user?.id ?? req.user?.userId ?? null;
}

export function createHermesRouter(options: HermesRouterOptions = {}): Router {
  const router = express.Router();

  router.get('/status', (_req, res) => {
    res.json({
      id: 'hermes',
      name: 'Hermes Agent',
      product: 'Pixcode',
      runtime: {
        mode: process.env.PIXCODE_MANAGED_PLATFORM === '1' ? 'managed' : 'local',
        host: os.hostname(),
        node: process.version,
        pid: process.pid,
      },
      capabilities: [
        'project-aware CLI orchestration',
        'background checks and tests',
        'workspace-scoped terminal operations',
        'run history and artifact review',
      ],
    });
  });

  router.get('/context', (req, res) => {
    const project = typeof req.query.project === 'string' ? req.query.project : null;
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : process.cwd();
    res.json({
      agent: 'Hermes Agent',
      product: 'Pixcode',
      project,
      cwd,
      local: true,
      message: project
        ? `Hermes is operating inside Pixcode for ${project}.`
        : 'Hermes is operating inside Pixcode.',
    });
  });

  router.get('/install-status', (_req, res) => {
    res.json(readHermesInstallStatus());
  });

  router.post('/install', (req: PixcodeRequest, res) => {
    const apiKey = options.createHermesApiKey?.(readUserId(req)) ?? null;
    if (!apiKey) {
      res.status(500).json({
        error: {
          code: 'HERMES_API_KEY_UNAVAILABLE',
          message: 'Pixcode could not create a Hermes MCP API key for this user.',
        },
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const job = createHermesInstallJob({
      appRoot: options.appRoot ?? process.cwd(),
      force: Boolean(body.force),
      pixcodeApiKey: apiKey,
      pixcodeBaseUrl: options.resolvePublicBaseUrl?.(req) ?? `http://127.0.0.1:${process.env.SERVER_PORT ?? process.env.PORT ?? '3001'}`,
      skipBrowser: body.skipBrowser !== false,
    });

    res.status(202).json({
      jobId: job.id,
      provider: 'hermes',
      status: job.status,
      startedAt: job.startedAt,
    });
  });

  router.get('/install/:jobId/stream', (req, res) => {
    const job = getHermesInstallJob(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: {
          code: 'HERMES_INSTALL_JOB_NOT_FOUND',
          message: 'Hermes install job not found or already expired.',
        },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    try {
      (res.socket as NodeJS.Socket & { setNoDelay?: (on: boolean) => void })?.setNoDelay?.(true);
    } catch { /* noop */ }

    let closed = false;
    const safeWrite = (event: string, payload: unknown) => {
      if (closed) return;
      try { writeSse(res, event, payload); } catch { /* socket gone */ }
    };

    try { res.write(': start\n\n'); } catch { /* noop */ }
    const heartbeat = setInterval(() => {
      if (closed) return;
      try { res.write(': ping\n\n'); } catch { /* noop */ }
    }, 5000);

    for (const entry of job.logs) {
      safeWrite('log', { stream: entry.stream, chunk: entry.chunk });
    }

    const onLog = (entry: { stream: string; chunk: string }) => {
      safeWrite('log', { stream: entry.stream, chunk: entry.chunk });
    };
    const onDone = (payload: Record<string, unknown>) => {
      safeWrite('done', payload);
      cleanup();
      try { res.end(); } catch { /* noop */ }
    };
    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      job.emitter.off('log', onLog);
      job.emitter.off('done', onDone);
    }

    if (job.status !== 'running') {
      safeWrite('done', snapshotHermesInstallDonePayload(job));
      cleanup();
      try { res.end(); } catch { /* noop */ }
      return;
    }

    job.emitter.on('log', onLog);
    job.emitter.once('done', onDone);
    req.on('close', cleanup);
  });

  router.delete('/install/:jobId', (req, res) => {
    const job = getHermesInstallJob(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: {
          code: 'HERMES_INSTALL_JOB_NOT_FOUND',
          message: 'Hermes install job not found.',
        },
      });
      return;
    }

    res.json({ cancelled: cancelHermesInstallJob(req.params.jobId) });
  });

  router.get('/agents', (_req, res) => {
    res.json({
      agent: 'hermes',
      agents: adapterRegistry.agentCards().map((agent) => ({
        ...agent,
        coordinator: 'hermes',
      })),
    });
  });

  router.get('/terminal-launches', (req, res) => {
    const after = Number.parseInt(typeof req.query.after === 'string' ? req.query.after : '0', 10);
    const afterId = Number.isFinite(after) ? after : 0;
    res.json({
      events: hermesTerminalLaunches.filter((event) => event.id > afterId),
    });
  });

  router.post('/terminal-launches', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
    if (!HERMES_TERMINAL_LAUNCH_PROVIDERS.has(provider)) {
      res.status(400).json({ error: { code: 'INVALID_PROVIDER', message: provider || 'provider is required' } });
      return;
    }

    const projectPath = typeof body.projectPath === 'string' && body.projectPath.trim()
      ? body.projectPath.trim()
      : null;
    const prompt = typeof body.prompt === 'string' && body.prompt.trim()
      ? body.prompt.trim()
      : null;

    const event: HermesTerminalLaunchEvent = {
      id: nextHermesTerminalLaunchId,
      provider,
      projectPath,
      prompt,
      source: 'hermes-mcp',
      createdAt: new Date().toISOString(),
    };
    nextHermesTerminalLaunchId += 1;
    hermesTerminalLaunches.push(event);
    if (hermesTerminalLaunches.length > HERMES_TERMINAL_LAUNCH_LIMIT) {
      hermesTerminalLaunches.splice(0, hermesTerminalLaunches.length - HERMES_TERMINAL_LAUNCH_LIMIT);
    }

    res.status(201).json({ event });
  });

  router.get('/tasks/:id', (req, res) => {
    const task = hermesTaskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'HERMES_TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json({
      ...task,
      hermesTaskId: task.id,
    });
  });

  return router;
}
