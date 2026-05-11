import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import SessionProviderLogo from '../llm-logo-provider/SessionProviderLogo';
import { Badge, Button } from '../../shared/view/ui';
import { useGsapEntrance } from '../../lib/animations';
import { authenticatedFetch } from '../../utils/api';
import { CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS, OPENCODE_MODELS, QWEN_MODELS } from '../../../shared/modelConstants';

import WorkflowRunPanel from './workflows/WorkflowRunPanel';

import type { Project } from '@/types/app';
import {
  Bot,
  CheckCircle,
  Clock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  SquareIcon,
  Trash2,
  Users,
  Workflow,
} from '@/lib/icons';

type BuiltInWorkflow = {
  id: string;
  name: string;
  description?: string;
  nodes?: Array<{ id: string; adapterId: string }>;
};

type WorkflowRunSummary = {
  id: string;
  workflowId: string;
  contextId: string;
  status: string;
  input?: string;
  startedAt: number;
  finishedAt?: number;
  nodeRuns: Array<{ nodeId: string; adapterId?: string; status: string; error?: string }>;
};

type OrchestrationContext = {
  appRoot?: string;
  defaultWorkspaceTarget?: WorkspaceTargetMode;
  supportedWorkspaceTargets?: WorkspaceTargetMode[];
};

const allAdapterIds = ['claude-code', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'] as const;

type AdapterId = typeof allAdapterIds[number];
type ProviderId = 'claude' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode';
type WorkspaceTargetMode = 'selected_project' | 'pixcode_app' | 'custom';

type OrchestrationAgent = {
  instanceId: string;
  adapterId: AdapterId;
  enabled: boolean;
  instruction: string;
  role?: AgentRole;
  model?: string;
};

type OrchestrationSettings = {
  agents: OrchestrationAgent[];
  maxParallelAgents: number;
  fallbackAgentInstanceId?: string;
};

type StoredSettings = Partial<OrchestrationSettings> & {
  enabledAdapters?: unknown;
};

type OrchestrationPageProps = {
  selectedProject: Project;
};

type AgentRole = string;
type ModelOption = { value: string; label: string; free?: boolean };

const knownAgentRoles = [
  'auto',
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

const customRoleValue = 'custom';

const settingsStorageKey = 'pixcode.orchestration.settings';
const workspaceTargetStorageKey = 'pixcode.orchestration.workspaceTarget';
const customWorkspacePathStorageKey = 'pixcode.orchestration.customWorkspacePath';
const promptHistoryStorageKey = 'pixcode.orchestration.promptHistory';
const promptHistoryLimit = 2;
const paneWidthStorageKey = 'pixcode.orchestration.leftPaneWidth';
const defaultLeftPaneWidth = 360;
const minLeftPaneWidth = 300;
const maxLeftPaneWidth = 560;
const minRightPaneWidth = 460;

const adapterLabels: Record<AdapterId, { provider: ProviderId }> = {
  'claude-code': { provider: 'claude' },
  cursor: { provider: 'cursor' },
  codex: { provider: 'codex' },
  gemini: { provider: 'gemini' },
  qwen: { provider: 'qwen' },
  opencode: { provider: 'opencode' },
};

const adapterRuntimeConfig: Record<AdapterId, { modelKey: string; settingsKey: string }> = {
  'claude-code': {
    modelKey: 'claude-model',
    settingsKey: 'claude-settings',
  },
  cursor: {
    modelKey: 'cursor-model',
    settingsKey: 'cursor-tools-settings',
  },
  codex: {
    modelKey: 'codex-model',
    settingsKey: 'codex-settings',
  },
  gemini: {
    modelKey: 'gemini-model',
    settingsKey: 'gemini-settings',
  },
  qwen: {
    modelKey: 'qwen-model',
    settingsKey: 'qwen-settings',
  },
  opencode: {
    modelKey: 'opencode-model',
    settingsKey: 'opencode-settings',
  },
};

const adapterModelOptions: Partial<Record<AdapterId, ModelOption[]>> = {
  cursor: CURSOR_MODELS.OPTIONS,
  codex: CODEX_MODELS.OPTIONS,
  gemini: GEMINI_MODELS.OPTIONS,
  qwen: QWEN_MODELS.OPTIONS,
  opencode: OPENCODE_MODELS.OPTIONS,
};

const adapterModelDefaults: Partial<Record<AdapterId, string>> = {
  cursor: CURSOR_MODELS.DEFAULT,
  codex: CODEX_MODELS.DEFAULT,
  gemini: GEMINI_MODELS.DEFAULT,
  qwen: QWEN_MODELS.DEFAULT,
  opencode: OPENCODE_MODELS.DEFAULT,
};

const fallbackWorkflows: BuiltInWorkflow[] = [
  {
    id: 'agent_team',
    name: 'Agent team',
    description: 'A coordinator reads the goal and active CLI instances, assigns work, then collects the result.',
  },
  {
    id: 'multi_model_review',
    name: 'Multi-model review',
    description: 'Enabled CLI agents review the same goal separately, then one enabled agent aggregates the result.',
  },
  {
    id: 'sequential_handoff',
    name: 'Sequential handoff',
    description: 'Agents plan, implement, and review in order. Disabled CLI steps are skipped.',
  },
  {
    id: 'adversarial_debate',
    name: 'Decision debate',
    description: 'Agents propose, critique, respond, and produce a final recommendation.',
  },
];

function isAdapterId(value: unknown): value is AdapterId {
  return typeof value === 'string' && (allAdapterIds as readonly string[]).includes(value);
}

function modelOptionsForAdapter(adapterId: AdapterId): ModelOption[] {
  return adapterModelOptions[adapterId] ?? [];
}

function defaultModelForAdapter(adapterId: AdapterId): string | undefined {
  if (adapterId === 'claude-code') {
    return undefined;
  }

  return readStorageString(adapterRuntimeConfig[adapterId].modelKey) ?? adapterModelDefaults[adapterId];
}

function createDefaultAgents(enabledAdapters: AdapterId[] = [...allAdapterIds]): OrchestrationAgent[] {
  return allAdapterIds.map((adapterId, index) => ({
    instanceId: `${adapterId}-${index + 1}`,
    adapterId,
    enabled: enabledAdapters.includes(adapterId),
    instruction: '',
    model: defaultModelForAdapter(adapterId),
  }));
}

function createAgent(adapterId: AdapterId): OrchestrationAgent {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    instanceId: `${adapterId}-${suffix}`,
    adapterId,
    enabled: true,
    instruction: '',
    role: 'auto',
    model: defaultModelForAdapter(adapterId),
  };
}

function isKnownAgentRole(value: unknown): value is typeof knownAgentRoles[number] {
  return typeof value === 'string' && (knownAgentRoles as readonly string[]).includes(value);
}

function normalizeAgentRole(value: unknown): AgentRole {
  return typeof value === 'string' && value.trim() ? value.trim() : 'auto';
}

function roleSelectValue(role: AgentRole | undefined, options: AgentRole[]): string {
  if (!role || role === 'auto') return 'auto';
  return options.includes(role) ? role : customRoleValue;
}

function isWorkspaceTargetMode(value: unknown): value is WorkspaceTargetMode {
  return value === 'selected_project' || value === 'pixcode_app' || value === 'custom';
}

function readWorkspaceTargetMode(): WorkspaceTargetMode {
  const stored = localStorage.getItem(workspaceTargetStorageKey);
  return isWorkspaceTargetMode(stored) ? stored : 'selected_project';
}

function readPromptHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(promptHistoryStorageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .slice(0, promptHistoryLimit);
  } catch {
    return [];
  }
}

