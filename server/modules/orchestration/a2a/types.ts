// server/modules/orchestration/a2a/types.ts
// A2A protocol v0.2 types — minimal surface used by pixcode.
// See https://a2a-protocol.org for the full spec; this file
// keeps only what the orchestrator actually exchanges.

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed';

export type Role = 'user' | 'agent';

export type PartKind = 'text' | 'file' | 'data';

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface FilePart {
  kind: 'file';
  name: string;
  mimeType?: string;
  bytesBase64?: string;
  uri?: string;
}

export interface DataPart {
  kind: 'data';
  data: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

export interface Message {
  messageId: string;
  role: Role;
  parts: Part[];
  /** Required for task-scoped messages. Omit only for broadcast/standalone messages. */
  taskId?: string;
}

export type ArtifactType =
  | 'file-diff'
  | 'command-output'
  | 'preview-url'
  | 'data';

// Note: Artifact and AuthScheme use `type` discriminator (matches A2A
// v0.2 wire format). Part and BusEvent use `kind` per the same spec.
export interface Artifact {
  artifactId: string;
  type: ArtifactType;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Task {
  id: string;
  contextId?: string;
  state: TaskState;
  history: Message[];
  artifacts: Artifact[];
  error?: TaskError;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TaskSummary {
  id: string;
  contextId?: string;
  state: TaskState;
  adapterId?: string;
  adapterSelector?: string;
  error?: TaskError;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  artifactCount: number;
  lastMessage?: Message;
}

export interface AgentSkill {
  id: string;
  description: string;
  examples?: string[];
}

export type AuthScheme =
  | { type: 'none' }
  | { type: 'bearer' }
  | { type: 'mtls' };

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  skills: AgentSkill[];
  authentication: AuthScheme;
}

export interface SubmitTaskInput {
  message: Message;
  contextId?: string;
  metadata?: Record<string, unknown>;
  /** Adapter id, "auto", or "skill:<id>". Resolved by the adapter registry. */
  adapterId: string;
}

export type BusEvent =
  | { kind: 'task-state'; taskId: string; state: TaskState; error?: TaskError }
  | { kind: 'message'; taskId: string; message: Message }
  | { kind: 'artifact'; taskId: string; artifact: Artifact };
