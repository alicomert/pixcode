import crypto from 'node:crypto';

import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
} from '@/modules/orchestration/workflows/workflow.types.js';
import { workflowStore } from '@/modules/orchestration/workflows/workflow-store.js';

const TERMINAL = new Set(['completed', 'failed', 'canceled']);

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function localA2ABaseUrl(): string {
  return `http://127.0.0.1:${process.env.SERVER_PORT ?? process.env.PORT ?? '3001'}/a2a`;
}

function validateWorkflow(workflow: Workflow): void {
  if (workflow.nodes.length > 24) {
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

type AgentAssignment = {
  instanceId: string;
  adapterId: string;
  label: string;
  instruction?: string;
  order: number;
};

function getMetadataRecord(metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
  const value = metadata?.[key];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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
        instruction: readString(record.instruction),
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
      return `${index + 1}. ${agent.label} (${agent.adapterId})${instruction}`;
    })
    .join('\n');
}

function expandAgentTeamWorkflow(workflow: Workflow, metadata?: Record<string, unknown>): Workflow {
  const agents = readAgentAssignments(metadata);
  if (agents.length === 0) {
    throw new Error('Select at least one CLI agent.');
  }

  const coordinator = agents.find((agent) => agent.adapterId === 'claude-code') ?? agents[0];
  const roster = agentRoster(agents);
  const workerNodes: WorkflowNode[] = agents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'work'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction,
    prompt: [
      `You are ${agent.label} in a Pixcode CLI team.`,
      'The coordinator plan is included above. Use it together with the original user goal.',
      agent.instruction
        ? `Your explicit assignment from the user is: ${agent.instruction}`
        : 'No fixed per-agent assignment was set. Take the part assigned to you by the coordinator; if none is named, choose useful work that fits this CLI and avoid duplicating other agents.',
      'Complete your portion in the project and report changed files, commands, blockers, and next actions.',
      'Respond in the same language as the user request.',
    ].join('\n'),
    inputs: ['coordinator'],
    output: 'both',
    onFail: 'continue',
  }));

  return {
    ...workflow,
    nodes: [
      {
        id: 'coordinator',
        adapterId: coordinator.adapterId,
        agentInstanceId: coordinator.instanceId,
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
      ...workerNodes,
      {
        id: 'final_report',
        adapterId: coordinator.adapterId,
        agentInstanceId: coordinator.instanceId,
        prompt: [
          'Collect the worker outputs into one user-facing result.',
          'Show what each CLI did, which parts failed, what changed, and the next action if work remains.',
          'Respond in the same language as the user request.',
        ].join('\n'),
        inputs: workerNodes.map((node) => node.id),
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
  if (workflow.id !== 'multi_model_review' || agents.length === 0) {
    return workflow;
  }

  const reviewNodes: WorkflowNode[] = agents.map((agent, index) => ({
    id: safeAgentNodeId(agent, index, 'review'),
    adapterId: agent.adapterId,
    agentInstanceId: agent.instanceId,
    agentLabel: agent.label,
    assignment: agent.instruction,
    prompt: [
      `You are ${agent.label}.`,
      'Review the requested change for bugs, regressions, missing validation, security, scale, and user-experience risks.',
      agent.instruction ? `Focus on this user assignment: ${agent.instruction}` : '',
      'Respond in the same language as the user request.',
    ].filter(Boolean).join('\n'),
    inputs: [],
    output: 'both',
    onFail: 'continue',
  }));
  const aggregateAgent = agents.find((agent) => agent.adapterId === 'claude-code') ?? agents[0];

  return {
    ...workflow,
    nodes: [
      ...reviewNodes,
      {
        id: 'aggregate',
        adapterId: aggregateAgent.adapterId,
        agentInstanceId: aggregateAgent.instanceId,
        prompt: 'Aggregate the prior agent reviews into a concise prioritized report. Respond in the same language as the user request.',
        inputs: reviewNodes.map((node) => node.id),
        output: 'message',
        onFail: 'abort',
      },
    ],
  };
}

async function waitForTask(taskId: string): Promise<TaskResult> {
  for (;;) {
    const response = await fetch(`${localA2ABaseUrl()}/tasks/${taskId}`);
    const task = await response.json() as {
      state?: string;
      error?: { code?: string; message?: string };
      history?: Array<{ role?: string; parts?: Array<{ kind?: string; text?: string; data?: Record<string, unknown> }> }>;
      artifacts?: Array<{
        type?: string;
        parts?: Array<{ kind?: string; text?: string; data?: Record<string, unknown> }>;
        metadata?: Record<string, unknown>;
      }>;
    };
    if (task.state && TERMINAL.has(task.state)) {
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
      const text = messages.map((message) => `${message.role}: ${message.text}`).join('\n\n');
      const error = task.error?.message
        ? `${task.error.code ? `${task.error.code}: ` : ''}${task.error.message}`
        : undefined;
      return { state: task.state, text, error, messages, artifacts };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function readyNodes(workflow: Workflow, completed: Set<string>, started: Set<string>): WorkflowNode[] {
  return workflow.nodes.filter((node) =>
    !started.has(node.id) && node.inputs.every((input) => completed.has(input)),
  );
}

class WorkflowRunner {
  start(workflow: Workflow, input = '', metadata?: Record<string, unknown>): WorkflowRun {
    const runtimeWorkflow = expandWorkflowForRun(workflow, metadata);
    validateWorkflow(runtimeWorkflow);
    const run: WorkflowRun = {
      id: newId('wrun'),
      workflowId: runtimeWorkflow.id,
      contextId: newId('ctx'),
      status: 'queued',
      input,
      nodeRuns: runtimeWorkflow.nodes.map((node) => ({
        nodeId: node.id,
        adapterId: node.adapterId,
        agentInstanceId: node.agentInstanceId,
        agentLabel: node.agentLabel,
        assignment: node.assignment,
        status: 'queued',
      })),
      startedAt: Date.now(),
      metadata,
    };
    workflowStore.setRun(run);
    void this.execute(runtimeWorkflow, run);
    return run;
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
        const batch = readyNodes(workflow, completed, started);
        if (batch.length === 0) {
          throw new Error('Workflow stalled; no ready nodes remain.');
        }
        for (let index = 0; index < batch.length; index += maxParallelAgents) {
          const slice = batch.slice(index, index + maxParallelAgents);
          await Promise.all(slice.map((node) => this.executeNode(node, run, outputs, started, completed)));
        }
      }
      run.status = 'completed';
    } catch (error) {
      run.status = 'failed';
      run.metadata = {
        ...run.metadata,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      run.finishedAt = Date.now();
      workflowStore.setRun(run);
    }
  }

  private async executeNode(
    node: WorkflowNode,
    run: WorkflowRun,
    outputs: Map<string, string>,
    started: Set<string>,
    completed: Set<string>,
  ): Promise<void> {
    started.add(node.id);
    const nodeRun = run.nodeRuns.find((candidate) => candidate.nodeId === node.id) as WorkflowNodeRun;
    const enabledAdapters = readEnabledAdapters(run.metadata);
    if (enabledAdapters.length > 0 && !enabledAdapters.includes(node.adapterId)) {
      nodeRun.status = 'skipped';
      nodeRun.finishedAt = Date.now();
      completed.add(node.id);
      workflowStore.setRun(run);
      return;
    }

    nodeRun.status = 'running';
    nodeRun.startedAt = Date.now();
    workflowStore.setRun(run);

    const inputContext = node.inputs.map((input) => outputs.get(input)).filter(Boolean).join('\n\n');
    const prompt = [run.input, inputContext, node.prompt].filter(Boolean).join('\n\n');
    const settings = getMetadataRecord(run.metadata, 'settings');
    const projectPath = readString(run.metadata?.projectPath);
    const isolation = readIsolation(settings.isolation) ?? node.isolation ?? 'host';
    const keepAfterCompletion = readBoolean(settings.keepWorkspace) ?? true;
    const baseRef = readString(settings.baseRef) ?? 'HEAD';
    const submit = await fetch(`${localA2ABaseUrl()}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
          projectPath,
          workspace: {
            kind: isolation,
            projectPath,
            baseRef,
            keepAfterCompletion,
          },
        },
      }),
    });
    const body = await submit.json() as { id?: string; error?: { message?: string } };
    if (!submit.ok || !body.id) {
      throw new Error(body.error?.message ?? `Workflow node ${node.id} submit failed.`);
    }
    nodeRun.a2aTaskId = body.id;
    workflowStore.setRun(run);

    const result = await waitForTask(body.id);
    nodeRun.finishedAt = Date.now();
    nodeRun.outputText = result.text;
    nodeRun.messages = result.messages;
    nodeRun.artifacts = result.artifacts;
    if (result.state === 'completed') {
      outputs.set(node.id, result.text);
      completed.add(node.id);
      nodeRun.status = 'completed';
      workflowStore.setRun(run);
      return;
    }

    nodeRun.status = 'failed';
    nodeRun.error = result.error ?? `A2A task ended with ${result.state}`;
    workflowStore.setRun(run);
    if (node.onFail === 'continue') {
      completed.add(node.id);
      return;
    }
    throw new Error(nodeRun.error);
  }
}

export const workflowRunner = new WorkflowRunner();
