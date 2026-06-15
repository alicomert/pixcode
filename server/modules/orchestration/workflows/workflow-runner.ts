import crypto from 'node:crypto';

import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
} from '@/modules/orchestration/workflows/workflow.types.js';
import {
  PIXCODE_HANDOFF_PROTOCOL,
  formatHandoffArtifactForContext,
  handoffArtifactToWorkflowArtifact,
  parseHandoffArtifact,
} from '@/modules/orchestration/workflows/handoff-artifact.js';
import {
  buildWorkflowContextPacket,
  formatContextPacketForPrompt,
} from '@/modules/orchestration/workflows/context-packet.js';
import {
  type WorkflowFallbackTrigger,
  classifyWorkflowFailure,
  resolveWorkflowFallbackDecision,
} from '@/modules/orchestration/workflows/workflow-fallback-policy.js';
import {
  evaluatePermissionRequest,
  resolvePermissionPolicyFromMetadata,
  type PermissionDecision,
  type PermissionPolicy,
  type PermissionPolicyEvent,
} from '@/modules/orchestration/security/permission-policy.js';
import {
  type ResolvedWorkspaceTarget,
  resolveWorkflowWorkspace,
  workspaceContextPrompt,
  workspaceTargetMetadata,
} from '@/modules/orchestration/workflows/workspace-target.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';
import { orchestrationTaskService } from '@/modules/orchestration/tasks/orchestration-task.service.js';
import {
  cancelA2ATask,
  getA2ATask,
  submitA2ATask,
} from '@/modules/orchestration/a2a/task-dispatcher.js';
// @ts-ignore — plain-JS service
import {
  getDefaultProviderModel,
  getProviderModelRegistryEntry,
  getStaticProviderModels,
} from '@/services/model-registry.js';
// @ts-ignore — plain-JS service
import {
  createNotificationEvent,
  notifyRunFailed,
  notifyRunStopped,
  notifyUserIfEnabled,
} from '@/services/notification-orchestrator.js';
// @ts-ignore — plain-JS service
import { dispatchWebhookEvent } from '@/services/webhooks.js';

const TERMINAL = new Set(['completed', 'failed', 'canceled']);
const SKIPPED = 'skipped';
const BACKEND_HANDOFF_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CONTEXT_CHARS = 12_000;
const DEFAULT_MAX_REPAIR_CYCLES = 1;
const MAX_REPAIR_CYCLES = 5;
const HANDOFF_ARTIFACT_EXAMPLE = [
  '{',
  '  "protocol": "pixcode.handoff.v1",',
  '  "taskStatus": "ready | completed | blocked | failed | needs-review",',
  '  "contextSummary": "Compacted context the next agent needs.",',
  '  "taskResult": "What was decided or completed in this step.",',
  '  "changedFiles": [],',
  '  "blockers": [],',
  '  "risks": [],',
  '  "nextAction": "The requested next action.",',
  '  "nextInstructions": "Specific instructions for the next agent."',
  '}',
].join('\n');
const KNOWN_AGENT_ROLES = [
  'backend',
  'frontend',
  'review',
  'implementation',
  'proposal',
  'critique',
  'response',
  'decision',
  'report',
] as const;

class WorkflowCanceledError extends Error {
  constructor() {
    super('Workflow canceled.');
    this.name = 'WorkflowCanceledError';
  }
}

class WorkflowNodeTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Workflow node timed out after ${Math.round(timeoutMs / 1000)}s.`);
    this.name = 'WorkflowNodeTimeoutError';
  }
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function validateWorkflow(workflow: Workflow): void {
  if (workflow.nodes.length > 64) {
    throw new Error('Workflow node limit exceeded.');
  }
  const ids = new Set(workflow.nodes.map((node) => node.id));
  for (const node of workflow.nodes) {
    for (const input of node.inputs) {
      if (!ids.has(input)) {
        throw new Error(`Workflow node ${node.id} references missing input ${input}.`);
      }
    }
  }
}

type TaskResult = {
  state: string;
  text: string;
  error?: string;
  messages: Array<{ role: string; text: string }>;
  artifacts: Array<{
    type: string;
    text?: string;
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
};

type RawTask = {
  id: string;
  state?: string;
  error?: { code?: string; message?: string };
  history?: Array<{ role?: string; parts?: Array<{ kind?: string; text?: string; data?: Record<string, unknown> }> }>;
  artifacts?: Array<{
    type?: string;
    parts?: Array<{ kind?: string; text?: string; data?: Record<string, unknown> }>;
    metadata?: Record<string, unknown>;
  }>;
};

type AgentAssignment = {
  instanceId: string;
  adapterId: string;
  label: string;
  role?: AgentRole;
  instruction?: string;
  model?: string;
  permissionMode?: string;
  toolsSettings?: Record<string, unknown>;
  order: number;
};

type KnownAgentRole = typeof KNOWN_AGENT_ROLES[number];
type AgentRole = string;
type ProviderId = 'claude' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode';
type ProviderModel = {
  value: string;
  label?: string;
  source?: 'static' | 'api';
  free?: boolean;
};
type RunStoppedNotifier = (payload: {
  userId: string | number;
  provider: string;
  sessionId?: string | null;
  stopReason?: string;
  sessionName?: string | null;
}) => void;
type RunFailedNotifier = (payload: {
  userId: string | number;
  provider: string;
  sessionId?: string | null;
  error: unknown;
  sessionName?: string | null;
}) => void;

const sendRunStoppedNotification = notifyRunStopped as RunStoppedNotifier;
const sendRunFailedNotification = notifyRunFailed as RunFailedNotifier;

const adapterProviderMap: Record<string, ProviderId | undefined> = {
  'claude-code': 'claude',
  cursor: 'cursor',
  codex: 'codex',
  gemini: 'gemini',
  qwen: 'qwen',
  opencode: 'opencode',
};

function readAgentRole(value: unknown): AgentRole | undefined {
  return typeof value === 'string' && value.trim() && value.trim() !== 'auto'
    ? value.trim()
    : undefined;
}

function isKnownAgentRole(value: string | undefined): value is KnownAgentRole {
  return Boolean(value && (KNOWN_AGENT_ROLES as readonly string[]).includes(value));
}

function getMetadataRecord(metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
  return readRecord(metadata?.[key]) ?? {};
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNotificationUserId(metadata?: Record<string, unknown>): string | number | null {
  const value = metadata?.userId;
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function workflowNotificationTitle(run: WorkflowRun): string {
  return readString(run.metadata?.workflowName) ?? run.workflowId;
}

function notifyWorkflowRunFinished(run: WorkflowRun): void {
  const userId = readNotificationUserId(run.metadata);
  if (!userId) return;

  if (run.status === 'completed') {
    sendRunStoppedNotification({
      userId,
      provider: 'system',
      sessionId: run.id,
      sessionName: workflowNotificationTitle(run),
      stopReason: 'Orchestration completed',
    });
    return;
  }

  if (run.status === 'canceled') {
    sendRunStoppedNotification({
      userId,
      provider: 'system',
      sessionId: run.id,
      sessionName: workflowNotificationTitle(run),
      stopReason: 'Orchestration canceled',
    });
    return;
  }

  if (run.status === 'failed') {
    sendRunFailedNotification({
      userId,
      provider: 'system',
      sessionId: run.id,
      sessionName: workflowNotificationTitle(run),
      error: readString(run.metadata?.error) ?? 'Orchestration failed',
    });
  }
}

function permissionPolicyFromRun(run: WorkflowRun): PermissionPolicy {
  return resolvePermissionPolicyFromMetadata(run.metadata);
}

function permissionPolicyEvents(run: WorkflowRun): PermissionPolicyEvent[] {
  return Array.isArray(run.metadata?.permissionPolicyEvents)
    ? run.metadata.permissionPolicyEvents.filter((event): event is PermissionPolicyEvent =>
      Boolean(event && typeof event === 'object'),
    )
    : [];
}

function permissionApprovalRequests(run: WorkflowRun): Array<Record<string, unknown>> {
  return Array.isArray(run.metadata?.pendingPermissionApprovals)
    ? run.metadata.pendingPermissionApprovals.filter((event): event is Record<string, unknown> =>
      Boolean(event && typeof event === 'object'),
    )
    : [];
}

function notifyPermissionApprovalRequested(run: WorkflowRun, decision: PermissionDecision): void {
  const userId = readNotificationUserId(run.metadata);
  if (!userId || !decision.approvalRequest) return;

  const event = (createNotificationEvent as unknown as (payload: Record<string, unknown>) => unknown)({
    provider: 'system',
    sessionId: run.id,
    kind: 'action_required',
    code: 'permission.required',
    meta: {
      toolName: decision.capabilities.join(', '),
      sessionName: workflowNotificationTitle(run),
    },
    severity: 'warning',
    requiresUserAction: true,
    dedupeKey: `workflow:permission:${run.id}:${decision.requestId}`,
  });
  (notifyUserIfEnabled as (payload: { userId: string | number; event: unknown }) => void)({
    userId,
    event,
  });
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function modelValueSet(models: ProviderModel[]): Set<string> {
  return new Set(models.map((model) => model.value).filter(Boolean));
}

function preferredFallbackModel(models: ProviderModel[], defaultModel?: string): string | undefined {
  const values = modelValueSet(models);
  if (defaultModel && values.has(defaultModel)) return defaultModel;
  return models.find((model) => model.source === 'api' && model.free)?.value
    ?? models.find((model) => model.source === 'api')?.value
    ?? models.find((model) => model.free)?.value
    ?? models[0]?.value
    ?? defaultModel;
}

async function resolveWorkflowModel(adapterId: string, requestedModel?: string): Promise<string | undefined> {
  const provider = adapterProviderMap[adapterId];
  if (!provider) return requestedModel;

  const defaultModel = getDefaultProviderModel(provider);
  if (!requestedModel) return defaultModel;

  try {
    const result = await getProviderModelRegistryEntry(provider);
    const models = Array.isArray(result?.models) ? result.models as ProviderModel[] : [];
    if (modelValueSet(models).has(requestedModel)) {
      return requestedModel;
    }
    return preferredFallbackModel(models, defaultModel) ?? requestedModel;
  } catch {
    const staticModels = getStaticProviderModels(provider) as ProviderModel[];
    const staticValues = modelValueSet(staticModels);
    return staticValues.has(requestedModel)
      ? requestedModel
      : preferredFallbackModel(staticModels, defaultModel) ?? requestedModel;
  }
}

function readIsolation(value: unknown): 'host' | 'worktree' | 'docker' | undefined {
  return value === 'host' || value === 'worktree' || value === 'docker' ? value : undefined;
}

function readLegacyEnabledAdapters(metadata?: Record<string, unknown>): string[] {
  return Array.isArray(metadata?.enabledAdapters)
    ? metadata.enabledAdapters.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function readMetadataAgents(metadata?: Record<string, unknown>): AgentAssignment[] {
  if (!Array.isArray(metadata?.agents)) return [];

  return metadata.agents
    .map((value, index): AgentAssignment | null => {
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      const adapterId = readString(record.adapterId);
      if (!adapterId) return null;
      if (readBoolean(record.enabled) === false) return null;

      return {
        instanceId: readString(record.instanceId) ?? `${adapterId}-${index + 1}`,
        adapterId,
        label: readString(record.label) ?? `${adapterId} #${index + 1}`,
        role: readAgentRole(record.role),
        instruction: readString(record.instruction),
        model: readString(record.model),
        permissionMode: readString(record.permissionMode),
        toolsSettings: readRecord(record.toolsSettings),
        order: index,
      };
    })
    .filter((value): value is AgentAssignment => Boolean(value))
    .slice(0, 16);
}