function storePromptHistory(prompt: string): string[] {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return readPromptHistory();
  const next = [
    trimmedPrompt,
    ...readPromptHistory().filter((item) => item !== trimmedPrompt),
  ].slice(0, promptHistoryLimit);
  localStorage.setItem(promptHistoryStorageKey, JSON.stringify(next));
  return next;
}

function clampPaneWidth(value: number, containerWidth?: number): number {
  const maxByContainer = containerWidth
    ? Math.max(minLeftPaneWidth, containerWidth - minRightPaneWidth)
    : maxLeftPaneWidth;
  return Math.round(Math.max(
    minLeftPaneWidth,
    Math.min(value, maxLeftPaneWidth, maxByContainer),
  ));
}

function readLeftPaneWidth(): number {
  const stored = Number(localStorage.getItem(paneWidthStorageKey));
  return Number.isFinite(stored) && stored > 0
    ? clampPaneWidth(stored)
    : defaultLeftPaneWidth;
}

function normalizeAgent(value: unknown, index: number): OrchestrationAgent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isAdapterId(record.adapterId)) return null;
  return {
    instanceId: typeof record.instanceId === 'string' && record.instanceId.trim()
      ? record.instanceId
      : `${record.adapterId}-${index + 1}`,
    adapterId: record.adapterId,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    instruction: typeof record.instruction === 'string' ? record.instruction : '',
    role: normalizeAgentRole(record.role),
    model: typeof record.model === 'string' && record.model.trim()
      ? record.model.trim()
      : defaultModelForAdapter(record.adapterId),
  };
}

