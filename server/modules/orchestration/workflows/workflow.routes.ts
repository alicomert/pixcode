import type { Router } from 'express';
import express from 'express';

import { workflowRunner } from '@/modules/orchestration/workflows/workflow-runner.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';

export function createWorkflowRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  router.get('/workflows', (_req, res) => {
    res.json({ workflows: workflowStore.listWorkflows() });
  });

  router.get('/workflows/runs', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const runs = projectId
      ? workflowStore.listRuns().filter((run) => run.metadata?.projectId === projectId)
      : workflowStore.listRuns();
    res.json({ runs });
  });

  router.get('/workflows/runs/:runId', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }
    res.json(run);
  });

  router.post('/workflows/:id/runs', (req, res) => {
    const workflow = workflowStore.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: req.params.id } });
      return;
    }
    try {
      const run = workflowRunner.start(
        workflow,
        typeof req.body?.input === 'string' ? req.body.input : '',
        req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
      );
      res.status(202).json(run);
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'WORKFLOW_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  return router;
}
