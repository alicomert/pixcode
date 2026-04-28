// server/modules/orchestration/index.ts
// Public surface for the orchestration module.
// All cross-module consumers must import from here per
// eslint.config.js boundaries rules.

export { createA2ARouter } from './a2a/routes.js';
export { adapterRegistry } from './a2a/adapter-registry.js';
export { ClaudeCodeA2AAdapter } from './a2a/adapters/claude-code.adapter.js';
export type {
  AdapterContext,
  TaskHandle,
} from './a2a/adapters/abstract-a2a.adapter.js';
export { AbstractA2AAdapter } from './a2a/adapters/abstract-a2a.adapter.js';
export { a2aBus } from './a2a/bus.js';
export type {
  AgentCard,
  Artifact,
  ArtifactType,
  BusEvent,
  Message,
  Part,
  SubmitTaskInput,
  Task,
  TaskError,
  TaskState,
} from './a2a/types.js';