function readAgentAssignments(metadata?: Record<string, unknown>): AgentAssignment[] {
  const agents = readMetadataAgents(metadata);
  if (agents.length > 0) return agents;

  return readLegacyEnabledAdapters(metadata).map((adapterId, index) => ({
    instanceId: `${adapterId}-${index + 1}`,
    adapterId,
    label: `${adapterId} #${index + 1}`,
    order: index,
  }));
}

function readEnabledAdapters(metadata?: Record<string, unknown>): string[] {
  return [...new Set(readAgentAssignments(metadata).map((agent) => agent.adapterId))];
}

function readMaxParallelAgents(metadata?: Record<string, unknown>): number {
  const settings = getMetadataRecord(metadata, 'settings');
  const value = settings.maxParallelAgents;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(12, Math.round(value)))
    : 3;
}

function readMaxRepairCycles(metadata?: Record<string, unknown>): number {
  const settings = getMetadataRecord(metadata, 'settings');
  const value = settings.maxRepairCycles;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_REPAIR_CYCLES, Math.round(value)))
    : DEFAULT_MAX_REPAIR_CYCLES;
}

function safeNodeId(adapterId: string, suffix: string): string {
  return `${adapterId.replace(/[^a-zA-Z0-9_]+/g, '_')}_${suffix}`;
}

function safeAgentNodeId(agent: AgentAssignment, index: number, suffix: string): string {
  return `agent_${index + 1}_${safeNodeId(agent.adapterId, suffix)}`;
}

function agentRoster(agents: AgentAssignment[]): string {
  return agents
    .map((agent, index) => {
      const instruction = agent.instruction
        ? `\n   User assignment: ${agent.instruction}`
        : '';
      const role = agent.role ? `\n   API role: ${agent.role}` : '';
      return `${index + 1}. ${agent.label} (${agent.adapterId})${role}${instruction}`;
    })
    .join('\n');
}

function inferAgentRole(agent: AgentAssignment): AgentRole {
  if (isKnownAgentRole(agent.role)) return agent.role;

  const text = `${agent.label} ${agent.adapterId} ${agent.role ?? ''} ${agent.instruction ?? ''}`.toLocaleLowerCase('tr');
  if (/(test|tester|qa|review|code review|hata|kontrol|onay|incele|doğrula|dogrula)/u.test(text)) {
    return 'review';
  }
  if (/(backend|back-end|api|server|veri|database|db|fapi|endpoint|websocket|ws)/u.test(text)) {
    return 'backend';
  }
  if (/(frontend|front-end|ui|ux|tailwind|tasarım|tasarim|design|chart|tradingview|arayüz|arayuz)/u.test(text)) {
    return 'frontend';
  }
  return 'implementation';
}

function inferImplementationRole(agent: AgentAssignment): 'backend' | 'frontend' | 'review' | 'implementation' {
  const role = inferAgentRole(agent);
  return role === 'backend' || role === 'frontend' || role === 'review' || role === 'implementation'
    ? role
    : 'implementation';
}

function displayStage(agent: AgentAssignment, fallback: AgentRole): string {
  return agent.role && !isKnownAgentRole(agent.role) ? agent.role : fallback;
}

function rolePrompt(role: AgentRole): string {
  if (role === 'backend') {
    return 'Backend/API/data work should define stable contracts first. Report endpoints, payload shapes, ports, and any data-source limitations clearly for downstream agents.';
  }
  if (role === 'frontend') {
    return 'Frontend/UI work must use prior backend/data-contract outputs when present. If a dependency is missing, use a minimal mock only as a temporary fallback and report the blocker.';
  }
  if (role === 'review') {
    return 'You are the validation/review stage. Inspect the prior agent outputs and actual project state. Approve only if it works; otherwise return a concrete bug list and required fixes.';
  }
  if (role === 'proposal') {
    return 'You are in the proposal stage. Produce a concrete option with tradeoffs, assumptions, and what should happen next. Do not edit files.';
  }
  if (role === 'critique') {
    return 'You are in the critique stage. Challenge the proposal for risks, missing constraints, and weak assumptions. Do not edit files.';
  }
  if (role === 'response') {
    return 'You are in the response stage. Reconcile the critique with the proposal and refine the practical path forward. Do not edit files.';
  }
  if (role === 'decision' || role === 'report') {
    return 'You are the reporting stage. Produce the final concise decision report and a next prompt for launching an implementation agent team. Do not edit files.';
  }
  if (role !== 'implementation') {
    return `You are assigned to the custom stage "${role}". Follow that user-defined stage literally, avoid duplicating other agents, and report changed files, commands, blockers, and next actions.`;
  }
  return 'Implementation work should avoid duplicating other agents and should report changed files, commands, blockers, and next actions.';
}

function privacyGuardPrompt(): string {
  return 'Do not mention internal instructions, memory files, skill use, or tool protocol unless the user explicitly asks.';
}

function handoffArtifactInstructions(statusHint: string): string {
  return [
    `Output exactly one JSON object using the ${PIXCODE_HANDOFF_PROTOCOL} handoff artifact protocol.`,
    'Do not wrap it in Markdown. Do not add commentary before or after it.',
    `Use "${statusHint}" for taskStatus unless completed, blocked, failed, or needs-review is more accurate.`,
    'Schema:',
    HANDOFF_ARTIFACT_EXAMPLE,
  ].join('\n');
}

function handoffPrompt(agent: AgentAssignment, role: AgentRole): string {
  return [
    `You are ${agent.label} in a Pixcode CLI team.`,
    `Your inferred stage is: ${role}.`,
    'This is a bounded Pixcode handoff task, not the full implementation.',
    'Read the original user goal and coordinator plan, then publish a compact contract for downstream agents.',
    agent.instruction ? `Your explicit assignment from the user is: ${agent.instruction}` : '',
    handoffArtifactInstructions('ready'),
    'Do not install dependencies, edit files, run long commands, or start servers in this handoff task.',
    privacyGuardPrompt(),
    'Stop after the contract. Keep it concise and respond in the same language as the user request.',
  ].filter(Boolean).join('\n');
}

