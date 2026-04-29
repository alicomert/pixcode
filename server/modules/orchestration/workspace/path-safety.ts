import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkspaceError } from '@/modules/orchestration/workspace/types.js';

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export function getWorktreesRoot(): string {
  return process.env.PIXCODE_WORKTREES_ROOT ?? path.join(os.homedir(), '.pixcode', 'worktrees');
}

export function assertSafeId(value: string, label: string): string {
  if (!SAFE_ID.test(value) || value.includes('..')) {
    throw new WorkspaceError('UNSAFE_WORKSPACE_ID', `Unsafe ${label}: ${value}`, { value, label });
  }
  return value;
}

export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function safeWorkspacePath(workspaceId: string): string {
  assertSafeId(workspaceId, 'workspace id');
  const root = getWorktreesRoot();
  ensureDirectory(root);
  const resolvedRoot = fs.realpathSync.native(root);
  const target = path.resolve(resolvedRoot, workspaceId);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new WorkspaceError('WORKSPACE_PATH_TRAVERSAL', 'Workspace path escaped root', {
      root: resolvedRoot,
      target,
    });
  }
  return target;
}

export function safeJoin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new WorkspaceError('WORKSPACE_PATH_TRAVERSAL', 'Workspace file path must be relative', {
      relativePath,
    });
  }

  const target = path.resolve(root, relativePath);
  const resolvedRoot = fs.existsSync(root) ? fs.realpathSync.native(root) : path.resolve(root);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`) && target !== resolvedRoot) {
    throw new WorkspaceError('WORKSPACE_PATH_TRAVERSAL', 'Workspace file path escaped root', {
      root: resolvedRoot,
      target,
    });
  }
  return target;
}
