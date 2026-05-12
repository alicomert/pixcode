import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '../../../shared/view/ui';
import { useGsapCrossfade } from '../../../lib/animations';
import { authenticatedFetch } from '../../../utils/api';
import { Markdown } from '../../chat/view/subcomponents/Markdown';

import WorkflowNodeStream from './WorkflowNodeStream';

import { AlertTriangle, Bot, Clock, FileText, Filter, ListChecks, MessageSquare, RotateCcw, Shield, SquareIcon, Workflow } from '@/lib/icons';

type WorkflowNodeRun = {
  nodeId: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  assignment?: string;
  promptPreview?: string;
  stage?: string;
  internal?: boolean;
  status: string;
  a2aTaskId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  outputText?: string;
  permissionPolicy?: Record<string, unknown>;
  permissionDecisions?: Array<Record<string, unknown>>;
  messages?: Array<{ role: string; text: string }>;
  artifacts?: Array<{
    type: string;
    text?: string;
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
};

type WorkflowRun = {
  id: string;
  workflowId: string;
  contextId: string;
  status: string;
  input?: string;
  startedAt: number;
  finishedAt?: number;
  metadata?: Record<string, unknown>;
  nodeRuns: WorkflowNodeRun[];
};

type WorkflowReplayPlan = {
  protocol: string;
  sourceRunId: string;
  sourceWorkflowId: string;
  scope: 'run' | 'node';
  fromNodeId?: string;
  selectedNodeIds: string[];
  requiresApproval: boolean;
  approvalReasons: string[];
  destructiveOperations: Array<{
    kind: string;
    nodeId?: string;
    summary: string;
  }>;
  limitations: string[];
};

type WorkflowTraceEvent = {
  id: string;
  type: 'run' | 'node' | 'provider' | 'message' | 'artifact' | 'file' | 'error' | 'permission_policy';
  severity: 'info' | 'warning' | 'error';
  status: string;
  timestamp: number;
  durationMs?: number;
  actor: string;
  title: string;
  titleKey?: string;
  summary?: string;
  detail?: string;
  nodeId?: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  model?: string;
  metadata?: Record<string, unknown>;
};

type TraceFilters = {
  actor: string;
  provider: string;
  type: string;
  severity: string;
};

type WorkflowRunPanelProps = {
  runId?: string;
  onRunSnapshot?: (run: WorkflowRun) => void;
  onReplayStarted?: (run: WorkflowRun) => void;
  onPrepareTeamFromSummary?: (summary: string) => void;
};

const teamHistoryId = '__team_history__';
const traceTimelineId = '__trace_timeline__';
const terminalRunStatuses = new Set(['completed', 'failed', 'canceled']);
const allTraceFilterValue = '__all__';
const defaultTraceFilters: TraceFilters = {
  actor: allTraceFilterValue,
  provider: allTraceFilterValue,
  type: allTraceFilterValue,
  severity: allTraceFilterValue,
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
}

function statusAccentClass(status: string): string {
  if (status === 'failed') return 'border-l-destructive/70 bg-destructive/5';
  if (status === 'canceled') return 'border-l-muted-foreground/50 bg-muted/30';
  if (status === 'running') return 'border-l-foreground/60 bg-muted/40';
  if (status === 'queued') return 'border-l-muted-foreground/40 bg-muted/25';
  if (status === 'completed') return 'border-l-muted-foreground/60 bg-muted/20';
  return 'border-l-border bg-background';
}

function statusDotClass(status: string): string {
  if (status === 'failed') return 'bg-destructive';
  if (status === 'canceled') return 'bg-muted-foreground/50';
  if (status === 'running') return 'animate-pulse bg-foreground';
  if (status === 'queued') return 'bg-muted-foreground/70';
  if (status === 'completed') return 'bg-muted-foreground';
  return 'bg-muted-foreground';
}

function duration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt) return '';
  const end = finishedAt ?? Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

function traceDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number') return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${Math.max(0, Math.round(durationMs / 1000))}s`;
}

function traceTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .sort((a, b) => a.localeCompare(b));
}

function nodeMessages(node: WorkflowNodeRun): Array<{ role: string; text: string }> {
  const agentMessages = (node.messages ?? []).filter((message) => message.role !== 'user');
  if (agentMessages.length) return agentMessages;
  if (node.outputText) return [{ role: 'agent', text: node.outputText }];
  return [];
}

function visibleNodeRuns(run: WorkflowRun): WorkflowNodeRun[] {
  return run.nodeRuns.filter((node) => !node.internal);
}