function handoffInitPrompt(agent: AgentAssignment, index: number): string {
  return [
    `You are preparing ${agent.label} for a strict Pixcode handoff chain.`,
    `This is internal step ${index + 1}.`,
    'Create a compact init packet for the next visible work step.',
    'Use the original user goal and any prior compact handoff packet included above.',
    agent.instruction ? `The explicit assignment for this agent is: ${agent.instruction}` : '',
    handoffArtifactInstructions('ready'),
    privacyGuardPrompt(),
    'Do not perform the task yet. Do not mention that this is hidden from the user.',
    'Respond in the same language as the user request.',
  ].filter(Boolean).join('\n');
}

function handoffWorkPrompt(agent: AgentAssignment, index: number): string {
  return [
    `You are ${agent.label} in a strict Pixcode handoff chain.`,
    `This is visible work step ${index + 1}.`,
    'The internal init packet above is your starting context. Do the assigned work now.',
    agent.instruction
      ? `Your explicit assignment from the user is: ${agent.instruction}`
      : 'Use the init packet and original user goal to choose the next useful work for this step.',
    rolePrompt(agent.role ?? 'implementation'),
    privacyGuardPrompt(),
    'Report only user-facing progress, changed files, commands, verification, blockers, and next actions.',
    'Respond in the same language as the user request.',
  ].filter(Boolean).join('\n');
}

function handoffCompactPrompt(agent: AgentAssignment, index: number): string {
  return [
    `You are compacting ${agent.label}'s strict handoff output for the next Pixcode agent.`,
    `This is internal compact step ${index + 1}.`,
    'Read the prior visible work output included above and create a compact handoff packet.',
    handoffArtifactInstructions('completed'),
    privacyGuardPrompt(),
    'Do not include raw logs unless they are essential. Keep it concise and actionable.',
    'Respond in the same language as the user request.',
  ].join('\n');
}

function compactOutputForContext(text: string): string {
  if (text.length <= MAX_OUTPUT_CONTEXT_CHARS) {
    return text;
  }

  const edge = Math.floor(MAX_OUTPUT_CONTEXT_CHARS / 2);
  return [
    text.slice(0, edge),
    `\n\n[...${text.length - MAX_OUTPUT_CONTEXT_CHARS} characters omitted from prior agent output...]\n\n`,
    text.slice(-edge),
  ].join('');
}

function requiresHandoffArtifact(node: WorkflowNode): boolean {
  return node.stage === 'handoff' || node.stage === 'handoff_init' || node.stage === 'handoff_compact';
}

function handoffArtifactSource(result: TaskResult): string {
  const structured = result.artifacts.find((artifact) => artifact.type === 'handoff-artifact' && artifact.data);
  if (structured?.data) {
    return JSON.stringify(structured.data);
  }
  return result.text;
}

function isExternalDirectoryPermissionError(value: unknown): boolean {
  const text = String(value ?? '').toLocaleLowerCase('en');
  return (
    text.includes('external_directory') ||
    /permission requested:.*auto-rejecting/u.test(text) ||
    /auto-rejecting.*permission/u.test(text) ||
    /outside (the )?(workspace|working directory)/u.test(text) ||
    /permission.*external/u.test(text)
  );
}

function isFinalReportNode(node: WorkflowNode): boolean {
  return node.id === 'final_report' || node.stage === 'final_report' || node.stage === 'report';
}

function workspaceNeedsHostPermissionBypass(target: ResolvedWorkspaceTarget): boolean {
  return (target.kind === 'selected_project' || target.kind === 'custom') && target.projectPath !== target.appRoot;
}

function resolveNodePermissionMode(node: WorkflowNode, target: ResolvedWorkspaceTarget): string | undefined {
  if (node.permissionMode && node.permissionMode !== 'default') {
    return node.permissionMode;
  }

  if (workspaceNeedsHostPermissionBypass(target)) {
    return 'bypassPermissions';
  }

  return node.permissionMode;
}

function buildPermissionFallbackOutput(
  node: WorkflowNode,
  reason: string,
  target: ResolvedWorkspaceTarget,
): string {
  return [
    'Bu adım çalışma alanı izin sınırına takıldı.',
    '',
    `Ajan: ${node.agentLabel || node.id}`,
    `Hedef çalışma alanı: ${target.projectPath}`,
    `Hata: ${reason}`,
    '',
    'Pixcode bu adımı workflow dışına taşırmadan devam ettirdi. Ajan aynı dış dizin yoluna tekrar tekrar erişmek yerine mevcut bağlamla ilerlemeli.',
  ].join('\n');
}

function buildFallbackFinalReport(
  outputs: Map<string, string>,
  reason: string,
  target: ResolvedWorkspaceTarget,
): string {
  const completedOutputs = [...outputs.entries()]
    .map(([nodeId, output]) => [`## ${nodeId}`, output || '(çıktı yok)'].join('\n'))
    .join('\n\n');

  return [
    'Final rapor aracı çalışma alanı izin sınırına takıldı, bu yüzden Pixcode tamamlanan ajan çıktılarından güvenli bir özet üretti.',
    '',
    `Hedef çalışma alanı: ${target.projectPath}`,
    `İzin hatası: ${reason}`,
    '',
    completedOutputs || 'Bu turda final rapora aktarılabilecek tamamlanmış ajan çıktısı yok.',
  ].join('\n');
}

function completeNodeWithPermissionFallback(
  nodeRun: WorkflowNodeRun,
  node: WorkflowNode,
  outputs: Map<string, string>,
  completed: Set<string>,
  reason: string,
  target: ResolvedWorkspaceTarget,
): void {
  const outputText = isFinalReportNode(node)
    ? buildFallbackFinalReport(outputs, reason, target)
    : buildPermissionFallbackOutput(node, reason, target);

  nodeRun.status = 'completed';
  nodeRun.error = reason;
  nodeRun.outputText = outputText;
  nodeRun.finishedAt = nodeRun.finishedAt ?? Date.now();
  outputs.set(node.id, compactOutputForContext(outputText));
  completed.add(node.id);
}

function expandAgentTeamWorkflow(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
  const agents = readAgentAssignments(metadata);
  if (agents.length === 0) {
    throw new Error('Select at least one CLI agent.');
  }

  const coordinator = agents.find((agent) => agent.adapterId === 'claude-code') ?? agents[0];
  const roster = agentRoster(agents);
  const workerSpecs = agents.map((agent, index) => ({
    agent,
    role: inferImplementationRole(agent),
    stage: displayStage(agent, inferImplementationRole(agent)),
    nodeId: safeAgentNodeId(agent, index, 'work'),
    handoffNodeId: safeAgentNodeId(agent, index, 'handoff'),
  }));
  const backendHandoffNodeIds = workerSpecs
    .filter((spec) => spec.role === 'backend')
    .map((spec) => spec.handoffNodeId);
  const implementationNodeIds = workerSpecs
    .filter((spec) => spec.role !== 'review')
    .map((spec) => spec.nodeId);
  const handoffNodes: WorkflowNode[] = workerSpecs
    .filter((spec) => spec.role === 'backend')
    .map(({ agent, role, handoffNodeId }) => ({
      id: handoffNodeId,
      adapterId: agent.adapterId,
      agentInstanceId: agent.instanceId,
      agentLabel: `${agent.label} Handoff`,
      assignment: agent.instruction,
      stage: 'handoff',
      model: agent.model,
      permissionMode: agent.permissionMode,
      toolsSettings: agent.toolsSettings,
      prompt: handoffPrompt(agent, role),
      inputs: ['coordinator'],
      output: 'message',
      onFail: 'continue',
      timeoutMs: BACKEND_HANDOFF_TIMEOUT_MS,
    }));
  const workerNodes: WorkflowNode[] = workerSpecs.map(({ agent, role, stage, nodeId, handoffNodeId }) => {
    const inputs = role === 'review'
      ? (implementationNodeIds.length > 0 ? implementationNodeIds : ['coordinator'])
      : role === 'frontend' && backendHandoffNodeIds.length > 0
        ? ['coordinator', ...backendHandoffNodeIds]
        : role === 'backend'
          ? ['coordinator', handoffNodeId]
          : ['coordinator'];

    return {
      id: nodeId,
      adapterId: agent.adapterId,
      agentInstanceId: agent.instanceId,
      agentLabel: agent.label,
      assignment: agent.instruction,
      stage,
      model: agent.model,
      permissionMode: agent.permissionMode,
      toolsSettings: agent.toolsSettings,
      prompt: [
        `You are ${agent.label} in a Pixcode CLI team.`,
        `Your stage is: ${stage}.`,
        stage !== role ? `Runtime routing category: ${role}.` : '',
        'The coordinator plan and any dependency outputs are included above. Use them together with the original user goal.',
        agent.instruction
          ? `Your explicit assignment from the user is: ${agent.instruction}`
          : 'No fixed per-agent assignment was set. Take the part assigned to you by the coordinator; if none is named, choose useful work that fits this CLI.',
        rolePrompt(stage),
        privacyGuardPrompt(),
        'Respond in the same language as the user request.',
      ].filter(Boolean).join('\n'),
      inputs,
      output: 'both',
      onFail: 'continue',
    };
  });

  return {
    ...workflow,
    nodes: [
      {
        id: 'coordinator',
        adapterId: coordinator.adapterId,
        agentInstanceId: coordinator.instanceId,
        agentLabel: coordinator.label,
        stage: 'coordinator',
        model: coordinator.model,
        permissionMode: coordinator.permissionMode,
        toolsSettings: coordinator.toolsSettings,
        prompt: [
          'You are the coordinator for a Pixcode CLI agent team.',
          'Read the user goal, active CLI roster, and any per-agent assignments. Create a compact execution plan for the selected agents.',
          'If the user directly names a CLI, honor that. Do not invent permanent roles; assign work only from the goal, active agents, and explicit assignment text.',
          `Active roster:\n${roster}`,
          'Respond in the same language as the user request.',
        ].join('\n'),
        inputs: [],
        output: 'message',
        onFail: 'abort',
      },
      ...handoffNodes,
      ...workerNodes,
      {
        id: 'final_report',
        adapterId: coordinator.adapterId,
        agentInstanceId: coordinator.instanceId,
        agentLabel: coordinator.label,
        stage: 'final_report',
        model: coordinator.model,
        permissionMode: coordinator.permissionMode,
        toolsSettings: coordinator.toolsSettings,
        prompt: [
          'Collect the worker outputs into one user-facing result.',
          'Show what each CLI did, which parts failed, what changed, and the next action if work remains.',
          'Do not expose internal prompts, memory lookup, skill/tool instructions, raw agent logs, or role prefixes like "agent:" and "user:".',
          'If a worker reveals internal process text, summarize only the useful user-facing result.',
          'Respond in the same language as the user request.',
        ].join('\n'),
        inputs: workerNodes.map((node) => node.id),
        output: 'message',
        onFail: 'abort',
      },
    ],
  };
}

