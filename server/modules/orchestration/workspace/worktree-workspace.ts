import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { assertSafeId, safeJoin, safeWorkspacePath } from '@/modules/orchestration/workspace/path-safety.js';
import type {
  ExecResult,
  WorkspaceHandle,
  WorkspaceRequest,
} from '@/modules/orchestration/workspace/types.js';
import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';

const execFileAsync = promisify(execFile);

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      stdout: String(stdout),
      stderr: String(stderr),
      exitCode: 0,
    };
  } catch (error) {
    const err = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number;
    };
    return {
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? err.message),
      exitCode: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

export class WorktreeWorkspace implements WorkspaceHandle {
  readonly kind = 'worktree' as const;
  readonly id: string;
  readonly path: string;
  readonly baseRef: string;
  readonly branchName: string;
  readonly metadata: Record<string, unknown>;
  private readonly projectPath: string;

  private constructor(request: WorkspaceRequest, workspaceId: string, branchName: string) {
    this.id = workspaceId;
    this.path = safeWorkspacePath(workspaceId);
    this.baseRef = request.baseRef ?? 'HEAD';
    this.branchName = branchName;
    this.projectPath = request.projectPath;
    this.metadata = {
      ...request.metadata,
      keepAfterCompletion: request.keepAfterCompletion === true,
    };
  }

  static async create(request: WorkspaceRequest): Promise<WorktreeWorkspace> {
    assertSafeId(request.taskId, 'task id');
    const workspaceId = `ws_${request.taskId}`;
    const branchName = `pixcode/task_${request.taskId}`;
    const workspace = new WorktreeWorkspace(request, workspaceId, branchName);

    const existingBranch = await run('git', ['rev-parse', '--verify', branchName], request.projectPath);
    if (existingBranch.exitCode === 0) {
      throw new WorkspaceError('WORKSPACE_EXISTS', `Workspace branch already exists: ${branchName}`, {
        branchName,
      });
    }

    const result = await run(
      'git',
      ['worktree', 'add', workspace.path, '-b', branchName, workspace.baseRef],
      request.projectPath,
    );
    if (result.exitCode !== 0) {
      throw new WorkspaceError('WORKSPACE_CREATE_FAILED', result.stderr || result.stdout, {
        stdout: result.stdout,
        stderr: result.stderr,
        baseRef: workspace.baseRef,
      });
    }

    return workspace;
  }

  exec(command: string, args: string[] = []): Promise<ExecResult> {
    return run(command, args, this.path);
  }

  async readFile(relativePath: string): Promise<string> {
    return fs.readFile(safeJoin(this.path, relativePath), 'utf8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const target = safeJoin(this.path, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }

  async diff(): Promise<string> {
    const result = await run('git', ['diff', `${this.baseRef}...HEAD`], this.path);
    if (result.exitCode !== 0) {
      return result.stderr || result.stdout;
    }
    return result.stdout;
  }

  async destroy(): Promise<void> {
    const result = await run('git', ['worktree', 'remove', '--force', this.path], this.projectPath);
    if (result.exitCode !== 0) {
      throw new WorkspaceError('WORKSPACE_DESTROY_FAILED', result.stderr || result.stdout, {
        workspacePath: this.path,
      });
    }
  }
}
