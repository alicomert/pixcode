export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowNodeStatus = WorkflowRunStatus | 'skipped';

export interface WorkflowNode {
  id: string;
  adapterId: string;
  prompt: string;
  inputs: string[];
  output: 'message' | 'artifact' | 'both';
  onFail: 'abort' | 'continue' | 'retry';
  stage?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  assignment?: string;
  model?: string;
  permissionMode?: string;
  toolsSettings?: Record<string, unknown>;
  isolation?: 'host' | 'worktree' | 'docker';
  timeoutMs?: number;
  internal?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: 'manual' | 'on-task-create' | 'on-pr-open';
  nodes: WorkflowNode[];
  isBuiltin?: boolean;
}

export interface WorkflowNodeRun {
  nodeId: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  assignment?: string;
  promptPreview?: string;
  model?: string;
  permissionMode?: string;
  timeoutMs?: number;
  stage?: string;
  internal?: boolean;
  status: WorkflowNodeStatus;
  a2aTaskId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  outputText?: string;
  messages?: Array<{
    role: string;
    text: string;
    createdAt?: number;
  }>;
  artifacts?: Array<{
    type: string;
    text?: string;
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  contextId: string;
  status: WorkflowRunStatus;
  nodeRuns: WorkflowNodeRun[];
  input?: string;
  startedAt: number;
  finishedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTraceEvent {
  id: string;
  type: 'run' | 'node' | 'provider' | 'message' | 'artifact' | 'file' | 'error';
  severity: 'info' | 'warning' | 'error';
  status: WorkflowRunStatus | WorkflowNodeStatus | 'submitted';
  timestamp: number;
  durationMs?: number;
  actor: string;
  title: string;
  titleKey?: string;
  summary?: string;
  detail?: string;
  nodeId?: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}
