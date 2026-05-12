import type { WorkflowNodeRun, WorkflowRun } from '@/modules/orchestration/workflows/workflow.types.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';
import { orchestrationTaskService } from '@/modules/orchestration/tasks/orchestration-task.service.js';
import type { OrchestrationTask } from '@/modules/orchestration/tasks/orchestration-task.types.js';

export const PIXCODE_TASK_RUN_GRAPH_PROTOCOL = 'pixcode.task-run-graph.v1';

export type TaskRunGraphCriterionStatus = 'pending' | 'passed' | 'failed';

export interface TaskRunGraphCriterion {
  id: string;
  label: string;
  status: TaskRunGraphCriterionStatus;
  source: 'taskmaster' | 'workflow';
}

export interface TaskRunGraphRunSummary {
  id: string;
  workflowId: string;
  status: WorkflowRun['status'];
  startedAt: number;
  finishedAt?: number;
  taskmasterId?: string;
  orchestrationTaskId?: string;
  changedFiles: string[];
}

export interface TaskRunGraph {
  protocol: typeof PIXCODE_TASK_RUN_GRAPH_PROTOCOL;
  projectId: string;
  taskmasterId?: string;
  orchestrationTaskId?: string;
  workflowRuns: TaskRunGraphRunSummary[];
  changedFiles: string[];
  acceptanceCriteria: TaskRunGraphCriterion[];
  status: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    passedCriteria: number;
    failedCriteria: number;
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .sort((a, b) => a.localeCompare(b));
}

function taskStatusPassed(status: unknown): boolean {
  const normalized = String(status ?? '').toLocaleLowerCase('en');
  return normalized === 'done' || normalized === 'completed';
}

function taskStatusFailed(status: unknown): boolean {
  const normalized = String(status ?? '').toLocaleLowerCase('en');
  return normalized === 'failed' || normalized === 'blocked' || normalized === 'cancelled' || normalized === 'canceled';
}

function criterionStatus(status: unknown): TaskRunGraphCriterionStatus {
  if (taskStatusPassed(status)) return 'passed';
  if (taskStatusFailed(status)) return 'failed';
  return 'pending';
}

function taskmasterAcceptanceCriteria(taskmasterTask: Record<string, unknown> | undefined): TaskRunGraphCriterion[] {
  if (!taskmasterTask) return [];

  const criteria: TaskRunGraphCriterion[] = [];
  const testStrategy = readString(taskmasterTask.testStrategy) ?? readString(taskmasterTask.test_strategy);
  if (testStrategy) {
    criteria.push({
      id: 'test-strategy',
      label: testStrategy,
      status: criterionStatus(taskmasterTask.status),
      source: 'taskmaster',
    });
  }

  const subtasks = Array.isArray(taskmasterTask.subtasks) ? taskmasterTask.subtasks : [];
  subtasks.forEach((subtask, index) => {
    const record = readRecord(subtask);
    if (!record) return;
    const title = readString(record.title);
    if (!title) return;
    criteria.push({
      id: `subtask-${readString(record.id) ?? index + 1}`,
      label: title,
      status: criterionStatus(record.status),
      source: 'taskmaster',
    });
  });

  return criteria;
}

function metadataTaskmasterId(run: WorkflowRun): string | undefined {
  return readString(run.metadata?.taskmasterId)
    ?? readString(readRecord(run.metadata?.taskGraph)?.taskmasterId)
    ?? readString(readRecord(run.metadata?.replay)?.taskmasterId);
}

function metadataOrchestrationTaskId(run: WorkflowRun): string | undefined {
  return readString(run.metadata?.orchestrationTaskId)
    ?? readString(readRecord(run.metadata?.taskGraph)?.orchestrationTaskId);
}

function artifactChangedFiles(node: WorkflowNodeRun): string[] {
  const files: string[] = [];

  if (node.handoffArtifact?.changedFiles) {
    files.push(...node.handoffArtifact.changedFiles);
  }

  for (const artifact of node.artifacts ?? []) {
    const data = readRecord(artifact.data);
    const metadata = readRecord(artifact.metadata);
    const candidates = [
      readString(metadata?.path),
      readString(metadata?.file),
      readString(data?.path),
      readString(data?.file),
    ];
    files.push(...candidates.filter((value): value is string => Boolean(value)));

    for (const key of ['files', 'changedFiles']) {
      const value = data?.[key] ?? metadata?.[key];
      if (Array.isArray(value)) {
        files.push(...value.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry)));
      }
    }
  }

  return uniqueStrings(files);
}

export function changedFilesFromWorkflowRun(run: WorkflowRun): string[] {
  return uniqueStrings(run.nodeRuns.flatMap((node) => artifactChangedFiles(node)));
}

function workflowRunMatchesTask(run: WorkflowRun, task: OrchestrationTask | undefined, taskmasterId: string | undefined): boolean {
  const runTaskmasterId = metadataTaskmasterId(run);
  const runOrchestrationTaskId = metadataOrchestrationTaskId(run);
  if (taskmasterId && runTaskmasterId === taskmasterId) return true;
  if (task?.id && runOrchestrationTaskId === task.id) return true;
  if (task?.workflowRunIds?.includes(run.id)) return true;
  return false;
}

function runSummary(run: WorkflowRun): TaskRunGraphRunSummary {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    taskmasterId: metadataTaskmasterId(run),
    orchestrationTaskId: metadataOrchestrationTaskId(run),
    changedFiles: changedFilesFromWorkflowRun(run),
  };
}

export function buildTaskRunGraph({
  projectId,
  taskmasterId,
  taskmasterTask,
}: {
  projectId: string;
  taskmasterId?: string;
  taskmasterTask?: Record<string, unknown>;
}): TaskRunGraph {
  const orchestrationTask = taskmasterId
    ? orchestrationTaskService.list(projectId).find((task) => task.taskmasterId === taskmasterId)
    : undefined;
  const workflowRuns = workflowStore
    .listRuns()
    .filter((run) => workflowRunMatchesTask(run, orchestrationTask, taskmasterId))
    .map(runSummary);
  const workflowCriteria: TaskRunGraphCriterion[] = workflowRuns.map((run) => ({
    id: `run-${run.id}`,
    label: `Workflow ${run.workflowId} ${run.status}`,
    status: run.status === 'completed' ? 'passed' : run.status === 'failed' || run.status === 'canceled' ? 'failed' : 'pending',
    source: 'workflow',
  }));
  const acceptanceCriteria = [
    ...taskmasterAcceptanceCriteria(taskmasterTask),
    ...(orchestrationTask?.acceptanceCriteria ?? []),
    ...workflowCriteria,
  ];
  const changedFiles = uniqueStrings([
    ...(orchestrationTask?.changedFiles ?? []),
    ...workflowRuns.flatMap((run) => run.changedFiles),
  ]);

  return {
    protocol: PIXCODE_TASK_RUN_GRAPH_PROTOCOL,
    projectId,
    taskmasterId,
    orchestrationTaskId: orchestrationTask?.id,
    workflowRuns,
    changedFiles,
    acceptanceCriteria,
    status: {
      totalRuns: workflowRuns.length,
      completedRuns: workflowRuns.filter((run) => run.status === 'completed').length,
      failedRuns: workflowRuns.filter((run) => run.status === 'failed' || run.status === 'canceled').length,
      passedCriteria: acceptanceCriteria.filter((criterion) => criterion.status === 'passed').length,
      failedCriteria: acceptanceCriteria.filter((criterion) => criterion.status === 'failed').length,
    },
  };
}
