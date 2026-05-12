import type { WorkflowRun } from '@/modules/orchestration/workflows/workflow.types.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';

export type ApprovalDecisionSource = 'ui' | 'telegram' | 'api';

export type ApprovalQueueItem = Record<string, unknown> & {
  id: string;
  runId: string;
  workflowId: string;
  status: string;
  requestedAt?: number;
};

function readRunApprovals(run: WorkflowRun): Array<Record<string, unknown>> {
  const approvals = run.metadata?.pendingPermissionApprovals;
  return Array.isArray(approvals)
    ? approvals.filter((approval): approval is Record<string, unknown> => Boolean(approval && typeof approval === 'object'))
    : [];
}

function normalizeApproval(run: WorkflowRun, approval: Record<string, unknown>): ApprovalQueueItem | null {
  const id = typeof approval.id === 'string' && approval.id.trim() ? approval.id : null;
  if (!id) return null;

  return {
    ...approval,
    id,
    runId: run.id,
    workflowId: run.workflowId,
    status: typeof approval.status === 'string' ? approval.status : 'pending',
    requestedAt: typeof approval.requestedAt === 'number' ? approval.requestedAt : run.startedAt,
  };
}

export function listPendingApprovals(options: {
  projectId?: string;
  includeResolved?: boolean;
} = {}): ApprovalQueueItem[] {
  const items: ApprovalQueueItem[] = [];
  for (const run of workflowStore.listRuns()) {
    if (options.projectId && run.metadata?.projectId !== options.projectId) continue;
    for (const approval of readRunApprovals(run)) {
      const item = normalizeApproval(run, approval);
      if (!item) continue;
      if (!options.includeResolved && item.status !== 'pending') continue;
      items.push(item);
    }
  }

  return items.sort((a, b) => Number(b.requestedAt ?? 0) - Number(a.requestedAt ?? 0));
}

export function resolvePermissionApproval({
  approvalId,
  allow,
  source = 'api',
  resolvedBy,
  message,
}: {
  approvalId: string;
  allow: boolean;
  source?: ApprovalDecisionSource; // source: 'ui' | 'telegram' | 'api'
  resolvedBy?: string | number | null;
  message?: string;
}): {
  runId: string;
  pendingApprovals: ApprovalQueueItem[];
  approvalHistory: ApprovalQueueItem[];
} | null {
  for (const run of workflowStore.listRuns()) {
    const approvals = readRunApprovals(run);
    let changed = false;
    const nextApprovals = approvals.map((approval) => {
      if (approval.id !== approvalId) return approval;
      changed = true;
      return {
        ...approval,
        status: allow ? 'allowed' : 'denied',
        resolvedAt: Date.now(),
        resolvedBy: resolvedBy ?? null,
        decisionSource: source,
        resolutionMessage: typeof message === 'string' && message.trim() ? message.trim() : undefined,
      };
    });

    if (!changed) continue;

    run.metadata = {
      ...run.metadata,
      pendingPermissionApprovals: nextApprovals,
    };
    workflowStore.setRun(run);

    const queueItems = nextApprovals
      .map((approval) => normalizeApproval(run, approval))
      .filter((approval): approval is ApprovalQueueItem => Boolean(approval));

    return {
      runId: run.id,
      pendingApprovals: queueItems.filter((approval) => approval.status === 'pending'),
      approvalHistory: queueItems.filter((approval) => approval.status !== 'pending'),
    };
  }

  return null;
}
