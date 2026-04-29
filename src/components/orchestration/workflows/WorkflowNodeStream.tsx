import { AlertTriangle, Bot, Code2, ExternalLink, FileText, MessageSquare } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/view/ui';

type WorkflowNodeStreamProps = {
  node: {
    nodeId: string;
    status: string;
    a2aTaskId?: string;
    adapterId?: string;
    agentInstanceId?: string;
    agentLabel?: string;
    assignment?: string;
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
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'canceled') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
}

export default function WorkflowNodeStream({ node }: WorkflowNodeStreamProps) {
  const { t } = useTranslation();
  const messages = node.messages?.length
    ? node.messages
    : node.outputText
      ? [{ role: 'agent', text: node.outputText }]
      : [];
  const artifacts = node.artifacts ?? [];

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
          <Badge variant={statusVariant(node.status)}>
            {t(`orchestration.status.${node.status}`, { defaultValue: node.status })}
          </Badge>
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
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">{message.text}</pre>
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
          {artifacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('orchestration.noOutputs')}
            </div>
          ) : artifacts.map((artifact, index) => {
            const previewUrl = typeof artifact.data?.proxiedUrl === 'string' ? artifact.data.proxiedUrl : undefined;
            return (
              <article key={`${artifact.type}-${index}`} className="rounded-md border border-border/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {artifact.type === 'preview-url' ? <ExternalLink className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                    {t(
                      artifact.type === 'file-diff'
                        ? 'orchestration.artifact.fileDiff'
                        : artifact.type === 'preview-url'
                          ? 'orchestration.artifact.previewUrl'
                          : artifact.type === 'command-output'
                            ? 'orchestration.artifact.commandOutput'
                            : artifact.type,
                      { defaultValue: artifact.type },
                    )}
                  </div>
                  {previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {t('orchestration.open')}
                    </a>
                  ) : null}
                </div>
                {artifact.text ? (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs leading-5">
                    {artifact.text}
                  </pre>
                ) : artifact.data ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs leading-5">
                    {JSON.stringify(artifact.data, null, 2)}
                  </pre>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
