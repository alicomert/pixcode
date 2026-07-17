export type TaskStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'AWAITING_INPUT' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type AgentType = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode' | 'grok';
export type TaskRole = 'backend' | 'frontend' | 'fullstack' | 'reviewer' | 'tester' | 'custom';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskRecurrence = 'none' | 'hourly' | 'daily' | 'weekly';
export type AutonomyLevel = 'supervised' | 'auto';
export type PlanStatus = 'approved' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  assignedProvider?: AgentType;
  agentType?: AgentType;
  model?: string;
  role?: TaskRole;
  dependsOn?: string[];
  status?: PlanStepStatus;
  taskId?: string | null;
  adaptive?: boolean;
}

export interface BotPlan {
  id: string;
  conversationId?: string;
  projectId: string;
  title: string;
  prompt: string;
  status: PlanStatus;
  autonomyLevel?: AutonomyLevel;
  steps: PlanStep[];
  parentPlanId?: string | null;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string;
  reportSent?: boolean;
}

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
  dependsOnTaskIds?: string[];
  continueSession?: boolean;
  sessionId?: string;
  conversationId?: string;
  proposalId?: string;
  planId?: string;
  planStepId?: string;
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

export type ProposalKind = 'task' | 'cron' | 'plan';
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
  recurrence?: TaskRecurrence | string;
  cronExpression?: string;
  autonomyLevel?: AutonomyLevel;
  planSteps?: PlanStep[];
  planId?: string;
  taskId?: string;
  cronId?: string;
  adaptiveForPlanId?: string;
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
  recurrence?: TaskRecurrence | string;
  cronExpression?: string;
  autonomyLevel?: AutonomyLevel;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastTaskId?: string | null;
  lastPlanId?: string | null;
  lastRunStatus?: string | null;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
}

/** NanoClaw scheduled job (once / interval / cron) — source of truth for timed PixBot work. */
export type ScheduledTaskStatus = 'active' | 'paused' | 'completed' | 'cancelled' | string;
export type ScheduleType = 'once' | 'interval' | 'cron' | string;

export interface ScheduledTask {
  id: string;
  projectId: string;
  title?: string;
  prompt: string;
  scheduleType: ScheduleType;
  scheduleValue?: string;
  cronExpression?: string;
  recurrence?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastResult?: string | null;
  /** Human-readable unwrap of lastResult (JSON `{ result }` → plain text) */
  resultText?: string | null;
  status: ScheduledTaskStatus;
  enabled?: boolean;
  contextMode?: string;
  createdAt: string;
  agentType?: string;
  /** Parsed from `[agent:…]` prefix when present */
  agent?: string | null;
  model?: string | null;
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
  agentType?: AgentType | string | null;
  meta?: Record<string, unknown>;
  proposalIds?: string[];
  taskId?: string;
  planId?: string;
  cronId?: string;
  interactionId?: string;
  taskStatus?: string;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  label: string;
  path?: string;
}
