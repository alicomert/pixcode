import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Bot,
  CheckCircle,
  Clock,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Workflow,
} from '@/lib/icons';
import type { Project } from '@/types/app';
import SessionProviderLogo from '../llm-logo-provider/SessionProviderLogo';
import { Badge, Button } from '../../shared/view/ui';
import { authenticatedFetch } from '../../utils/api';
import WorkflowRunPanel from './workflows/WorkflowRunPanel';

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

const allAdapterIds = ['claude-code', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'] as const;

type AdapterId = typeof allAdapterIds[number];
type ProviderId = 'claude' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode';

type OrchestrationAgent = {
  instanceId: string;
  adapterId: AdapterId;
  enabled: boolean;
  instruction: string;
};

type OrchestrationSettings = {
  agents: OrchestrationAgent[];
  maxParallelAgents: number;
};

type StoredSettings = Partial<OrchestrationSettings> & {
  enabledAdapters?: unknown;
};

type OrchestrationPageProps = {
  selectedProject: Project;
};

const settingsStorageKey = 'pixcode.orchestration.settings';

const adapterLabels: Record<AdapterId, { provider: ProviderId }> = {
  'claude-code': { provider: 'claude' },
  cursor: { provider: 'cursor' },
  codex: { provider: 'codex' },
  gemini: { provider: 'gemini' },
  qwen: { provider: 'qwen' },
  opencode: { provider: 'opencode' },
};

function isAdapterId(value: unknown): value is AdapterId {
  return typeof value === 'string' && (allAdapterIds as readonly string[]).includes(value);
}

function createDefaultAgents(enabledAdapters: AdapterId[] = [...allAdapterIds]): OrchestrationAgent[] {
  return allAdapterIds.map((adapterId, index) => ({
    instanceId: `${adapterId}-${index + 1}`,
    adapterId,
    enabled: enabledAdapters.includes(adapterId),
    instruction: '',
  }));
}

function createAgent(adapterId: AdapterId): OrchestrationAgent {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    instanceId: `${adapterId}-${suffix}`,
    adapterId,
    enabled: true,
    instruction: '',
  };
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
    };
  } catch {
    return {
      agents: createDefaultAgents(),
      maxParallelAgents: 3,
    };
  }
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

export default function OrchestrationPage({ selectedProject }: OrchestrationPageProps) {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<BuiltInWorkflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [workflowId, setWorkflowId] = useState('agent_team');
  const [goal, setGoal] = useState('');
  const [settings, setSettings] = useState<OrchestrationSettings>(readSettings);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectPath = selectedProject.path || selectedProject.fullPath;
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === workflowId),
    [workflowId, workflows],
  );
  const enabledAgents = useMemo(
    () => settings.agents.filter((agent) => agent.enabled),
    [settings.agents],
  );
  const enabledAdapterIds = useMemo(
    () => [...new Set(enabledAgents.map((agent) => agent.adapterId))],
    [enabledAgents],
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
    }));
  };

  const loadWorkflows = async () => {
    const response = await authenticatedFetch('/api/orchestration/workflows');
    if (!response.ok) return;
    const data = await response.json() as { workflows?: BuiltInWorkflow[] };
    const nextWorkflows = data.workflows ?? [];
    setWorkflows(nextWorkflows);
    setWorkflowId((current) =>
      nextWorkflows.some((workflow) => workflow.id === current)
        ? current
        : nextWorkflows[0]?.id || '',
    );
  };

  const loadRuns = async () => {
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
  };

  useEffect(() => {
    void loadWorkflows();
    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedProject.name]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  const start = async () => {
    const trimmedGoal = goal.trim();
    if (!workflowId || !trimmedGoal || starting) return;
    if (enabledAgents.length === 0) {
      setError(t('orchestration.needAgent'));
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const agents = enabledAgents.map((agent) => ({
        instanceId: agent.instanceId,
        adapterId: agent.adapterId,
        enabled: true,
        label: agentLabel(agent),
        instruction: agent.instruction.trim(),
      }));
      const response = await authenticatedFetch(`/api/orchestration/workflows/${encodeURIComponent(workflowId)}/runs`, {
        method: 'POST',
        body: JSON.stringify({
          input: trimmedGoal,
          metadata: {
            projectId: selectedProject.name,
            projectName: selectedProject.displayName,
            projectPath,
            agents,
            enabledAdapters: enabledAdapterIds,
            settings: {
              maxParallelAgents: settings.maxParallelAgents,
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
      localStorage.setItem('pixcode.orchestration.selectedRunId', body.id);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="border-b border-border px-4 py-3 md:px-5">
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

      <div className="grid min-h-0 flex-1 gap-0 overflow-auto xl:grid-cols-[minmax(480px,620px)_1fr] xl:overflow-hidden">
        <aside className="min-h-0 overflow-auto border-b border-border xl:border-b-0 xl:border-r">
          <section className="border-b border-border p-4 md:p-5">
            <label className="block text-xs font-medium text-muted-foreground">{t('orchestration.goal')}</label>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={t('orchestration.goalPlaceholder')}
              className="mt-2 min-h-32 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />

            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('orchestration.mode')}</span>
                <select
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {workflows.map((workflow) => (
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
            </div>

            {error ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

            <Button
              type="button"
              className="mt-4 w-full"
              disabled={!goal.trim() || !workflowId || starting || enabledAgents.length === 0}
              onClick={() => void start()}
            >
              <Play className="h-4 w-4" />
              {starting ? t('orchestration.starting') : t('orchestration.start')}
            </Button>
          </section>

          <section className="border-b border-border p-4 md:p-5">
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
                return (
                  <div
                    key={agent.instanceId}
                    className={`rounded-md border p-3 transition-colors ${
                      agent.enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={agent.enabled}
                        onChange={(event) => updateAgent(agent.instanceId, { enabled: event.target.checked })}
                        aria-label={label}
                        className="h-4 w-4 rounded border-input"
                      />
                      <SessionProviderLogo provider={adapter.provider} className="h-5 w-5" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{label}</div>
                        <div className="truncate text-xs text-muted-foreground">{adapterName(agent.adapterId)}</div>
                      </div>
                      <Badge variant={agent.enabled ? 'default' : 'outline'}>
                        {agent.enabled ? t('orchestration.enabled') : t('orchestration.disabled')}
                      </Badge>
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
                    <label className="mt-3 block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t('orchestration.assignment')}</span>
                      <textarea
                        value={agent.instruction}
                        onChange={(event) => updateAgent(agent.instanceId, { instruction: event.target.value })}
                        placeholder={t('orchestration.assignmentPlaceholder')}
                        className="min-h-16 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="p-4 md:p-5">
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

        <section className="min-h-0 overflow-hidden">
          <WorkflowRunPanel runId={runId} />
        </section>
      </div>
    </main>
  );
}
