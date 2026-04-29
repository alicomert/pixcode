import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle, Bot, Clock, FileText, Workflow } from '@/lib/icons';
import { Badge, Button } from '../../../shared/view/ui';
import { authenticatedFetch } from '../../../utils/api';
import WorkflowNodeStream from './WorkflowNodeStream';

type WorkflowNodeRun = {
  nodeId: string;
  adapterId?: string;
  agentInstanceId?: string;
  agentLabel?: string;
  assignment?: string;
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
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
}

function duration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt) return '';
  const end = finishedAt ?? Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

export default function WorkflowRunPanel({ runId }: WorkflowRunPanelProps) {
  const { t } = useTranslation();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
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
      setSelectedNodeId((current) => current || nextRun.nodeRuns[0]?.nodeId);
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [runId]);

  const selectedNode = useMemo(
    () => run?.nodeRuns.find((node) => node.nodeId === selectedNodeId) ?? run?.nodeRuns[0],
    [run, selectedNodeId],
  );

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
    <div className="flex h-full min-h-0 flex-col">
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            {duration(run.startedAt, run.finishedAt)}
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

      <div className="grid min-h-0 flex-1 xl:grid-cols-[280px_1fr]">
        <nav className="min-h-0 overflow-auto border-b border-border p-3 xl:border-b-0 xl:border-r">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            {t('orchestration.agentSteps')}
          </div>
          <div className="space-y-2">
            {run.nodeRuns.map((node) => (
              <Button
                key={node.nodeId}
                type="button"
                variant={selectedNode?.nodeId === node.nodeId ? 'secondary' : 'ghost'}
                className="h-auto w-full justify-start px-3 py-2"
                onClick={() => setSelectedNodeId(node.nodeId)}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId })}
                </span>
                <Badge variant={statusVariant(node.status)}>
                  {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
                </Badge>
              </Button>
            ))}
          </div>
        </nav>

        <div className="min-h-0 overflow-auto p-4 md:p-5">
          {selectedNode ? (
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
