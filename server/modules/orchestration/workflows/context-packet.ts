import type { ResolvedWorkspaceTarget } from '@/modules/orchestration/workflows/workspace-target.js';

export const PIXCODE_CONTEXT_PROTOCOL = 'pixcode.context.v1' as const;
export const MAX_CONTEXT_PACKET_TEXT_CHARS = 16_000;

export interface WorkflowContextPacket {
  protocol: typeof PIXCODE_CONTEXT_PROTOCOL;
  originalUserRequest: string;
  project: {
    kind: string;
    label: string;
    selectedProjectName?: string;
  };
  task: {
    workflowId: string;
    workflowRunId: string;
    nodeId: string;
    stage?: string;
    assignment?: string;
    stepInstructions: string;
  };
  constraints: {
    adapterId?: string;
    agentLabel?: string;
    model?: string;
    permissionMode?: string;
    isolation?: string;
    toolsSettings?: Record<string, unknown>;
  };
  upstreamArtifacts: Array<{
    type: 'upstream-context';
    text: string;
    sourceNodeIds: string[];
  }>;
  runState: {
    status: string;
    startedAt: number;
    nodeCount: number;
    completedNodeIds: string[];
    runningNodeIds: string[];
  };
  compaction: {
    maxChars: number;
    originalChars: number;
    compactedChars: number;
    omittedChars: number;
    wasCompacted: boolean;
  };
  createdAt: string;
}

type ContextPacketRun = {
  id: string;
  workflowId: string;
  status: string;
  input?: string;
  startedAt: number;
  nodeRuns: Array<{
    nodeId: string;
    status: string;
  }>;
};

type ContextPacketNode = {
  id: string;
  adapterId?: string;
  agentLabel?: string;
  assignment?: string;
  prompt: string;
  stage?: string;
  model?: string;
  permissionMode?: string;
  toolsSettings?: Record<string, unknown>;
  isolation?: string;
};

export type BuildWorkflowContextPacketInput = {
  run: ContextPacketRun;
  node: ContextPacketNode;
  workspaceTarget: ResolvedWorkspaceTarget;
  inputContext: string;
  inputNodeIds: string[];
};

function compactContextText(text: string): {
  text: string;
  originalChars: number;
  compactedChars: number;
  omittedChars: number;
  wasCompacted: boolean;
} {
  const originalChars = text.length;
  if (originalChars <= MAX_CONTEXT_PACKET_TEXT_CHARS) {
    return {
      text,
      originalChars,
      compactedChars: originalChars,
      omittedChars: 0,
      wasCompacted: false,
    };
  }

  const edge = Math.floor(MAX_CONTEXT_PACKET_TEXT_CHARS / 2);
  const omittedChars = originalChars - MAX_CONTEXT_PACKET_TEXT_CHARS;
  const compacted = [
    text.slice(0, edge),
    `\n\n[...${omittedChars} characters omitted from upstream context packet...]\n\n`,
    text.slice(-edge),
  ].join('');

  return {
    text: compacted,
    originalChars,
    compactedChars: compacted.length,
    omittedChars,
    wasCompacted: true,
  };
}

export function buildWorkflowContextPacket({
  run,
  node,
  workspaceTarget,
  inputContext,
  inputNodeIds,
}: BuildWorkflowContextPacketInput): WorkflowContextPacket {
  const compacted = compactContextText(inputContext);
  return {
    protocol: PIXCODE_CONTEXT_PROTOCOL,
    originalUserRequest: run.input?.trim() || '(No original user request was provided.)',
    project: {
      kind: workspaceTarget.kind,
      label: workspaceTarget.label,
      selectedProjectName: workspaceTarget.selectedProjectName,
    },
    task: {
      workflowId: run.workflowId,
      workflowRunId: run.id,
      nodeId: node.id,
      stage: node.stage,
      assignment: node.assignment,
      stepInstructions: node.prompt,
    },
    constraints: {
      adapterId: node.adapterId,
      agentLabel: node.agentLabel,
      model: node.model,
      permissionMode: node.permissionMode,
      isolation: node.isolation,
      toolsSettings: node.toolsSettings,
    },
    upstreamArtifacts: compacted.text
      ? [{
        type: 'upstream-context',
        text: compacted.text,
        sourceNodeIds: inputNodeIds,
      }]
      : [],
    runState: {
      status: run.status,
      startedAt: run.startedAt,
      nodeCount: run.nodeRuns.length,
      completedNodeIds: run.nodeRuns
        .filter((nodeRun) => nodeRun.status === 'completed')
        .map((nodeRun) => nodeRun.nodeId),
      runningNodeIds: run.nodeRuns
        .filter((nodeRun) => nodeRun.status === 'running')
        .map((nodeRun) => nodeRun.nodeId),
    },
    compaction: {
      maxChars: MAX_CONTEXT_PACKET_TEXT_CHARS,
      originalChars: compacted.originalChars,
      compactedChars: compacted.compactedChars,
      omittedChars: compacted.omittedChars,
      wasCompacted: compacted.wasCompacted,
    },
    createdAt: new Date().toISOString(),
  };
}

export function formatContextPacketForPrompt(packet: WorkflowContextPacket): string {
  return [
    `Pixcode standardized init context packet (${PIXCODE_CONTEXT_PROTOCOL}):`,
    JSON.stringify(packet, null, 2),
  ].join('\n');
}
