export type OrchestrationTaskState = 'todo' | 'in_progress' | 'in_review' | 'done' | 'failed' | 'canceled';

export interface OrchestrationTask {
  id: string;
  hermesTaskId?: string;
  workflowRunIds?: string[];
  projectId: string;
  title: string;
  description?: string;
  state: OrchestrationTaskState;
  acceptanceCriteria?: Array<{
    id: string;
    label: string;
    status: 'pending' | 'passed' | 'failed';
    source: 'workflow' | 'hermes';
  }>;
  changedFiles?: string[];
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
  acceptanceCriteria?: OrchestrationTask['acceptanceCriteria'];
  changedFiles?: string[];
}

export interface DispatchOrchestrationTaskInput {
  adapterId: string;
  isolation?: 'host' | 'worktree' | 'docker';
  projectPath?: string;
  model?: string;
  permissionMode?: string;
}
