import { OrchestrationTaskStore } from '@/modules/orchestration/tasks/orchestration-task-store.js';
import type { CreateOrchestrationTaskInput, DispatchOrchestrationTaskInput, OrchestrationTask } from '@/modules/orchestration/tasks/orchestration-task.types.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type { TaskState } from '@/modules/orchestration/a2a/types.js';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const TERMINAL_A2A_STATES: TaskState[] = ['completed', 'canceled', 'failed'];

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
