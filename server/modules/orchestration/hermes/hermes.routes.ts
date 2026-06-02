import os from 'node:os';
import { EventEmitter } from 'node:events';

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
import {
  ensureHermesGateway,
  getHermesGatewayStatus,
  probeHermesGateway,
  readHermesControlPlane,
  readHermesDiagnostics,
  repairHermesControlPlane,
  requestHermesGateway,
  runHermesGatewayPrompt,
  stopHermesGateway,
} from '@/services/hermes-gateway.js';

const HERMES_TERMINAL_LAUNCH_LIMIT = 100;
const HERMES_TERMINAL_LAUNCH_PROVIDERS = new Set(['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode']);
const HERMES_TERMINAL_LAUNCH_STREAM_HEARTBEAT_MS = 25000;

type HermesTerminalLaunchEvent = {
  id: number;
  provider: string;
  projectPath: string | null;
  prompt: string | null;
  startupInput: string | null;
  forceNewSession: boolean;
  permissionMode: string | null;
  skipPermissions: boolean;
  bypassPermissions: boolean;
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
const hermesTerminalLaunchEmitter = new EventEmitter();
hermesTerminalLaunchEmitter.setMaxListeners(200);

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function readUserId(req: PixcodeRequest) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function resolveHermesMcpBaseUrl() {
  const configured = process.env.PIXCODE_INTERNAL_BASE_URL || process.env.PIXCODE_HERMES_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  return `http://127.0.0.1:${process.env.SERVER_PORT ?? process.env.PORT ?? '3001'}`;
}

function readAfterId(req: Request) {
  const after = Number.parseInt(typeof req.query.after === 'string' ? req.query.after : '0', 10);
  return Number.isFinite(after) ? after : 0;
}

function rememberHermesTerminalLaunch(event: HermesTerminalLaunchEvent) {
  hermesTerminalLaunches.push(event);
  if (hermesTerminalLaunches.length > HERMES_TERMINAL_LAUNCH_LIMIT) {
    hermesTerminalLaunches.splice(0, hermesTerminalLaunches.length - HERMES_TERMINAL_LAUNCH_LIMIT);
  }
  hermesTerminalLaunchEmitter.emit('terminal-launch', event);
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  return value === true || value === 'true' || value === '1';
}

function isLegacyPromptLikelyStartupInput(prompt: string | null) {
  if (!prompt || prompt.length > 160 || prompt.includes('\n')) return false;
  if (/^[/:!@]/u.test(prompt)) return true;
  if (prompt.includes(':')) return false;
  if (/\b(user|request|reason|audit|task|kullanıcı|kullanicinin|istek|isteği|gorev|görev|terminal|codex|claude|qwen|gemini|cursor|opencode|open|aç|ac|başlat|baslat|send|gönder|gonder)\b/iu.test(prompt)) {
    return false;
  }
  return prompt.length <= 80;
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

  router.get('/gateway/status', (req, res) => {
    const projectPath = typeof req.query.projectPath === 'string' ? req.query.projectPath : null;
    res.json(getHermesGatewayStatus(projectPath));
  });

  router.post('/gateway/start', async (req: PixcodeRequest, res) => {
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
    try {
      const gateway = await ensureHermesGateway({
        appRoot: options.appRoot ?? process.cwd(),
        pixcodeApiKey: apiKey,
        pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
        projectPath: typeof body.projectPath === 'string' ? body.projectPath : undefined,
      });
      res.status(202).json(gateway);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_GATEWAY_START_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/gateway/probe', async (req: PixcodeRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = typeof body.projectPath === 'string' ? body.projectPath : null;
    const input = typeof body.input === 'string' ? body.input : undefined;
    const shouldStart = body.startIfNeeded === true;

    try {
      if (shouldStart) {
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
        await ensureHermesGateway({
          appRoot: options.appRoot ?? process.cwd(),
          pixcodeApiKey: apiKey,
          pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
          projectPath: projectPath ?? undefined,
        });
      }

      const probe = await probeHermesGateway(projectPath, { input });
      res.status(probe.ok ? 200 : 503).json(probe);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_GATEWAY_PROBE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/gateway/chat', async (req: PixcodeRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = typeof body.projectPath === 'string' && body.projectPath.trim()
      ? body.projectPath.trim()
      : undefined;
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : undefined;

    if (!input) {
      res.status(400).json({
        error: {
          code: 'HERMES_PROMPT_REQUIRED',
          message: 'Hermes prompt is required.',
        },
      });
      return;
    }

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

    try {
      const gateway = await ensureHermesGateway({
        appRoot: options.appRoot ?? process.cwd(),
        pixcodeApiKey: apiKey,
        pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
        projectPath,
        probeExisting: false,
      });
      const run = await runHermesGatewayPrompt(projectPath, {
        input,
        sessionId,
      });

      res.status(run.ok ? 200 : 502).json({
        ok: run.ok,
        gateway,
        run,
        message: run.message,
        error: run.error ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_GATEWAY_CHAT_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/gateway/request', async (req: PixcodeRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = typeof body.projectPath === 'string' && body.projectPath.trim()
      ? body.projectPath.trim()
      : undefined;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : body.path;
    const method = typeof body.method === 'string' ? body.method : 'GET';

    try {
      if (body.startIfNeeded === true) {
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
        await ensureHermesGateway({
          appRoot: options.appRoot ?? process.cwd(),
          pixcodeApiKey: apiKey,
          pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
          projectPath,
        });
      }

      const gatewayResponse = await requestHermesGateway(projectPath, {
        endpoint,
        method,
        body: body.body,
        timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      });
      res.status(gatewayResponse.ok ? 200 : 502).json(gatewayResponse);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_GATEWAY_REQUEST_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.get('/diagnostics', async (req, res) => {
    const projectPath = typeof req.query.projectPath === 'string' && req.query.projectPath.trim()
      ? req.query.projectPath.trim()
      : undefined;

    try {
      const diagnostics = await readHermesDiagnostics({
        appRoot: options.appRoot ?? process.cwd(),
        projectPath,
      });
      res.status(diagnostics.ok ? 200 : 503).json(diagnostics);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_DIAGNOSTICS_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.get('/control-plane', async (req, res) => {
    const projectPath = typeof req.query.projectPath === 'string' && req.query.projectPath.trim()
      ? req.query.projectPath.trim()
      : undefined;

    try {
      const controlPlane = await readHermesControlPlane({
        appRoot: options.appRoot ?? process.cwd(),
        projectPath,
      });
      res.status(controlPlane.ok ? 200 : 503).json(controlPlane);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_CONTROL_PLANE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/control-plane/repair', async (req: PixcodeRequest, res) => {
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
    const projectPath = typeof body.projectPath === 'string' && body.projectPath.trim()
      ? body.projectPath.trim()
      : undefined;

    try {
      const repaired = await repairHermesControlPlane({
        appRoot: options.appRoot ?? process.cwd(),
        pixcodeApiKey: apiKey,
        pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
        projectPath,
        forceRestart: readBoolean(body.forceRestart),
      });
      res.status(repaired.ok ? 200 : 202).json(repaired);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'HERMES_CONTROL_PLANE_REPAIR_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/gateway/stop', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = typeof body.projectPath === 'string' ? body.projectPath : null;
    res.json(stopHermesGateway(projectPath));
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
      pixcodeBaseUrl: resolveHermesMcpBaseUrl(),
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
    const afterId = readAfterId(req);
    res.json({
      events: hermesTerminalLaunches.filter((event) => event.id > afterId),
    });
  });

  router.get('/terminal-launches/stream', (req, res) => {
    const afterId = readAfterId(req);

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
    const replayed = hermesTerminalLaunches.filter((event) => event.id > afterId);
    for (const event of replayed) {
      safeWrite('terminal-launch', event);
    }
    safeWrite('ready', {
      latestId: hermesTerminalLaunches[hermesTerminalLaunches.length - 1]?.id ?? afterId,
      replayed: replayed.length,
    });

    const heartbeat = setInterval(() => {
      if (closed) return;
      try { res.write(': ping\n\n'); } catch { /* noop */ }
    }, HERMES_TERMINAL_LAUNCH_STREAM_HEARTBEAT_MS);

    const onTerminalLaunch = (event: HermesTerminalLaunchEvent) => {
      safeWrite('terminal-launch', event);
    };
    hermesTerminalLaunchEmitter.on('terminal-launch', onTerminalLaunch);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      hermesTerminalLaunchEmitter.off('terminal-launch', onTerminalLaunch);
    };

    req.on('close', cleanup);
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
    const prompt = readTrimmedString(body.prompt ?? body.reason);
    const requestedStartupInput = readTrimmedString(body.startupInput ?? body.input);
    const startupInput = requestedStartupInput ?? (isLegacyPromptLikelyStartupInput(prompt) ? prompt : null);
    const forceNewSession = readBoolean(body.forceNewSession ?? body.newSession ?? body.freshSession);
    const bypassPermissions = readBoolean(body.bypassPermissions);
    const skipPermissions = readBoolean(body.skipPermissions) || bypassPermissions;
    const requestedPermissionMode = readTrimmedString(body.permissionMode);
    const permissionMode = requestedPermissionMode ?? (skipPermissions ? 'bypassPermissions' : null);

    const event: HermesTerminalLaunchEvent = {
      id: nextHermesTerminalLaunchId,
      provider,
      projectPath,
      prompt,
      startupInput,
      forceNewSession,
      permissionMode,
      skipPermissions,
      bypassPermissions,
      source: 'hermes-mcp',
      createdAt: new Date().toISOString(),
    };
    nextHermesTerminalLaunchId += 1;
    rememberHermesTerminalLaunch(event);

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
