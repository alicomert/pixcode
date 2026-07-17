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
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  SendHorizonalIcon,
  Sparkles,
  Trash2,
  X,
} from '@/lib/icons';

import { usePixBot, useTaskMeta, useTasks } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';
import { api } from '../../utils/api';

import type {
  AgentType,
  BotMessage,
  BotPlan,
  BotProposal,
  Task,
  TaskStatus,
  WorkspaceOption,
} from './types';
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
          'max-w-[min(100%,48rem)] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function PlanCard({ plan }: { plan: BotPlan }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{plan.title}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {plan.steps?.length || 0} steps · {plan.autonomyLevel || 'supervised'} · {formatDate(plan.updatedAt || plan.createdAt)}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {plan.status}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {(plan.steps || []).slice(0, 6).map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono text-[10px] text-primary">{step.id}</span>
            <span className="truncate">{step.title}</span>
            <span className="ml-auto shrink-0 font-medium">{step.status || 'pending'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProposalCard({
  proposal,
  busy,
  onApprove,
  onReject,
}: {
  proposal: BotProposal;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const stepCount = proposal.planSteps?.length || 0;
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{proposal.title}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {proposal.kind === 'plan' && (
              <>Plan · {stepCount} step{stepCount === 1 ? '' : 's'} · {proposal.autonomyLevel || 'supervised'}</>
            )}
            {proposal.kind === 'cron' && (
              <>
                Schedule ·
                {' '}
                <code className="rounded bg-muted px-1">{proposal.cronExpression || proposal.recurrence}</code>
                {' · '}
                {proposal.autonomyLevel || 'supervised'}
              </>
            )}
            {proposal.kind === 'task' && (
              <>Task · {proposal.agentType} · {proposal.role || 'fullstack'}</>
            )}
          </div>
          {proposal.kind === 'plan' && proposal.planSteps && proposal.planSteps.length > 0 && (
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-border/60 pt-2">
              {proposal.planSteps.map((step) => (
                <li key={step.id} className="text-[11px] leading-4 text-muted-foreground">
                  <span className="font-mono text-primary">{step.id}</span>
                  {' '}
                  {step.title}
                  <span className="text-muted-foreground/80">
                    {' '}
                    ·
                    {step.agentType || step.assignedProvider}
                    {step.dependsOn?.length ? ` · after ${step.dependsOn.join(',')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TasksPage({
  projectId: initialProjectId,
  projectLabel: initialProjectLabel,
  projects = [],
  onBindProject,
  onExit,
  fullScreen = false,
}: {
  projectId?: string;
  projectLabel?: string;
  projects?: WorkspaceOption[];
  onBindProject?: (project: WorkspaceOption) => void;
  onExit?: () => void;
  fullScreen?: boolean;
}) {
  const { t } = useTranslation('common');
  const [boundProjectId, setBoundProjectId] = useState<string | undefined>(initialProjectId);
  const [boundLabel, setBoundLabel] = useState<string | undefined>(initialProjectLabel);

  useEffect(() => {
    setBoundProjectId(initialProjectId);
    setBoundLabel(initialProjectLabel);
  }, [initialProjectId, initialProjectLabel]);

  const projectId = boundProjectId;
  const projectLabel = boundLabel;

  const [workspaceList, setWorkspaceList] = useState<WorkspaceOption[]>(projects);

  useEffect(() => {
    if (projects.length > 0) {
      setWorkspaceList(projects);
      return;
    }
    let cancelled = false;
    void api.projects()
      .then(async (response: Response) => {
        if (!response.ok) return;
        const list = await response.json();
        if (cancelled || !Array.isArray(list)) return;
        setWorkspaceList(list.map((entry: { name?: string; displayName?: string; fullPath?: string; path?: string }) => ({
          id: entry.name || '',
          name: entry.name || '',
          label: entry.displayName || entry.name || '',
          path: entry.fullPath || entry.path,
        })).filter((entry) => entry.id));
      })
      .catch(() => {
        // bind screen still usable if empty
      });
    return () => { cancelled = true; };
  }, [projects]);

  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
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
    plans,
    loading: botLoading,
    sending,
    error: botError,
    sendMessage,
    approveProposal,
    rejectProposal,
    toggleCron,
    runCronNow,
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
  const [mobilePane, setMobilePane] = useState<'chat' | 'ops'>('chat');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const activeTasks = useMemo(() => tasks.filter(isActiveTask), [tasks]);
  const recentTasks = useMemo(
    () => tasks.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 12),
    [tasks],
  );
  const runningPlans = useMemo(() => plans.filter((plan) => plan.status === 'running' || plan.status === 'approved'), [plans]);

  const bindProject = (project: WorkspaceOption) => {
    setBoundProjectId(project.id || project.name);
    setBoundLabel(project.label || project.name);
    onBindProject?.(project);
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

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !projectId || sending) return;
    setDraft('');
    try {
      await sendMessage(text, { agentType });
      await refreshTasks();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-background text-foreground'
    : 'flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground';

  // ── Project bind gate ──────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className={shellClass}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/15 via-background to-violet-500/10 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">PixBot</h1>
              <p className="text-xs text-muted-foreground">Full-screen autonomous planner · bind a workspace to start</p>
            </div>
          </div>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Exit
            </button>
          )}
        </header>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
          <div className="rounded-3xl border border-border bg-card/50 p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-6 w-6 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Bind a workspace</h2>
                <p className="text-sm text-muted-foreground">
                  PixBot runs CLIs only inside a project. Pick one, then chat to build multi-step plans and schedules.
                </p>
              </div>
            </div>
            <div className="mt-6 max-h-[50vh] space-y-2 overflow-y-auto">
              {workspaceList.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No projects found. Open a project in Pixcode first, then return to PixBot.
                </p>
              ) : workspaceList.map((project) => (
                <button
                  key={project.id || project.name}
                  type="button"
                  onClick={() => bindProject(project)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{project.label || project.name}</div>
                    {project.path && (
                      <div className="truncate text-[11px] text-muted-foreground">{project.path}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/10 via-background to-violet-500/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">PixBot</h1>
            <p className="truncate text-xs text-muted-foreground">
              {t('taskSystem.workspaceSubtitle', {
                project: projectLabel || projectId,
                defaultValue: 'Pixcode × NanoClaw-lite · schedules & agents for {{project}}',
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-xl border border-border p-0.5 text-xs sm:flex md:hidden">
            <button
              type="button"
              onClick={() => setMobilePane('chat')}
              className={cn('rounded-lg px-2.5 py-1.5', mobilePane === 'chat' && 'bg-primary text-primary-foreground')}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('ops')}
              className={cn('rounded-lg px-2.5 py-1.5', mobilePane === 'ops' && 'bg-primary text-primary-foreground')}
            >
              Ops
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setBoundProjectId(undefined);
              setBoundLabel(undefined);
            }}
            className="hidden h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:bg-muted sm:inline-flex"
            title="Change workspace"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Workspace
          </button>
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
            onClick={() => void runAction('new-chat', () => startNewChat())}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
              title="Exit PixBot"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

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

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Conversations */}
        <aside className={cn(
          'min-h-0 flex-col border-r border-border bg-muted/10',
          'hidden lg:flex',
          mobilePane === 'chat' ? 'max-lg:hidden' : 'max-lg:hidden',
        )}
        >
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
        <section className={cn(
          'flex min-h-0 min-w-0 flex-col',
          mobilePane === 'ops' && 'max-lg:hidden',
        )}
        >
          <div ref={scrollerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {botLoading && messages.length === 0 ? (
              <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading PixBot…
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Chat with PixBot"
                body="Describe multi-step work. I draft an auto-plan (CLI + dependsOn). Approve to run. Mention “every day at 9…” for schedules · “auto” for unattended."
              />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                PixBot is drafting a plan…
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-card/40 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Default CLI</label>
              <select
                value={agentType}
                onChange={(event) => setAgentType(event.target.value as AgentType)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
              >
                {(agents.length ? agents : [
                  { value: 'opencode', label: 'OpenCode' },
                  { value: 'claude-code', label: 'Claude Code' },
                  { value: 'codex', label: 'Codex' },
                  { value: 'cursor', label: 'Cursor' },
                  { value: 'gemini', label: 'Gemini' },
                  { value: 'qwen', label: 'Qwen' },
                ] as const).map((agent) => (
                  <option key={agent.value} value={agent.value}>{agent.label}</option>
                ))}
              </select>
              {activeTasks.length > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {activeTasks.length} running
                </span>
              )}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder="Describe work or a schedule… (Shift+Enter for newline)"
                className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 focus:ring-2"
              />
              <button
                type="button"
                disabled={!draft.trim() || sending}
                onClick={() => void handleSend()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonalIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* Ops rail */}
        <aside className={cn(
          'min-h-0 flex-col overflow-y-auto border-l border-border bg-muted/5',
          'lg:flex',
          mobilePane === 'chat' ? 'hidden max-lg:hidden' : 'flex',
          'max-lg:border-l-0',
        )}
        >
          <div className="space-y-4 p-3 sm:p-4">
            <section>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Awaiting approval
              </div>
              {proposals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending plans or schedules.</p>
              ) : (
                <div className="space-y-2">
                  {proposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      busy={busyId === proposal.id}
                      onApprove={() => void runAction(proposal.id, () => approveProposal(proposal.id))}
                      onReject={() => void runAction(proposal.id, () => rejectProposal(proposal.id))}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Active plans
              </div>
              {runningPlans.length === 0 ? (
                <p className="text-xs text-muted-foreground">No running plans.</p>
              ) : (
                <div className="space-y-2">
                  {runningPlans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Schedules
              </div>
              {crons.length === 0 ? (
                <p className="text-xs text-muted-foreground">No schedules. Ask PixBot to run something daily/hourly.</p>
              ) : (
                <div className="space-y-2">
                  {crons.map((cron) => (
                    <div key={cron.id} className="rounded-xl border border-border bg-card/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{cron.title}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {cron.cronExpression || cron.recurrence}
                            {' · '}
                            {cron.autonomyLevel || 'supervised'}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            next {formatDate(cron.nextRunAt)}
                          </div>
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          cron.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
                        )}
                        >
                          {cron.enabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === cron.id}
                          onClick={() => void runAction(cron.id, () => toggleCron(cron.id))}
                          className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-muted"
                        >
                          {cron.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `run-${cron.id}`}
                          onClick={() => void runAction(`run-${cron.id}`, () => runCronNow(cron.id))}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-muted"
                        >
                          <Play className="h-3 w-3" />
                          Run now
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `del-${cron.id}`}
                          onClick={() => void runAction(`del-${cron.id}`, () => deleteCron(cron.id))}
                          className="rounded-lg border border-border px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5" />
                Jobs
              </div>
              {recentTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No jobs yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="flex w-full items-start gap-2 rounded-xl border border-border/80 bg-card/40 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/5"
                    >
                      <span className={cn('mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', STATUS_STYLE[task.status])}>
                        {task.status}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{task.title}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {task.agentType}
                          {task.planStepId ? ` · ${task.planStepId}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          getLogs={getTaskLogs}
          getInteractions={getTaskInteractions}
          answerInteraction={async (interactionId, answer) => {
            await answerInteraction(interactionId, answer);
          }}
          onFollowUp={() => {
            setDraft((current) => (current.trim()
              ? current
              : `Follow up on failed/completed job: ${selectedTask.title}`));
            setSelectedTask(null);
            setMobilePane('chat');
          }}
        />
      )}
    </div>
  );
}
