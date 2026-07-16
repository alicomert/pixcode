export type TaskStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'AWAITING_INPUT' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type AgentType = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode';
export type TaskRole = 'backend' | 'frontend' | 'fullstack' | 'reviewer' | 'tester' | 'custom';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskRecurrence = 'none' | 'hourly' | 'daily' | 'weekly';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  agentType: AgentType;
  provider?: string;
  model?: string;
  role: TaskRole;
  priority: TaskPriority;
  predecessorTaskId?: string;
  continueSession?: boolean;
  sessionId?: string;
  maxBudgetUsd?: number;
  costUsd?: number;
  tokenCount?: { input: number; output: number };
  branchName?: string;
  worktreePath?: string;
  result?: string;
  summary?: string;
  changedFiles?: string[];
  error?: string;
  permissionMode?: string;
  scheduledAt?: string;
  recurrence?: TaskRecurrence;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface TaskInteraction {
  id: string;
  taskId: string;
  question: string;
  options?: string[];
  answer?: string;
  status: 'pending' | 'answered' | 'timeout';
  createdAt: string;
}

export interface RoleInfo {
  value: TaskRole;
  label: string;
  description: string;
  defaultAgent: AgentType;
}

export interface AgentInfo {
  value: AgentType;
  label: string;
  provider: string;
  installed?: boolean;
  authenticated?: boolean;
}