function readSettings(): OrchestrationSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(settingsStorageKey) ?? 'null') as StoredSettings | null;
    const legacyEnabledAdapters = Array.isArray(parsed?.enabledAdapters)
      ? parsed.enabledAdapters.filter(isAdapterId)
      : [...allAdapterIds];
    const parsedAgents = Array.isArray(parsed?.agents)
      ? parsed.agents.map(normalizeAgent).filter((agent): agent is OrchestrationAgent => Boolean(agent))
      : [];
    return {
      agents: parsedAgents.length > 0 ? parsedAgents : createDefaultAgents(legacyEnabledAdapters),
      maxParallelAgents:
        typeof parsed?.maxParallelAgents === 'number' && Number.isFinite(parsed.maxParallelAgents)
          ? Math.max(1, Math.min(12, Math.round(parsed.maxParallelAgents)))
          : 3,
      fallbackAgentInstanceId: typeof parsed?.fallbackAgentInstanceId === 'string'
        ? parsed.fallbackAgentInstanceId
        : undefined,
    };
  } catch {
    return {
      agents: createDefaultAgents(),
      maxParallelAgents: 3,
    };
  }
}

function readStorageString(key: string): string | undefined {
  try {
    const value = localStorage.getItem(key)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function readStorageObject(key: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function readAgentRuntimeOptions(adapterId: AdapterId): {
  model?: string;
  permissionMode?: string;
  toolsSettings?: Record<string, unknown>;
} {
  const config = adapterRuntimeConfig[adapterId];
  const toolsSettings = readStorageObject(config.settingsKey);
  const permissionMode = typeof toolsSettings?.permissionMode === 'string'
    ? toolsSettings.permissionMode
    : undefined;

  if (adapterId === 'claude-code') {
    return {
      permissionMode,
      toolsSettings,
    };
  }

  return {
    model: readStorageString(config.modelKey),
    permissionMode,
    toolsSettings,
  };
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed' || status === 'done') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'working') return 'secondary';
  return 'outline';
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function roleOptionsForWorkflow(workflowId: string): AgentRole[] {
  if (workflowId === 'adversarial_debate') {
    return ['auto', 'proposal', 'critique', 'response', 'decision'];
  }
  if (workflowId === 'multi_model_review') {
    return ['auto', 'review', 'report'];
  }
  if (workflowId === 'sequential_handoff') {
    return ['auto', 'implementation', 'review'];
  }
  return ['auto', 'backend', 'frontend', 'review', 'implementation'];
}

export default function OrchestrationPage({ selectedProject }: OrchestrationPageProps) {
  const { t } = useTranslation();
  const pageRef = useRef<HTMLElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const loadRunsInFlightRef = useRef(false);
  const [workflows, setWorkflows] = useState<BuiltInWorkflow[]>([]);
  const [orchestrationContext, setOrchestrationContext] = useState<OrchestrationContext>({});
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [workflowId, setWorkflowId] = useState('agent_team');
  const [goal, setGoal] = useState('');
  const [promptHistory, setPromptHistory] = useState<string[]>(readPromptHistory);
  const [settings, setSettings] = useState<OrchestrationSettings>(readSettings);
  const [workspaceTargetMode, setWorkspaceTargetMode] = useState<WorkspaceTargetMode>(readWorkspaceTargetMode);
  const [customWorkspacePath, setCustomWorkspacePath] = useState(
    () => localStorage.getItem(customWorkspacePathStorageKey) ?? '',
  );
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState('');
  const [preparedPrompt, setPreparedPrompt] = useState<string | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(readLeftPaneWidth);
  const [isResizingPanes, setIsResizingPanes] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectPath = selectedProject.path || selectedProject.fullPath;
  const effectiveWorkspacePath = workspaceTargetMode === 'pixcode_app'
    ? orchestrationContext.appRoot
    : workspaceTargetMode === 'custom'
      ? customWorkspacePath.trim()
      : projectPath;
  const availableWorkflows = workflows.length > 0 ? workflows : fallbackWorkflows;
  const selectedWorkflow = useMemo(
    () => availableWorkflows.find((workflow) => workflow.id === workflowId),
    [availableWorkflows, workflowId],
  );
  const enabledAgents = useMemo(
    () => settings.agents.filter((agent) => agent.enabled),
    [settings.agents],
  );
  const fallbackAgent = useMemo(
    () => enabledAgents.find((agent) => agent.instanceId === settings.fallbackAgentInstanceId),
    [enabledAgents, settings.fallbackAgentInstanceId],
  );
  const enabledAdapterIds = useMemo(
    () => [...new Set(enabledAgents.map((agent) => agent.adapterId))],
    [enabledAgents],
  );
  const roleOptions = useMemo(
    () => roleOptionsForWorkflow(workflowId),
    [workflowId],
  );
  const agentNumbers = useMemo(() => {
    const counts = new Map<AdapterId, number>();
    const numbers = new Map<string, number>();
    for (const agent of settings.agents) {
      const nextCount = (counts.get(agent.adapterId) ?? 0) + 1;
      counts.set(agent.adapterId, nextCount);
      numbers.set(agent.instanceId, nextCount);
    }
    return numbers;
  }, [settings.agents]);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === runId),
    [runId, runs],
  );
  const activeRun = useMemo(
    () => (selectedRun && ['queued', 'running'].includes(selectedRun.status)
      ? selectedRun
      : runs.find((run) => ['queued', 'running'].includes(run.status))),
    [runs, selectedRun],
  );
  const isExecutionMode = Boolean(activeRun);
  const runsRefreshIntervalMs = activeRun ? 5_000 : 30_000;
  useGsapEntrance(pageRef, 'fade-up');

  const adapterName = (adapterId: AdapterId) =>
    t(`orchestration.adapters.${adapterId}.label`);

  const agentLabel = (agent: OrchestrationAgent) =>
    t('orchestration.agentInstance', {
      name: adapterName(agent.adapterId),
      number: agentNumbers.get(agent.instanceId) ?? 1,
    });

  const updateAgent = (instanceId: string, patch: Partial<OrchestrationAgent>) => {
    setSettings((prev) => ({
      ...prev,
      agents: prev.agents.map((agent) =>
        agent.instanceId === instanceId ? { ...agent, ...patch } : agent,
      ),
    }));
  };

  const addAgent = (adapterId: AdapterId) => {
    setSettings((prev) => ({
      ...prev,
      agents: [...prev.agents, createAgent(adapterId)],
    }));
  };

  const removeAgent = (instanceId: string) => {
    setSettings((prev) => ({
      ...prev,
      agents: prev.agents.filter((agent) => agent.instanceId !== instanceId),
      fallbackAgentInstanceId: prev.fallbackAgentInstanceId === instanceId
        ? undefined
        : prev.fallbackAgentInstanceId,
    }));
    if (editingAssignmentId === instanceId) {
      setEditingAssignmentId(null);
      setAssignmentDraft('');
    }
  };

  const soloAgent = (instanceId: string) => {
    setSettings((prev) => ({
      ...prev,
      maxParallelAgents: 1,
      agents: prev.agents.map((agent) => ({
        ...agent,
        enabled: agent.instanceId === instanceId,
      })),
    }));
  };

  const startAssignmentEdit = (agent: OrchestrationAgent) => {
    setEditingAssignmentId(agent.instanceId);
    setAssignmentDraft(agent.instruction);
  };

  const cancelAssignmentEdit = () => {
    setEditingAssignmentId(null);
    setAssignmentDraft('');
  };

  const saveAssignmentEdit = (instanceId: string) => {
    updateAgent(instanceId, { instruction: assignmentDraft });
    setEditingAssignmentId(null);
    setAssignmentDraft('');
  };

  const loadWorkflows = useCallback(async () => {
    const response = await authenticatedFetch('/api/orchestration/workflows');
    if (!response.ok) return;
    const data = await response.json() as { workflows?: BuiltInWorkflow[] };
    const nextWorkflows = data.workflows ?? [];
    setWorkflows(nextWorkflows);
    const nextAvailableWorkflows = nextWorkflows.length > 0 ? nextWorkflows : fallbackWorkflows;
    setWorkflowId((current) =>
      nextAvailableWorkflows.some((workflow) => workflow.id === current)
        ? current
        : nextAvailableWorkflows[0]?.id || 'agent_team',
    );
  }, []);

  const loadOrchestrationContext = useCallback(async () => {
    const response = await authenticatedFetch('/api/orchestration/workflows/context');
    if (!response.ok) return;
    const data = await response.json() as OrchestrationContext;
    setOrchestrationContext(data);
  }, []);

  const loadRuns = useCallback(async () => {
    if (loadRunsInFlightRef.current) return;
    loadRunsInFlightRef.current = true;
    try {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs?projectId=${encodeURIComponent(selectedProject.name)}`);
      if (!response.ok) return;
      const data = await response.json() as { runs?: WorkflowRunSummary[] };
      const nextRuns = data.runs ?? [];
      setRuns(nextRuns);
      const requestedRunId = localStorage.getItem('pixcode.orchestration.selectedRunId') || undefined;
      setRunId((current) => {
        if (current && nextRuns.some((run) => run.id === current)) return current;
        if (requestedRunId && nextRuns.some((run) => run.id === requestedRunId)) return requestedRunId;
        return nextRuns[0]?.id;
      });
    } finally {
      loadRunsInFlightRef.current = false;
    }
  }, [selectedProject.name]);

  useEffect(() => {
    void loadOrchestrationContext();
    void loadWorkflows();
    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, runsRefreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [loadOrchestrationContext, loadRuns, loadWorkflows, runsRefreshIntervalMs]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(workspaceTargetStorageKey, workspaceTargetMode);
  }, [workspaceTargetMode]);

  useEffect(() => {
    localStorage.setItem(customWorkspacePathStorageKey, customWorkspacePath);
  }, [customWorkspacePath]);

  useEffect(() => {
    localStorage.setItem(paneWidthStorageKey, String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    const resize = () => {
      const containerWidth = layoutRef.current?.getBoundingClientRect().width;
      setLeftPaneWidth((previous) => clampPaneWidth(previous, containerWidth));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const adjustPaneWidth = useCallback((delta: number) => {
    const containerWidth = layoutRef.current?.getBoundingClientRect().width;
    setLeftPaneWidth((previous) => clampPaneWidth(previous + delta, containerWidth));
  }, []);

  const startPaneResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const container = layoutRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width < minLeftPaneWidth + minRightPaneWidth) return;

    event.preventDefault();
    setIsResizingPanes(true);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => {
      setLeftPaneWidth(clampPaneWidth(moveEvent.clientX - rect.left, rect.width));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingPanes(false);
      window.removeEventListener('pointermove', handleMove);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
  }, []);

  const handlePaneResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      adjustPaneWidth(-24);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      adjustPaneWidth(24);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setLeftPaneWidth(minLeftPaneWidth);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const containerWidth = layoutRef.current?.getBoundingClientRect().width;
      setLeftPaneWidth(clampPaneWidth(maxLeftPaneWidth, containerWidth));
    }
  }, [adjustPaneWidth]);

  const start = async () => {
    const trimmedGoal = goal.trim();
    if (!workflowId || !trimmedGoal || starting) return;
    if (enabledAgents.length === 0) {
      setError(t('orchestration.needAgent'));
      return;
    }
    if (workspaceTargetMode === 'custom' && !customWorkspacePath.trim()) {
      setError(t('orchestration.needWorkspacePath'));
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const agents = enabledAgents.map((agent) => {
        const runtimeOptions = readAgentRuntimeOptions(agent.adapterId);
        return {
          instanceId: agent.instanceId,
          adapterId: agent.adapterId,
          enabled: true,
          label: agentLabel(agent),
          role: agent.role && agent.role !== 'auto' && agent.role !== customRoleValue ? agent.role : undefined,
          instruction: agent.instruction.trim(),
          ...runtimeOptions,
          model: agent.model?.trim() || runtimeOptions.model,
        };
      });
      const response = await authenticatedFetch(`/api/orchestration/workflows/${encodeURIComponent(workflowId)}/runs`, {
        method: 'POST',
        body: JSON.stringify({
          input: trimmedGoal,
          metadata: {
            projectId: selectedProject.name,
            projectName: selectedProject.displayName,
            selectedProjectPath: projectPath,
            projectPath: effectiveWorkspacePath || projectPath,
            workspaceTarget: {
              kind: workspaceTargetMode,
              label: workspaceTargetMode === 'pixcode_app'
                ? 'Pixcode app'
                : workspaceTargetMode === 'custom'
                  ? 'Custom workspace'
                  : selectedProject.displayName,
              projectPath: effectiveWorkspacePath || projectPath,
            },
            agents,
            enabledAdapters: enabledAdapterIds,
            settings: {
              maxParallelAgents: settings.maxParallelAgents,
              fallbackAgentInstanceId: fallbackAgent?.instanceId,
              isolation: 'host',
              keepWorkspace: true,
              baseRef: 'HEAD',
            },
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body?.id !== 'string') {
        throw new Error(body?.error?.message ?? t('orchestration.startFailed'));
      }
      setRunId(body.id);
      setRuns((previous) => [body as WorkflowRunSummary, ...previous.filter((run) => run.id !== body.id)]);
      localStorage.setItem('pixcode.orchestration.selectedRunId', body.id);
      setPromptHistory(storePromptHistory(trimmedGoal));
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    const targetRunId = activeRun?.id ?? runId;
    if (!targetRunId || stopping) return;

    setStopping(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(targetRunId)}/cancel`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body?.id !== 'string') {
        throw new Error(body?.error?.message ?? t('orchestration.cancelFailed'));
      }
      setRunId(body.id);
      setRuns((previous) => [body as WorkflowRunSummary, ...previous.filter((run) => run.id !== body.id)]);
      localStorage.setItem('pixcode.orchestration.selectedRunId', body.id);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  };

  const prepareTeamFromSummary = (summary: string) => {
    setPreparedPrompt([
      t('orchestration.reportToPromptPrefix'),
      '',
      summary,
    ].join('\n'));
  };

  const applyPreparedPrompt = () => {
    if (!preparedPrompt?.trim()) return;
    setGoal(preparedPrompt.trim());
    setWorkflowId('agent_team');
    setPreparedPrompt(null);
    window.requestAnimationFrame(() => {
      document.querySelector('[data-orchestration-goal]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <main ref={pageRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {preparedPrompt !== null ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-2xl">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">{t('orchestration.prepareTeamTitle')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t('orchestration.prepareTeamDescription')}</div>
            </div>
            <div className="p-4">
              <textarea
                value={preparedPrompt}
                onChange={(event) => setPreparedPrompt(event.target.value)}
                className="min-h-56 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              <Button type="button" variant="ghost" onClick={() => setPreparedPrompt(null)}>
                {t('buttons.cancel')}
              </Button>
              <Button type="button" onClick={applyPreparedPrompt}>
                {t('orchestration.usePreparedPrompt')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="shrink-0 border-b border-border px-3 py-2 md:px-5 md:py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Workflow className="h-4 w-4" />
              {t('orchestration.title')}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {t('orchestration.subtitle', { project: selectedProject.displayName })}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRuns()}>
            <RefreshCw className="h-4 w-4" />
            {t('orchestration.refresh')}
          </Button>
        </div>
      </div>

      <div
        ref={layoutRef}
        data-orchestration-execution-mode={isExecutionMode ? 'true' : 'false'}
        className={`grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:overflow-hidden ${
          isExecutionMode
            ? 'lg:grid-cols-[minmax(0,1fr)]'
            : 'lg:grid-cols-[minmax(300px,var(--orchestration-left-pane))_10px_minmax(0,1fr)]'
        } ${
          isResizingPanes ? '' : 'transition-[grid-template-columns] duration-300 ease-out'
        }`}
        style={{ '--orchestration-left-pane': `${leftPaneWidth}px` } as CSSProperties}
      >
        {!isExecutionMode ? (
        <aside className="min-h-0 overflow-visible border-b border-border lg:overflow-auto lg:border-b-0">
          <section className="border-b border-border p-3 md:p-5">
            <label data-orchestration-goal className="block text-xs font-medium text-muted-foreground">{t('orchestration.goal')}</label>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={t('orchestration.goalPlaceholder')}
              className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring md:min-h-32"
            />
            {promptHistory.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {promptHistory.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-w-full justify-start truncate text-xs"
                    onClick={() => setGoal(prompt)}
                    title={prompt}
                  >
                    <span className="truncate">{prompt}</span>
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('orchestration.mode')}</span>
                <select
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {availableWorkflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {t(`orchestration.workflows.${workflow.id}.name`, { defaultValue: workflow.name })}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Bot className="h-4 w-4" />
                  {t('orchestration.systemPlan')}
                </div>
                <div className="mt-2 text-sm font-medium">
                  {selectedWorkflow
                    ? t(`orchestration.workflows.${selectedWorkflow.id}.name`, { defaultValue: selectedWorkflow.name })
                    : t('orchestration.noMode')}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selectedWorkflow
                    ? t(`orchestration.workflows.${selectedWorkflow.id}.description`, { defaultValue: selectedWorkflow.description })
                    : t('orchestration.loadingPlan')}
                </p>
              </div>

              <div className="rounded-md border border-border/70 bg-background/60 p-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t('orchestration.workspaceTarget')}</span>
                  <select
                    value={workspaceTargetMode}
                    onChange={(event) => setWorkspaceTargetMode(event.target.value as WorkspaceTargetMode)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="selected_project">{t('orchestration.workspaceTargets.selectedProject')}</option>
                    <option value="pixcode_app">{t('orchestration.workspaceTargets.pixcodeApp')}</option>
                    <option value="custom">{t('orchestration.workspaceTargets.custom')}</option>
                  </select>
                </label>
                {workspaceTargetMode === 'custom' ? (
                  <input
                    type="text"
                    value={customWorkspacePath}
                    onChange={(event) => setCustomWorkspacePath(event.target.value)}
                    placeholder={t('orchestration.customWorkspacePlaceholder')}
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                ) : null}
                <div className="mt-2 break-all rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] leading-5 text-muted-foreground">
                  {t('orchestration.workspaceTargetHint', {
                    path: effectiveWorkspacePath || t('orchestration.autoDetect'),
                  })}
                </div>
              </div>
            </div>

            {error ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

            <Button
              type="button"
              variant={activeRun ? 'destructive' : 'default'}
              className="mt-4 w-full"
              disabled={activeRun ? stopping : !goal.trim() || !workflowId || starting || enabledAgents.length === 0}
              onClick={() => void (activeRun ? stop() : start())}
            >
              {activeRun ? <SquareIcon className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {activeRun
                ? (stopping ? t('orchestration.stopping') : t('orchestration.stop'))
                : (starting ? t('orchestration.starting') : t('orchestration.start'))}
            </Button>
          </section>

          <section className="border-b border-border p-3 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" />
                {t('orchestration.cliControl')}
              </div>
              <Badge variant="outline">
                {t('orchestration.activeCount', { active: enabledAgents.length, total: settings.agents.length })}
              </Badge>
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              {t('orchestration.teamHint')}
            </p>

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">{t('orchestration.parallelLimit')}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.maxParallelAgents}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSettings((prev) => ({
                      ...prev,
                      maxParallelAgents: Number.isFinite(value) ? Math.max(1, Math.min(12, Math.round(value))) : prev.maxParallelAgents,
                    }));
                  }}
                  className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="min-w-[220px] flex-1 space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {t('orchestration.fallbackAgent', 'Fallback CLI')}
                </span>
                <select
                  value={fallbackAgent?.instanceId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSettings((prev) => ({
                      ...prev,
                      fallbackAgentInstanceId: value || undefined,
                    }));
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('orchestration.noFallbackAgent', 'No automatic fallback')}</option>
                  {enabledAgents.map((agent) => (
                    <option key={agent.instanceId} value={agent.instanceId}>
                      {agentLabel(agent)}
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] leading-4 text-muted-foreground">
                  {t('orchestration.fallbackAgentHint', 'If a CLI step fails, Pixcode retries that step with this backup agent.')}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {allAdapterIds.map((adapterId) => (
                  <Button
                    key={adapterId}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addAgent(adapterId)}
                    title={t('orchestration.addAgent', { agent: adapterName(adapterId) })}
                  >
                    <Plus className="h-4 w-4" />
                    <SessionProviderLogo provider={adapterLabels[adapterId].provider} className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              {settings.agents.map((agent) => {
                const adapter = adapterLabels[agent.adapterId];
                const label = agentLabel(agent);
                const runtimeOptions = readAgentRuntimeOptions(agent.adapterId);
                const modelOptions = modelOptionsForAdapter(agent.adapterId);
                const activeModel = agent.model || runtimeOptions.model || defaultModelForAdapter(agent.adapterId) || '';
                return (
                  <div
                    key={agent.instanceId}
                    className={`rounded-md border p-3 transition-colors ${
                      agent.enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={agent.enabled}
                        aria-label={label}
                        onClick={() => updateAgent(agent.instanceId, { enabled: !agent.enabled })}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                          agent.enabled ? 'border-primary bg-primary' : 'border-border bg-muted'
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
                            agent.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <SessionProviderLogo provider={adapter.provider} className="h-5 w-5" />
                      <div className="min-w-[140px] flex-1">
                        <div className="truncate text-sm font-medium">{label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {adapterName(agent.adapterId)} · {activeModel || t('orchestration.cliSettings')}
                        </div>
                      </div>
                      <Badge variant={agent.enabled ? 'default' : 'outline'}>
                        {agent.enabled ? t('orchestration.enabled') : t('orchestration.disabled')}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => soloAgent(agent.instanceId)}
                        aria-label={t('orchestration.soloAgent', { agent: label })}
                        title={t('orchestration.soloAgent', { agent: label })}
                      >
                        {t('orchestration.soloAgentShort')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => addAgent(agent.adapterId)}
                        aria-label={t('orchestration.duplicateAgent', { agent: label })}
                        title={t('orchestration.duplicateAgent', { agent: label })}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeAgent(agent.instanceId)}
                        aria-label={t('orchestration.removeAgent', { agent: label })}
                        title={t('orchestration.removeAgent', { agent: label })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {t('orchestration.agentRole')}
                        </span>
                        <select
                          value={roleSelectValue(agent.role, roleOptions)}
                          onChange={(event) => {
                            const nextRole = event.target.value;
                            updateAgent(agent.instanceId, {
                              role: nextRole === customRoleValue
                                ? (agent.role && !isKnownAgentRole(agent.role) ? agent.role : customRoleValue)
                                : nextRole,
                            });
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {t(`orchestration.agentRoles.${role}`)}
                            </option>
                          ))}
                          <option value={customRoleValue}>{t('orchestration.agentRoles.custom')}</option>
                        </select>
                        {roleSelectValue(agent.role, roleOptions) === customRoleValue ? (
                          <input
                            type="text"
                            value={agent.role && agent.role !== customRoleValue && !isKnownAgentRole(agent.role) ? agent.role : ''}
                            onChange={(event) => updateAgent(agent.instanceId, {
                              role: event.target.value.trim() || customRoleValue,
                            })}
                            placeholder={t('orchestration.customRolePlaceholder')}
                            className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                          />
                        ) : null}
                      </label>
                      <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                        {t(`orchestration.roleHints.${workflowId}`, {
                          defaultValue: t('orchestration.roleHints.default'),
                        })}
                      </div>
                    </div>
                    {modelOptions.length > 0 ? (
                      <label className="mt-3 block space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {t('orchestration.agentModel', 'Model')}
                        </span>
                        <select
                          value={activeModel}
                          onChange={(event) => updateAgent(agent.instanceId, { model: event.target.value })}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {modelOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className="mt-3 rounded-md border border-border/70 bg-background/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => startAssignmentEdit(agent)}
                          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('orchestration.assignment')}
                        </button>
                        {editingAssignmentId !== agent.instanceId ? (
                          <span className="min-w-0 truncate text-right text-xs text-muted-foreground">
                            {agent.instruction.trim() || t('orchestration.auto')}
                          </span>
                        ) : null}
                      </div>
                      {editingAssignmentId === agent.instanceId ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={assignmentDraft}
                            onChange={(event) => setAssignmentDraft(event.target.value)}
                            placeholder={t('orchestration.assignmentPlaceholder')}
                            className="min-h-16 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={cancelAssignmentEdit}
                            >
                              {t('buttons.cancel')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => saveAssignmentEdit(agent.instanceId)}
                            >
                              {t('buttons.save')}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="p-3 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                {t('orchestration.history')}
              </div>
              <Badge variant="outline">{runs.length}</Badge>
            </div>
            <div className="space-y-2">
              {runs.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {t('orchestration.emptyHistory')}
                </div>
              ) : runs.map((run) => {
                const runAdapters = [...new Set(run.nodeRuns.map((node) => node.adapterId).filter(isAdapterId))];
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setRunId(run.id);
                      localStorage.setItem('pixcode.orchestration.selectedRunId', run.id);
                    }}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      run.id === runId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{run.input || run.workflowId}</div>
                      <Badge variant={statusVariant(run.status)}>
                        {t(`orchestration.status.${run.status}`, { defaultValue: run.status })}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>
                        {t('orchestration.steps', {
                          done: run.nodeRuns.filter((node) => node.status === 'completed').length,
                          total: run.nodeRuns.length,
                        })}
                      </span>
                      <span>{formatTime(run.startedAt)}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {runAdapters.slice(0, 6).map((adapterId) => (
                          <SessionProviderLogo
                            key={adapterId}
                            provider={adapterLabels[adapterId].provider}
                            className="h-4 w-4"
                          />
                        ))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
        ) : null}

        {!isExecutionMode ? (
        <button
          type="button"
          className="group hidden min-h-0 cursor-col-resize items-stretch justify-center border-x border-border/60 bg-muted/25 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:flex"
          aria-label={t('orchestration.resizePanels', { defaultValue: 'Resize orchestration panels' })}
          title={t('orchestration.resizePanels', { defaultValue: 'Resize orchestration panels' })}
          onPointerDown={startPaneResize}
          onKeyDown={handlePaneResizeKeyDown}
        >
          <span className="my-4 w-px rounded-full bg-border transition-colors group-hover:bg-foreground/50" />
        </button>
        ) : null}

        <section className="min-h-0 min-w-0 overflow-visible lg:overflow-hidden">
          <WorkflowRunPanel runId={runId} onPrepareTeamFromSummary={prepareTeamFromSummary} />
        </section>
      </div>
    </main>
  );
}
