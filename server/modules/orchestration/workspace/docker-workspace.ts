import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';
import type {
  ExecResult,
  WorkspaceHandle,
  WorkspaceRequest,
} from '@/modules/orchestration/workspace/types.js';

export class DockerWorkspace implements WorkspaceHandle {
  readonly kind = 'docker' as const;
  readonly id: string;
  readonly path: string;
  readonly baseRef: string;
  readonly metadata: Record<string, unknown>;

  constructor(request: WorkspaceRequest) {
    this.id = `docker_${request.taskId}`;
    this.path = '/workspace';
    this.baseRef = request.baseRef ?? 'HEAD';
    this.metadata = {
      ...request.metadata,
      image: request.metadata?.image,
      containerId: undefined,
      exposedPorts: [],
    };
  }

  private notImplemented(): never {
    throw new WorkspaceError(
      'WORKSPACE_DOCKER_NOT_IMPLEMENTED',
      'Docker workspace execution is not implemented yet.',
      { workspaceId: this.id },
    );
  }

  exec(): Promise<ExecResult> {
    this.notImplemented();
  }

  readFile(): Promise<string> {
    this.notImplemented();
  }

  writeFile(): Promise<void> {
    this.notImplemented();
  }

  diff(): Promise<string> {
    this.notImplemented();
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}
