import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertCircle,
  Bot,
  Calendar,
  Check,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  SendHorizonalIcon,
  Sparkles,
  Trash2,
  X,
} from '@/lib/icons';

import { usePixBot, useTaskMeta, useTasks } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';

import type { AgentType, BotMessage, Task, TaskStatus } from './types';
import { TaskDetail } from './TaskDetail';

const STATUS_STYLE: Record<TaskStatus, string> = {
  PENDING: 'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  QUEUED: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  RUNNING: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  AWAITING_INPUT: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  COMPLETED: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  FAILED: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  CANCELLED: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
};

function isActiveTask(task: Task) {
  return task.status === 'PENDING'
    || task.status === 'QUEUED'
    || task.status === 'RUNNING'
    || task.status === 'AWAITING_INPUT';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MessageBubble({ message }: { message: BotMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card text-foreground',
        )}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-primary" />
            PixBot
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  );
}

export function TasksPage({
  projectId,
  projectLabel,
}: {
  projectId?: string;
  projectLabel?: string;
}) {
  const { t } = useTranslation('common');
  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    cancelTask,
    retryTask,
    deleteTask,
    getTaskLogs,
    getTaskInteractions,
    answerInteraction,
    refresh: refreshTasks,
  } = useTasks(projectId);
  const {
    conversations,
    conversationId,
    setConversationId,
    messages,
    proposals,
    crons,
    loading: botLoading,
    sending,
    error: botError,
    sendMessage,
    approveProposal,
    rejectProposal,
    toggleCron,
    deleteCron,
    startNewChat,
    refresh: refreshBot,
  } = usePixBot(projectId);
  const { agents } = useTaskMeta();

  const [draft, setDraft] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('opencode');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const preferred = agents.find((agent) => agent.value === 'opencode' && agent.installed !== false)
      || agents.find((agent) => agent.installed !== false);
    if (preferred) setAgentType(preferred.value);
  }, [agents]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const activeTasks = useMemo(() => tasks.filter(isActiveTask), [tasks]);
  const recentTasks = useMemo(
    () => tasks.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 12),
    [tasks],
  );

  const onSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!projectId) {
      setActionError(t('taskSystem.selectWorkspace', { defaultValue: 'Select a workspace in the sidebar first.' }));
      return;
    }
    setDraft('');
    setActionError(null);
    try {
      await sendMessage(text, { agentType });
      await refreshTasks();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      await refreshTasks();
      await refreshBot();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/10 via-background to-violet-500/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">PixBot</h1>
            <p className="truncate text-xs text-muted-foreground">
              {projectId
                ? t('taskSystem.workspaceSubtitle', { project: projectLabel || projectId, defaultValue: 'Chat → approve tasks/crons → CLI runs in background for {{project}}' })
                : t('taskSystem.selectWorkspace', { defaultValue: 'Select a workspace, then chat with PixBot' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void refreshTasks(); void refreshBot(); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title={t('buttons.refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', (tasksLoading || botLoading) && 'animate-spin')} />
          </button>
          <button
            type="button"
            disabled={!projectId}
            onClick={() => void runAction('new-chat', () => startNewChat())}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
      </div>

      {(tasksError || botError || actionError) && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{actionError || botError || tasksError}</span>
          </div>
          {actionError && (
            <button type="button" onClick={() => setActionError(null)}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* Conversations */}
        <aside className="hidden min-h-0 flex-col border-r border-border bg-muted/10 lg:flex">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Chats
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No chats yet</p>
            ) : conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void setConversationId(conversation.id)}
                className={cn(
                  'w-full rounded-xl px-3 py-2.5 text-left text-sm transition',
                  conversationId === conversation.id
                    ? 'bg-primary/10 text-foreground ring-1 ring-primary/25'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <div className="line-clamp-2 font-medium leading-5">{conversation.title}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{formatDate(conversation.updatedAt || conversation.createdAt)}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Chat */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div ref={scrollerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {!projectId ? (
              <EmptyState
                title="Pick a workspace"
                body="PixBot runs CLIs inside a workspace. Select one in the sidebar, then describe what you want automated."
              />
            ) : botLoading && messages.length === 0 ? (
              <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading PixBot…
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Chat with PixBot"
                body="Describe a job or schedule. I propose tasks/crons — you approve — CLI agents run in the background and I report when they finish."
                examples={[
                  'Fix login bug with OpenCode free model',
                  'Every day run tests and summarize failures',
                  'status',
                ]}
              />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                PixBot is drafting proposals…
              </div>
            )}
          </div>

          <div className="border-t border-border bg-background/95 p-3 backdrop-blur sm:p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CLI</label>
                <select
                  value={agentType}
                  onChange={(event) => setAgentType(event.target.value as AgentType)}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                >
                  {(agents.length > 0 ? agents : ([
                    { value: 'opencode', label: 'OpenCode', installed: true },
                    { value: 'claude-code', label: 'Claude Code', installed: true },
                    { value: 'codex', label: 'Codex', installed: true },
                    { value: 'gemini', label: 'Gemini', installed: true },
                    { value: 'qwen', label: 'Qwen', installed: true },
                    { value: 'cursor', label: 'Cursor', installed: true },
                  ] as const)).map((agent) => (
                    <option key={agent.value} value={agent.value} disabled={'installed' in agent && agent.installed === false}>
                      {agent.label}{'installed' in agent && agent.installed === false ? ' (missing)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">
                  Approve proposals before anything runs · background CLI survives page close
                </span>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void onSend();
                    }
                  }}
                  rows={2}
                  disabled={!projectId || sending}
                  placeholder={projectId ? 'Message PixBot… (Shift+Enter for newline)' : 'Select a workspace first'}
                  className="min-h-[52px] max-h-40 flex-1 resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none ring-primary/20 transition focus:ring-2 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!projectId || sending || !draft.trim()}
                  onClick={() => void onSend()}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonalIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Side: proposals, runs, crons */}
        <aside className="flex min-h-0 flex-col border-t border-border bg-muted/10 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <Panel title={`Approvals (${proposals.length})`} icon={Sparkles}>
              {proposals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending proposals.</p>
              ) : proposals.map((proposal) => (
                <div key={proposal.id} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {proposal.kind === 'cron' ? `Cron · ${proposal.recurrence}` : 'Task'}
                  </div>
                  <div className="mt-1 text-sm font-medium leading-5">{proposal.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{proposal.agentType} · {proposal.role}</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === proposal.id}
                      onClick={() => void runAction(proposal.id, () => approveProposal(proposal.id))}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 text-xs font-semibold text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === proposal.id}
                      onClick={() => void runAction(proposal.id, () => rejectProposal(proposal.id))}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel title={`Active (${activeTasks.length})`} icon={ClipboardCheck}>
              {activeTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No running jobs.</p>
              ) : activeTasks.map((task) => (
                <TaskChip
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  onOpen={() => setSelectedTask(task)}
                  onCancel={() => void runAction(task.id, () => cancelTask(task.id))}
                />
              ))}
            </Panel>

            <Panel title={`Crons (${crons.length})`} icon={Calendar}>
              {crons.length === 0 ? (
                <p className="text-xs text-muted-foreground">No schedules. Ask PixBot to run something daily/hourly.</p>
              ) : crons.map((cron) => (
                <div key={cron.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{cron.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {cron.enabled ? 'ON' : 'OFF'} · {cron.recurrence} · next {formatDate(cron.nextRunAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void runAction(cron.id, () => deleteCron(cron.id))}
                      aria-label="Delete cron"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAction(cron.id, () => toggleCron(cron.id))}
                    className="mt-2 h-8 w-full rounded-lg border border-border text-xs font-medium hover:bg-muted"
                  >
                    {cron.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </Panel>

            <Panel title="Recent runs" icon={Clock}>
              {recentTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No runs yet.</p>
              ) : recentTasks.map((task) => (
                <TaskChip
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  onOpen={() => setSelectedTask(task)}
                  onCancel={isActiveTask(task) ? () => void runAction(task.id, () => cancelTask(task.id)) : undefined}
                  onRetry={!isActiveTask(task) && task.status === 'FAILED' ? () => void runAction(task.id, () => retryTask(task.id)) : undefined}
                  onDelete={!isActiveTask(task) ? () => void runAction(task.id, () => deleteTask(task.id)) : undefined}
                />
              ))}
            </Panel>
          </div>
        </aside>
      </div>

      {selectedTask && (
        <TaskDetail
          task={tasks.find((task) => task.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
          getLogs={getTaskLogs}
          getInteractions={getTaskInteractions}
          answerInteraction={answerInteraction}
          onFollowUp={() => {
            setSelectedTask(null);
            setDraft(`Follow-up on "${selectedTask.title}": `);
          }}
        />
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: import('react').ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TaskChip({
  task,
  busy,
  onOpen,
  onCancel,
  onRetry,
  onDelete,
}: {
  task: Task;
  busy?: boolean;
  onOpen: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[task.status])}>
          {task.status.replace('_', ' ')}
        </span>
        <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-5">{task.title}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{task.agentType}{task.model ? ` · ${task.model}` : ''}</div>
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
            Cancel
          </button>
        )}
        {onRetry && (
          <button type="button" disabled={busy} onClick={onRetry} className="rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
            Retry
          </button>
        )}
        {onDelete && (
          <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body, examples }: { title: string; body: string; examples?: string[] }) {
  return (
    <div className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-gradient-to-b from-muted/30 to-background p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {examples && examples.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
          {examples.map((example) => (
            <li key={example} className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{example}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
