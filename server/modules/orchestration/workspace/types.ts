import type { ExecFileOptions } from 'node:child_process';

export type WorkspaceKind = 'host' | 'worktree' | 'docker';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorkspaceHandle {
  id: string;
  kind: WorkspaceKind;
  path: string;
  baseRef: string;
  branchName?: string;
  metadata: Record<string, unknown>;
  exec(command: string, args?: string[], options?: ExecFileOptions): Promise<ExecResult>;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  diff(): Promise<string>;
  destroy(): Promise<void>;
}

export interface WorkspaceRequest {
  taskId: string;
  projectPath: string;
  kind?: WorkspaceKind;
  baseRef?: string;
  keepAfterCompletion?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceMetadata {
  id: string;
  kind: WorkspaceKind;
  path: string;
  baseRef: string;
  branchName?: string;
  keepAfterCompletion?: boolean;
}

export class WorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}
