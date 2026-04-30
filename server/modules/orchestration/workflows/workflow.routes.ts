import type { Router } from 'express';
import express from 'express';

import { workflowRunner } from '@/modules/orchestration/workflows/workflow-runner.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';
import { findPixcodeAppRoot } from '@/modules/orchestration/workflows/workspace-target.js';

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'canceled']);

function readMetadata(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const metadata = (body as Record<string, unknown>).metadata;
  return metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : undefined;
}

function sendRunSnapshot(res: express.Response, runId: string): boolean {
  const run = workflowStore.getRun(runId);
  if (!run) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: { code: 'RUN_NOT_FOUND', message: runId } })}\n\n`);
    return true;
  }

  res.write(`event: snapshot\ndata: ${JSON.stringify({ run })}\n\n`);
  return TERMINAL_RUN_STATES.has(run.status);
}

export function createWorkflowRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  router.get('/workflows', (_req, res) => {
    res.json({ workflows: workflowStore.listWorkflows() });
  });

  router.get('/workflows/context', (_req, res) => {
    res.json({
      appRoot: findPixcodeAppRoot(),
      defaultWorkspaceTarget: 'selected_project',
      supportedWorkspaceTargets: ['selected_project', 'pixcode_app', 'custom'],
    });
  });

  router.get('/workflows/runs', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const runs = projectId
      ? workflowStore.listRuns().filter((run) => run.metadata?.projectId === projectId)
      : workflowStore.listRuns();
    res.json({ runs });
  });

  router.get('/workflows/runs/:runId/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    if (res.socket && typeof res.socket.setNoDelay === 'function') {
      try {
        res.socket.setNoDelay(true);
      } catch {
        // Non-fatal; SSE still works without disabling Nagle.
      }
    }

    const terminal = sendRunSnapshot(res, req.params.runId);
    if (terminal) {
      res.end();
      return;
    }

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 15_000);
    const timer = setInterval(() => {
      const done = sendRunSnapshot(res, req.params.runId);
      if (done) {
        clearInterval(timer);
        clearInterval(heartbeat);
        res.end();
      }
    }, 1_000);

    req.on('close', () => {
      clearInterval(timer);
      clearInterval(heartbeat);
    });
  });

  router.get('/workflows/runs/:runId', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }
    res.json(run);
  });

  router.post('/workflows/:id/preview', (req, res) => {
    const workflow = workflowStore.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: req.params.id } });
      return;
    }
    try {
      const runtimeWorkflow = workflowRunner.preview(workflow, readMetadata(req.body));
      res.json({
        workflow: runtimeWorkflow,
        nodeCount: runtimeWorkflow.nodes.length,
        nodes: runtimeWorkflow.nodes.map((node) => ({
          id: node.id,
          adapterId: node.adapterId,
          agentInstanceId: node.agentInstanceId,
          agentLabel: node.agentLabel,
          assignment: node.assignment,
          stage: node.stage,
          inputs: node.inputs,
          onFail: node.onFail,
          output: node.output,
          model: node.model,
          permissionMode: node.permissionMode,
          timeoutMs: node.timeoutMs,
        })),
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'WORKFLOW_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/workflows/runs/:runId/cancel', async (req, res) => {
    const run = await workflowRunner.cancel(req.params.runId);
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
        readMetadata(req.body),
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
