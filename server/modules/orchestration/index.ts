// server/modules/orchestration/index.ts
// Public surface for the orchestration module.
// All cross-module consumers must import from here per
// eslint.config.js boundaries rules.

export { createA2ARouter } from './a2a/routes.js';
export { adapterRegistry } from './a2a/adapter-registry.js';
export { ClaudeCodeA2AAdapter } from './a2a/adapters/claude-code.adapter.js';
export { CodexA2AAdapter } from './a2a/adapters/codex.adapter.js';
export { CursorA2AAdapter } from './a2a/adapters/cursor.adapter.js';
export { GeminiA2AAdapter } from './a2a/adapters/gemini.adapter.js';
export { QwenA2AAdapter } from './a2a/adapters/qwen.adapter.js';
export { OpenCodeA2AAdapter } from './a2a/adapters/opencode.adapter.js';
export type {
  AdapterContext,
  TaskHandle,
} from './a2a/adapters/abstract-a2a.adapter.js';
export { AbstractA2AAdapter } from './a2a/adapters/abstract-a2a.adapter.js';
export { a2aBus } from './a2a/bus.js';
export { portWatcher } from './preview/port-watcher.js';
export { createPreviewProxyRouter } from './preview/preview-proxy.js';
export { createOrchestrationTaskRouter } from './tasks/orchestration-task.routes.js';
export { orchestrationTaskService } from './tasks/orchestration-task.service.js';
export { createWorkflowRouter } from './workflows/workflow.routes.js';
export { workflowRunner } from './workflows/workflow-runner.js';
export { workflowStore } from './workflows/workflow-store.js';
export { workspaceManager } from './workspace/workspace-manager.js';
export type {
  AgentCard,
  Artifact,
  ArtifactType,
  BusEvent,
  Message,
  Part,
  SubmitTaskInput,
  Task,
  TaskSummary,
  TaskError,
  TaskState,
} from './a2a/types.js';
export type {
  PortEvent,
  PreviewArtifactData,
} from './preview/types.js';
export type {
  CreateOrchestrationTaskInput,
  DispatchOrchestrationTaskInput,
  OrchestrationTask,
  OrchestrationTaskState,
} from './tasks/orchestration-task.types.js';
export type {
  Workflow,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowNodeStatus,
  WorkflowRun,
  WorkflowRunStatus,
} from './workflows/workflow.types.js';
export type {
  ExecResult,
  WorkspaceHandle,
  WorkspaceKind,
  WorkspaceMetadata,
  WorkspaceRequest,
} from './workspace/types.js';
export { WorkspaceError } from './workspace/types.js';
