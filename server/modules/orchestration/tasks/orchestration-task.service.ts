import { OrchestrationTaskStore } from '@/modules/orchestration/tasks/orchestration-task-store.js';
import type { CreateOrchestrationTaskInput, DispatchOrchestrationTaskInput, OrchestrationTask } from '@/modules/orchestration/tasks/orchestration-task.types.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type { TaskState } from '@/modules/orchestration/a2a/types.js';
import type { WorkflowNodeRun, WorkflowRun } from '@/modules/orchestration/workflows/workflow.types.js';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const TERMINAL_A2A_STATES: TaskState[] = ['completed', 'canceled', 'failed'];

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .sort((a, b) => a.localeCompare(b));
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function changedFilesFromNode(node: WorkflowNodeRun): string[] {
  const files: string[] = [];
  if (node.handoffArtifact?.changedFiles) {
    files.push(...node.handoffArtifact.changedFiles);
  }
  for (const artifact of node.artifacts ?? []) {
    const data = readRecord(artifact.data);
    const metadata = readRecord(artifact.metadata);
    files.push(
      ...[readString(data?.path), readString(data?.file), readString(metadata?.path), readString(metadata?.file)]
        .filter((value): value is string => Boolean(value)),
    );
    for (const key of ['files', 'changedFiles']) {
      const value = data?.[key] ?? metadata?.[key];
      if (Array.isArray(value)) {
        files.push(...value.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry)));
      }
    }
  }
  return uniqueStrings(files);
}

function changedFilesFromWorkflowRun(run: WorkflowRun): string[] {
  return uniqueStrings(run.nodeRuns.flatMap((node) => changedFilesFromNode(node)));
}

function workflowRunState(run: WorkflowRun): OrchestrationTask['state'] {
  if (run.status === 'completed') return 'done';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'canceled') return 'canceled';
  return 'in_progress';
}

class OrchestrationTaskService {
  private store: OrchestrationTaskStore;

  constructor(store?: OrchestrationTaskStore) {
    this.store = store ?? new OrchestrationTaskStore();
    this.watchA2ATerminalStates();
  }

  list(projectId?: string): OrchestrationTask[] {
    return this.store.list(projectId);
  }

  get(id: string): OrchestrationTask | undefined {
    return this.store.get(id);
  }