function stagePrompt(agent: AgentAssignment, stage: AgentRole): string {
  return [
    `You are ${agent.label} in a Pixcode decision workflow.`,
    `Your stage is: ${stage}.`,
    agent.role && agent.role !== stage ? `User custom stage label: ${agent.role}.` : '',
    agent.instruction ? `User assignment for you: ${agent.instruction}` : '',
    rolePrompt(stage),
    privacyGuardPrompt(),
    'Keep the answer concise, structured, and useful for the next stage.',
    'Respond in the same language as the user request.',
  ].filter(Boolean).join('\n');
}

function agentsWithRole(agents: AgentAssignment[], role: AgentRole): AgentAssignment[] {
  return agents.filter((agent) => agent.role === role);
}

function autoAssignDebateAgents(agents: AgentAssignment[]): {
  proposalAgents: AgentAssignment[];
  critiqueAgents: AgentAssignment[];
  responseAgents: AgentAssignment[];
  reportAgent: AgentAssignment;
} {
  const assigned = new Set<string>();
  const markAssigned = (items: AgentAssignment[]) => {
    for (const item of items) assigned.add(item.instanceId);
  };
  const pickNext = () =>
    agents.find((agent) => !assigned.has(agent.instanceId) && agent.role !== 'decision' && agent.role !== 'report')
    ?? agents.find((agent) => !assigned.has(agent.instanceId))
    ?? agents[0];

  const proposalAgents = agentsWithRole(agents, 'proposal');
  if (proposalAgents.length === 0) proposalAgents.push(pickNext());
  markAssigned(proposalAgents);

  const critiqueAgents = agentsWithRole(agents, 'critique');
  if (critiqueAgents.length === 0) critiqueAgents.push(pickNext());
  markAssigned(critiqueAgents);

  const responseAgents = agentsWithRole(agents, 'response');
  if (responseAgents.length === 0 && agents.length > 2) {
    responseAgents.push(...agents.filter((agent) =>
      !assigned.has(agent.instanceId) && agent.role !== 'decision' && agent.role !== 'report',
    ));
  }
  markAssigned(responseAgents);

  const reportAgent = agentsWithRole(agents, 'decision')[0]
    ?? agentsWithRole(agents, 'report')[0]
    ?? agents[0];

  return { proposalAgents, critiqueAgents, responseAgents, reportAgent };
}

function expandAdversarialDebateWorkflow(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
  const agents = readAgentAssignments(metadata);
  if (agents.length === 0) {
    throw new Error('Select at least one CLI agent.');
  }

  const {
    proposalAgents,
    critiqueAgents,
    responseAgents,
    reportAgent,
  } = autoAssignDebateAgents(agents);

  const proposalNodes: WorkflowNode[] = proposalAgents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'proposal'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction || 'Proposal stage',
    stage: 'proposal',
    model: agent.model,
    permissionMode: agent.permissionMode,
    toolsSettings: agent.toolsSettings,
    prompt: stagePrompt(agent, 'proposal'),
    inputs: [],
    output: 'message',
    onFail: 'continue',
  }));
  const critiqueNodes: WorkflowNode[] = critiqueAgents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'critique'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction || 'Critique stage',
    stage: 'critique',
    model: agent.model,
    permissionMode: agent.permissionMode,
    toolsSettings: agent.toolsSettings,
    prompt: stagePrompt(agent, 'critique'),
    inputs: proposalNodes.map((node) => node.id),
    output: 'message',
    onFail: 'continue',
  }));
  const responseNodes: WorkflowNode[] = responseAgents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'response'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction || 'Response stage',
    stage: 'response',
    model: agent.model,
    permissionMode: agent.permissionMode,
    toolsSettings: agent.toolsSettings,
    prompt: stagePrompt(agent, 'response'),
    inputs: critiqueNodes.map((node) => node.id),
    output: 'message',
    onFail: 'continue',
  }));
  const finalInputs = responseNodes.length > 0
    ? responseNodes.map((node) => node.id)
    : critiqueNodes.map((node) => node.id);

  return {
    ...workflow,
    nodes: [
      ...proposalNodes,
      ...critiqueNodes,
      ...responseNodes,
      {
        id: 'final_report',
        adapterId: reportAgent.adapterId,
        agentInstanceId: reportAgent.instanceId,
        agentLabel: reportAgent.label,
        assignment: reportAgent.instruction || 'Final decision report',
        stage: 'final_report',
        model: reportAgent.model,
        permissionMode: reportAgent.permissionMode,
        toolsSettings: reportAgent.toolsSettings,
        prompt: [
          'Produce the final decision report from the debate.',
          'Use this exact structure:',
          '1. Short decision',
          '2. Why',
          '3. Risks',
          '4. Suggested next prompt',
          '5. Proposed agent team and assignments',
          'The next prompt should be ready to paste into Pixcode Agent Team mode.',
          'Do not edit files. Respond in the same language as the user request.',
        ].join('\n'),
        inputs: finalInputs,
        output: 'message',
        onFail: 'abort',
      },
    ],
  };
}

function expandSequentialHandoffWorkflow(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
  const agents = readAgentAssignments(metadata);
  if (agents.length === 0) {
    throw new Error('Select at least one CLI agent.');
  }

  const nodes: WorkflowNode[] = agents.flatMap((agent, index): WorkflowNode[] => {
    const initNodeId = safeAgentNodeId(agent, index, 'init');
    const workNodeId = safeAgentNodeId(agent, index, 'work');
    const compactNodeId = safeAgentNodeId(agent, index, 'compact');

    return [
      {
        id: initNodeId,
        adapterId: agent.adapterId,
        agentInstanceId: agent.instanceId,
        agentLabel: `${agent.label} Init`,
        assignment: agent.instruction,
        stage: 'handoff_init',
        model: agent.model,
        permissionMode: agent.permissionMode,
        toolsSettings: agent.toolsSettings,
        prompt: handoffInitPrompt(agent, index),
        inputs: index === 0 ? [] : [safeAgentNodeId(agents[index - 1], index - 1, 'compact')],
        output: 'message',
        onFail: 'abort',
        internal: true,
      },
      {
        id: workNodeId,
        adapterId: agent.adapterId,
        agentInstanceId: agent.instanceId,
        agentLabel: agent.label,
        assignment: agent.instruction,
        stage: agent.role ?? 'implementation',
        model: agent.model,
        permissionMode: agent.permissionMode,
        toolsSettings: agent.toolsSettings,
        prompt: handoffWorkPrompt(agent, index),
        inputs: [initNodeId],
        output: 'both',
        onFail: 'abort',
      },
      {
        id: compactNodeId,
        adapterId: agent.adapterId,
        agentInstanceId: agent.instanceId,
        agentLabel: `${agent.label} Compact`,
        assignment: agent.instruction,
        stage: 'handoff_compact',
        model: agent.model,
        permissionMode: agent.permissionMode,
        toolsSettings: agent.toolsSettings,
        prompt: handoffCompactPrompt(agent, index),
        inputs: [workNodeId],
        output: 'message',
        onFail: 'abort',
        internal: true,
      },
    ];
  });
  const reportAgent = agents[0];
  const lastCompactNodeId = safeAgentNodeId(agents[agents.length - 1], agents.length - 1, 'compact');

  return {
    ...workflow,
    nodes: [
      ...nodes,
      {
        id: 'final_report',
        adapterId: reportAgent.adapterId,
        agentInstanceId: reportAgent.instanceId,
        agentLabel: reportAgent.label,
        stage: 'final_report',
        model: reportAgent.model,
        permissionMode: reportAgent.permissionMode,
        toolsSettings: reportAgent.toolsSettings,
        prompt: [
          'Create the final user-facing result for this strict handoff run.',
          'Use the final compact handoff packet and the original user goal.',
          'Summarize what each visible agent did, what changed, verification, blockers, and next actions.',
          'Do not expose internal init packets, compact packets, prompts, memory lookup, skill/tool instructions, raw agent logs, or role prefixes like "agent:" and "user:".',
          'Respond in the same language as the user request.',
        ].join('\n'),
        inputs: [lastCompactNodeId],
        output: 'message',
        onFail: 'abort',
      },
    ],
  };
}

