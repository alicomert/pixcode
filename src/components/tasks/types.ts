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
  conversationId?: string;
  proposalId?: string;
  cronId?: string;
  trigger?: string;
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
  updatedAt?: string;
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

export type ProposalKind = 'task' | 'cron';
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface BotProposal {
  id: string;
  conversationId?: string;
  projectId: string;
  kind: ProposalKind;
  status: ProposalStatus;
  title: string;
  prompt: string;
  agentType: AgentType;
  model?: string;
  role?: TaskRole;
  priority?: TaskPriority;
  permissionMode?: string;
  recurrence?: TaskRecurrence;
  taskId?: string;
  cronId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface BotCron {
  id: string;
  conversationId?: string;
  projectId: string;
  title: string;
  prompt: string;
  agentType: AgentType;
  model?: string;
  role?: TaskRole;
  recurrence: TaskRecurrence;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastTaskId?: string | null;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
}

export interface BotConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BotMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  kind?: string;
  proposalIds?: string[];
  taskId?: string;
  cronId?: string;
  interactionId?: string;
  taskStatus?: string;
}
