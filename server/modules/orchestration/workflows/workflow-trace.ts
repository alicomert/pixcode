import os from 'node:os';

import type {
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowTraceEvent,
} from '@/modules/orchestration/workflows/workflow.types.js';

const MAX_TRACE_TEXT_CHARS = 2_400;
const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled', 'skipped']);

function traceId(parts: Array<string | number | undefined>): string {
  return parts.filter((part) => part !== undefined && part !== '').join(':');
}

function durationMs(startedAt?: number, finishedAt?: number): number | undefined {
  if (!startedAt || !finishedAt) return undefined;
  return Math.max(0, finishedAt - startedAt);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function redactionValues(run: WorkflowRun): string[] {
  const metadata = run.metadata ?? {};
  const workspaceTarget = metadata.workspaceTarget && typeof metadata.workspaceTarget === 'object'
    ? metadata.workspaceTarget as Record<string, unknown>
    : {};

  return [
    os.homedir(),
    readString(metadata.projectPath),
    readString(metadata.selectedProjectPath),
    readString(workspaceTarget.path),
    readString(workspaceTarget.projectPath),
    readString(workspaceTarget.selectedProjectPath),
  ].filter((value): value is string => Boolean(value && value.length > 2));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactTraceText(value: string | undefined, run: WorkflowRun, maxLength = MAX_TRACE_TEXT_CHARS): string | undefined {
  if (!value?.trim()) return undefined;

  let text = value;
  for (const secret of redactionValues(run)) {
    text = text.replace(new RegExp(escapeRegExp(secret), 'g'), '[workspace]');
  }

  text = text
    .replace(/\b(?:sk|ghp|github_pat|glpat|npm)_[A-Za-z0-9_=-]{12,}\b/gu, '[redacted-token]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 32).trimEnd()}\n...[trace truncated]`;
}

function eventBase(
  node: WorkflowNodeRun | undefined,
): Pick<WorkflowTraceEvent, 'actor' | 'adapterId' | 'agentInstanceId' | 'agentLabel' | 'model' | 'nodeId'> {
  if (!node) {
    return { actor: 'Pixcode' };
  }

  return {
    actor: node.agentLabel || node.adapterId || node.nodeId,
    nodeId: node.nodeId,
    adapterId: node.adapterId,
    agentInstanceId: node.agentInstanceId,
    agentLabel: node.agentLabel,
    model: node.model,
  };
}

function pushEvent(
  events: WorkflowTraceEvent[],
  event: WorkflowTraceEvent,
): void {
  events.push(event);
}

function artifactTitleKey(type: string): string {
  if (type === 'file-diff') return 'workflow.trace.fileChanged';
  if (type === 'preview-url') return 'workflow.trace.previewReady';
  if (type === 'command-output') return 'workflow.trace.commandOutput';
  if (type === 'handoff-artifact') return 'workflow.trace.handoffArtifact';
  return 'workflow.trace.artifact';
}

function artifactType(type: string): WorkflowTraceEvent['type'] {
  return type === 'file-diff' ? 'file' : 'artifact';
}

function artifactTitle(type: string): string {
  if (type === 'file-diff') return 'File changes captured';
  if (type === 'preview-url') return 'Preview output captured';
  if (type === 'command-output') return 'Command output captured';
  if (type === 'handoff-artifact') return 'Handoff artifact captured';
  return 'Artifact captured';
}

function artifactSummary(
  artifact: NonNullable<WorkflowNodeRun['artifacts']>[number],
  run: WorkflowRun,
): string | undefined {
  if (artifact.text?.trim()) {
    return redactTraceText(artifact.text, run);
  }
  if (artifact.data && Object.keys(artifact.data).length > 0) {
    return redactTraceText(JSON.stringify(artifact.data, null, 2), run);
  }
  return artifact.type;
}

function nodeTimestamp(run: WorkflowRun, node: WorkflowNodeRun, index: number): number {
  return node.startedAt ?? run.startedAt + index;
}

export function buildWorkflowTrace(run: WorkflowRun): WorkflowTraceEvent[] {
  const events: WorkflowTraceEvent[] = [];

  pushEvent(events, {
    id: traceId([run.id, 'run-started']),
    type: 'run',
    severity: 'info',
    status: run.status,
    timestamp: run.startedAt,
    durationMs: durationMs(run.startedAt, run.finishedAt),
    actor: 'Pixcode',
    title: 'Workflow run started',
    titleKey: 'workflow.trace.runStarted',
    summary: redactTraceText(run.input, run),
    metadata: {
      workflowId: run.workflowId,
      contextId: run.contextId,
    },
  });

  const replay = readRecord(run.metadata?.replay);
  if (replay) {
    pushEvent(events, {
      id: traceId([run.id, 'replay']),
      type: 'run',
      severity: replay.requiresApproval ? 'warning' : 'info',
      status: run.status,
      timestamp: run.startedAt + 0.25,
      actor: 'Pixcode',
      title: 'Workflow replay prepared',
      titleKey: 'workflow.trace.replay',
      summary: redactTraceText([
        `Source run: ${readString(replay.sourceRunId) ?? 'unknown'}`,
        `Scope: ${readString(replay.scope) ?? 'unknown'}`,
        Array.isArray(replay.selectedNodeIds) ? `Selected steps: ${replay.selectedNodeIds.join(', ')}` : undefined,
        replay.requiresApproval ? 'Replay required approval for prior shell, network, or file-write activity.' : undefined,
      ].filter(Boolean).join('\n'), run),
      metadata: replay,
    });
  }

  const workflowTemplate = readRecord(run.metadata?.workflowTemplate);
  if (workflowTemplate) {
    pushEvent(events, {
      id: traceId([run.id, 'workflow-template']),
      type: 'run',
      severity: 'info',
      status: run.status,
      timestamp: run.startedAt + 0.3,
      actor: 'Pixcode',
      title: 'Workflow template applied',
      titleKey: 'workflow.trace.template',
      summary: redactTraceText([
        `Template: ${readString(workflowTemplate.name) ?? readString(workflowTemplate.id) ?? 'unknown'}`,
        `Protocol: ${readString(workflowTemplate.protocol) ?? 'unknown'}`,
        Array.isArray(workflowTemplate.acceptanceCriteria)
          ? `Acceptance criteria:\n- ${workflowTemplate.acceptanceCriteria.filter((item) => typeof item === 'string').join('\n- ')}`
          : undefined,
      ].filter(Boolean).join('\n'), run),
      metadata: workflowTemplate,
    });
  }

  const fallbackEvents = Array.isArray(run.metadata?.fallbackEvents)
    ? run.metadata.fallbackEvents
    : [];
  fallbackEvents.forEach((event, index) => {
    const record = readRecord(event);
    if (!record) return;
    pushEvent(events, {
      id: traceId([run.id, 'fallback', index]),
      type: 'node',
      severity: 'warning',
      status: 'submitted',
      timestamp: typeof record.startedAt === 'number' ? record.startedAt : run.startedAt + 0.5 + index,
      actor: 'Pixcode',
      nodeId: readString(record.nodeId),
      title: 'Fallback agent started',
      titleKey: 'workflow.trace.fallback',
      summary: redactTraceText([
        `Trigger: ${readString(record.trigger) ?? 'unknown'}`,
        `Source node: ${readString(record.nodeId) ?? 'unknown'}`,
        `Fallback node: ${readString(record.fallbackNodeId) ?? 'unknown'}`,
        readString(record.reason) ? `Reason: ${readString(record.reason)}` : undefined,
      ].filter(Boolean).join('\n'), run),
      metadata: record,
    });
  });

  const fallbackSkippedEvents = Array.isArray(run.metadata?.fallbackSkippedEvents)
    ? run.metadata.fallbackSkippedEvents
    : [];
  fallbackSkippedEvents.forEach((event, index) => {
    const record = readRecord(event);
    if (!record) return;
    pushEvent(events, {
      id: traceId([run.id, 'fallback-skipped', index]),
      type: 'node',
      severity: 'info',
      status: 'skipped',
      timestamp: typeof record.createdAt === 'number' ? record.createdAt : run.startedAt + 0.75 + index,
      actor: 'Pixcode',
      nodeId: readString(record.nodeId),
      title: 'Fallback skipped',
      titleKey: 'workflow.trace.fallback',
      summary: redactTraceText([
        `Trigger: ${readString(record.trigger) ?? 'unknown'}`,
        `Skipped: ${readString(record.skippedReason) ?? 'policy did not allow fallback'}`,
        readString(record.reason) ? `Reason: ${readString(record.reason)}` : undefined,
      ].filter(Boolean).join('\n'), run),
      metadata: record,
    });
  });

  const permissionPolicyEvents = Array.isArray(run.metadata?.permissionPolicyEvents)
    ? run.metadata.permissionPolicyEvents
    : [];
  permissionPolicyEvents.forEach((event, index) => {
    const record = readRecord(event);
    if (!record) return;
    const behavior = readString(record.behavior);
    const capabilities = Array.isArray(record.capabilities)
      ? record.capabilities.filter((item): item is string => typeof item === 'string')
      : [];
    pushEvent(events, {
      id: traceId([run.id, 'permission-policy', readString(record.id) ?? index]),
      type: 'permission_policy',
      severity: behavior === 'deny' ? 'error' : behavior === 'prompt' ? 'warning' : 'info',
      status: behavior === 'deny' ? 'failed' : behavior === 'prompt' ? 'submitted' : 'completed',
      timestamp: typeof record.createdAt === 'number' ? record.createdAt : run.startedAt + 0.85 + index,
      actor: 'Pixcode',
      nodeId: readString(record.nodeId),
      adapterId: readString(record.adapterId),
      agentLabel: readString(record.agentLabel),
      title: 'Permission policy decision',
      titleKey: 'workflow.trace.permissionPolicy',
      summary: redactTraceText([
        `Decision: ${behavior ?? readString(record.status) ?? 'unknown'}`,
        capabilities.length > 0 ? `Capabilities: ${capabilities.join(', ')}` : undefined,
        readString(record.summary),
        readString(record.message),
      ].filter(Boolean).join('\n'), run),
      metadata: record,
    });
  });

  run.nodeRuns.forEach((node, index) => {
    const base = eventBase(node);
    const timestamp = nodeTimestamp(run, node, index);
    const nodeDuration = durationMs(node.startedAt, node.finishedAt);

    pushEvent(events, {
      id: traceId([run.id, node.nodeId, 'node']),
      type: 'node',
      severity: node.status === 'failed' ? 'error' : 'info',
      status: node.status,
      timestamp,
      durationMs: nodeDuration,
      ...base,
      title: TERMINAL_STATES.has(node.status) ? 'Workflow step finished' : 'Workflow step started',
      titleKey: TERMINAL_STATES.has(node.status) ? 'workflow.trace.nodeFinished' : 'workflow.trace.nodeStarted',
      summary: redactTraceText(node.assignment, run),
      metadata: {
        stage: node.stage,
        internal: node.internal,
      },
    });

    if (node.promptPreview) {
      pushEvent(events, {
        id: traceId([run.id, node.nodeId, 'prompt']),
        type: 'message',
        severity: 'info',
        status: node.status,
        timestamp: timestamp + 1,
        ...base,
        title: 'Prompt prepared',
        titleKey: 'workflow.trace.prompt',
        summary: redactTraceText(node.promptPreview, run),
      });
    }

    if (node.contextPacket) {
      pushEvent(events, {
        id: traceId([run.id, node.nodeId, 'context-packet']),
        type: 'message',
        severity: node.contextPacket.compaction.wasCompacted ? 'warning' : 'info',
        status: node.status,
        timestamp: timestamp + 1.5,
        ...base,
        title: 'Context packet prepared',
        titleKey: 'workflow.trace.contextPacket',
        summary: node.contextPacket.compaction.wasCompacted
          ? `Context compacted by ${node.contextPacket.compaction.omittedChars} characters`
          : 'Context packet prepared without compaction',
        metadata: {
          protocol: node.contextPacket.protocol,
          compaction: node.contextPacket.compaction,
          upstreamArtifactCount: node.contextPacket.upstreamArtifacts.length,
          sourceNodeIds: node.contextPacket.upstreamArtifacts.flatMap((artifact) => artifact.sourceNodeIds),
        },
      });
    }

    if (node.adapterId || node.model) {
      pushEvent(events, {
        id: traceId([run.id, node.nodeId, 'provider']),
        type: 'provider',
        severity: node.status === 'failed' ? 'error' : 'info',
        status: node.hermesTaskId ? 'submitted' : node.status,
        timestamp: timestamp + 2,
        durationMs: nodeDuration,
        ...base,
        title: 'Provider call',
        titleKey: 'workflow.trace.providerCall',
        summary: [node.adapterId, node.model].filter(Boolean).join(' / '),
        metadata: {
          hermesTaskId: node.hermesTaskId,
          permissionMode: node.permissionMode,
          timeoutMs: node.timeoutMs,
        },
      });
    }

    (node.messages ?? [])
      .filter((message) => message.role !== 'user' && message.text.trim())
      .forEach((message, messageIndex) => {
        pushEvent(events, {
          id: traceId([run.id, node.nodeId, 'message', messageIndex]),
          type: 'message',
          severity: 'info',
          status: node.status,
          timestamp: message.createdAt ?? timestamp + 10 + messageIndex,
          ...base,
          title: 'Agent message',
          titleKey: 'workflow.trace.agentMessage',
          summary: redactTraceText(message.text, run),
          metadata: {
            role: message.role,
          },
        });
      });

    (node.artifacts ?? []).forEach((artifact, artifactIndex) => {
      pushEvent(events, {
        id: traceId([run.id, node.nodeId, 'artifact', artifactIndex]),
        type: artifactType(artifact.type),
        severity: 'info',
        status: node.status,
        timestamp: node.finishedAt ?? timestamp + 20 + artifactIndex,
        ...base,
        title: artifactTitle(artifact.type),
        titleKey: artifactTitleKey(artifact.type),
        summary: artifactSummary(artifact, run),
        metadata: {
          artifactType: artifact.type,
          artifactMetadata: artifact.metadata,
        },
      });
    });

    if (node.error) {
      pushEvent(events, {
        id: traceId([run.id, node.nodeId, 'error']),
        type: 'error',
        severity: 'error',
        status: node.status,
        timestamp: node.finishedAt ?? timestamp + 30,
        durationMs: nodeDuration,
        ...base,
        title: 'Step error',
        titleKey: 'workflow.trace.error',
        summary: redactTraceText(node.error, run),
      });
    }
  });

  if (run.finishedAt) {
    pushEvent(events, {
      id: traceId([run.id, 'run-finished']),
      type: 'run',
      severity: run.status === 'failed' ? 'error' : 'info',
      status: run.status,
      timestamp: run.finishedAt,
      durationMs: durationMs(run.startedAt, run.finishedAt),
      actor: 'Pixcode',
      title: 'Workflow run finished',
      titleKey: 'workflow.trace.runFinished',
      summary: redactTraceText(readString(run.metadata?.error), run),
      metadata: {
        workflowId: run.workflowId,
        contextId: run.contextId,
      },
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}
