import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type WorkspaceTargetKind = 'selected_project' | 'pixcode_app' | 'custom';

export type ResolvedWorkspaceTarget = {
  kind: WorkspaceTargetKind;
  label: string;
  projectPath: string;
  selectedProjectPath?: string;
  selectedProjectName?: string;
  appRoot: string;
};

const pixcodePackageName = '@pixelbyte-software/pixcode';

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readTargetKind(value: unknown): WorkspaceTargetKind | undefined {
  return value === 'selected_project' || value === 'pixcode_app' || value === 'custom'
    ? value
    : undefined;
}

export function findPixcodeAppRoot(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const packagePath = resolve(currentDir, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
      if (pkg.name === pixcodePackageName) {
        return currentDir;
      }
    } catch {
      // Walk upward until the Pixcode package root is found.
    }

    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return process.cwd();
}

export function resolveWorkflowWorkspace(metadata?: Record<string, unknown>): ResolvedWorkspaceTarget {
  const target = readRecord(metadata?.workspaceTarget);
  const appRoot = findPixcodeAppRoot();
  const selectedProjectPath = readString(metadata?.selectedProjectPath) ?? readString(metadata?.projectPath);
  const selectedProjectName = readString(metadata?.projectName) ?? readString(metadata?.projectId);
  const kind = readTargetKind(target?.kind) ?? 'selected_project';
  const customPath = readString(target?.projectPath);

  if (kind === 'pixcode_app') {
    return {
      kind,
      label: 'Pixcode app',
      projectPath: appRoot,
      selectedProjectPath,
      selectedProjectName,
      appRoot,
    };
  }

  if (kind === 'custom') {
    return {
      kind,
      label: readString(target?.label) ?? 'Custom workspace',
      projectPath: customPath ?? selectedProjectPath ?? appRoot,
      selectedProjectPath,
      selectedProjectName,
      appRoot,
    };
  }

  return {
    kind: 'selected_project',
    label: selectedProjectName ?? 'Selected project',
    projectPath: selectedProjectPath ?? appRoot,
    selectedProjectPath,
    selectedProjectName,
    appRoot,
  };
}

export function workspaceTargetMetadata(target: ResolvedWorkspaceTarget): Record<string, unknown> {
  return {
    kind: target.kind,
    label: target.label,
    projectPath: target.projectPath,
    selectedProjectPath: target.selectedProjectPath,
    selectedProjectName: target.selectedProjectName,
    appRoot: target.appRoot,
  };
}

export function workspaceContextPrompt(target: ResolvedWorkspaceTarget): string {
  return [
    'Pixcode orchestration execution context:',
    `- Target workspace: ${target.label}`,
    `- Working directory for this agent: ${target.projectPath}`,
    target.selectedProjectName ? `- Selected UI project: ${target.selectedProjectName}` : '',
    target.selectedProjectPath ? `- Selected UI project path: ${target.selectedProjectPath}` : '',
    `- Pixcode app root: ${target.appRoot}`,
    '',
    'Rules:',
    '- Treat the working directory above as the authoritative project/application for this task.',
    '- Do not guess another repository path unless the user explicitly asks for it.',
    '- If the user asks to analyze or modify Pixcode/orchestration itself, the target workspace must be the Pixcode app root.',
    '- Before running package-manager commands, inspect the package files in the working directory.',
  ].filter(Boolean).join('\n');
}
