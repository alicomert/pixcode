// server/modules/orchestration/a2a/task-store.ts
// A2A task persistence backed by shared JsonStore for atomic writes and corruption recovery.
// Exposes a Map-compatible surface (get/set/delete/size/entries/values) so routes.ts
// can treat the store as a typed Map while still benefiting from durable JSON storage.

import os from 'os';
import path from 'path';

import { JsonStore } from '@/database/json-store.js';
import type { Message, Task, TaskState, TaskSummary } from '@/modules/orchestration/a2a/types.js';

const filePath = path.join(os.homedir(), '.pixcode', 'a2a-tasks.json');

export interface A2ATaskStoreOptions {
  terminalTaskTtlMs?: number;
}

export interface ListOptions {
  state?: TaskState;
  contextId?: string;
  adapterId?: string;
  limit?: number;
}

export class A2ATaskStore {
  private store: JsonStore;

  constructor(_options?: A2ATaskStoreOptions) {
    this.store = new JsonStore(filePath, { a2a_tasks: [] });
  }

  // ── Map-compatible API ─────────────────────────────────────────────────────

  get(id: string): Task | undefined {
    return this.store.findWhere('a2a_tasks', (t: Task) => t.id === id) ?? undefined;
  }

  set(task: Task): void {
    const existing = this.get(task.id);
    if (existing) {
      this.store.updateWhere('a2a_tasks', (t: Task) => t.id === task.id, task);
    } else {
      this.store.insert('a2a_tasks', task, { autoId: false });
    }
  }

  delete(id: string): void {
    this.store.deleteWhere('a2a_tasks', (t: Task) => t.id === id);
  }

  get size(): number {
    return (this.store.filterWhere('a2a_tasks', () => true) as Task[]).length;
  }

  *entries(): IterableIterator<[string, Task]> {
    const tasks = this.store.filterWhere('a2a_tasks', () => true) as Task[];
    for (const task of tasks) {
      yield [task.id, task];
    }
  }

  *values(): IterableIterator<Task> {
    const tasks = this.store.filterWhere('a2a_tasks', () => true) as Task[];
    for (const task of tasks) {
      yield task;
    }
  }

  // ── Query helpers ──────────────────────────────────────────────────────────

  list(options: ListOptions = {}): Task[] {
    const { state, contextId, adapterId, limit = 50 } = options;
    let tasks = this.store.filterWhere('a2a_tasks', (t: Task) => {
      if (state && t.state !== state) return false;
      if (contextId && t.contextId !== contextId) return false;
      if (adapterId && (t.metadata?.adapterId as string | undefined) !== adapterId) return false;
      return true;
    }) as Task[];
    if (limit > 0) tasks = tasks.slice(0, limit);
    return tasks;
  }

  summarize(task: Task): TaskSummary {
    return {
      id: task.id,
      contextId: task.contextId,
      state: task.state,
      adapterId: task.metadata?.adapterId as string | undefined,
      adapterSelector: task.metadata?.adapterSelector as string | undefined,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      messageCount: task.history?.length ?? 0,
      artifactCount: task.artifacts?.length ?? 0,
      lastMessage: task.history?.at(-1),
    };
  }

  // ── Legacy named methods (kept for any future internal callers) ────────────

  getTask(id: string): Task | undefined {
    return this.get(id);
  }

  getTaskByIndex(index: number): Task | undefined {
    const tasks = this.store.filterWhere('a2a_tasks', () => true) as Task[];
    return tasks[index] ?? undefined;
  }

  getTasks(): Task[] {
    return this.store.filterWhere('a2a_tasks', () => true) as Task[];
  }

  createTask(task: Task): void {
    this.store.insert('a2a_tasks', task, { autoId: false });
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const existing = this.get(id);
    if (!existing) return;
    const updated = { ...existing, ...updates, id: existing.id };
    this.store.updateWhere('a2a_tasks', (t: Task) => t.id === id, updated);
  }

  updateTaskState(id: string, state: TaskState): void {
    this.updateTask(id, { status: { state } } as Partial<Task>);
  }

  deleteTask(id: string): void {
    this.delete(id);
  }

  appendHistory(id: string, entry: { state: TaskState; timestamp: string }): void {
    const task = this.get(id);
    if (!task) return;
    const history = [...(task.history ?? []), entry as unknown as Message];
    this.updateTask(id, { history } as Partial<Task>);
  }

  addArtifact(id: string, artifact: NonNullable<Task['artifacts']>[number]): void {
    const task = this.get(id);
    if (!task) return;
    const artifacts = [...(task.artifacts ?? []), artifact];
    this.updateTask(id, { artifacts } as Partial<Task>);
  }

  addMessage(id: string, message: Message): void {
    const task = this.get(id);
    if (!task) return;
    const history = [...(task.history ?? []), message];
    this.updateTask(id, { history } as Partial<Task>);
  }

  updateMessage(id: string, messageId: string, updates: Partial<Message>): void {
    const task = this.get(id);
    if (!task?.history) return;
    const history = task.history.map((m) =>
      m.messageId === messageId ? { ...m, ...updates } : m,
    );
    this.updateTask(id, { history } as Partial<Task>);
  }

  getMessage(id: string, messageId: string): Message | undefined {
    const task = this.get(id);
    return task?.history?.find((m) => m.messageId === messageId);
  }

  getMessages(id: string): Message[] {
    const task = this.get(id);
    return task?.history ?? [];
  }

  clearMessages(id: string): void {
    this.updateTask(id, { history: [] } as Partial<Task>);
  }
}

export const a2aTaskStore = new A2ATaskStore();
