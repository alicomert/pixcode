import crypto from 'node:crypto';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import { a2aTaskStore } from '@/modules/orchestration/a2a/task-store.js';
import type {
  BusEvent,
  Message,
  SubmitTaskInput,
  Task,
  TaskState,
} from '@/modules/orchestration/a2a/types.js';
import type { TaskHandle } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import { portWatcher } from '@/modules/orchestration/preview/port-watcher.js';
import type { PreviewArtifactData } from '@/modules/orchestration/preview/types.js';
import {
  type PermissionPolicy,
  type PermissionPolicyContext,
} from '@/modules/orchestration/security/permission-policy.js';
import { workspaceManager } from '@/modules/orchestration/workspace/workspace-manager.js';
import type {
  WorkspaceHandle,
  WorkspaceKind,
  WorkspaceMetadata,
} from '@/modules/orchestration/workspace/types.js';
import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';

type RoutingHints = {
  preferredAdapterId?: string;
  preferredProvider?: string;
  preferredSkillId?: string;
};

const TERMINAL: TaskState[] = ['completed', 'canceled', 'failed'];
const MAX_TASKS = 1000;
const activeWorkspaces = new Map<string, WorkspaceHandle>();
const activeHandles = new Map<string, TaskHandle>();
const previewStops = new Map<string, () => void>();
const taskUnsubs = new Map<string, () => void>();
const finalizingTasks = new Set<string>();

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isTerminalTaskState(state: TaskState): boolean {
  return TERMINAL.includes(state);
}

