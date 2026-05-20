import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function hermesCommandCandidates(): string[] {
  const candidates = [process.env.HERMES_CLI_PATH, 'hermes'].filter((candidate): candidate is string => (
    typeof candidate === 'string' && candidate.trim().length > 0
  ));

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(
        path.join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
        path.join(localAppData, 'hermes', 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
        path.join(localAppData, 'hermes', 'hermes-agent', 'hermes.exe'),
      );
    }
  } else {
    candidates.push(
      path.join(os.homedir(), '.local', 'bin', 'hermes'),
      path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
      '/usr/local/bin/hermes',
    );
  }

  return [...new Set(candidates)];
}

function readHermesInstallStatus() {
  for (const candidate of hermesCommandCandidates()) {
    const isBareCommand = candidate === 'hermes';
    if (!isBareCommand && !existsSync(candidate)) {
      continue;
    }

    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      shell: false,
    });
    if (!result.error && result.status === 0) {
      const version = `${result.stdout || result.stderr || ''}`.trim() || null;
      return {
        installed: true,
        command: candidate,
        version,
        error: null,
      };
    }
  }

  return {
    installed: false,
    command: null,
    version: null,
    error: 'Hermes Agent CLI is not installed or is not on PATH.',
  };
}

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

  router.get('/install-status', (_req, res) => {
    res.json(readHermesInstallStatus());
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
