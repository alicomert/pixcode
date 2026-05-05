import path from 'node:path';
import os from 'node:os';

import { JsonStore } from '@/database/json-store.js';
import type { OrchestrationTask } from '@/modules/orchestration/tasks/orchestration-task.types.js';

function defaultPath(): string {
  return process.env.ORCHESTRATION_TASKS_PATH ??
    path.join(os.homedir(), '.pixcode', 'orchestration-tasks.json');
}

export class OrchestrationTaskStore {
  private store: JsonStore;

  constructor(filePath = defaultPath()) {
    this.store = new JsonStore(filePath, { orchestration_tasks: [] });
  }

  get(id: string): OrchestrationTask | undefined {
    return this.store.findWhere('orchestration_tasks', (r: OrchestrationTask) => r.id === id) ?? undefined;
  }

  getByA2ATaskId(a2aTaskId: string): OrchestrationTask | undefined {
    return this.store.findWhere('orchestration_tasks', (r: OrchestrationTask) => r.a2aTaskId === a2aTaskId) ?? undefined;
  }

  getByTaskMasterId(taskmasterId: string): OrchestrationTask | undefined {
    return this.store.findWhere('orchestration_tasks', (r: OrchestrationTask) => r.taskmasterId === taskmasterId) ?? undefined;
  }

  list(projectId?: string): OrchestrationTask[] {
    const tasks = this.store.filterWhere('orchestration_tasks', () => true) as OrchestrationTask[];
    const sorted = tasks.sort((a, b) => b.createdAt - a.createdAt);
    return projectId ? sorted.filter((task) => task.projectId === projectId) : sorted;
  }

  set(task: OrchestrationTask): void {
    const existing = this.store.findWhere('orchestration_tasks', (r: OrchestrationTask) => r.id === task.id);
    if (existing) {
      this.store.updateWhere('orchestration_tasks', (r: OrchestrationTask) => r.id === task.id, task);
    } else {
      this.store.insert('orchestration_tasks', task, { autoId: false });
    }
  }
}
