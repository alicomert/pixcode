export type OrchestrationTaskState = 'todo' | 'in_progress' | 'in_review' | 'done' | 'failed' | 'canceled';

export interface OrchestrationTask {
  id: string;
  a2aTaskId?: string;
  taskmasterId?: string;
  projectId: string;
  title: string;
  description?: string;
  state: OrchestrationTaskState;
  adapterId?: string;
  adapterSelector?: string;
  workspaceKind?: 'host' | 'worktree' | 'docker';
  workspacePath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateOrchestrationTaskInput {
  projectId: string;
  title: string;
  description?: string;
  taskmasterId?: string;
}

export interface DispatchOrchestrationTaskInput {
  adapterId: string;
  isolation?: 'host' | 'worktree' | 'docker';
}
