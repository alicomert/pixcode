import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Task, TaskSummary, TaskState } from '@/modules/orchestration/a2a/types.js';

interface PersistedTaskDocument {
  version: 1;
  tasks: Task[];
}

const DOCUMENT_VERSION = 1;
const TERMINAL_STATES = new Set(['completed', 'canceled', 'failed']);

function getDefaultStorePath(): string {
  if (process.env.A2A_TASKS_PATH) {
    return process.env.A2A_TASKS_PATH;
  }

  const databasePath = process.env.DATABASE_PATH;
  if (databasePath) {
    return path.join(path.dirname(databasePath), 'a2a-tasks.json');
  }

  return path.join(os.homedir(), '.pixcode', 'a2a-tasks.json');
}

function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

function isTaskShape(value: unknown): value is Task {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const task = value as Partial<Task>;
  return (
    typeof task.id === 'string' &&
    typeof task.state === 'string' &&
    Array.isArray(task.history) &&
    Array.isArray(task.artifacts) &&
    typeof task.createdAt === 'number' &&
    typeof task.updatedAt === 'number'
  );
}

export class A2ATaskStore {
  private readonly filePath: string;
  private readonly tmpPath: string;
  private readonly terminalTaskTtlMs: number;
  private readonly tasks = new Map<string, Task>();

  constructor(options?: { filePath?: string; terminalTaskTtlMs?: number }) {
    this.filePath = options?.filePath ?? getDefaultStorePath();
    this.tmpPath = `${this.filePath}.tmp`;
    this.terminalTaskTtlMs = options?.terminalTaskTtlMs ?? 60 * 60 * 1000;
    this.load();
  }

  get size(): number {
    return this.tasks.size;
  }

  entries(): IterableIterator<[string, Task]> {
    return this.tasks.entries();
  }

  values(): IterableIterator<Task> {
    return this.tasks.values();
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  list(options: {
    state?: TaskState;
    contextId?: string;
    adapterId?: string;
    limit?: number;
  } = {}): Task[] {
    const {
      state,
      contextId,
      adapterId,
      limit,
    } = options;

    let tasks = [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);

    if (state) {
      tasks = tasks.filter((task) => task.state === state);
    }
    if (contextId) {
      tasks = tasks.filter((task) => task.contextId === contextId);
    }
    if (adapterId) {
      tasks = tasks.filter((task) => task.metadata?.adapterId === adapterId);
    }
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
      tasks = tasks.slice(0, limit);
    }

    return tasks;
  }

  summarize(task: Task): TaskSummary {
    return {
      id: task.id,
      contextId: task.contextId,
      state: task.state,
      adapterId: typeof task.metadata?.adapterId === 'string' ? task.metadata.adapterId : undefined,
      adapterSelector:
        typeof task.metadata?.adapterSelector === 'string' ? task.metadata.adapterSelector : undefined,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      messageCount: task.history.length,
      artifactCount: task.artifacts.length,
      lastMessage: task.history[task.history.length - 1],
    };
  }

  set(task: Task): void {
    this.tasks.set(task.id, task);
    this.flush();
  }

  delete(taskId: string): boolean {
    const deleted = this.tasks.delete(taskId);
    if (deleted) {
      this.flush();
    }
    return deleted;
  }

  private load(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      this.flush();
      return;
    }

    let parsed: PersistedTaskDocument | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as PersistedTaskDocument;
    } catch (error) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      console.error(
        `[A2ATaskStore] Failed to read ${this.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }. Backing up to ${backup}.`,
      );
      try {
        fs.renameSync(this.filePath, backup);
      } catch {
        // noop
      }
      this.flush();
      return;
    }

    const now = Date.now();
    let repaired = false;
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    for (const candidate of tasks) {
      if (!isTaskShape(candidate)) {
        repaired = true;
        continue;
      }

      const task: Task = structuredClone(candidate);

      if (isTerminalState(task.state)) {
        if (task.updatedAt + this.terminalTaskTtlMs <= now) {
          repaired = true;
          continue;
        }
      } else {
        task.state = 'failed';
        task.error = {
          code: 'SERVER_RESTARTED',
          message: 'Pixcode restarted before this A2A task reached a terminal state.',
        };
        task.updatedAt = now;
        repaired = true;
      }

      this.tasks.set(task.id, task);
    }

    if (repaired || parsed?.version !== DOCUMENT_VERSION) {
      this.flush();
    }
  }

  private flush(): void {
    const document: PersistedTaskDocument = {
      version: DOCUMENT_VERSION,
      tasks: [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt),
    };
    fs.writeFileSync(this.tmpPath, JSON.stringify(document, null, 2), 'utf8');
    fs.renameSync(this.tmpPath, this.filePath);
  }
}