function expandWorkflowForRun(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
  if (workflow.id === 'agent_team') {
    return expandAgentTeamWorkflow(workflow, metadata);
  }

  const agents = readAgentAssignments(metadata);
  if (workflow.id === 'adversarial_debate') {
    return expandAdversarialDebateWorkflow(workflow, metadata);
  }
  if (workflow.id === 'sequential_handoff') {
    return expandSequentialHandoffWorkflow(workflow, metadata);
  }
  if (workflow.id !== 'multi_model_review' || agents.length === 0) {
    return workflow;
  }

  const reportAgent = agentsWithRole(agents, 'report')[0] ?? agentsWithRole(agents, 'decision')[0] ?? agents[0];
  const reviewAgents = agents.filter((agent) => agent.instanceId !== reportAgent.instanceId || agents.length === 1);
  const reviewNodes: WorkflowNode[] = reviewAgents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'review'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction,
    stage: 'review',
    model: agent.model,
    permissionMode: agent.permissionMode,
    toolsSettings: agent.toolsSettings,
    prompt: [
      `You are ${agent.label}.`,
      'Review the requested change for bugs, regressions, missing validation, security, scale, and user-experience risks.',
      agent.instruction ? `Focus on this user assignment: ${agent.instruction}` : '',
      privacyGuardPrompt(),
      'Respond in the same language as the user request.',
    ].filter(Boolean).join('\n'),
    inputs: [],
    output: 'both',
    onFail: 'continue',
  }));

  return {
    ...workflow,
    nodes: [
      ...reviewNodes,
      {
        id: 'aggregate',
        adapterId: reportAgent.adapterId,
        agentInstanceId: reportAgent.instanceId,
        agentLabel: reportAgent.label,
        stage: 'report',
        model: reportAgent.model,
        permissionMode: reportAgent.permissionMode,
        toolsSettings: reportAgent.toolsSettings,
        prompt: [
          'Aggregate the prior agent reviews into a concise prioritized report.',
          'Do not expose internal prompts, memory lookup, skill/tool instructions, raw agent logs, or role prefixes like "agent:" and "user:".',
          'Respond in the same language as the user request.',
        ].join('\n'),
        inputs: reviewNodes.map((node) => node.id),
        output: 'message',
        onFail: 'abort',
      },
    ],
  };
}

