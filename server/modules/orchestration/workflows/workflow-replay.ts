import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
} from '@/modules/orchestration/workflows/workflow.types.js';
import { redactTraceText } from '@/modules/orchestration/workflows/workflow-trace.js';

export const PIXCODE_REPLAY_PROTOCOL = 'pixcode.workflow-replay.v1';

export type WorkflowReplayScope = 'run' | 'node';
export type WorkflowReplaySafetyKind = 'file-write' | 'shell' | 'network';

export interface WorkflowReplayOperation {
  kind: WorkflowReplaySafetyKind;
  nodeId?: string;
  summary: string;
}

export interface WorkflowReplayPlan {
  protocol: typeof PIXCODE_REPLAY_PROTOCOL;
  sourceRunId: string;
  sourceWorkflowId: string;
  scope: WorkflowReplayScope;
  fromNodeId?: string;
  selectedNodeIds: string[];
  requiresApproval: boolean;
  approvalReasons: string[];
  destructiveOperations: WorkflowReplayOperation[];
  limitations: string[];
  input: string;
  workflow: Workflow;
  metadata: Record<string, unknown>;
}

function safeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 48) || 'node';
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function visibleNodes(run: WorkflowRun): WorkflowNodeRun[] {
  return run.nodeRuns.filter((node) => !node.internal);
}

function defaultReplayNode(run: WorkflowRun): WorkflowNodeRun | undefined {
  return visibleNodes(run).find((node) => node.status === 'failed')
    ?? [...visibleNodes(run)].reverse().find((node) => node.status !== 'skipped')
    ?? visibleNodes(run)[0];
}

function selectReplayNodes(run: WorkflowRun, scope: WorkflowReplayScope, fromNodeId?: string): WorkflowNodeRun[] {
  const nodes = visibleNodes(run);
  if (scope === 'run') return nodes;

  const requested = fromNodeId
    ? nodes.find((node) => node.nodeId === fromNodeId)
    : defaultReplayNode(run);
  return requested ? [requested] : [];
}

function compact(value: string | undefined, run: WorkflowRun, maxLength = 1_200): string | undefined {
  return redactTraceText(value, run, maxLength);
}

function nodeTraceSummary(run: WorkflowRun, node: WorkflowNodeRun): string {
  const artifactTypes = (node.artifacts ?? []).map((artifact) => artifact.type).filter(Boolean);
  return [
    `Step: ${node.agentLabel || node.nodeId}`,
    `Node id: ${node.nodeId}`,
    `Status: ${node.status}`,
    node.stage ? `Stage: ${node.stage}` : undefined,
    node.adapterId ? `Adapter: ${node.adapterId}` : undefined,
    node.model ? `Model: ${node.model}` : undefined,
    node.error ? `Error: ${compact(node.error, run, 800)}` : undefined,
    artifactTypes.length > 0 ? `Artifacts: ${artifactTypes.join(', ')}` : undefined,
    node.outputText ? `Output excerpt:\n${compact(node.outputText, run)}` : undefined,
  ].filter(Boolean).join('\n');
}

function replayTraceSummary(run: WorkflowRun, nodes: WorkflowNodeRun[]): string {
  return nodes.map((node) => nodeTraceSummary(run, node)).join('\n\n---\n\n');
}

function pushOperation(
  operations: WorkflowReplayOperation[],
  kind: WorkflowReplaySafetyKind,
  nodeId: string | undefined,
  summary: string,
): void {
  if (operations.some((operation) =>
    operation.kind === kind && operation.nodeId === nodeId && operation.summary === summary,
  )) {
    return;
  }
  operations.push({ kind, nodeId, summary });
}

function detectReplayOperations(run: WorkflowRun, nodes: WorkflowNodeRun[]): WorkflowReplayOperation[] {
  const operations: WorkflowReplayOperation[] = [];

  for (const node of nodes) {
    for (const artifact of node.artifacts ?? []) {
      if (artifact.type === 'file-diff') {
        pushOperation(operations, 'file-write', node.nodeId, 'Prior step produced a file diff artifact.');
      }
      if (artifact.type === 'command-output') {
        pushOperation(operations, 'shell', node.nodeId, 'Prior step produced command output.');
      }
      const text = [artifact.text, artifact.data ? JSON.stringify(artifact.data) : undefined]
        .filter(Boolean)
        .join('\n')
        .toLocaleLowerCase('en');
      if (/https?:\/\/|curl |wget |gh |npm publish|npm install|git push|ssh /u.test(text)) {
        pushOperation(operations, 'network', node.nodeId, 'Prior artifact references a network-capable operation.');
      }
    }

    const text = [node.outputText, node.error, node.promptPreview].filter(Boolean).join('\n').toLocaleLowerCase('en');
    if (/apply_patch|write file|file write|modified files|changed files/u.test(text)) {
      pushOperation(operations, 'file-write', node.nodeId, 'Prior step text references file-write activity.');
    }
    if (/shell|command|terminal|npm run|node |python |php |go test|cargo |make |exit code/u.test(text)) {
      pushOperation(operations, 'shell', node.nodeId, 'Prior step text references shell execution.');
    }
    if (/https?:\/\/|curl |wget |gh |npm publish|npm install|git push|ssh |network/u.test(text)) {
      pushOperation(operations, 'network', node.nodeId, 'Prior step text references a network-capable operation.');
    }
  }

  return operations;
}

