import { useTranslation } from 'react-i18next';

import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../shared/view/ui';
import { Markdown } from '../../chat/view/subcomponents/Markdown';

import { AlertTriangle, Bot, ChevronDown, ChevronRight, Code2, ExternalLink, FileText, MessageSquare } from '@/lib/icons';

type WorkflowArtifact = {
  type: string;
  text?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type WorkflowNodeStreamProps = {
  node: {
    nodeId: string;
    status: string;
    a2aTaskId?: string;
    adapterId?: string;
    agentInstanceId?: string;
    agentLabel?: string;
    assignment?: string;
    stage?: string;
    error?: string;
    outputText?: string;
    messages?: Array<{ role: string; text: string }>;
    artifacts?: WorkflowArtifact[];
  };
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
}

function artifactLabelKey(type: string): string {
  if (type === 'file-diff') return 'orchestration.artifact.fileDiff';
  if (type === 'preview-url') return 'orchestration.artifact.previewUrl';
  if (type === 'command-output') return 'orchestration.artifact.commandOutput';
  return type;
}

function isFinalSummaryNode(nodeId: string): boolean {
  return nodeId === 'final_report' || nodeId.includes('aggregate') || nodeId.includes('review');
}

export default function WorkflowNodeStream({ node }: WorkflowNodeStreamProps) {
  const { t } = useTranslation();
  const agentMessages = (node.messages ?? []).filter((message) => message.role !== 'user');
  const messages = agentMessages.length
    ? agentMessages
    : node.outputText
      ? [{ role: 'agent', text: node.outputText }]
      : [];
  const artifacts = node.artifacts ?? [];
  const summaryText = isFinalSummaryNode(node.nodeId)
    ? node.outputText || messages[messages.length - 1]?.text
    : undefined;
  const stage = node.stage ? t(`orchestration.stages.${node.stage}`, { defaultValue: node.stage }) : undefined;
  const hasFileSummary = artifacts.some((artifact) => artifact.type === 'file-diff');
  const visibleArtifacts: WorkflowArtifact[] = summaryText && !hasFileSummary
    ? [{ type: 'file-diff', text: summaryText }, ...artifacts]
    : artifacts;

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4" />
            <h3 className="truncate text-sm font-semibold">
              {node.agentLabel || t(`orchestration.nodes.${node.nodeId}`, { defaultValue: node.nodeId })}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {stage ? <Badge variant="outline">{stage}</Badge> : null}
            <Badge variant={statusVariant(node.status)}>
              {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
            </Badge>
          </div>
        </div>
        {node.a2aTaskId ? (
          <div className="mt-2 truncate text-xs text-muted-foreground">{node.a2aTaskId}</div>
        ) : null}
        {node.assignment ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground">{t('orchestration.assignment')}</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{node.assignment}</div>
          </div>
        ) : null}
        {node.error ? (
          <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{node.error}</span>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" />
          {t('orchestration.agentMessages')}
        </div>
        <div className="space-y-3 p-4">
          {messages.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('orchestration.noAgentMessages')}
            </div>
          ) : messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                {t(`orchestration.role.${message.role}`, { defaultValue: message.role })}
              </div>
              <Markdown className="orchestration-markdown prose prose-sm max-w-none dark:prose-invert">
                {message.text}
              </Markdown>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {t('orchestration.outputs')}
        </div>
        <div className="space-y-3 p-4">
          {visibleArtifacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('orchestration.noOutputs')}
            </div>
          ) : visibleArtifacts.map((artifact, index) => {
            const previewUrl = typeof artifact.data?.proxiedUrl === 'string' ? artifact.data.proxiedUrl : undefined;
            const isCollapsedByDefault = artifact.type === 'command-output' || artifact.type === 'data';
            const body = artifact.text
              ? artifact.text
              : artifact.data
                ? JSON.stringify(artifact.data, null, 2)
                : '';

            return (
              <Collapsible key={`${artifact.type}-${index}`} defaultOpen={!isCollapsedByDefault}>
                <article className="overflow-hidden rounded-md border border-border/70">
                  <div className="flex items-center justify-between gap-2 bg-muted/20 px-3 py-2">
                    <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium">
                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:hidden" />
                      <ChevronDown className="hidden h-4 w-4 shrink-0 transition-transform group-data-[state=open]:block" />
                      {artifact.type === 'preview-url' ? <ExternalLink className="h-4 w-4 shrink-0" /> : <Code2 className="h-4 w-4 shrink-0" />}
                      <span className="truncate">
                        {t(artifactLabelKey(artifact.type), { defaultValue: artifact.type })}
                      </span>
                    </CollapsibleTrigger>
                  {previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {t('orchestration.open')}
                    </a>
                  ) : null}
                  </div>
                  <CollapsibleContent>
                    {body ? (
                      artifact.type === 'file-diff' ? (
                        <div className="p-3">
                          <Markdown className="orchestration-markdown prose prose-sm max-w-none dark:prose-invert">
                            {body}
                          </Markdown>
                        </div>
                      ) : (
                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted/40 p-3 font-mono text-xs leading-5">
                          {body}
                        </pre>
                      )
                    ) : null}
                  </CollapsibleContent>
                </article>
              </Collapsible>
            );
          })}
        </div>
      </section>
    </div>
  );
}
