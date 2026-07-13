import os from 'node:os';
import path from 'node:path';

export const PIXCODE_PERMISSION_POLICY_PROTOCOL = 'pixcode.permission-policy.v1' as const;

export const PERMISSION_CAPABILITIES = [
  'shell',
  'file_write',
  'external_directory',
  'network',
  'secret',
] as const;

export const PERMISSION_POLICY_MODES = ['allow', 'deny', 'prompt', 'audit'] as const;

export type PermissionCapability = typeof PERMISSION_CAPABILITIES[number];
export type PermissionPolicyMode = typeof PERMISSION_POLICY_MODES[number];
export type PermissionDecisionStatus = 'allowed' | 'denied' | 'needs_approval';

export interface PermissionPolicy {
  protocol: typeof PIXCODE_PERMISSION_POLICY_PROTOCOL;
  modes: Record<PermissionCapability, PermissionPolicyMode>;
  allowedExternalDirectories: string[];
  audit: boolean;
}

export interface PermissionRequest {
  requestId?: string;
  source: 'workflow_node' | 'provider_tool' | 'api' | 'shell' | 'file' | string;
  capability?: PermissionCapability;
  capabilities?: PermissionCapability[];
  toolName?: string;
  command?: string;
  input?: unknown;
  cwd?: string;
  workspacePath?: string;
  targetPaths?: string[];
  summary?: string;
}

export interface PermissionPolicyContext {
  runId?: string;
  nodeId?: string;
  workflowId?: string;
  adapterId?: string;
  agentLabel?: string;
  userId?: string | number | null;
}

export interface PermissionApprovalRequest {
  id: string;
  protocol: typeof PIXCODE_PERMISSION_POLICY_PROTOCOL;
  status: 'pending' | 'allowed' | 'denied' | 'canceled';
  capabilities: PermissionCapability[];
  source: string;
  toolName?: string;
  runId?: string;
  nodeId?: string;
  workflowId?: string;
  adapterId?: string;
  agentLabel?: string;
  summary?: string;
  message: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string | number | null;
  resolutionMessage?: string;
}

export interface PermissionPolicyEvent {
  id: string;
  protocol: typeof PIXCODE_PERMISSION_POLICY_PROTOCOL;
  status: PermissionDecisionStatus;
  behavior: 'allow' | 'deny' | 'prompt';
  capabilities: PermissionCapability[];
  source: string;
  toolName?: string;
  summary?: string;
  message: string;
  modeByCapability: Partial<Record<PermissionCapability, PermissionPolicyMode>>;
  audit: boolean;
  runId?: string;
  nodeId?: string;
  workflowId?: string;
  adapterId?: string;
  agentLabel?: string;
  createdAt: number;
}

export interface PermissionDecision {
  protocol: typeof PIXCODE_PERMISSION_POLICY_PROTOCOL;
  requestId: string;
  status: PermissionDecisionStatus;
  behavior: 'allow' | 'deny' | 'prompt';
  capabilities: PermissionCapability[];
  modeByCapability: Partial<Record<PermissionCapability, PermissionPolicyMode>>;
  message: string;
  audit: boolean;
  event: PermissionPolicyEvent;
  approvalRequest?: PermissionApprovalRequest;
}

const DEFAULT_MODES: Record<PermissionCapability, PermissionPolicyMode> = {
  shell: 'audit',
  file_write: 'audit',
  external_directory: 'audit',
  network: 'audit',
  secret: 'audit',
};

