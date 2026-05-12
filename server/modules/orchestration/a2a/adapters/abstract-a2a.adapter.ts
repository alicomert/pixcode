// server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts
// Base class every CLI adapter extends. Adapters wrap the
// existing per-CLI runtime files (claude-sdk.js, openai-codex.js, ...)
// and translate between A2A messages and the CLI's native I/O.

import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type {
  AgentCard,
  Artifact,
  Message,
  Task,
  TaskError,
  TaskState,
} from '@/modules/orchestration/a2a/types.js';
import type { WorkspaceHandle } from '@/modules/orchestration/workspace/types.js';
import type {
  PermissionPolicy,
  PermissionPolicyContext,
} from '@/modules/orchestration/security/permission-policy.js';

export interface AdapterContext {
  /** Isolated execution workspace for the task. */
  workspace: WorkspaceHandle;
  /** Compatibility alias while legacy adapters still accept cwd directly. */
  cwd: string;
  /** pixcode permission mode passed through to the underlying CLI. */
  permissionMode?: string;
  /** Provider-independent permission/sandbox policy evaluated before runtime tool use. */
  permissionPolicy?: PermissionPolicy;
  /** Run context preserved when the policy needs a human approval. */
  permissionPolicyContext?: PermissionPolicyContext;
  /** Provider model selected by the user in Pixcode. */
  model?: string;
  /** Provider-specific tool / permission settings from Pixcode Settings. */
  toolsSettings?: Record<string, unknown>;
  /** Optional parent task id when this adapter is invoked inside a workflow. */
  parentTaskId?: string;
}

export interface TaskHandle {
  cancel(): Promise<void>;
  finished: Promise<void>;
}

export abstract class AbstractA2AAdapter {
  abstract readonly id: string;
  abstract readonly agentCard: AgentCard;

  abstract submitTask(task: Task, ctx: AdapterContext): Promise<TaskHandle>;
  abstract cancelTask(taskId: string): Promise<void>;

  protected emitState(taskId: string, state: TaskState, error?: TaskError): void {
    a2aBus.publish({ kind: 'task-state', taskId, state, error });
  }

  protected emitMessage(taskId: string, message: Message): void {
    a2aBus.publish({ kind: 'message', taskId, message });
  }

  protected emitArtifact(taskId: string, artifact: Artifact): void {
    a2aBus.publish({ kind: 'artifact', taskId, artifact });
  }
}