function readRoutingHints(value: unknown): RoutingHints {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  return {
    preferredAdapterId:
      typeof source.preferredAdapterId === 'string' ? source.preferredAdapterId : undefined,
    preferredProvider:
      typeof source.preferredProvider === 'string' ? source.preferredProvider : undefined,
    preferredSkillId:
      typeof source.preferredSkillId === 'string' ? source.preferredSkillId : undefined,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readWorkspaceKind(value: unknown): WorkspaceKind | undefined {
  return value === 'host' || value === 'worktree' || value === 'docker' ? value : undefined;
}

function workspaceMetadata(workspace: WorkspaceHandle, keepAfterCompletion?: boolean): WorkspaceMetadata {
  return {
    id: workspace.id,
    kind: workspace.kind,
    path: workspace.path,
    baseRef: workspace.baseRef,
    branchName: workspace.branchName,
    keepAfterCompletion,
  };
}

function evictOldestTerminalTask(): boolean {
  for (const [taskId, task] of a2aTaskStore.entries()) {
    if (!isTerminalTaskState(task.state)) continue;
    const unsub = taskUnsubs.get(taskId);
    if (unsub) {
      unsub();
      taskUnsubs.delete(taskId);
    }
    a2aTaskStore.delete(taskId);
    return true;
  }
  return false;
}

async function finalizeTerminalTask(task: Task): Promise<void> {
  if (finalizingTasks.has(task.id)) return;
  finalizingTasks.add(task.id);

  const stopPreview = previewStops.get(task.id);
  if (stopPreview) {
    stopPreview();
    previewStops.delete(task.id);
  }

  const workspace = activeWorkspaces.get(task.id);
  try {
    if (workspace) {
      const diff = await workspace.diff();
      if (diff.trim()) {
        a2aBus.publish({
          kind: 'artifact',
          taskId: task.id,
          artifact: {
            artifactId: newId('art'),
            type: 'file-diff',
            parts: [{ kind: 'text', text: diff }],
            metadata: {
              source: 'workspace-diff',
              workspaceId: workspace.id,
              workspaceKind: workspace.kind,
              baseRef: workspace.baseRef,
            },
          },
        });
      }

      const keepAfterCompletion = task.metadata?.workspace &&
        typeof task.metadata.workspace === 'object' &&
        readBoolean((task.metadata.workspace as Record<string, unknown>).keepAfterCompletion);
      if (workspace.kind !== 'host' && keepAfterCompletion !== true) {
        await workspace.destroy();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    task.metadata = {
      ...task.metadata,
      workspaceFinalizationError: message,
    };
    task.updatedAt = Date.now();
    a2aTaskStore.set(task);
  } finally {
    activeWorkspaces.delete(task.id);
    activeHandles.delete(task.id);
    const unsub = taskUnsubs.get(task.id);
    if (unsub) {
      unsub();
      taskUnsubs.delete(task.id);
    }
    finalizingTasks.delete(task.id);
  }
}

function attachBusToTask(task: Task): void {
  if (taskUnsubs.has(task.id)) return;

  const unsubscribe = a2aBus.subscribe(task.id, (event: BusEvent) => {
    if (event.kind === 'task-state') {
      task.state = event.state;
      if (event.error) task.error = event.error;
      task.updatedAt = Date.now();
      a2aTaskStore.set(task);
      if (isTerminalTaskState(event.state)) {
        void finalizeTerminalTask(task);
      }
    } else if (event.kind === 'message') {
      task.history.push(event.message);
      task.updatedAt = Date.now();
      a2aTaskStore.set(task);
    } else if (event.kind === 'artifact') {
      task.artifacts.push(event.artifact);
      task.updatedAt = Date.now();
      a2aTaskStore.set(task);
    }
  });
  taskUnsubs.set(task.id, unsubscribe);
}

export function getA2ATask(taskId: string): Task | undefined {
  return a2aTaskStore.get(taskId);
}

export function listA2AAgentCards() {
  return adapterRegistry.agentCards();
}

export async function submitA2ATask(input: SubmitTaskInput): Promise<Task> {
  const metadata = input.metadata as Record<string, unknown> | undefined;
  const routing = readRoutingHints(metadata?.routing);
  const adapter = adapterRegistry.resolve(input.adapterId, routing);
  if (!adapter) {
    throw new Error(`ADAPTER_NOT_FOUND: ${input.adapterId}`);
  }

  if (a2aTaskStore.size >= MAX_TASKS && !evictOldestTerminalTask()) {
    throw new Error(`TASK_LIMIT: task store at capacity (${MAX_TASKS})`);
  }

  const userMessage: Message = input.message;
  const task: Task = {
    id: newId('task'),
    contextId: input.contextId,
    state: 'submitted',
    history: [{ ...userMessage, taskId: '' }],
    artifacts: [],
    metadata: {
      ...metadata,
      adapterId: adapter.id,
      adapterSelector: input.adapterId,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  task.history[0] = { ...userMessage, taskId: task.id };
  a2aTaskStore.set(task);
  attachBusToTask(task);

  const workspaceOptions = (metadata?.workspace && typeof metadata.workspace === 'object'
    ? metadata.workspace
    : {}) as Record<string, unknown>;
  let workspace: WorkspaceHandle;
  try {
    workspace = await workspaceManager.create({
      taskId: task.id,
      projectPath: readString(workspaceOptions.projectPath) ?? process.cwd(),
      kind: readWorkspaceKind(workspaceOptions.kind) ?? readWorkspaceKind(metadata?.isolation),
      baseRef: readString(workspaceOptions.baseRef) ?? readString(metadata?.baseRef) ?? 'HEAD',
      keepAfterCompletion: readBoolean(workspaceOptions.keepAfterCompletion),
      metadata: workspaceOptions,
    });
  } catch (err) {
    const workspaceError = err instanceof WorkspaceError ? err : undefined;
    a2aBus.publish({
      kind: 'task-state',
      taskId: task.id,
      state: 'failed',
      error: {
        code: workspaceError?.code ?? 'WORKSPACE_CREATE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        details: workspaceError?.details,
      },
    });
    return a2aTaskStore.get(task.id) ?? task;
  }

  activeWorkspaces.set(task.id, workspace);
  task.metadata = {
    ...task.metadata,
    workspace: workspaceMetadata(workspace, readBoolean(workspaceOptions.keepAfterCompletion)),
  };
  task.updatedAt = Date.now();
  a2aTaskStore.set(task);

  previewStops.set(
    task.id,
    portWatcher.watch({
      taskId: task.id,
      workspace,
      onPort: (event) => {
        const data: PreviewArtifactData = {
          url: event.url,
          proxiedUrl: `/preview/${event.port}/`,
          port: event.port,
          host: event.host,
          processName: event.processName,
          confidence: event.confidence,
        };
        a2aBus.publish({
          kind: 'artifact',
          taskId: task.id,
          artifact: {
            artifactId: newId('art'),
            type: 'preview-url',
            parts: [{ kind: 'data', data: { ...data } }],
            metadata: {
              source: 'port-watcher',
              workspaceId: workspace.id,
            },
          },
        });
      },
    }),
  );

  try {
    const handle = await adapter.submitTask(task, {
      cwd: workspace.path,
      workspace,
      model: readString(metadata?.model),
      permissionMode: readString(metadata?.permissionMode),
      permissionPolicy: readObject(metadata?.permissionPolicy) as PermissionPolicy | undefined,
      permissionPolicyContext: readObject(metadata?.permissionPolicyContext) as PermissionPolicyContext | undefined,
      toolsSettings: readObject(metadata?.toolsSettings),
    });
    activeHandles.set(task.id, handle);
    handle.finished.finally(() => {
      activeHandles.delete(task.id);
    }).catch(() => undefined);
  } catch (err) {
    a2aBus.publish({
      kind: 'task-state',
      taskId: task.id,
      state: 'failed',
      error: {
        code: 'ADAPTER_SUBMIT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }

  return a2aTaskStore.get(task.id) ?? task;
}

export async function cancelA2ATask(taskId: string, adapterId?: string): Promise<Task | undefined> {
  const task = a2aTaskStore.get(taskId);
  if (!task) return undefined;

  const handle = activeHandles.get(taskId);
  if (handle) {
    await handle.cancel();
    return a2aTaskStore.get(taskId) ?? task;
  }

  const resolvedAdapterId = adapterId ?? readString(task.metadata?.adapterId);
  const adapter = resolvedAdapterId ? adapterRegistry.resolve(resolvedAdapterId) : undefined;
  if (adapter) {
    await adapter.cancelTask(task.id);
    return a2aTaskStore.get(task.id) ?? task;
  }

  a2aBus.publish({ kind: 'task-state', taskId: task.id, state: 'canceled' });
  return a2aTaskStore.get(task.id) ?? task;
}
