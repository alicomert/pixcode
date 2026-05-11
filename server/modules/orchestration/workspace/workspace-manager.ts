import fs from 'node:fs';
import path from 'node:path';

import { DockerWorkspace } from '@/modules/orchestration/workspace/docker-workspace.js';
import { safeJoin } from '@/modules/orchestration/workspace/path-safety.js';
import type {
  ExecResult,
  WorkspaceHandle,
  WorkspaceKind,
  WorkspaceRequest,
} from '@/modules/orchestration/workspace/types.js';
import { WorktreeWorkspace } from '@/modules/orchestration/workspace/worktree-workspace.js';

class HostWorkspace implements WorkspaceHandle {
  readonly kind = 'host' as const;
  readonly id: string;
  readonly path: string;
  readonly baseRef: string;
  readonly metadata: Record<string, unknown>;

  constructor(request: WorkspaceRequest) {
    this.id = `host_${request.taskId}`;
    this.path = request.projectPath;
    this.baseRef = request.baseRef ?? 'HEAD';
    this.metadata = { ...request.metadata, keepAfterCompletion: true };
  }

  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: this.path,
        maxBuffer: 20 * 1024 * 1024,
      });
      return { stdout: String(stdout), stderr: String(stderr), exitCode: 0 };
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: String(err.stdout ?? ''),
        stderr: String(err.stderr ?? err.message),
        exitCode: typeof err.code === 'number' ? err.code : 1,
      };
    }
  }

  async readFile(relativePath: string): Promise<string> {
    return fs.promises.readFile(safeJoin(this.path, relativePath), 'utf8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const target = safeJoin(this.path, relativePath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, content, 'utf8');
  }

  async diff(): Promise<string> {
    const insideWorkTree = await this.exec('git', ['rev-parse', '--is-inside-work-tree']);
    if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== 'true') {
      return '';
    }

    const result = await this.exec('git', ['diff', `${this.baseRef}...HEAD`]);
    return result.exitCode === 0 ? result.stdout : result.stderr || result.stdout;
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

function readKind(value: unknown): WorkspaceKind {
  return value === 'host' || value === 'docker' || value === 'worktree' ? value : 'worktree';
}

class WorkspaceManager {
  async create(request: WorkspaceRequest): Promise<WorkspaceHandle> {
    const kind = readKind(request.kind);
    if (kind === 'host') {
      return new HostWorkspace(request);
    }
    if (kind === 'docker') {
      return new DockerWorkspace(request);
    }
    return WorktreeWorkspace.create(request);
  }

  recover(request: WorkspaceRequest): WorkspaceHandle {
    return new HostWorkspace({
      ...request,
      kind: 'host',
      metadata: {
        ...request.metadata,
        recovered: true,
      },
    });
  }
}

export const workspaceManager = new WorkspaceManager();
export type { WorkspaceManager };
