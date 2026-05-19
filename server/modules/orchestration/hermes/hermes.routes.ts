import os from 'node:os';

import express, { type Router } from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { a2aTaskStore as hermesTaskStore } from '@/modules/orchestration/a2a/task-store.js';

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