  create(input: CreateOrchestrationTaskInput): OrchestrationTask {
    const now = Date.now();
    const task: OrchestrationTask = {
      id: newId('otask'),
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      taskmasterId: input.taskmasterId,
      acceptanceCriteria: input.acceptanceCriteria,
      changedFiles: input.changedFiles,
      state: 'todo',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(task);
    return task;
  }

  upsertFromTaskMaster(input: CreateOrchestrationTaskInput): OrchestrationTask {
    const existing = this.store.list(input.projectId).find((task) =>
      task.taskmasterId === input.taskmasterId,
    );
    if (existing) {
      existing.title = input.title;
      existing.description = input.description;
      existing.acceptanceCriteria = input.acceptanceCriteria ?? existing.acceptanceCriteria;
      existing.changedFiles = uniqueStrings([...(existing.changedFiles ?? []), ...(input.changedFiles ?? [])]);
      existing.updatedAt = Date.now();
      this.store.set(existing);
      return existing;
    }
    return this.create(input);
  }

  async dispatch(taskId: string, input: DispatchOrchestrationTaskInput): Promise<OrchestrationTask> {
    const task = this.store.get(taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');

    const a2aResponse = await fetch(`http://127.0.0.1:${process.env.SERVER_PORT ?? '3001'}/a2a/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adapterId: input.adapterId,
        message: {
          messageId: newId('msg'),
          role: 'user',
          parts: [{ kind: 'text', text: `${task.title}\n\n${task.description ?? ''}` }],
        },
        metadata: {
          isolation: input.isolation ?? 'worktree',
          model: input.model,
          permissionMode: input.permissionMode,
          workspace: {
            kind: input.isolation ?? 'worktree',
            projectPath: input.projectPath,
          },
          orchestrationTaskId: task.id,
          taskmasterId: task.taskmasterId,
        },
      }),
    });

    const body = await a2aResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
    if (!a2aResponse.ok || typeof body?.id !== 'string') {
      throw new Error(body?.error?.message ?? 'DISPATCH_FAILED');
    }

    task.a2aTaskId = body.id;
    task.adapterId = input.adapterId;
    task.adapterSelector = input.adapterId;
    task.workspaceKind = input.isolation ?? 'worktree';
    task.workspacePath = input.projectPath;
    task.state = 'in_progress';
    task.updatedAt = Date.now();
    this.store.set(task);
    return task;
  }

  linkWorkflowRun(taskId: string, run: WorkflowRun): OrchestrationTask | undefined {
    const task = this.store.get(taskId);
    if (!task) return undefined;
    task.workflowRunIds = uniqueStrings([...(task.workflowRunIds ?? []), run.id]);
    task.state = workflowRunState(run);
    task.updatedAt = Date.now();
    this.store.set(task);
    return task;
  }

  updateFromWorkflowRun(run: WorkflowRun): OrchestrationTask | undefined {
    const metadata = run.metadata ?? {};
    const taskId = readString(metadata.orchestrationTaskId);
    const taskmasterId = readString(metadata.taskmasterId);
    const task = taskId
      ? this.store.get(taskId)
      : taskmasterId
        ? this.store.list(readString(metadata.projectId)).find((candidate) => candidate.taskmasterId === taskmasterId)
        : undefined;
    if (!task) return undefined;

    const changedFiles = changedFilesFromWorkflowRun(run);
    task.workflowRunIds = uniqueStrings([...(task.workflowRunIds ?? []), run.id]);
    task.changedFiles = uniqueStrings([...(task.changedFiles ?? []), ...changedFiles]);
    task.state = workflowRunState(run);
    task.acceptanceCriteria = [
      ...(task.acceptanceCriteria ?? []).filter((criterion) => criterion.id !== `run-${run.id}`),
      {
        id: `run-${run.id}`,
        label: `Workflow ${run.workflowId} ${run.status}`,
        status: run.status === 'completed' ? 'passed' : run.status === 'failed' || run.status === 'canceled' ? 'failed' : 'pending',
        source: 'workflow',
      },
    ];
    task.updatedAt = Date.now();
    this.store.set(task);

    if (task.taskmasterId && task.state === 'done') {
      this.syncTaskMasterStatus(task.taskmasterId, 'done');
    }
    return task;
  }

  updateState(taskId: string, state: OrchestrationTask['state']): OrchestrationTask | undefined {
    const task = this.store.get(taskId);
    if (!task) return undefined;
    task.state = state;
    task.updatedAt = Date.now();
    this.store.set(task);
    return task;
  }

  private watchA2ATerminalStates(): void {
    a2aBus.subscribeAll((event) => {
      if (event.kind !== 'task-state') return;
      if (!TERMINAL_A2A_STATES.includes(event.state)) return;

      const orchTask = this.store.getByA2ATaskId(event.taskId);
      if (!orchTask) return;
      if (orchTask.state === 'done' || orchTask.state === 'failed' || orchTask.state === 'canceled') return;

      const mapped = event.state === 'completed' ? 'done'
        : event.state === 'failed' ? 'failed'
        : 'canceled';

      orchTask.state = mapped;
      orchTask.updatedAt = Date.now();
      this.store.set(orchTask);

      if (orchTask.taskmasterId && mapped === 'done') {
        this.syncTaskMasterStatus(orchTask.taskmasterId, 'done');
      }
    });
  }

  private syncTaskMasterStatus(taskmasterId: string, status: string): void {
    const { spawn } = require('node:child_process') as typeof import('node:child_process');
    spawn('task-master', ['set-status', '--id', taskmasterId, '--status', status], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  }

  cancel(taskId: string): OrchestrationTask {
    const task = this.store.get(taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');
    task.state = 'canceled';
    task.updatedAt = Date.now();
    this.store.set(task);
    return task;
  }
}

export const orchestrationTaskService = new OrchestrationTaskService();
