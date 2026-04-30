import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '../../../shared/view/ui';
import { authenticatedFetch } from '../../../utils/api';
import { Markdown } from '../../chat/view/subcomponents/Markdown';

import WorkflowNodeStream from './WorkflowNodeStream';

import { AlertTriangle, Bot, Clock, FileText, MessageSquare, SquareIcon, Workflow } from '@/lib/icons';

type WorkflowNodeRun = {
  nodeId: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  assignment?: string;
  stage?: string;
  status: string;
  a2aTaskId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  outputText?: string;
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

type WorkflowRunPanelProps = {
  runId?: string;
  onPrepareTeamFromSummary?: (summary: string) => void;
};

const teamHistoryId = '__team_history__';

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
}

function statusAccentClass(status: string): string {
  if (status === 'completed') return 'border-l-emerald-500 bg-emerald-500/5';
  if (status === 'failed') return 'border-l-red-500 bg-red-500/5';
  if (status === 'canceled') return 'border-l-zinc-400 bg-zinc-500/5';
  if (status === 'running') return 'border-l-sky-500 bg-sky-500/10';
  if (status === 'queued') return 'border-l-amber-500 bg-amber-500/5';
  return 'border-l-border bg-muted/20';
}

function statusDotClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-red-500';
  if (status === 'canceled') return 'bg-zinc-400';
  if (status === 'running') return 'animate-pulse bg-sky-500';
  if (status === 'queued') return 'bg-amber-500';
  return 'bg-muted-foreground';
}

function duration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt) return '';
  const end = finishedAt ?? Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

function nodeMessages(node: WorkflowNodeRun): Array<{ role: string; text: string }> {
  const agentMessages = (node.messages ?? []).filter((message) => message.role !== 'user');
  if (agentMessages.length) return agentMessages;
  if (node.outputText) return [{ role: 'agent', text: node.outputText }];
  return [];
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
    if (!run.nodeRuns.some(hasUsefulOutput)) return undefined;

    const completed = run.nodeRuns.filter((node) => node.status === 'completed').length;
    const failed = run.nodeRuns.filter((node) => node.status === 'failed').length;
    const canceled = run.nodeRuns.filter((node) => node.status === 'canceled').length;
    const changedFiles = run.nodeRuns
      .flatMap((node) => node.artifacts ?? [])
      .filter((artifact) => artifact.type === 'file-diff' && artifact.text?.trim())
      .length;
    const previewCount = run.nodeRuns
      .flatMap((node) => node.artifacts ?? [])
      .filter((artifact) => artifact.type === 'preview-url')
      .length;

    return [
      `### ${t('orchestration.generatedSummaryTitle')}`,
      '',
      `- ${t('orchestration.summaryStatus')}: ${t(`orchestration.status.${run.status}`, { defaultValue: run.status })}`,
      `- ${t('orchestration.summarySteps')}: ${completed}/${run.nodeRuns.length}`,
      failed > 0 ? `- ${t('orchestration.summaryFailures')}: ${failed}` : undefined,
      canceled > 0 ? `- ${t('orchestration.summaryCanceled')}: ${canceled}` : undefined,
      changedFiles > 0 ? `- ${t('orchestration.summaryDiffs')}: ${changedFiles}` : undefined,
      previewCount > 0 ? `- ${t('orchestration.summaryPreviews')}: ${previewCount}` : undefined,
      '',
      `#### ${t('orchestration.agentSteps')}`,
      ...run.nodeRuns.map((node) => {
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
          {run.nodeRuns.map((node) => {
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
        {run.nodeRuns.map((node) => {
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

export default function WorkflowRunPanel({ runId, onPrepareTeamFromSummary }: WorkflowRunPanelProps) {
  const { t } = useTranslation();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(teamHistoryId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setSelectedNodeId(teamHistoryId);
      return undefined;
    }

    const load = async () => {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}`);
      if (!response.ok) {
        setLoadError(t('orchestration.loadFailed'));
        return;
      }
      const nextRun = await response.json() as WorkflowRun;
      setRun(nextRun);
      setLoadError(null);
      setSelectedNodeId((current) => current || teamHistoryId);
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [runId, t]);

  const selectedNode = useMemo(
    () => selectedNodeId === teamHistoryId
      ? undefined
      : run?.nodeRuns.find((node) => node.nodeId === selectedNodeId),
    [run, selectedNodeId],
  );

  const isActiveRun = run?.status === 'queued' || run?.status === 'running';

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
      setLoadError(null);
    } finally {
      setCanceling(false);
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
        {typeof run.metadata?.error === 'string' ? (
          <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{run.metadata.error}</span>
          </div>
        ) : null}
      </header>

      <div className="grid flex-1 xl:min-h-0 xl:grid-cols-[280px_1fr]">
        <nav className="min-h-0 overflow-auto border-b border-border p-3 xl:border-b-0 xl:border-r">
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
            {run.nodeRuns.map((node) => {
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

        <div className="min-h-0 overflow-auto p-4 md:p-5">
          {selectedNodeId === teamHistoryId ? (
            <WorkflowTeamHistory run={run} onPrepareTeamFromSummary={onPrepareTeamFromSummary} />
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