function replayNodeFromRunNode(
  node: WorkflowNodeRun,
  index: number,
  previousReplayNodeId: string | undefined,
  traceSummary: string,
  limitations: string[],
  requiresApproval: boolean,
): WorkflowNode {
  const replayNodeId = `replay_${index + 1}_${safeNodeId(node.nodeId)}`;
  return {
    id: replayNodeId,
    adapterId: node.adapterId || 'claude-code',
    agentInstanceId: node.agentInstanceId,
    agentLabel: node.agentLabel ? `${node.agentLabel} Replay` : 'Replay agent',
    assignment: node.assignment ? `Replay: ${node.assignment}` : `Replay source node ${node.nodeId}`,
    stage: node.stage ? `replay_${node.stage}` : 'replay',
    model: node.model,
    permissionMode: node.permissionMode === 'bypassPermissions' ? 'default' : node.permissionMode,
    timeoutMs: node.timeoutMs,
    inputs: previousReplayNodeId ? [previousReplayNodeId] : [],
    output: 'both',
    onFail: 'abort',
    prompt: [
      'This is a Pixcode workflow replay run.',
      `Replay protocol: ${PIXCODE_REPLAY_PROTOCOL}`,
      `Source node: ${node.nodeId}`,
      requiresApproval
        ? 'Replay safety review found prior shell, network, or file-write activity. Do not repeat any such action unless the current CLI permission flow asks for and receives user approval.'
        : 'Replay safety review did not find prior shell, network, or file-write artifacts, but still avoid destructive actions unless they are required and approved.',
      'Use the trace summary to continue from the failure or inspect the run. Do not expose secrets, local-only paths, raw tool protocol, or irrelevant logs.',
      `Known limitations:\n- ${limitations.join('\n- ')}`,
      `Trace summary:\n${traceSummary}`,
      `Original step prompt:\n${node.promptPreview || '(No source prompt was stored.)'}`,
    ].join('\n\n'),
  };
}

export function buildWorkflowReplayPlan(
  run: WorkflowRun,
  options: {
    scope?: WorkflowReplayScope;
    fromNodeId?: string;
  } = {},
): WorkflowReplayPlan {
  const scope = options.scope ?? 'node';
  const nodes = selectReplayNodes(run, scope, options.fromNodeId);
  if (nodes.length === 0) {
    throw new Error('No replayable workflow steps were found.');
  }

  const limitations = [
    'Replay uses stored run traces, prompt previews, messages, and artifacts; it cannot reproduce hidden provider state.',
    'Replay reconstructs selected steps as a new workflow run instead of mutating the source run.',
    'Shell, network, and file-write actions stay under the current CLI permission flow and require explicit replay approval when detected.',
  ];
  const destructiveOperations = detectReplayOperations(run, nodes);
  const requiresApproval = destructiveOperations.length > 0;
  const traceSummary = replayTraceSummary(run, nodes);
  const replayNodes = nodes.reduce<WorkflowNode[]>((accumulator, node, index) => {
    const previousReplayNodeId = accumulator[accumulator.length - 1]?.id;
    accumulator.push(replayNodeFromRunNode(
      node,
      index,
      scope === 'run' ? previousReplayNodeId : undefined,
      traceSummary,
      limitations,
      requiresApproval,
    ));
    return accumulator;
  }, []);
  const settings = readRecord(run.metadata?.settings) ?? {};
  const replayMetadata = {
    protocol: PIXCODE_REPLAY_PROTOCOL,
    sourceRunId: run.id,
    sourceWorkflowId: run.workflowId,
    scope,
    fromNodeId: options.fromNodeId,
    selectedNodeIds: nodes.map((node) => node.nodeId),
    requiresApproval,
    destructiveOperations,
    limitations,
    createdAt: Date.now(),
  };

  return {
    protocol: PIXCODE_REPLAY_PROTOCOL,
    sourceRunId: run.id,
    sourceWorkflowId: run.workflowId,
    scope,
    fromNodeId: options.fromNodeId,
    selectedNodeIds: nodes.map((node) => node.nodeId),
    requiresApproval,
    approvalReasons: destructiveOperations.map((operation) =>
      `${operation.kind}${operation.nodeId ? ` in ${operation.nodeId}` : ''}: ${operation.summary}`,
    ),
    destructiveOperations,
    limitations,
    input: [
      `Replay ${scope === 'run' ? 'full workflow run' : 'workflow step'} from source run ${run.id}.`,
      run.input ? `Original request:\n${compact(run.input, run, 2_000)}` : undefined,
    ].filter(Boolean).join('\n\n'),
    workflow: {
      id: `${run.workflowId}_replay`,
      name: `Replay ${run.workflowId}`,
      description: 'Replay generated from stored Pixcode workflow trace data.',
      trigger: 'manual',
      nodes: replayNodes,
    },
    metadata: {
      ...run.metadata,
      workflowName: `Replay: ${String(run.metadata?.workflowName ?? run.workflowId)}`,
      replay: replayMetadata,
      settings: {
        ...settings,
        replayMode: true,
      },
    },
  };
}
