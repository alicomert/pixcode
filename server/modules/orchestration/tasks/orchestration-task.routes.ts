import express, { type Router } from 'express';

import { orchestrationTaskService } from '@/modules/orchestration/tasks/orchestration-task.service.js';

export function createOrchestrationTaskRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  router.get('/tasks', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    res.json({ tasks: orchestrationTaskService.list(projectId) });
  });

  router.post('/tasks', (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : 'default';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : undefined;
    const taskmasterId = typeof req.body?.taskmasterId === 'string' ? req.body.taskmasterId : undefined;

    if (!title) {
      res.status(400).json({ error: { code: 'TITLE_REQUIRED', message: 'title is required' } });
      return;
    }

    const task = orchestrationTaskService.create({ projectId, title, description, taskmasterId });
    res.status(201).json(task);
  });

  router.post('/tasks/import-taskmaster', (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : 'default';
    const entries = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    const imported = entries
      .map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const taskmasterId = typeof record.id === 'string' ? record.id : undefined;
        const title = typeof record.title === 'string' ? record.title : undefined;
        const description = typeof record.description === 'string' ? record.description : undefined;
        if (!taskmasterId || !title) return null;
        return orchestrationTaskService.upsertFromTaskMaster({ projectId, title, description, taskmasterId });
      })
      .filter(Boolean);

    res.json({ tasks: imported, count: imported.length });
  });

  router.post('/tasks/:id/dispatch', async (req, res) => {
    try {
      const adapterId = typeof req.body?.adapterId === 'string' ? req.body.adapterId : '';
      const isolation = req.body?.isolation;
      const projectPath = typeof req.body?.projectPath === 'string' ? req.body.projectPath : undefined;
      const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
      const permissionMode = typeof req.body?.permissionMode === 'string' ? req.body.permissionMode : undefined;
      if (!adapterId) {
        res.status(400).json({ error: { code: 'ADAPTER_REQUIRED', message: 'adapterId is required' } });
        return;
      }
      const task = await orchestrationTaskService.dispatch(req.params.id, {
        adapterId,
        isolation,
        projectPath,
        model,
        permissionMode,
      });
      res.json(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'TASK_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: { code: 'DISPATCH_FAILED', message } });
    }
  });

  router.post('/tasks/:id/cancel', (req, res) => {
    try {
      const task = orchestrationTaskService.cancel(req.params.id);
      res.json(task);
    } catch {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
    }
  });

  return router;
}