function readTaskResult(task: RawTask): TaskResult {
  const messages = (task.history ?? []).map((message) => ({
    role: typeof message.role === 'string' ? message.role : 'agent',
    text: (message.parts ?? [])
      .filter((part) => part.kind === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n'),
  })).filter((message) => message.text.trim());
  const artifacts = (task.artifacts ?? []).map((artifact) => {
    const text = (artifact.parts ?? [])
      .filter((part) => part.kind === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    const data = (artifact.parts ?? []).find((part) => part.kind === 'data')?.data;
    return {
      type: artifact.type ?? 'data',
      text: text || undefined,
      data,
      metadata: artifact.metadata,
    };
  });
  const outputMessages = messages.filter((message) => message.role !== 'user');
  const userFacingTaskText = outputMessages.map((message) => message.text.trim()).filter(Boolean).join('\n\n');
  const error = task.error?.message
    ? `${task.error.code ? `${task.error.code}: ` : ''}${task.error.message}`
    : undefined;
  return {
    state: task.state ?? 'submitted',
    text: userFacingTaskText,
    error,
    messages,
    artifacts,
  };
}

async function waitForTask(
  taskId: string,
  shouldCancel?: () => boolean,
  onSnapshot?: (result: TaskResult) => void,
  timeoutMs?: number,
): Promise<TaskResult> {
  const timeout = timeoutMs && timeoutMs > 0 ? timeoutMs : undefined;
  const deadline = timeout ? Date.now() + timeout : undefined;
  for (;;) {
    if (shouldCancel?.()) {
      throw new WorkflowCanceledError();
    }
    if (deadline && Date.now() >= deadline) {
      throw new WorkflowNodeTimeoutError(timeout ?? 0);
    }
    const task = getA2ATask(taskId);
    if (!task) {
      throw new Error(`Agent task ${taskId} was not found.`);
    }
    const snapshot = readTaskResult(task);
    onSnapshot?.(snapshot);
    if (task.state && TERMINAL.has(task.state)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function readyNodes(workflow: Workflow, completed: Set<string>, started: Set<string>): WorkflowNode[] {
  return workflow.nodes.filter((node) =>
    !started.has(node.id) && node.inputs.every((input) => completed.has(input)),
  );
}

function nodeRunFromNode(node: WorkflowNode): WorkflowNodeRun {
  return {
    nodeId: node.id,
    adapterId: node.adapterId,
    agentInstanceId: node.agentInstanceId,
    agentLabel: node.agentLabel,
    assignment: node.assignment,
    promptPreview: node.prompt,
    model: node.model,
    permissionMode: node.permissionMode,
    timeoutMs: node.timeoutMs,
    stage: node.stage,
    internal: node.internal,
    fallbackTrigger: node.fallbackTrigger,
    fallbackSourceNodeId: node.fallbackSourceNodeId,
    status: 'queued',
  };
}

function uniqueInputs(inputs: string[]): string[] {
  return [...new Set(inputs.filter(Boolean))];
}

function isReviewNode(node: WorkflowNode): boolean {
  return node.stage === 'review';
}

function isImplementationNode(node: WorkflowNode): boolean {
  return node.stage === 'backend' || node.stage === 'frontend' || node.stage === 'implementation' || node.stage === 'repair';
}

function reviewRequiresRepair(text: string): boolean {
  const normalized = text.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const approvalPatterns = [
    /hata yok/u,
    /sorun yok/u,
    /problem yok/u,
    /bulgu yok/u,
    /kritik bulgu yok/u,
    /temiz/u,
    /onaylı/u,
    /onayli/u,
    /approved/u,
    /lgtm/u,
    /no issues/u,
    /no findings/u,
    /looks good/u,
    /pass(?:ed)?/u,
  ];
  const actionableText = approvalPatterns.reduce((current, pattern) => current.replace(pattern, ' '), normalized);
  const issuePatterns = [
    /hata/u,
    /bug/u,
    /kritik/u,
    /critical/u,
    /blocker/u,
    /regression/u,
    /failed/u,
    /failure/u,
    /fail/u,
    /eksik/u,
    /düzelt/u,
    /duzelt/u,
    /fix required/u,
    /needs fix/u,
    /sorun/u,
    /risk/u,
    /güvenlik/u,
    /guvenlik/u,
    /security/u,
    /çalışmıyor/u,
    /calismiyor/u,
  ];

  return issuePatterns.some((pattern) => pattern.test(actionableText));
}

function findRepairFixer(workflow: Workflow, reviewNode: WorkflowNode): WorkflowNode | undefined {
  return reviewNode.inputs
    .map((input) => workflow.nodes.find((node) => node.id === input))
    .find((node): node is WorkflowNode => Boolean(node && isImplementationNode(node)))
    ?? workflow.nodes.find((node) => isImplementationNode(node))
    ?? workflow.nodes.find((node) => node.stage === 'coordinator');
}

class WorkflowRunner {
  private readonly cancelingRuns = new Set<string>();

  preview(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
    const runtimeWorkflow = expandWorkflowForRun(workflow, metadata);
    validateWorkflow(runtimeWorkflow);
    return runtimeWorkflow;
  }

  start(workflow: Workflow, input = '', metadata?: Record<string, unknown>): WorkflowRun {
    const runtimeWorkflow = expandWorkflowForRun(workflow, metadata);
    validateWorkflow(runtimeWorkflow);
    const workspaceTarget = resolveWorkflowWorkspace(metadata);
    const permissionPolicy = resolvePermissionPolicyFromMetadata(metadata);
    const runMetadata: Record<string, unknown> = {
      ...metadata,
      permissionPolicy,
      projectPath: workspaceTarget.projectPath,
      selectedProjectPath: workspaceTarget.selectedProjectPath,
      workspaceTarget: workspaceTargetMetadata(workspaceTarget),
    };
    const run: WorkflowRun = {
      id: newId('wrun'),
      workflowId: runtimeWorkflow.id,
      contextId: newId('ctx'),
      status: 'queued',
      input,
      nodeRuns: runtimeWorkflow.nodes.map(nodeRunFromNode),
      startedAt: Date.now(),
      metadata: runMetadata,
    };
    workflowStore.setRun(run);
    const orchestrationTaskId = readString(runMetadata.orchestrationTaskId);
    if (orchestrationTaskId) {
      orchestrationTaskService.linkWorkflowRun(orchestrationTaskId, run);
    }
    void this.execute(runtimeWorkflow, run);
    return run;
  }

  async cancel(runId: string): Promise<WorkflowRun | undefined> {
    const run = workflowStore.getRun(runId);
    if (!run) return undefined;
    if (TERMINAL.has(run.status)) return run;

    this.cancelingRuns.add(run.id);
    const taskIds = run.nodeRuns
      .filter((node) => node.a2aTaskId && (node.status === 'running' || node.status === 'queued'))
      .map((node) => node.a2aTaskId as string);

    this.markCanceled(run);
    workflowStore.setRun(run);

    await Promise.all(taskIds.map((taskId) => cancelA2ATask(taskId)));

    return workflowStore.getRun(run.id) ?? run;
  }

  private isCanceling(runId: string): boolean {
    return this.cancelingRuns.has(runId) || workflowStore.getRun(runId)?.status === 'canceled';
  }

  private markCanceled(run: WorkflowRun): void {
    run.status = 'canceled';
    run.finishedAt = run.finishedAt ?? Date.now();
    for (const nodeRun of run.nodeRuns) {
      if (!TERMINAL.has(nodeRun.status) && nodeRun.status !== SKIPPED) {
        nodeRun.status = 'canceled';
        nodeRun.finishedAt = nodeRun.finishedAt ?? Date.now();
      }
    }
  }

  private fallbackAgentFor(run: WorkflowRun, node: WorkflowNode): AgentAssignment | undefined {
    if (node.stage === 'fallback' || node.id.startsWith('fallback_')) {
      return undefined;
    }

    const settings = getMetadataRecord(run.metadata, 'settings');
    const fallbackAgentInstanceId = readString(settings.fallbackAgentInstanceId);
    if (!fallbackAgentInstanceId || fallbackAgentInstanceId === node.agentInstanceId) {
      return undefined;
    }

    return readAgentAssignments(run.metadata).find((agent) => agent.instanceId === fallbackAgentInstanceId);
  }

  private createFallbackNode(
    node: WorkflowNode,
    fallbackAgent: AgentAssignment,
    reason: string,
    fallbackTrigger: WorkflowFallbackTrigger,
  ): WorkflowNode {
    const fallbackSuffix = safeNodeId(fallbackAgent.instanceId, 'fallback');
    return {
      ...node,
      id: `fallback_${node.id}_${fallbackSuffix}`,
      adapterId: fallbackAgent.adapterId,
      agentInstanceId: fallbackAgent.instanceId,
      agentLabel: `${fallbackAgent.label} Fallback`,
      assignment: `Fallback for ${node.agentLabel || node.id}`,
      stage: 'fallback',
      model: fallbackAgent.model,
      permissionMode: fallbackAgent.permissionMode,
      toolsSettings: fallbackAgent.toolsSettings,
      fallbackTrigger,
      fallbackSourceNodeId: node.id,
      prompt: [
        'The previous CLI agent failed on this orchestration step.',
        `Failed step: ${node.agentLabel || node.id}`,
        `Fallback trigger: ${fallbackTrigger}`,
        `Failure: ${reason}`,
        'Take over the same assignment as the backup CLI. Use the original goal and upstream context.',
        'Do not repeat unrelated work; complete the failed step and report what you did.',
        node.prompt,
      ].join('\n'),
      onFail: 'continue',
    };
  }

  private recordFallbackSkipped(
    run: WorkflowRun,
    node: WorkflowNode,
    reason: string,
    fallbackTrigger: WorkflowFallbackTrigger,
    skippedReason: string,
  ): void {
    const fallbackSkippedEvents = Array.isArray(run.metadata?.fallbackSkippedEvents)
      ? run.metadata.fallbackSkippedEvents
      : [];
    run.metadata = {
      ...run.metadata,
      fallbackSkippedEvents: [
        ...fallbackSkippedEvents,
        {
          nodeId: node.id,
          trigger: fallbackTrigger,
          reason,
          skippedReason,
          createdAt: Date.now(),
        },
      ],
    };
    workflowStore.setRun(run);
  }

  private async runFallbackAfterFailure(
    node: WorkflowNode,
    workflow: Workflow,
    run: WorkflowRun,
    outputs: Map<string, string>,
    started: Set<string>,
    completed: Set<string>,
    reason: string,
    trigger?: WorkflowFallbackTrigger,
  ): Promise<boolean> {
    const fallbackTrigger = classifyWorkflowFailure(reason, trigger);
    const fallbackAgent = this.fallbackAgentFor(run, node);
    if (!fallbackAgent) {
      this.recordFallbackSkipped(run, node, reason, fallbackTrigger, 'No fallback agent is configured for this run.');
      return false;
    }
    const decision = resolveWorkflowFallbackDecision({
      run,
      node,
      reason,
      trigger: fallbackTrigger,
      fallbackAgentInstanceId: fallbackAgent.instanceId,
    });
    if (!decision.shouldFallback) {
      this.recordFallbackSkipped(
        run,
        node,
        reason,
        decision.trigger,
        decision.skippedReason ?? 'Fallback policy skipped this failure.',
      );
      return false;
    }
    if (workflow.nodes.length + 1 > 64) {
      run.metadata = {
        ...run.metadata,
        fallbackSkipped: `Workflow node limit reached after ${node.id}.`,
      };
      workflowStore.setRun(run);
      return false;
    }

    let fallbackNode = this.createFallbackNode(node, fallbackAgent, reason, decision.trigger);
    let collision = 1;
    while (workflow.nodes.some((candidate) => candidate.id === fallbackNode.id)) {
      collision += 1;
      fallbackNode = {
        ...fallbackNode,
        id: `${fallbackNode.id}_${collision}`,
      };
    }

    const nodeIndex = workflow.nodes.findIndex((candidate) => candidate.id === node.id);
    const runIndex = run.nodeRuns.findIndex((candidate) => candidate.nodeId === node.id);
    if (nodeIndex >= 0) {
      workflow.nodes.splice(nodeIndex + 1, 0, fallbackNode);
    } else {
      workflow.nodes.push(fallbackNode);
    }
    if (runIndex >= 0) {
      run.nodeRuns.splice(runIndex + 1, 0, nodeRunFromNode(fallbackNode));
    } else {
      run.nodeRuns.push(nodeRunFromNode(fallbackNode));
    }

    const fallbackEvents = Array.isArray(run.metadata?.fallbackEvents)
      ? run.metadata.fallbackEvents
      : [];
    run.metadata = {
      ...run.metadata,
      fallbackEvents: [
        ...fallbackEvents,
        {
          nodeId: node.id,
          fallbackNodeId: fallbackNode.id,
          fallbackAgentInstanceId: fallbackAgent.instanceId,
          trigger: decision.trigger,
          policy: decision.policy,
          reason,
          startedAt: Date.now(),
        },
      ],
    };
    workflowStore.setRun(run);

    await this.executeNode(fallbackNode, workflow, run, outputs, started, completed);

    const fallbackRun = run.nodeRuns.find((candidate) => candidate.nodeId === fallbackNode.id);
    if (fallbackRun?.status !== 'completed') {
      return false;
    }

    const fallbackOutput = outputs.get(fallbackNode.id) || fallbackRun.outputText;
    if (fallbackOutput) {
      outputs.set(node.id, compactOutputForContext(fallbackOutput));
    }
    completed.add(node.id);
    workflowStore.setRun(run);
    return true;
  }

  private maybeAddRepairCycle(
    node: WorkflowNode,
    workflow: Workflow,
    run: WorkflowRun,
    result: TaskResult,
  ): void {
    if (workflow.id !== 'agent_team') return;
    if (!isReviewNode(node) || node.id.startsWith('repair_') || node.id.startsWith('recheck_')) return;
    if (!reviewRequiresRepair(`${result.text}\n${result.error ?? ''}`)) return;

    const maxRepairCycles = readMaxRepairCycles(run.metadata);
    if (maxRepairCycles <= 0) return;

    const existingCycles = workflow.nodes.filter((candidate) => candidate.id.startsWith(`repair_${node.id}_`)).length;
    if (existingCycles >= maxRepairCycles) return;

    if (workflow.nodes.length + 2 > 64) {
      run.metadata = {
        ...run.metadata,
        dynamicRepairSkipped: `Workflow node limit reached after ${node.id}.`,
      };
      workflowStore.setRun(run);
      return;
    }

    const fixer = findRepairFixer(workflow, node);
    if (!fixer || fixer.id === node.id) return;

    const cycle = existingCycles + 1;
    const repairNode: WorkflowNode = {
      id: `repair_${node.id}_${cycle}`,
      adapterId: fixer.adapterId,
      agentInstanceId: fixer.agentInstanceId,
      agentLabel: fixer.agentLabel ? `${fixer.agentLabel} Repair` : undefined,
      assignment: `Automatic repair from ${node.agentLabel || node.id} review findings`,
      stage: 'repair',
      model: fixer.model,
      permissionMode: fixer.permissionMode,
      toolsSettings: fixer.toolsSettings,
      prompt: [
        'A review stage found actionable issues in the prior work.',
        'Use the original user goal, prior implementation outputs, and review output included above.',
        'Fix only the reported issues; do not restart the whole project or duplicate unrelated work.',
        'Report changed files, commands, verification, and any remaining blockers.',
        'Respond in the same language as the user request.',
      ].join('\n'),
      inputs: uniqueInputs([...node.inputs, fixer.id, node.id]),
      output: 'both',
      onFail: 'continue',
    };
    const recheckNode: WorkflowNode = {
      id: `recheck_${node.id}_${cycle}`,
      adapterId: node.adapterId,
      agentInstanceId: node.agentInstanceId,
      agentLabel: node.agentLabel ? `${node.agentLabel} Recheck` : undefined,
      assignment: 'Automatic validation after repair',
      stage: 'review',
      model: node.model,
      permissionMode: node.permissionMode,
      toolsSettings: node.toolsSettings,
      prompt: [
        'Validate the automatic repair against the original review findings.',
        'Approve only if the reported issues are fixed.',
        'If anything remains, list the remaining blockers clearly and do not invent new unrelated scope.',
        'Respond in the same language as the user request.',
      ].join('\n'),
      inputs: uniqueInputs([node.id, repairNode.id]),
      output: 'message',
      onFail: 'continue',
    };

    const finalIndex = workflow.nodes.findIndex((candidate) =>
      candidate.id === 'final_report' || candidate.stage === 'final_report' || candidate.stage === 'report',
    );
    if (finalIndex >= 0) {
      workflow.nodes.splice(finalIndex, 0, repairNode, recheckNode);
      run.nodeRuns.splice(finalIndex, 0, nodeRunFromNode(repairNode), nodeRunFromNode(recheckNode));
    } else {
      workflow.nodes.push(repairNode, recheckNode);
      run.nodeRuns.push(nodeRunFromNode(repairNode), nodeRunFromNode(recheckNode));
    }

    for (const finalNode of workflow.nodes) {
      if (finalNode.id === 'final_report' || finalNode.stage === 'final_report' || finalNode.stage === 'report') {
        finalNode.inputs = uniqueInputs([...finalNode.inputs, recheckNode.id]);
      }
    }

    const repairCycles = Array.isArray(run.metadata?.dynamicRepairCycles)
      ? run.metadata.dynamicRepairCycles
      : [];
    run.metadata = {
      ...run.metadata,
      dynamicRepairCycles: [
        ...repairCycles,
        {
          reviewNodeId: node.id,
          repairNodeId: repairNode.id,
          recheckNodeId: recheckNode.id,
          fixerNodeId: fixer.id,
        },
      ],
    };
    workflowStore.setRun(run);
  }

  private async execute(workflow: Workflow, run: WorkflowRun): Promise<void> {
    run.status = 'running';
    workflowStore.setRun(run);
    const completed = new Set<string>();
    const started = new Set<string>();
    const outputs = new Map<string, string>();
    const maxParallelAgents = readMaxParallelAgents(run.metadata);

    try {
      while (completed.size < workflow.nodes.length) {
        if (this.isCanceling(run.id)) {
          throw new WorkflowCanceledError();
        }
        const batch = readyNodes(workflow, completed, started);
        if (batch.length === 0) {
          throw new Error('Workflow stalled; no ready nodes remain.');
        }
        for (let index = 0; index < batch.length; index += maxParallelAgents) {
          if (this.isCanceling(run.id)) {
            throw new WorkflowCanceledError();
          }
          const slice = batch.slice(index, index + maxParallelAgents);
          await Promise.all(slice.map((node) => this.executeNode(node, workflow, run, outputs, started, completed)));
        }
      }
      if (this.isCanceling(run.id)) {
        throw new WorkflowCanceledError();
      }
      run.status = 'completed';
    } catch (error) {
      if (error instanceof WorkflowCanceledError || this.isCanceling(run.id)) {
        this.markCanceled(run);
      } else {
        run.status = 'failed';
        run.metadata = {
          ...run.metadata,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } finally {
      run.finishedAt = run.finishedAt ?? Date.now();
      workflowStore.setRun(run);
      orchestrationTaskService.updateFromWorkflowRun(run);
      notifyWorkflowRunFinished(run);
      const webhookRunStatus = String(run.status);
      dispatchWebhookEvent({
        type: webhookRunStatus === 'completed'
          ? 'run.completed'
          : webhookRunStatus === 'canceled'
            ? 'run.canceled'
            : 'run.failed',
        payload: {
          runId: run.id,
          workflowId: run.workflowId,
          status: webhookRunStatus,
          error: readString(run.metadata?.error),
        },
      });
      this.cancelingRuns.delete(run.id);
    }
  }

  private recordPermissionDecision(
    run: WorkflowRun,
    nodeRun: WorkflowNodeRun,
    decision: PermissionDecision,
  ): void {
    nodeRun.permissionDecisions = [
      ...(nodeRun.permissionDecisions ?? []),
      decision,
    ];

    const existingApprovals = permissionApprovalRequests(run)
      .filter((approval) => approval.id !== decision.approvalRequest?.id);
    run.metadata = {
      ...run.metadata,
      permissionPolicyEvents: [
        ...permissionPolicyEvents(run),
        decision.event,
      ],
      pendingPermissionApprovals: decision.approvalRequest
        ? [
          ...existingApprovals,
          decision.approvalRequest,
        ]
        : existingApprovals,
    };

    if (decision.approvalRequest) {
      notifyPermissionApprovalRequested(run, decision);
      dispatchWebhookEvent({
        type: 'approval.needed',
        payload: {
          runId: run.id,
          workflowId: run.workflowId,
          approvalId: decision.approvalRequest.id,
          capabilities: decision.capabilities,
        },
      });
    }
  }

  private async executeNode(
    node: WorkflowNode,
    workflow: Workflow,
    run: WorkflowRun,
    outputs: Map<string, string>,
    started: Set<string>,
    completed: Set<string>,
  ): Promise<void> {
    started.add(node.id);
    const nodeRun = run.nodeRuns.find((candidate) => candidate.nodeId === node.id) as WorkflowNodeRun;
    const enabledAdapters = readEnabledAdapters(run.metadata);
    if (enabledAdapters.length > 0 && !enabledAdapters.includes(node.adapterId)) {
      nodeRun.status = SKIPPED;
      nodeRun.finishedAt = Date.now();
      completed.add(node.id);
      workflowStore.setRun(run);
      return;
    }
    if (this.isCanceling(run.id)) {
      nodeRun.status = 'canceled';
      nodeRun.finishedAt = Date.now();
      workflowStore.setRun(run);
      throw new WorkflowCanceledError();
    }

    nodeRun.status = 'running';
    nodeRun.startedAt = Date.now();
    nodeRun.permissionMode = resolveNodePermissionMode(node, resolveWorkflowWorkspace(run.metadata));
    workflowStore.setRun(run);

    const inputContext = node.inputs.map((input) => outputs.get(input)).filter(Boolean).join('\n\n');
    const workspaceTarget = resolveWorkflowWorkspace(run.metadata);
    const contextPacket = buildWorkflowContextPacket({
      run,
      node,
      workspaceTarget,
      inputContext,
      inputNodeIds: node.inputs,
    });
    nodeRun.contextPacket = contextPacket;
    workflowStore.setRun(run);
    const prompt = [
      'Original user request (primary task; answer this directly even if the workspace is empty):',
      run.input?.trim() || '(No original user request was provided.)',
      formatContextPacketForPrompt(contextPacket),
      inputContext
        ? `Upstream workflow context from prior agents:\n${inputContext}`
        : '',
      `Current workflow step instructions:\n${node.prompt}`,
      workspaceContextPrompt(workspaceTarget),
    ].filter(Boolean).join('\n\n');
    const settings = getMetadataRecord(run.metadata, 'settings');
    const projectPath = workspaceTarget.projectPath;
    const isolation = readIsolation(settings.isolation) ?? node.isolation ?? 'host';
    const keepAfterCompletion = readBoolean(settings.keepWorkspace) ?? true;
    const baseRef = readString(settings.baseRef) ?? 'HEAD';
    const effectivePermissionMode = resolveNodePermissionMode(node, workspaceTarget);
    const effectiveModel = await resolveWorkflowModel(node.adapterId, node.model);
    if (effectiveModel !== node.model) {
      nodeRun.model = effectiveModel;
      const modelFallbackEvents = Array.isArray(run.metadata?.modelFallbackEvents)
        ? run.metadata.modelFallbackEvents
        : [];
      run.metadata = {
        ...run.metadata,
        modelFallbackEvents: [
          ...modelFallbackEvents,
          {
            nodeId: node.id,
            adapterId: node.adapterId,
            requestedModel: node.model,
            effectiveModel,
            changedAt: Date.now(),
          },
        ],
      };
      workflowStore.setRun(run);
    }
    const permissionPolicy = permissionPolicyFromRun(run);
    nodeRun.permissionPolicy = permissionPolicy;
    const permissionDecision = evaluatePermissionRequest({
      policy: permissionPolicy,
      request: {
        source: 'workflow_node',
        toolName: node.adapterId,
        input: {
          assignment: node.assignment,
          stage: node.stage,
          toolsSettings: node.toolsSettings,
        },
        cwd: projectPath,
        workspacePath: workspaceTarget.appRoot,
        targetPaths: [projectPath],
        summary: [
          node.agentLabel || node.id,
          node.stage ? `stage=${node.stage}` : undefined,
          node.assignment,
        ].filter(Boolean).join(' / '),
      },
      context: {
        runId: run.id,
        nodeId: node.id,
        workflowId: run.workflowId,
        adapterId: node.adapterId,
        agentLabel: node.agentLabel,
        userId: readNotificationUserId(run.metadata),
      },
    });
    this.recordPermissionDecision(run, nodeRun, permissionDecision);
    workflowStore.setRun(run);
    if (permissionDecision.behavior === 'deny') {
      nodeRun.finishedAt = Date.now();
      nodeRun.status = 'failed';
      nodeRun.error = permissionDecision.message;
      workflowStore.setRun(run);
      if (node.onFail === 'continue') {
        completed.add(node.id);
        return;
      }
      throw new Error(permissionDecision.message);
    }
    let submittedTask: RawTask;
    try {
      submittedTask = await submitA2ATask({
        adapterId: node.adapterId,
        contextId: run.contextId,
        message: {
          messageId: newId('msg'),
          role: 'user',
          parts: [{ kind: 'text', text: prompt }],
        },
        metadata: {
          workflowRunId: run.id,
          workflowNodeId: node.id,
          agentInstanceId: node.agentInstanceId,
          agentLabel: node.agentLabel,
          assignment: node.assignment,
          model: effectiveModel,
          permissionMode: effectivePermissionMode,
          permissionPolicy,
          permissionPolicyContext: {
            runId: run.id,
            nodeId: node.id,
            workflowId: run.workflowId,
            adapterId: node.adapterId,
            agentLabel: node.agentLabel,
            userId: readNotificationUserId(run.metadata),
          },
          toolsSettings: node.toolsSettings,
          projectPath,
          workspaceTarget: workspaceTargetMetadata(workspaceTarget),
          workspace: {
            kind: isolation,
            projectPath,
            baseRef,
            keepAfterCompletion,
          },
        },
      });
    } catch (error) {
      nodeRun.finishedAt = Date.now();
      nodeRun.status = 'failed';
      nodeRun.error = error instanceof Error ? error.message : String(error);
      workflowStore.setRun(run);
      if (isExternalDirectoryPermissionError(nodeRun.error)) {
        completeNodeWithPermissionFallback(nodeRun, node, outputs, completed, nodeRun.error, workspaceTarget);
        workflowStore.setRun(run);
        return;
      }
      if (await this.runFallbackAfterFailure(
        node,
        workflow,
        run,
        outputs,
        started,
        completed,
        nodeRun.error,
        'provider_failure',
      )) {
        return;
      }
      if (node.onFail === 'continue') {
        completed.add(node.id);
        return;
      }
      throw error;
    }
    nodeRun.a2aTaskId = submittedTask.id;
    workflowStore.setRun(run);

    if (this.isCanceling(run.id)) {
      await cancelA2ATask(submittedTask.id);
      nodeRun.status = 'canceled';
      nodeRun.finishedAt = Date.now();
      workflowStore.setRun(run);
      throw new WorkflowCanceledError();
    }

    let result: TaskResult;
    try {
      result = await waitForTask(
        submittedTask.id,
        () => this.isCanceling(run.id),
        (snapshot) => {
          nodeRun.outputText = snapshot.text || nodeRun.outputText;
          nodeRun.messages = snapshot.messages;
          nodeRun.artifacts = snapshot.artifacts;
          nodeRun.error = snapshot.error;
          workflowStore.setRun(run);
        },
        node.timeoutMs,
      );
    } catch (error) {
      if (!(error instanceof WorkflowNodeTimeoutError)) {
        throw error;
      }

      await cancelA2ATask(submittedTask.id);
      nodeRun.finishedAt = Date.now();
      nodeRun.status = 'failed';
      nodeRun.error = error.message;
      if (nodeRun.outputText) {
        outputs.set(node.id, compactOutputForContext(nodeRun.outputText));
      }
      workflowStore.setRun(run);
      if (isExternalDirectoryPermissionError(nodeRun.error)) {
        completeNodeWithPermissionFallback(nodeRun, node, outputs, completed, nodeRun.error, workspaceTarget);
        workflowStore.setRun(run);
        return;
      }
      if (await this.runFallbackAfterFailure(
        node,
        workflow,
        run,
        outputs,
        started,
        completed,
        nodeRun.error,
        'timeout',
      )) {
        return;
      }
      if (node.onFail === 'continue') {
        completed.add(node.id);
        return;
      }
      throw error;
    }
    nodeRun.finishedAt = Date.now();
    nodeRun.outputText = result.text;
    nodeRun.messages = result.messages;
    nodeRun.artifacts = result.artifacts;
    if (this.isCanceling(run.id)) {
      nodeRun.status = 'canceled';
      workflowStore.setRun(run);
      throw new WorkflowCanceledError();
    }
    if (result.state === 'completed') {
      let outputForContext = result.text;
      if (requiresHandoffArtifact(node)) {
        const handoffParse = parseHandoffArtifact(handoffArtifactSource(result), {
          workflowRunId: run.id,
          nodeId: node.id,
          agentLabel: node.agentLabel,
          stage: node.stage,
        });
        if (!handoffParse.ok) {
          const visibleHandoffError = handoffParse.error.startsWith('Invalid handoff artifact')
            ? handoffParse.error
            : `Invalid handoff artifact: ${handoffParse.error}`;
          nodeRun.status = 'failed';
          nodeRun.error = visibleHandoffError;
          workflowStore.setRun(run);
          if (await this.runFallbackAfterFailure(
            node,
            workflow,
            run,
            outputs,
            started,
            completed,
            visibleHandoffError,
            'invalid_output',
          )) {
            return;
          }
          if (node.onFail === 'continue') {
            completed.add(node.id);
            return;
          }
          throw new Error(visibleHandoffError);
        }

        nodeRun.handoffArtifact = handoffParse.artifact;
        nodeRun.artifacts = [
          ...(nodeRun.artifacts ?? []).filter((artifact) => artifact.type !== 'handoff-artifact'),
          handoffArtifactToWorkflowArtifact(handoffParse.artifact),
        ];
        outputForContext = formatHandoffArtifactForContext(handoffParse.artifact);
      }

      outputs.set(node.id, compactOutputForContext(outputForContext));
      completed.add(node.id);
      nodeRun.status = 'completed';
      workflowStore.setRun(run);
      this.maybeAddRepairCycle(node, workflow, run, result);
      return;
    }
    if (result.state === 'canceled') {
      nodeRun.status = 'canceled';
      workflowStore.setRun(run);
      throw new WorkflowCanceledError();
    }

    nodeRun.status = 'failed';
    nodeRun.error = result.error ?? `Agent task ended with ${result.state}`;
    workflowStore.setRun(run);
    if (isExternalDirectoryPermissionError(`${nodeRun.error}\n${nodeRun.outputText ?? ''}`)) {
      completeNodeWithPermissionFallback(nodeRun, node, outputs, completed, nodeRun.error, workspaceTarget);
      workflowStore.setRun(run);
      return;
    }
    if (await this.runFallbackAfterFailure(
      node,
      workflow,
      run,
      outputs,
      started,
      completed,
      nodeRun.error,
      classifyWorkflowFailure(`${nodeRun.error}\n${nodeRun.outputText ?? ''}`),
    )) {
      return;
    }
    if (node.onFail === 'continue') {
      if (nodeRun.outputText) {
        outputs.set(node.id, compactOutputForContext(nodeRun.outputText));
      }
      completed.add(node.id);
      return;
    }
    throw new Error(nodeRun.error);
  }
}

export const workflowRunner = new WorkflowRunner();