const NETWORK_COMMAND_PATTERN = /\b(curl|wget|fetch|ssh|scp|rsync|gh|git\s+(?:clone|fetch|pull|push)|npm\s+(?:install|publish|view|pack|audit)|pnpm\s+(?:install|publish)|yarn\s+(?:install|publish)|pip\s+install|cargo\s+(?:install|publish)|go\s+(?:get|install)|docker\s+(?:pull|push|run))\b|https?:\/\//iu;
const FILE_WRITE_COMMAND_PATTERN = /(^|\s)(apply_patch|touch|mkdir|rm|mv|cp|tee|sed\s+-i|perl\s+-pi|truncate|chmod|chown)\b|>>?|\b(write|edit|patch|delete|create)\s+(?:file|folder|directory)\b/iu;
const SECRET_COMMAND_PATTERN = /\b(printenv|env|set)\b|\b(cat|type|less|more)\s+(\S*\.env\b|\S*secret\S*|\S*token\S*|\S*key\S*)/iu;
const SECRET_VALUE_PATTERN = /\b(?:sk|ghp|github_pat|glpat|npm)_[A-Za-z0-9_=-]{12,}\b|(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/iu;

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMode(value: unknown): PermissionPolicyMode | undefined {
  return typeof value === 'string' && (PERMISSION_POLICY_MODES as readonly string[]).includes(value)
    ? value as PermissionPolicyMode
    : undefined;
}

function uniqueCapabilities(values: Array<PermissionCapability | undefined>): PermissionCapability[] {
  return [...new Set(values.filter((value): value is PermissionCapability => Boolean(value)))];
}

function requestId(value?: string): string {
  return value?.trim() || `perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePath(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return path.resolve(value);
  } catch {
    return undefined;
  }
}

function isInsidePath(basePath: string | undefined, candidatePath: string | undefined): boolean {
  const base = normalizePath(basePath);
  const candidate = normalizePath(candidatePath);
  if (!base || !candidate) return true;
  if (candidate === base) return true;
  const relative = path.relative(base, candidate);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function collectInputPaths(input: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      if (/^(?:[A-Za-z]:[\\/]|\/|~\/|\.\.?[\\/])/u.test(value.trim())) {
        paths.push(value.trim().replace(/^~(?=$|[\\/])/u, os.homedir()));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = readRecord(value);
    if (!record) return;
    for (const [key, nested] of Object.entries(record)) {
      if (/path|file|dir|cwd|target|source|destination/iu.test(key)) {
        visit(nested);
      }
    }
  };
  visit(input);
  return paths;
}

function inferCapabilities(request: PermissionRequest): PermissionCapability[] {
  const capabilities: PermissionCapability[] = [];
  if (request.capability) capabilities.push(request.capability);
  if (Array.isArray(request.capabilities)) capabilities.push(...request.capabilities);

  const toolName = request.toolName?.toLocaleLowerCase('en') ?? '';
  const command = [
    request.command,
    typeof request.input === 'string' ? request.input : undefined,
    readString(readRecord(request.input)?.command),
    readString(readRecord(request.input)?.query),
  ].filter(Boolean).join('\n');
  const inputText = [
    command,
    typeof request.summary === 'string' ? request.summary : undefined,
    typeof request.input === 'object' ? JSON.stringify(request.input) : undefined,
  ].filter(Boolean).join('\n');

  if (toolName === 'bash' || toolName.includes('shell') || toolName.includes('terminal') || command.trim()) {
    capabilities.push('shell');
  }
  if (/write|edit|multiedit|notebookedit|delete|patch/iu.test(toolName) || FILE_WRITE_COMMAND_PATTERN.test(command)) {
    capabilities.push('file_write');
  }
  if (/webfetch|websearch|fetch|search/iu.test(toolName) || NETWORK_COMMAND_PATTERN.test(command)) {
    capabilities.push('network');
  }
  if (/secret|credential|token|keychain|vault/iu.test(toolName) || SECRET_COMMAND_PATTERN.test(command) || SECRET_VALUE_PATTERN.test(inputText)) {
    capabilities.push('secret');
  }

  const targetPaths = [
    ...(Array.isArray(request.targetPaths) ? request.targetPaths : []),
    ...collectInputPaths(request.input),
  ];
  if (targetPaths.some((targetPath) => !isInsidePath(request.workspacePath ?? request.cwd, targetPath))) {
    capabilities.push('external_directory');
  }

  return uniqueCapabilities(capabilities);
}

export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = {
  protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
  modes: DEFAULT_MODES,
  allowedExternalDirectories: [],
  audit: true,
};

export function normalizePermissionPolicy(value?: unknown): PermissionPolicy {
  const record = readRecord(value);
  const modeRecord = readRecord(record?.modes) ?? readRecord(record?.rules) ?? record ?? {};
  const modes = { ...DEFAULT_MODES };
  for (const capability of PERMISSION_CAPABILITIES) {
    modes[capability] = readMode(modeRecord[capability]) ?? modes[capability];
  }

  const allowedExternalDirectories = Array.isArray(record?.allowedExternalDirectories)
    ? record.allowedExternalDirectories
      .map((item) => readString(item))
      .filter((item): item is string => Boolean(item))
    : [];

  return {
    protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
    modes,
    allowedExternalDirectories,
    audit: typeof record?.audit === 'boolean' ? record.audit : true,
  };
}

export function resolvePermissionPolicyFromMetadata(metadata?: Record<string, unknown>): PermissionPolicy {
  const settings = readRecord(metadata?.settings);
  return normalizePermissionPolicy(metadata?.permissionPolicy ?? settings?.permissionPolicy);
}

export function redactPermissionText(
  value: string | undefined,
  context?: { workspacePath?: string; cwd?: string; projectPath?: string },
): string | undefined {
  if (!value?.trim()) return undefined;
  const candidates = [
    os.homedir(),
    context?.workspacePath,
    context?.cwd,
    context?.projectPath,
  ].filter((item): item is string => Boolean(item && item.length > 2));

  let text = value;
  for (const candidate of candidates) {
    text = text.split(candidate).join('[workspace]');
  }

  return text
    .replace(SECRET_VALUE_PATTERN, '[redacted-secret]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .trim();
}

function modeAllowsExternalDirectory(
  request: PermissionRequest,
  policy: PermissionPolicy,
): boolean {
  const targetPaths = [
    ...(Array.isArray(request.targetPaths) ? request.targetPaths : []),
    ...collectInputPaths(request.input),
  ];
  if (!targetPaths.length || !policy.allowedExternalDirectories.length) return false;

  return targetPaths.every((targetPath) =>
    policy.allowedExternalDirectories.some((allowedPath) => isInsidePath(allowedPath, targetPath)),
  );
}

export function createPermissionApprovalRequest(
  decision: Omit<PermissionDecision, 'approvalRequest'>,
  context?: PermissionPolicyContext,
): PermissionApprovalRequest {
  return {
    id: decision.requestId,
    protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
    status: 'pending',
    capabilities: decision.capabilities,
    source: decision.event.source,
    toolName: decision.event.toolName,
    runId: context?.runId,
    nodeId: context?.nodeId,
    workflowId: context?.workflowId,
    adapterId: context?.adapterId,
    agentLabel: context?.agentLabel,
    summary: decision.event.summary,
    message: decision.message,
    createdAt: decision.event.createdAt,
  };
}

export function evaluatePermissionRequest({
  policy: policyInput,
  request,
  context,
}: {
  policy?: unknown;
  request: PermissionRequest;
  context?: PermissionPolicyContext;
}): PermissionDecision {
  const policy = normalizePermissionPolicy(policyInput);
  const id = requestId(request.requestId);
  const capabilities = inferCapabilities(request);
  const modeByCapability: Partial<Record<PermissionCapability, PermissionPolicyMode>> = {};

  for (const capability of capabilities) {
    const mode = capability === 'external_directory' && modeAllowsExternalDirectory(request, policy)
      ? 'allow'
      : policy.modes[capability];
    modeByCapability[capability] = mode;
  }

  const modes = Object.values(modeByCapability);
  const behavior: PermissionDecision['behavior'] = modes.includes('deny')
    ? 'deny'
    : modes.includes('prompt')
      ? 'prompt'
      : 'allow';
  const status: PermissionDecisionStatus = behavior === 'deny'
    ? 'denied'
    : behavior === 'prompt'
      ? 'needs_approval'
      : 'allowed';
  const summary = redactPermissionText(
    request.summary
      ?? request.command
      ?? (request.toolName ? `${request.toolName} tool request` : `${request.source} permission request`),
    {
      workspacePath: request.workspacePath,
      cwd: request.cwd,
    },
  );
  const capabilityText = capabilities.length ? capabilities.join(', ') : 'unclassified';
  const message = behavior === 'deny'
    ? `Permission policy denied ${capabilityText}.`
    : behavior === 'prompt'
      ? `Permission policy requires approval for ${capabilityText}.`
      : `Permission policy allowed ${capabilityText}.`;
  const event: PermissionPolicyEvent = {
    id,
    protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
    status,
    behavior,
    capabilities,
    source: request.source,
    toolName: request.toolName,
    summary,
    message,
    modeByCapability,
    audit: policy.audit || modes.includes('audit'),
    runId: context?.runId,
    nodeId: context?.nodeId,
    workflowId: context?.workflowId,
    adapterId: context?.adapterId,
    agentLabel: context?.agentLabel,
    createdAt: Date.now(),
  };
  const decisionBase: Omit<PermissionDecision, 'approvalRequest'> = {
    protocol: PIXCODE_PERMISSION_POLICY_PROTOCOL,
    requestId: id,
    status,
    behavior,
    capabilities,
    modeByCapability,
    message,
    audit: event.audit,
    event,
  };

  return {
    ...decisionBase,
    approvalRequest: behavior === 'prompt'
      ? createPermissionApprovalRequest(decisionBase, context)
      : undefined,
  };
}
