// server/modules/orchestration/a2a/task-store.ts
// A2A task persistence backed by shared JsonStore for atomic writes and corruption recovery.

import os from 'os';
import path from 'path';

import { JsonStore } from '@/database/json-store.js';
import type { Message, Task, TaskState } from '@/modules/orchestration/a2a/types.js';

const filePath = path.join(os.homedir(), '.pixcode', 'a2a-tasks.json');

export class A2ATaskStore {
  private store: JsonStore;

  constructor() {
    this.store = new JsonStore(filePath, { a2a_tasks: [] });
  }

  getTask(id: string): Task | undefined {
    return this.store.findWhere('a2a_tasks', (t: Task) => t.id === id) ?? undefined;
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
    const existing = this.getTask(id);
    if (!existing) return;
    const updated = { ...existing, ...updates, id: existing.id };
    this.store.updateWhere('a2a_tasks', (t: Task) => t.id === id, updated);
  }

  updateTaskState(id: string, state: TaskState): void {
    this.updateTask(id, { status: { state } } as Partial<Task>);
  }

  deleteTask(id: string): void {
    this.store.deleteWhere('a2a_tasks', (t: Task) => t.id === id);
  }

  appendHistory(id: string, entry: { state: TaskState; timestamp: string }): void {
    const task = this.getTask(id);
    if (!task) return;
    const history = [...(task.history ?? []), entry];
    this.updateTask(id, { history } as Partial<Task>);
  }

  addArtifact(id: string, artifact: NonNullable<Task['artifacts']>[number]): void {
    const task = this.getTask(id);
    if (!task) return;
    const artifacts = [...(task.artifacts ?? []), artifact];
    this.updateTask(id, { artifacts } as Partial<Task>);
  }

  addMessage(id: string, message: Message): void {
    const task = this.getTask(id);
    if (!task) return;
    const messages = [...(task.messages ?? []), message];
    this.updateTask(id, { messages } as Partial<Task>);
  }

  updateMessage(id: string, messageId: string, updates: Partial<Message>): void {
    const task = this.getTask(id);
    if (!task?.messages) return;
    const messages = task.messages.map((m) =>
      m.metadata?.messageId === messageId ? { ...m, ...updates } : m,
    );
    this.updateTask(id, { messages } as Partial<Task>);
  }

  getMessage(id: string, messageId: string): Message | undefined {
    const task = this.getTask(id);
    return task?.messages?.find((m) => m.metadata?.messageId === messageId);
  }

  getMessages(id: string): Message[] {
    const task = this.getTask(id);
    return task?.messages ?? [];
  }

  clearMessages(id: string): void {
    this.updateTask(id, { messages: [] } as Partial<Task>);
  }
}

export const a2aTaskStore = new A2ATaskStore();
