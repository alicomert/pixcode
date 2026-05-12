import type { WorkflowNode, WorkflowRun } from '@/modules/orchestration/workflows/workflow.types.js';

export const PIXCODE_FALLBACK_POLICY_PROTOCOL = 'pixcode.fallback-policy.v1';

export type WorkflowFallbackTrigger = 'provider_failure' | 'timeout' | 'tool_failure' | 'invalid_output';

export interface WorkflowFallbackPolicy {
  protocol: typeof PIXCODE_FALLBACK_POLICY_PROTOCOL;
  enabled: boolean;
  triggers: WorkflowFallbackTrigger[];
  maxFallbacksPerRun: number;
  requireDifferentAgent: boolean;
}

export interface WorkflowFallbackDecision {
  shouldFallback: boolean;
  trigger: WorkflowFallbackTrigger;
  reason: string;
  policy: WorkflowFallbackPolicy;
  skippedReason?: string;
}

const DEFAULT_TRIGGERS: WorkflowFallbackTrigger[] = [
  'provider_failure',
  'timeout',
  'tool_failure',
  'invalid_output',
];

export const DEFAULT_WORKFLOW_FALLBACK_POLICY: WorkflowFallbackPolicy = {
  protocol: PIXCODE_FALLBACK_POLICY_PROTOCOL,
  enabled: true,
  triggers: DEFAULT_TRIGGERS,
  maxFallbacksPerRun: 3,
  requireDifferentAgent: true,
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isWorkflowFallbackTrigger(value: unknown): value is WorkflowFallbackTrigger {
  return value === 'provider_failure'
    || value === 'timeout'
    || value === 'tool_failure'
    || value === 'invalid_output';
}

function readFallbackTriggers(value: unknown): WorkflowFallbackTrigger[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const triggers = value.filter(isWorkflowFallbackTrigger);
  return triggers.length > 0 ? [...new Set(triggers)] : undefined;
}

export function readWorkflowFallbackPolicy(metadata?: Record<string, unknown>): WorkflowFallbackPolicy {
  const settings = readRecord(metadata?.settings) ?? {};
  const configured = readRecord(settings.fallbackPolicy) ?? {};
  const maxFallbacksPerRun = readNumber(configured.maxFallbacksPerRun);

  return {
    protocol: PIXCODE_FALLBACK_POLICY_PROTOCOL,
    enabled: readBoolean(configured.enabled) ?? DEFAULT_WORKFLOW_FALLBACK_POLICY.enabled,
    triggers: readFallbackTriggers(configured.triggers) ?? DEFAULT_WORKFLOW_FALLBACK_POLICY.triggers,
    maxFallbacksPerRun: maxFallbacksPerRun === undefined
      ? DEFAULT_WORKFLOW_FALLBACK_POLICY.maxFallbacksPerRun
      : Math.max(0, Math.min(8, Math.round(maxFallbacksPerRun))),
    requireDifferentAgent: readBoolean(configured.requireDifferentAgent)
      ?? DEFAULT_WORKFLOW_FALLBACK_POLICY.requireDifferentAgent,
  };
}

export function classifyWorkflowFailure(
  reason: string,
  explicitTrigger?: WorkflowFallbackTrigger,
): WorkflowFallbackTrigger {
  if (explicitTrigger) return explicitTrigger;

  const text = reason.toLocaleLowerCase('en');
  if (/timed out|timeout|deadline/u.test(text)) return 'timeout';
  if (/invalid (handoff|output|artifact|json|schema)|parse|protocol/u.test(text)) return 'invalid_output';
  if (
    /tool|command|shell|exit code|permission|file write|write failed|network|fetch|curl|wget|gh |npm |git /u
      .test(text)
  ) {
    return 'tool_failure';
  }
  return 'provider_failure';
}

function fallbackEventCount(run: WorkflowRun): number {
  return Array.isArray(run.metadata?.fallbackEvents) ? run.metadata.fallbackEvents.length : 0;
}

export function resolveWorkflowFallbackDecision({
  run,
  node,
  reason,
  trigger,
  fallbackAgentInstanceId,
}: {
  run: WorkflowRun;
  node: WorkflowNode;
  reason: string;
  trigger?: WorkflowFallbackTrigger;
  fallbackAgentInstanceId?: string;
}): WorkflowFallbackDecision {
  const fallbackTrigger = classifyWorkflowFailure(reason, trigger);
  const policy = readWorkflowFallbackPolicy(run.metadata);

  if (!policy.enabled) {
    return {
      shouldFallback: false,
      trigger: fallbackTrigger,
      reason,
      policy,
      skippedReason: 'Fallback policy is disabled.',
    };
  }
  if (!policy.triggers.includes(fallbackTrigger)) {
    return {
      shouldFallback: false,
      trigger: fallbackTrigger,
      reason,
      policy,
      skippedReason: `Fallback trigger ${fallbackTrigger} is not enabled.`,
    };
  }
  if (fallbackEventCount(run) >= policy.maxFallbacksPerRun) {
    return {
      shouldFallback: false,
      trigger: fallbackTrigger,
      reason,
      policy,
      skippedReason: `Fallback limit ${policy.maxFallbacksPerRun} reached.`,
    };
  }
  if (policy.requireDifferentAgent && fallbackAgentInstanceId && fallbackAgentInstanceId === node.agentInstanceId) {
    return {
      shouldFallback: false,
      trigger: fallbackTrigger,
      reason,
      policy,
      skippedReason: 'Fallback agent must be different from the failed agent.',
    };
  }

  return {
    shouldFallback: true,
    trigger: fallbackTrigger,
    reason,
    policy,
  };
}