function finalSummary(run: WorkflowRun): string | undefined {
  const finalNode = run.nodeRuns.find((node) => node.nodeId === 'final_report')
    ?? [...run.nodeRuns].reverse().find((node) => node.outputText || node.messages?.some((message) => message.role !== 'user'));
  if (!finalNode) return undefined;
  return finalNode.outputText
    || [...(finalNode.messages ?? [])].reverse().find((message) => message.role !== 'user')?.text;
}

function hasUsefulOutput(node: WorkflowNodeRun): boolean {
  return Boolean(
    node.outputText?.trim()
    || node.error?.trim()
    || node.messages?.some((message) => message.role !== 'user' && message.text.trim())
    || node.artifacts?.length,
  );
}

function pendingPermissionApprovals(run: WorkflowRun): Array<Record<string, unknown>> {
  return Array.isArray(run.metadata?.pendingPermissionApprovals)
    ? run.metadata.pendingPermissionApprovals.filter((approval): approval is Record<string, unknown> =>
      Boolean(approval && typeof approval === 'object' && approval.status === 'pending'),
    )
    : [];
}

function defaultReplayNodeId(run: WorkflowRun): string | undefined {
  return visibleNodeRuns(run).find((node) => node.status === 'failed')?.nodeId
    ?? [...visibleNodeRuns(run)].reverse().find((node) => node.status !== 'skipped')?.nodeId;
}

