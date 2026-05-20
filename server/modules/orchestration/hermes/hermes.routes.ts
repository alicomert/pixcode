import os from 'node:os';

import express, { type Router } from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { a2aTaskStore as hermesTaskStore } from '@/modules/orchestration/a2a/task-store.js';

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

let nextHermesTerminalLaunchId = 1;
const hermesTerminalLaunches: HermesTerminalLaunchEvent[] = [];

export function createHermesRouter(): Router {
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
