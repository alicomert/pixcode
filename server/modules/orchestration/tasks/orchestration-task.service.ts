import type { CreateOrchestrationTaskInput, DispatchOrchestrationTaskInput, OrchestrationTask } from '@/modules/orchestration/tasks/orchestration-task.types.js';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

class OrchestrationTaskService {
  private tasks = new Map<string, OrchestrationTask>();

  list(projectId?: string): OrchestrationTask[] {
    const items = Array.from(this.tasks.values());
    return (projectId ? items.filter((task) => task.projectId === projectId) : items)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): OrchestrationTask | undefined {
    return this.tasks.get(id);
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
    this.tasks.set(task.id, task);
    return task;
  }

  upsertFromTaskMaster(input: CreateOrchestrationTaskInput): OrchestrationTask {
    const existing = Array.from(this.tasks.values()).find((task) =>
      task.projectId === input.projectId && task.taskmasterId === input.taskmasterId,
    );
    if (existing) {
      existing.title = input.title;
      existing.description = input.description;
      existing.updatedAt = Date.now();
      this.tasks.set(existing.id, existing);
      return existing;
    }
    return this.create(input);
  }

  async dispatch(taskId: string, input: DispatchOrchestrationTaskInput): Promise<OrchestrationTask> {
    const task = this.tasks.get(taskId);
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
    task.state = 'in_progress';
    task.updatedAt = Date.now();
    this.tasks.set(task.id, task);
    return task;
  }

  cancel(taskId: string): OrchestrationTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');
    task.state = 'canceled';
    task.updatedAt = Date.now();
    this.tasks.set(task.id, task);
    return task;
  }
}

export const orchestrationTaskService = new OrchestrationTaskService();
