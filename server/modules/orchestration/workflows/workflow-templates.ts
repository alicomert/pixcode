export const PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL = 'pixcode.workflow-template.v1' as const;

export interface WorkflowTemplateAgentSlot {
  id: string;
  role: string;
  label: string;
  instruction: string;
}

export interface WorkflowTemplate {
  id: string;
  protocol: typeof PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL;
  version: 1;
  workflowId: string;
  name: string;
  description: string;
  inputPlaceholder: string;
  agentSlots: WorkflowTemplateAgentSlot[];
  acceptanceCriteria: string[];
  defaultSettings?: {
    maxParallelAgents?: number;
    maxRepairCycles?: number;
  };
}

type AgentRecord = Record<string, unknown>;

export const builtInWorkflowTemplates: WorkflowTemplate[] = [
  {
    id: 'bug_fix_team',
    protocol: PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL,
    version: 1,
    workflowId: 'agent_team',
    name: 'Bug fix team',
    description: 'Reproduce, fix, and verify a focused bug with an implementation and review loop.',
    inputPlaceholder: 'Describe the bug, expected behavior, current behavior, and any reproduction steps.',
    agentSlots: [
      {
        id: 'reproducer',
        role: 'implementation',
        label: 'Reproducer',
        instruction: 'Reproduce the bug from the user report, identify the failing path, and keep the scope narrow.',
      },
      {
        id: 'fixer',
        role: 'implementation',
        label: 'Fixer',
        instruction: 'Implement the smallest durable fix and report changed files and verification commands.',
      },
      {
        id: 'reviewer',
        role: 'review',
        label: 'Reviewer',
        instruction: 'Review the fix for regressions, missing validation, and whether the original bug is covered.',
      },
    ],
    acceptanceCriteria: [
      'The bug has a concrete reproduction or a clearly documented blocker.',
      'The fix is limited to the failing behavior.',
      'Verification commands and remaining risks are reported.',
    ],
    defaultSettings: {
      maxParallelAgents: 2,
      maxRepairCycles: 1,
    },
  },
  {
    id: 'pr_review_team',
    protocol: PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL,
    version: 1,
    workflowId: 'multi_model_review',
    name: 'PR review team',
    description: 'Run independent reviewers and aggregate actionable findings for a pull request or diff.',
    inputPlaceholder: 'Paste the PR link, branch, or diff summary to review.',
    agentSlots: [
      {
        id: 'correctness',
        role: 'review',
        label: 'Correctness reviewer',
        instruction: 'Prioritize correctness bugs, regressions, missing tests, and broken edge cases.',
      },
      {
        id: 'security',
        role: 'review',
        label: 'Security reviewer',
        instruction: 'Prioritize security, secret handling, permission, and data exposure risks.',
      },
      {
        id: 'reporter',
        role: 'report',
        label: 'Report aggregator',
        instruction: 'Aggregate findings by severity with file references and concrete fix suggestions.',
      },
    ],
    acceptanceCriteria: [
      'Findings are ordered by severity and avoid speculative noise.',
      'Each issue includes the concrete impact and suggested fix.',
      'The final report clearly says when no blocking issue is found.',
    ],
    defaultSettings: {
      maxParallelAgents: 3,
    },
  },
  {
    id: 'frontend_polish',
    protocol: PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL,
    version: 1,
    workflowId: 'agent_team',
    name: 'Frontend polish',
    description: 'Improve a UI workflow with implementation, responsive checks, and UX review.',
    inputPlaceholder: 'Describe the screen or workflow that needs frontend polish.',
    agentSlots: [
      {
        id: 'ui_implementation',
        role: 'frontend',
        label: 'UI implementer',
        instruction: 'Implement the requested UI change using existing design conventions and responsive constraints.',
      },
      {
        id: 'ux_review',
        role: 'review',
        label: 'UX reviewer',
        instruction: 'Review layout, text overflow, responsive behavior, accessibility, and interaction states.',
      },
      {
        id: 'verification',
        role: 'review',
        label: 'Verification reviewer',
        instruction: 'Verify the change with available typecheck, lint, build, smoke, or manual UI evidence.',
      },
    ],
    acceptanceCriteria: [
      'The UI follows existing components and visual density.',
      'Text and controls do not overlap on mobile or desktop.',
      'Verification evidence is included in the final summary.',
    ],
    defaultSettings: {
      maxParallelAgents: 2,
      maxRepairCycles: 1,
    },
  },
  {
    id: 'release_manager',
    protocol: PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL,
    version: 1,
    workflowId: 'sequential_handoff',
    name: 'Release manager',
    description: 'Prepare a release checklist, run verification, and summarize publish readiness.',
    inputPlaceholder: 'Describe the version, release scope, and target channels.',
    agentSlots: [
      {
        id: 'release_plan',
        role: 'implementation',
        label: 'Release planner',
        instruction: 'Create a release checklist, verify version surfaces, and identify publish blockers.',
      },
      {
        id: 'release_verification',
        role: 'review',
        label: 'Release verifier',
        instruction: 'Run or inspect release verification commands and report the exact publish state.',
      },
      {
        id: 'release_report',
        role: 'report',
        label: 'Release reporter',
        instruction: 'Summarize what was released, what was verified, and any blocked channels.',
      },
    ],
    acceptanceCriteria: [
      'Version surfaces are aligned.',
      'Build/package verification is reported.',
      'Remote artifact and publish state are explicitly stated.',
    ],
    defaultSettings: {
      maxParallelAgents: 1,
    },
  },
  {
    id: 'dependency_audit',
    protocol: PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL,
    version: 1,
    workflowId: 'agent_team',
    name: 'Dependency audit',
    description: 'Inspect dependency, runtime, and package risks without making broad upgrades by default.',
    inputPlaceholder: 'Describe the dependency or runtime area to audit.',
    agentSlots: [
      {
        id: 'audit',
        role: 'implementation',
        label: 'Audit analyst',
        instruction: 'Inspect dependency and runtime risk using existing lockfiles and configured package managers.',
      },
      {
        id: 'risk_review',
        role: 'review',
        label: 'Risk reviewer',
        instruction: 'Validate the findings, call out false positives, and avoid broad upgrade churn unless requested.',
      },
      {
        id: 'report',
        role: 'report',
        label: 'Audit reporter',
        instruction: 'Produce a prioritized remediation plan with commands, risks, and no-secret output.',
      },
    ],
    acceptanceCriteria: [
      'Findings are tied to actual dependency evidence.',
      'No unrelated dependency upgrades are proposed as automatic work.',
      'Security and runtime risks are separated from maintenance suggestions.',
    ],
    defaultSettings: {
      maxParallelAgents: 2,
    },
  },
];

