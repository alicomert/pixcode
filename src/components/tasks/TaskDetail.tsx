import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Bot, Clock, FileText, Loader2, MessageSquare, RefreshCw, Sparkles, X } from '@/lib/icons';

import { cn } from '../../lib/utils';

import type { Task, TaskInteraction, TaskLog } from './types';

type TaskDetailProps = {
  task: Task;
  onClose: () => void;
  getLogs: (taskId: string) => Promise<TaskLog[]>;
  getInteractions: (taskId: string) => Promise<TaskInteraction[]>;
  answerInteraction: (interactionId: string, answer: string) => Promise<void>;
  onFollowUp: () => void;
};

export function TaskDetail({ task, onClose, getLogs, getInteractions, answerInteraction, onFollowUp }: TaskDetailProps) {
  const { t } = useTranslation('common');
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [interactions, setInteractions] = useState<TaskInteraction[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextLogs, nextInteractions] = await Promise.all([getLogs(task.id), getInteractions(task.id)]);
      setLogs(nextLogs);
      setInteractions(nextInteractions);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  }, [getInteractions, getLogs, task.id]);

  useEffect(() => {
    void refresh();
    const active = task.status === 'RUNNING' || task.status === 'AWAITING_INPUT' || task.status === 'QUEUED';
    if (!active) return undefined;
    const intervalId = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(intervalId);
  }, [refresh, task.status]);

  const sendAnswer = async (interactionId: string, explicitAnswer?: string) => {
    const answer = explicitAnswer || answers[interactionId];
    if (!answer?.trim()) return;
    try {
      await answerInteraction(interactionId, answer.trim());
      setAnswers((current) => ({ ...current, [interactionId]: '' }));
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-gradient-to-r from-primary/8 via-background to-amber-500/8 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="rounded-full border border-border bg-card px-2 py-1">{task.status.replace('_', ' ')}</span>
              <span>{task.agentType}{task.model ? ` · ${task.model}` : ''}</span>
            </div>
            <h2 className="mt-2 truncate text-lg font-semibold text-foreground">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          <div className="space-y-5 p-5 lg:overflow-y-auto">
            {error && <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" />{t('taskSystem.detail.instructions', { defaultValue: 'Instructions' })}</div>
              <div className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 text-sm leading-6 text-foreground">{task.prompt}</div>
            </section>

            {(task.summary || task.result || task.error) && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />{t('taskSystem.detail.result', { defaultValue: 'Agent result' })}</div>
                <div className={cn('whitespace-pre-wrap rounded-2xl border p-4 text-sm leading-6', task.error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-emerald-500/20 bg-emerald-500/5 text-foreground')}>{task.error || task.result || task.summary}</div>
              </section>
            )}

            {interactions.map((interaction) => (
              <section key={interaction.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
                <div className="text-sm font-medium text-foreground">{interaction.question}</div>
                {interaction.options && interaction.options.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {interaction.options.map((option) => <button type="button" key={option} onClick={() => void sendAnswer(interaction.id, option)} className="rounded-lg border border-amber-500/30 bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-amber-500/10">{option}</button>)}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <input value={answers[interaction.id] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [interaction.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') void sendAnswer(interaction.id); }} placeholder={t('taskSystem.detail.answerPlaceholder', { defaultValue: 'Reply to the agent' })} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-amber-500/50" />
                  <button type="button" onClick={() => void sendAnswer(interaction.id)} className="rounded-xl bg-amber-500 px-4 text-sm font-semibold text-black">{t('buttons.submit')}</button>
                </div>
              </section>
            ))}

            {task.changedFiles && task.changedFiles.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="h-3.5 w-3.5" />{t('taskSystem.detail.changedFiles', { defaultValue: 'Changed files' })}</div>
                <div className="rounded-2xl border border-border bg-card p-2 font-mono text-xs">{task.changedFiles.map((file) => <div key={file} className="rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{file}</div>)}</div>
              </section>
            )}
          </div>

          <aside className="flex min-h-80 flex-col border-t border-border bg-muted/15 lg:min-h-0 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Bot className="h-3.5 w-3.5" />{t('taskSystem.detail.activity', { defaultValue: 'Activity' })}</div>
              <button type="button" onClick={() => void refresh()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 font-mono text-xs">
              {loading && logs.length === 0 ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('status.loading')}</div> : logs.length === 0 ? <div className="py-12 text-center text-muted-foreground">{t('taskSystem.detail.noActivity', { defaultValue: 'No activity yet' })}</div> : logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider"><span className={log.level === 'error' ? 'text-destructive' : log.level === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}>{log.level}</span><span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{new Date(log.timestamp).toLocaleTimeString()}</span></div>
                  <div className="mt-1.5 whitespace-pre-wrap break-words leading-5 text-foreground/85">{log.message}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-background p-4">
          <button type="button" onClick={onClose} className="h-9 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">{t('buttons.close')}</button>
          <button type="button" onClick={onFollowUp} className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Sparkles className="h-4 w-4" />{t('taskSystem.detail.followUp', { defaultValue: 'Create follow-up' })}</button>
        </div>
      </div>
    </div>
  );
}