function WorkflowTraceTimeline({
  events,
  filters,
  setTraceFilters,
  loadError,
}: {
  events: WorkflowTraceEvent[];
  filters: TraceFilters;
  setTraceFilters: Dispatch<SetStateAction<TraceFilters>>;
  loadError: string | null;
}) {
  const { t } = useTranslation();
  const actors = useMemo(() => uniqueSorted(events.map((event) => event.actor)), [events]);
  const providers = useMemo(() => uniqueSorted(events.map((event) => event.adapterId)), [events]);
  const types = useMemo(() => uniqueSorted(events.map((event) => event.type)), [events]);
  const severities = useMemo(() => uniqueSorted(events.map((event) => event.severity)), [events]);
  const filteredEvents = useMemo(() => events.filter((event) =>
    (filters.actor === allTraceFilterValue || event.actor === filters.actor)
    && (filters.provider === allTraceFilterValue || event.adapterId === filters.provider)
    && (filters.type === allTraceFilterValue || event.type === filters.type)
    && (filters.severity === allTraceFilterValue || event.severity === filters.severity),
  ), [events, filters]);

  const renderSelect = (
    key: keyof TraceFilters,
    label: string,
    options: string[],
    labelForOption: (value: string) => string = (value) => value,
  ) => (
    <label className="min-w-0 text-xs font-medium text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <select
        value={filters[key]}
        onChange={(event) => setTraceFilters((current) => ({ ...current, [key]: event.target.value }))}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
      >
        <option value={allTraceFilterValue}>{t('orchestration.traceAll')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labelForOption(option)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4" />
          {t('orchestration.traceTimeline')}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-4 w-4" />
          {t('orchestration.traceFilters')}
        </div>
      </div>

      <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-4">
        {renderSelect('actor', t('orchestration.traceActor'), actors)}
        {renderSelect('provider', t('orchestration.traceProvider'), providers, (value) => value)}
        {renderSelect('type', t('orchestration.traceType'), types, (value) =>
          t(`orchestration.traceTypes.${value}`, { defaultValue: value }),
        )}
        {renderSelect('severity', t('orchestration.traceSeverity'), severities, (value) =>
          t(`orchestration.traceSeverityLevels.${value}`, { defaultValue: value }),
        )}
      </div>

      <div className="space-y-3 p-4">
        {loadError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}
        {filteredEvents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('orchestration.traceEmpty')}
          </div>
        ) : filteredEvents.map((event) => (
          <article key={event.id} className={`rounded-md border border-l-4 border-border/70 p-3 ${event.severity === 'error' ? 'border-l-destructive/70 bg-destructive/5' : statusAccentClass(event.status)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {event.titleKey ? t(event.titleKey, { defaultValue: event.title }) : event.title}
                  </span>
                  <Badge variant={statusVariant(event.status)}>
                    {t(`orchestration.status.${event.status}`, { defaultValue: event.status })}
                  </Badge>
                  <Badge variant="outline">
                    {t(`orchestration.traceTypes.${event.type}`, { defaultValue: event.type })}
                  </Badge>
                  {event.severity !== 'info' ? (
                    <Badge variant={event.severity === 'error' ? 'destructive' : 'secondary'}>
                      {t(`orchestration.traceSeverityLevels.${event.severity}`, { defaultValue: event.severity })}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{traceTime(event.timestamp)}</span>
                  <span>{event.actor}</span>
                  {event.adapterId ? <span>{event.adapterId}</span> : null}
                  {event.model ? <span>{event.model}</span> : null}
                  {event.durationMs !== undefined ? (
                    <span>{t('orchestration.traceDuration', { duration: traceDuration(event.durationMs) })}</span>
                  ) : null}
                </div>
              </div>
            </div>
            {event.summary ? (
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-background/70 p-3 font-mono text-xs leading-5">
                {event.summary}
              </pre>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkflowTeamHistory({
  run,
  onPrepareTeamFromSummary,
}: {
  run: WorkflowRun;
  onPrepareTeamFromSummary?: (summary: string) => void;
}) {
  const { t } = useTranslation();
  const explicitSummary = finalSummary(run);
  const generatedSummary = useMemo(() => {
    if (explicitSummary?.trim()) return explicitSummary;
    const visibleNodes = visibleNodeRuns(run);
    if (!visibleNodes.some(hasUsefulOutput)) return undefined;

    const completed = visibleNodes.filter((node) => node.status === 'completed').length;
    const failed = visibleNodes.filter((node) => node.status === 'failed').length;
    const canceled = visibleNodes.filter((node) => node.status === 'canceled').length;
    const changedFiles = visibleNodes
      .flatMap((node) => node.artifacts ?? [])
      .filter((artifact) => artifact.type === 'file-diff' && artifact.text?.trim())
      .length;
    const previewCount = visibleNodes
      .flatMap((node) => node.artifacts ?? [])
      .filter((artifact) => artifact.type === 'preview-url')
      .length;

    return [
      `### ${t('orchestration.generatedSummaryTitle')}`,
      '',
      `- ${t('orchestration.summaryStatus')}: ${t(`orchestration.status.${run.status}`, { defaultValue: run.status })}`,
      `- ${t('orchestration.summarySteps')}: ${completed}/${visibleNodes.length}`,
      failed > 0 ? `- ${t('orchestration.summaryFailures')}: ${failed}` : undefined,
      canceled > 0 ? `- ${t('orchestration.summaryCanceled')}: ${canceled}` : undefined,
      changedFiles > 0 ? `- ${t('orchestration.summaryDiffs')}: ${changedFiles}` : undefined,
      previewCount > 0 ? `- ${t('orchestration.summaryPreviews')}: ${previewCount}` : undefined,
      '',
      `#### ${t('orchestration.agentSteps')}`,
      ...visibleNodes.map((node) => {
        const label = node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId });
        const status = t(`orchestration.status.${node.status}`, { defaultValue: node.status });
        const stage = node.stage ? t(`orchestration.stages.${node.stage}`, { defaultValue: node.stage }) : undefined;
        const assignment = node.assignment?.trim() || t('orchestration.autoAssigned');
        const error = node.error ? ` ${t('orchestration.summaryErrorPrefix')}: ${node.error}` : '';
        return `- **${label}** (${stage ? `${stage} / ` : ''}${status}) - ${assignment}${error}`;
      }),
    ].filter(Boolean).join('\n');
  }, [explicitSummary, run, t]);
  const summary = explicitSummary || generatedSummary;
  const canPrepareTeam = Boolean(onPrepareTeamFromSummary && run.status === 'completed' && explicitSummary?.trim());

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {t('orchestration.changeSummary')}
        </div>
        <div className="p-4">
          {summary ? (
            <div className="space-y-3">
              <Markdown className="orchestration-markdown prose prose-sm max-w-none dark:prose-invert">
                {summary}
              </Markdown>
              {canPrepareTeam ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (explicitSummary?.trim()) {
                      onPrepareTeamFromSummary?.(explicitSummary);
                    }
                  }}
                >
                  {t('orchestration.prepareTeamFromReport')}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('orchestration.noChangeSummary')}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Bot className="h-4 w-4" />
          {t('orchestration.assignedWork')}
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {visibleNodeRuns(run).map((node) => {
            const stage = node.stage ? t(`orchestration.stages.${node.stage}`, { defaultValue: node.stage }) : undefined;
            return (
              <div key={node.nodeId} className={`rounded-md border border-l-4 border-border/70 px-3 py-2 ${statusAccentClass(node.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-medium">
                    {node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId })}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {stage ? <Badge variant="outline">{stage}</Badge> : null}
                    <Badge variant={statusVariant(node.status)}>
                      {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
                    </Badge>
                  </div>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {node.assignment?.trim() || t('orchestration.autoAssigned')}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" />
          {t('orchestration.teamHistory')}
        </div>
        <div className="space-y-3 p-4">
        {visibleNodeRuns(run).map((node) => {
          const messages = nodeMessages(node);
          const stage = node.stage ? t(`orchestration.stages.${node.stage}`, { defaultValue: node.stage }) : undefined;
          return (
            <article key={node.nodeId} className={`rounded-md border border-l-4 border-border/70 p-3 ${statusAccentClass(node.status)}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId })}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{node.adapterId || node.nodeId}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {stage ? <Badge variant="outline">{stage}</Badge> : null}
                  <Badge variant={statusVariant(node.status)}>
                    {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
                  </Badge>
                </div>
              </div>
              {node.assignment ? (
                <div className="mb-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs leading-5">
                  <span className="font-medium text-muted-foreground">{t('orchestration.assignment')}: </span>
                  {node.assignment}
                </div>
              ) : null}
              {node.error ? (
                <div className="mb-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{node.error}</span>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-background/60 p-3 text-sm text-muted-foreground">
                  {t('orchestration.noAgentMessages')}
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((message, index) => (
                    <div key={`${node.nodeId}-${message.role}-${index}`} className="rounded-md border border-border/70 bg-background/70 p-3">
                      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                        {t(`orchestration.role.${message.role}`, { defaultValue: message.role })}
                      </div>
                      <Markdown className="orchestration-markdown prose prose-sm max-w-none dark:prose-invert">
                        {message.text}
                      </Markdown>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        </div>
      </section>
    </div>
  );
}

export default function WorkflowRunPanel({
  runId,
  onRunSnapshot,
  onReplayStarted,
  onPrepareTeamFromSummary,
}: WorkflowRunPanelProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(teamHistoryId);
  const [traceEvents, setTraceEvents] = useState<WorkflowTraceEvent[]>([]);
  const [traceFilters, setTraceFilters] = useState<TraceFilters>(defaultTraceFilters);
  const [traceLoadError, setTraceLoadError] = useState<string | null>(null);
  const [replayPlan, setReplayPlan] = useState<WorkflowReplayPlan | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setSelectedNodeId(teamHistoryId);
      setTraceEvents([]);
      setTraceLoadError(null);
      setReplayPlan(null);
      setReplayError(null);
      return undefined;
    }

    let canceled = false;
    let timer: number | undefined;
    const loadReplayPlan = async (nextRun: WorkflowRun) => {
      if (!terminalRunStatuses.has(nextRun.status)) {
        setReplayPlan(null);
        setReplayError(null);
        return;
      }
      const fromNodeId = defaultReplayNodeId(nextRun);
      const search = new URLSearchParams({
        scope: fromNodeId ? 'node' : 'run',
      });
      if (fromNodeId) search.set('fromNodeId', fromNodeId);
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/replay-plan?${search.toString()}`);
      if (canceled) return;
      if (!response.ok) {
        setReplayPlan(null);
        return;
      }
      const body = await response.json() as { replayPlan?: WorkflowReplayPlan };
      if (canceled) return;
      setReplayPlan(body.replayPlan ?? null);
      setReplayError(null);
    };
    const loadTrace = async () => {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/trace`);
      if (canceled) return;
      if (!response.ok) {
        setTraceLoadError(t('orchestration.traceLoadFailed'));
        return;
      }
      const body = await response.json() as { trace?: WorkflowTraceEvent[] };
      if (canceled) return;
      setTraceEvents(Array.isArray(body.trace) ? body.trace : []);
      setTraceLoadError(null);
    };
    const load = async () => {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}`);
      if (canceled) return;
      if (!response.ok) {
        setLoadError(t('orchestration.loadFailed'));
        return;
      }
      const nextRun = await response.json() as WorkflowRun;
      if (canceled) return;
      setRun(nextRun);
      onRunSnapshot?.(nextRun);
      void loadTrace();
      void loadReplayPlan(nextRun);
      setLoadError(null);
      setSelectedNodeId((current) => current || teamHistoryId);

      if (!terminalRunStatuses.has(nextRun.status)) {
        timer = window.setTimeout(() => {
          void load();
        }, 2_000);
      }
    };

    void load();
    return () => {
      canceled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [onRunSnapshot, runId, t]);

  const selectedNode = useMemo(
    () => selectedNodeId === teamHistoryId || selectedNodeId === traceTimelineId
      ? undefined
      : run?.nodeRuns.find((node) => !node.internal && node.nodeId === selectedNodeId),
    [run, selectedNodeId],
  );

  const isActiveRun = run?.status === 'queued' || run?.status === 'running';
  useGsapCrossfade(contentRef, selectedNodeId);

  const cancelRun = async () => {
    if (!runId || canceling) return;
    setCanceling(true);
    try {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) {
        setLoadError(t('orchestration.cancelFailed'));
        return;
      }
      const nextRun = await response.json() as WorkflowRun;
      setRun(nextRun);
      onRunSnapshot?.(nextRun);
      setLoadError(null);
      const traceResponse = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/trace`);
      if (traceResponse.ok) {
        const body = await traceResponse.json() as { trace?: WorkflowTraceEvent[] };
        setTraceEvents(Array.isArray(body.trace) ? body.trace : []);
        setTraceLoadError(null);
      }
    } finally {
      setCanceling(false);
    }
  };

  const replayRun = async (approveReplay = false) => {
    if (!runId || !run || replaying || isActiveRun) return;
    setReplaying(true);
    setReplayError(null);
    try {
      const fromNodeId = replayPlan?.fromNodeId ?? defaultReplayNodeId(run);
      const scope = replayPlan?.scope ?? (fromNodeId ? 'node' : 'run');
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/replay`, {
        method: 'POST',
        body: JSON.stringify({
          scope,
          fromNodeId,
          approveReplay,
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        run?: WorkflowRun;
        replayPlan?: WorkflowReplayPlan;
        error?: { code?: string; message?: string };
      };
      if (response.status === 409 && body.replayPlan) {
        setReplayPlan(body.replayPlan);
        setReplayError(t('orchestration.replayApprovalRequired'));
        return;
      }
      if (!response.ok || !body.run?.id) {
        throw new Error(body.error?.message ?? t('orchestration.replayFailed'));
      }
      setRun(body.run);
      onRunSnapshot?.(body.run);
      onReplayStarted?.(body.run);
      setReplayPlan(null);
      setReplayError(null);
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplaying(false);
    }
  };

  if (!runId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-md border border-dashed border-border p-6 text-center">
          <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm font-semibold">{t('orchestration.notSelected')}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('orchestration.notSelectedDescription')}
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-5 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center p-5 text-sm text-muted-foreground">
        {t('orchestration.loadingRun')}
      </div>
    );
  }

  const replayRequiresApproval = Boolean(replayPlan?.requiresApproval);
  const canReplay = Boolean(replayPlan && terminalRunStatuses.has(run.status));
  const taskmasterId = typeof run.metadata?.taskmasterId === 'string' ? run.metadata.taskmasterId : undefined;
  const linkedTaskTitle = typeof run.metadata?.taskmasterTaskTitle === 'string' ? run.metadata.taskmasterTaskTitle : undefined;
  const pendingApprovals = pendingPermissionApprovals(run);

  return (
    <div className="flex min-h-[70vh] flex-col xl:h-full xl:min-h-0">
      <header className="border-b border-border px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(run.status)}>
                {t(`orchestration.status.${run.status}`, { defaultValue: run.status })}
              </Badge>
              <span className="truncate text-sm font-semibold">
                {t(`orchestration.workflows.${run.workflowId}.name`, { defaultValue: run.workflowId })}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{run.contextId}</div>
          </div>
          <div className="flex items-center gap-2">
            {canReplay ? (
              <Button
                type="button"
                variant={replayRequiresApproval ? 'secondary' : 'outline'}
                size="sm"
                disabled={replaying}
                onClick={() => void replayRun(false)}
              >
                <RotateCcw className="h-4 w-4" />
                {replaying ? t('orchestration.replaying') : t('orchestration.replayRun')}
              </Button>
            ) : null}
            {isActiveRun ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={canceling}
                onClick={() => void cancelRun()}
              >
                <SquareIcon className="h-4 w-4" />
                {canceling ? t('orchestration.stopping') : t('orchestration.stop')}
              </Button>
            ) : null}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" />
              {duration(run.startedAt, run.finishedAt)}
            </div>
          </div>
        </div>
        {run.input ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm leading-6">
            {run.input}
          </div>
        ) : null}
        {taskmasterId ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t('orchestration.linkedTask')}:</span>{' '}
            <span>TaskMaster #{taskmasterId}</span>
            {linkedTaskTitle ? <span> · {linkedTaskTitle}</span> : null}
          </div>
        ) : null}
        {pendingApprovals.length > 0 ? (
          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Shield className="h-4 w-4" />
              {t('orchestration.permissionApprovalsPending', { count: pendingApprovals.length })}
            </div>
            <div className="mt-2 line-clamp-3">
              {pendingApprovals
                .map((approval) =>
                  [approval.agentLabel, approval.message, approval.summary]
                    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                    .join(' · '),
                )
                .filter(Boolean)
                .join(' / ')}
            </div>
          </div>
        ) : null}
        {typeof run.metadata?.error === 'string' ? (
          <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{run.metadata.error}</span>
          </div>
        ) : null}
        {replayError ? (
          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-foreground" />
              <span className="font-medium text-foreground">{replayError}</span>
              {replayRequiresApproval ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={replaying}
                  onClick={() => void replayRun(true)}
                >
                  {t('orchestration.approveReplay')}
                </Button>
              ) : null}
            </div>
            {replayPlan?.approvalReasons.length ? (
              <div className="mt-2 line-clamp-3">
                {replayPlan.approvalReasons.join(' · ')}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid flex-1 xl:min-h-0 xl:grid-cols-[280px_1fr]">
        <nav className="min-h-0 overflow-visible border-b border-border p-3 xl:overflow-auto xl:border-b-0 xl:border-r">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            {t('orchestration.agentSteps')}
          </div>
          <div className="space-y-2">
            <Button
              type="button"
              variant={selectedNodeId === teamHistoryId ? 'secondary' : 'ghost'}
              className={`h-auto w-full justify-start border-l-4 px-3 py-2 ${statusAccentClass(run.status)}`}
              onClick={() => setSelectedNodeId(teamHistoryId)}
            >
              <span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${statusDotClass(run.status)}`} />
              <span className="min-w-0 flex-1 truncate text-left">
                {t('orchestration.teamHistory')}
              </span>
              <Badge variant={statusVariant(run.status)}>
                {t(`orchestration.status.${run.status}`, { defaultValue: run.status })}
              </Badge>
            </Button>
            <Button
              type="button"
              variant={selectedNodeId === traceTimelineId ? 'secondary' : 'ghost'}
              className={`h-auto w-full justify-start border-l-4 px-3 py-2 ${statusAccentClass(run.status)}`}
              onClick={() => setSelectedNodeId(traceTimelineId)}
            >
              <ListChecks className="mr-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                {t('orchestration.traceTimeline')}
              </span>
              <Badge variant="outline">{traceEvents.length}</Badge>
            </Button>
            {visibleNodeRuns(run).map((node) => {
              const stage = node.stage ? t(`orchestration.stages.${node.stage}`, { defaultValue: node.stage }) : undefined;
              return (
                <Button
                  key={node.nodeId}
                  type="button"
                  variant={selectedNode?.nodeId === node.nodeId ? 'secondary' : 'ghost'}
                  className={`h-auto w-full justify-start border-l-4 px-3 py-2 ${statusAccentClass(node.status)}`}
                  onClick={() => setSelectedNodeId(node.nodeId)}
                >
                  <span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${statusDotClass(node.status)}`} />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId })}
                    {node.assignment || stage ? (
                      <span className="mt-1 block truncate text-[11px] font-normal text-muted-foreground">
                        {[stage, node.assignment].filter(Boolean).join(' / ')}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant={statusVariant(node.status)}>
                    {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </nav>

        <div ref={contentRef} className="min-h-0 overflow-visible p-4 md:p-5 xl:overflow-auto">
          {selectedNodeId === teamHistoryId ? (
            <WorkflowTeamHistory run={run} onPrepareTeamFromSummary={onPrepareTeamFromSummary} />
          ) : selectedNodeId === traceTimelineId ? (
            <WorkflowTraceTimeline
              events={traceEvents}
              filters={traceFilters}
              setTraceFilters={setTraceFilters}
              loadError={traceLoadError}
            />
          ) : selectedNode ? (
            <WorkflowNodeStream node={selectedNode} />
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              <FileText className="mb-3 h-6 w-6" />
              {t('orchestration.noStepOutput')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