export function getWorkflowTemplate(templateId: string): WorkflowTemplate | undefined {
  return builtInWorkflowTemplates.find((template) => template.id === templateId);
}

function applyTemplateSlots(agents: AgentRecord[] | undefined, template: WorkflowTemplate): AgentRecord[] | undefined {
  if (!Array.isArray(agents) || agents.length === 0) return agents;

  let enabledSlotIndex = 0;
  return agents.map((agent) => {
    if (agent.enabled === false) return agent;
    const slot = template.agentSlots[enabledSlotIndex];
    enabledSlotIndex += 1;
    if (!slot) return agent;
    return {
      ...agent,
      role: slot.role,
      instruction: typeof agent.instruction === 'string' && agent.instruction.trim()
        ? agent.instruction
        : slot.instruction,
      templateSlotId: slot.id,
      templateSlotLabel: slot.label,
    };
  });
}

export function applyWorkflowTemplateToMetadata(
  template: WorkflowTemplate,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  const settings = metadata?.settings && typeof metadata.settings === 'object'
    ? metadata.settings as Record<string, unknown>
    : {};

  return {
    ...metadata,
    workflowTemplate: {
      protocol: template.protocol,
      id: template.id,
      version: template.version,
      name: template.name,
      workflowId: template.workflowId,
      acceptanceCriteria: template.acceptanceCriteria,
      agentSlots: template.agentSlots.map((slot) => ({
        id: slot.id,
        role: slot.role,
        label: slot.label,
      })),
    },
    agents: applyTemplateSlots(metadata?.agents as AgentRecord[] | undefined, template),
    settings: {
      ...settings,
      ...template.defaultSettings,
    },
  };
}
