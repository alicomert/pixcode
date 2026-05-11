import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';
import type {
  ExecResult,
  WorkspaceHandle,
  WorkspaceRequest,
} from '@/modules/orchestration/workspace/types.js';

async function run(
  command: string,
  args: string[],
): Promise<ExecResult> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout, stderr } = await execFileAsync(command, args, {
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

export class DockerWorkspace implements WorkspaceHandle {
  readonly kind = 'docker' as const;
  readonly id: string;
  readonly path: string;
  readonly baseRef: string;
  readonly metadata: Record<string, unknown>;
  private containerId?: string;
  private readonly worktreePath: string;

  constructor(request: WorkspaceRequest) {
    this.id = `docker_${request.taskId}`;
    this.path = '/workspace';
    this.baseRef = request.baseRef ?? 'HEAD';
    this.worktreePath = request.projectPath;
    this.metadata = {
      ...request.metadata,
      image: request.metadata?.image ?? 'node:22-slim',
      containerId: undefined,
      exposedPorts: [],
    };
  }

  private async ensureStarted(): Promise<void> {
    if (this.containerId) return;
    const image = String(this.metadata.image ?? 'node:22-slim');
    const pullResult = await run('docker', ['pull', image]);
    if (pullResult.exitCode !== 0) {
      throw new WorkspaceError('WORKSPACE_DOCKER_PULL_FAILED', pullResult.stderr || pullResult.stdout, {
        image,
        workspaceId: this.id,
      });
    }
    const createResult = await run('docker', [
      'create',
      '--rm',
      '-v', `${this.worktreePath}:/workspace`,
      '-w', '/workspace',
      image,
      'tail', '-f', '/dev/null',
    ]);
    if (createResult.exitCode !== 0 || !createResult.stdout.trim()) {
      throw new WorkspaceError('WORKSPACE_DOCKER_CREATE_FAILED', createResult.stderr || createResult.stdout, {
        image,
        workspaceId: this.id,
      });
    }
    this.containerId = createResult.stdout.trim();
    const startResult = await run('docker', ['start', this.containerId]);
    if (startResult.exitCode !== 0) {
      await this.cleanupContainer();
      throw new WorkspaceError('WORKSPACE_DOCKER_START_FAILED', startResult.stderr || startResult.stdout, {
        containerId: this.containerId,
        workspaceId: this.id,
      });
    }
    this.metadata.containerId = this.containerId;
  }

  private async cleanupContainer(): Promise<void> {
    if (!this.containerId) return;
    await run('docker', ['rm', '-f', this.containerId]).catch(() => {});
    this.containerId = undefined;
  }

  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    await this.ensureStarted();
    return run('docker', ['exec', this.containerId!, command, ...args]);
  }

  async readFile(relativePath: string): Promise<string> {
    await this.ensureStarted();
    const result = await run('docker', ['exec', this.containerId!, 'cat', relativePath]);
    if (result.exitCode !== 0) {
      throw new WorkspaceError('WORKSPACE_READ_FAILED', result.stderr, { path: relativePath });
    }
    return result.stdout;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    await this.ensureStarted();
    const result = await run('docker', ['exec', this.containerId!, 'sh', '-c', `cat > ${relativePath}`]);
    if (result.exitCode !== 0) {
      throw new WorkspaceError('WORKSPACE_WRITE_FAILED', result.stderr, { path: relativePath });
    }
  }

  async diff(): Promise<string> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const { stdout } = await execFileAsync('git', ['diff', `${this.baseRef}...HEAD`], {
        cwd: this.worktreePath,
        maxBuffer: 20 * 1024 * 1024,
      });
      return String(stdout);
    } catch (error) {
      const err = error as Error & { stderr?: string };
      const output = String(err.stderr ?? err.message);
      return /not a git repository|usage: git diff --no-index/i.test(output) ? '' : output;
    }
  }

  async destroy(): Promise<void> {
    await this.cleanupContainer();
  }
}
