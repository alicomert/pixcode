export const PIXCODE_HANDOFF_PROTOCOL = 'pixcode.handoff.v1' as const;

export type WorkflowHandoffTaskStatus =
  | 'ready'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'needs-review';

export interface WorkflowHandoffArtifact {
  protocol: typeof PIXCODE_HANDOFF_PROTOCOL;
  taskStatus: WorkflowHandoffTaskStatus;
  contextSummary: string;
  taskResult: string;
  changedFiles: string[];
  blockers: string[];
  risks: string[];
  nextAction: string;
  nextInstructions: string;
  producedBy?: {
    workflowRunId?: string;
    nodeId?: string;
    agentLabel?: string;
    stage?: string;
  };
  createdAt: string;
}

export type HandoffArtifactParseResult =
  | { ok: true; artifact: WorkflowHandoffArtifact }
  | { ok: false; error: string };

type HandoffArtifactMetadata = {
  workflowRunId?: string;
  nodeId?: string;
  agentLabel?: string;
  stage?: string;
};

const VALID_TASK_STATUSES = new Set<WorkflowHandoffTaskStatus>([
  'ready',
  'completed',
  'blocked',
  'failed',
  'needs-review',
]);

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function readRequiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function sanitizeChangedFile(filePath: string): string {
  const normalized = filePath.trim().replaceAll('\\', '/');
  if (!normalized) return '';
  if (!normalized.startsWith('/') && !/^[a-zA-Z]:\//.test(normalized)) return normalized;
  return normalized.split('/').filter(Boolean).slice(-4).join('/');
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | null {
  const value = record[key];
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => key === 'changedFiles' ? sanitizeChangedFile(item) : item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function parseHandoffArtifact(
  text: string,
  metadata: HandoffArtifactMetadata = {},
): HandoffArtifactParseResult {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return { ok: false, error: 'Invalid handoff artifact: expected one JSON object.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid handoff artifact: JSON parse failed (${error instanceof Error ? error.message : String(error)}).`,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Invalid handoff artifact: payload must be an object.' };
  }

  const record = parsed as Record<string, unknown>;
  if (record.protocol !== PIXCODE_HANDOFF_PROTOCOL) {
    return { ok: false, error: `Invalid handoff artifact: protocol must be ${PIXCODE_HANDOFF_PROTOCOL}.` };
  }

  const taskStatus = record.taskStatus;
  if (typeof taskStatus !== 'string' || !VALID_TASK_STATUSES.has(taskStatus as WorkflowHandoffTaskStatus)) {
    return { ok: false, error: 'Invalid handoff artifact: taskStatus is missing or unsupported.' };
  }

  const contextSummary = readRequiredString(record, 'contextSummary');
  const taskResult = readRequiredString(record, 'taskResult');
  const changedFiles = readStringArray(record, 'changedFiles');
  const blockers = readStringArray(record, 'blockers');
  const risks = readStringArray(record, 'risks');
  const nextAction = readRequiredString(record, 'nextAction');
  const nextInstructions = readRequiredString(record, 'nextInstructions');

  if (!contextSummary || !taskResult || !changedFiles || !blockers || !risks || !nextAction || !nextInstructions) {
    return {
      ok: false,
      error: 'Invalid handoff artifact: required fields are protocol, taskStatus, contextSummary, taskResult, changedFiles, blockers, risks, nextAction, and nextInstructions.',
    };
  }

  return {
    ok: true,
    artifact: {
      protocol: PIXCODE_HANDOFF_PROTOCOL,
      taskStatus: taskStatus as WorkflowHandoffTaskStatus,
      contextSummary,
      taskResult,
      changedFiles,
      blockers,
      risks,
      nextAction,
      nextInstructions,
      producedBy: {
        workflowRunId: metadata.workflowRunId,
        nodeId: metadata.nodeId,
        agentLabel: metadata.agentLabel,
        stage: metadata.stage,
      },
      createdAt: new Date().toISOString(),
    },
  };
}

export function formatHandoffArtifactForContext(artifact: WorkflowHandoffArtifact): string {
  return [
    `Pixcode handoff artifact (${PIXCODE_HANDOFF_PROTOCOL})`,
    JSON.stringify(artifact, null, 2),
  ].join('\n');
}

export function handoffArtifactToWorkflowArtifact(artifact: WorkflowHandoffArtifact): {
  type: 'handoff-artifact';
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
} {
  return {
    type: 'handoff-artifact',
    data: artifact as unknown as Record<string, unknown>,
    metadata: {
      protocol: artifact.protocol,
      taskStatus: artifact.taskStatus,
      changedFileCount: artifact.changedFiles.length,
      blockerCount: artifact.blockers.length,
      nextAction: artifact.nextAction,
    },
  };
}
