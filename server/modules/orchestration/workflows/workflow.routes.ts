import type { Router } from 'express';
import express from 'express';

import { workflowRunner } from '@/modules/orchestration/workflows/workflow-runner.js';
import {
  type WorkflowReplayScope,
  buildWorkflowReplayPlan,
} from '@/modules/orchestration/workflows/workflow-replay.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';
import { buildWorkflowTrace } from '@/modules/orchestration/workflows/workflow-trace.js';
import { findPixcodeAppRoot } from '@/modules/orchestration/workflows/workspace-target.js';
import {
  DEFAULT_PERMISSION_POLICY,
  PERMISSION_CAPABILITIES,
  PERMISSION_POLICY_MODES,
  PIXCODE_PERMISSION_POLICY_PROTOCOL,
  evaluatePermissionRequest,
  normalizePermissionPolicy,
} from '@/modules/orchestration/security/permission-policy.js';

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'canceled']);

function isWindowsLikeProjectId(projectId: string): boolean {
  return /^[A-Za-z]--/.test(projectId) || /^[A-Za-z]:[\\/]/.test(projectId);
}

function normalizeProjectId(projectId: string): string {
  return projectId.trim().replace(/\\/g, '/').toLowerCase();
}

function projectIdsMatch(storedProjectId: unknown, requestedProjectId: string): boolean {
  if (typeof storedProjectId !== 'string') return false;
  if (storedProjectId === requestedProjectId) return true;

  if (!isWindowsLikeProjectId(storedProjectId) && !isWindowsLikeProjectId(requestedProjectId)) {
    return false;
  }

  return normalizeProjectId(storedProjectId) === normalizeProjectId(requestedProjectId);
}

function readLimit(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 100);
}

function readMetadata(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const metadata = (body as Record<string, unknown>).metadata;
  return metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : undefined;
}

function readRequestUserId(req: express.Request): string | number | null {
  const user = (req as express.Request & { user?: { id?: string | number; userId?: string | number } }).user;
  return user?.id ?? user?.userId ?? null;
}

function readReplayScope(value: unknown): WorkflowReplayScope {
  return value === 'run' ? 'run' : 'node';
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBooleanFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function replayOptions(req: express.Request): {
  scope: WorkflowReplayScope;
  fromNodeId?: string;
  approveReplay: boolean;
} {
  return {
    scope: readReplayScope(req.body?.scope ?? req.query.scope),
    fromNodeId: readOptionalString(req.body?.fromNodeId ?? req.query.fromNodeId),
    approveReplay: readBooleanFlag(req.body?.approveReplay ?? req.query.approveReplay),
  };
}

function readRunArray(run: { metadata?: Record<string, unknown> }, key: string): Array<Record<string, unknown>> {
  const value = run.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
}

function updateApproval(
  run: { metadata?: Record<string, unknown> },
  requestId: string,
  patch: Record<string, unknown>,
): boolean {
  const approvals = readRunArray(run, 'pendingPermissionApprovals');
  let changed = false;
  const nextApprovals = approvals.map((approval) => {
    if (approval.id !== requestId) return approval;
    changed = true;
    return {
      ...approval,
      ...patch,
    };
  });
  if (!changed) return false;
  run.metadata = {
    ...run.metadata,
    pendingPermissionApprovals: nextApprovals,
  };
  return true;
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
    const limit = readLimit(req.query.limit);
    const runs = projectId
      ? workflowStore.listRuns().filter((run) => projectIdsMatch(run.metadata?.projectId, projectId))
      : workflowStore.listRuns();
    res.json({ runs: limit ? runs.slice(0, limit) : runs });
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

  router.get('/workflows/runs/:runId/trace', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }

    res.json({
      runId: run.id,
      trace: buildWorkflowTrace(run),
    });
  });

  router.get('/workflows/permission-policy', (_req, res) => {
    res.json({
      protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
      capabilities: PERMISSION_CAPABILITIES,
      modes: PERMISSION_POLICY_MODES,
      defaultPolicy: DEFAULT_PERMISSION_POLICY,
    });
  });

  router.post('/workflows/permission-policy/evaluate', (req, res) => {
    try {
      res.json({
        decision: evaluatePermissionRequest({
          policy: normalizePermissionPolicy(req.body?.policy),
          request: req.body?.request ?? { source: 'api' },
        }),
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'PERMISSION_POLICY_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.get('/workflows/runs/:runId/permission-approvals', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }

    res.json({
      runId: run.id,
      pendingApprovals: readRunArray(run, 'pendingPermissionApprovals')
        .filter((approval) => approval.status === 'pending'),
      approvalHistory: readRunArray(run, 'pendingPermissionApprovals')
        .filter((approval) => approval.status !== 'pending'),
    });
  });

  router.post('/workflows/runs/:runId/permission-approvals/:requestId', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }

    const allow = req.body?.allow === true;
    const deny = req.body?.allow === false;
    if (!allow && !deny) {
      res.status(400).json({
        error: {
          code: 'PERMISSION_DECISION_REQUIRED',
          message: 'Permission approval requires allow=true or allow=false.',
        },
      });
      return;
    }

    const updated = updateApproval(run, req.params.requestId, {
      status: allow ? 'allowed' : 'denied',
      resolvedAt: Date.now(),
      resolvedBy: readRequestUserId(req),
      resolutionMessage: readOptionalString(req.body?.message),
    });
    if (!updated) {
      res.status(404).json({ error: { code: 'APPROVAL_NOT_FOUND', message: req.params.requestId } });
      return;
    }

    workflowStore.setRun(run);
    res.json({
      runId: run.id,
      pendingApprovals: readRunArray(run, 'pendingPermissionApprovals')
        .filter((approval) => approval.status === 'pending'),
      approvalHistory: readRunArray(run, 'pendingPermissionApprovals')
        .filter((approval) => approval.status !== 'pending'),
    });
  });

  router.get('/workflows/runs/:runId/replay-plan', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }

    try {
      const options = replayOptions(req);
      res.json({
        replayPlan: buildWorkflowReplayPlan(run, {
          scope: options.scope,
          fromNodeId: options.fromNodeId,
        }),
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'REPLAY_PLAN_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post('/workflows/runs/:runId/replay', (req, res) => {
    const run = workflowStore.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: req.params.runId } });
      return;
    }

    try {
      const options = replayOptions(req);
      const replayPlan = buildWorkflowReplayPlan(run, {
        scope: options.scope,
        fromNodeId: options.fromNodeId,
      });

      if (replayPlan.requiresApproval && !options.approveReplay) {
        res.status(409).json({
          error: {
            code: 'REPLAY_APPROVAL_REQUIRED',
            message: 'Replay requires explicit approval because prior shell, network, or file-write activity was detected.',
          },
          replayPlan,
        });
        return;
      }

      const replayRun = workflowRunner.start(
        replayPlan.workflow,
        replayPlan.input,
        {
          ...replayPlan.metadata,
          userId: readRequestUserId(req) ?? run.metadata?.userId,
          replay: {
            ...(replayPlan.metadata.replay && typeof replayPlan.metadata.replay === 'object'
              ? replayPlan.metadata.replay as Record<string, unknown>
              : {}),
            approved: options.approveReplay,
            approvedAt: options.approveReplay ? Date.now() : undefined,
          },
        },
      );
      res.status(202).json({
        run: replayRun,
        replayPlan,
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'REPLAY_START_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
        {
          ...readMetadata(req.body),
          userId: readRequestUserId(req),
          workflowName: workflow.name,
        },
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
