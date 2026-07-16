import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from '@/lib/icons';

import { useTasks } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';

import type { Task, TaskStatus } from './types';
import { TaskCreateDialog } from './TaskCreateDialog';
import { TaskDetail } from './TaskDetail';

type Filter = TaskStatus | 'all' | 'active';

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

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function TasksPage({ projectId }: { projectId?: string }) {
  const { t } = useTranslation('common');
  const {
    tasks,
    loading,
    error,
    createTask,
    cancelTask,
    deleteTask,
    getTaskLogs,
    getTaskInteractions,
    answerInteraction,
    refresh,
  } = useTasks(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [followUpTask, setFollowUpTask] = useState<Task | null>(null);

  const activeCount = tasks.filter(isActiveTask).length;
  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const attentionCount = tasks.filter((task) => task.status === 'AWAITING_INPUT' || task.status === 'FAILED').length;

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesFilter = filter === 'all'
        || (filter === 'active' ? isActiveTask(task) : task.status === filter);
      const matchesQuery = !normalizedQuery
        || task.title.toLowerCase().includes(normalizedQuery)
        || task.prompt.toLowerCase().includes(normalizedQuery)
        || task.agentType.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, tasks]);

  const runAction = async (taskId: string, action: () => Promise<void>) => {
    setBusyTaskId(taskId);
    setActionError(null);
    try {
      await action();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="relative shrink-0 overflow-hidden border-b border-border bg-gradient-to-r from-primary/10 via-background to-amber-500/10 px-4 py-5 sm:px-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">{t('taskSystem.title', { defaultValue: 'Agent Tasks' })}</h1>
                <p className="text-xs text-muted-foreground">
                  {projectId
                    ? t('taskSystem.workspaceSubtitle', { project: projectId, defaultValue: 'Background CLI work for {{project}}' })
                    : t('taskSystem.allSubtitle', { defaultValue: 'Run and review work across every workspace' })}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Metric label={t('taskSystem.metrics.active', { defaultValue: 'Active' })} value={activeCount} icon={Sparkles} tone="primary" />
            <Metric label={t('taskSystem.metrics.completed', { defaultValue: 'Done' })} value={completedCount} icon={CheckCircle} tone="success" />
            <Metric label={t('taskSystem.metrics.attention', { defaultValue: 'Attention' })} value={attentionCount} icon={AlertCircle} tone="warning" />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {(['all', 'active', 'AWAITING_INPUT', 'COMPLETED', 'FAILED'] as Filter[]).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFilter(entry)}
              className={cn(
                'h-8 shrink-0 rounded-lg border px-3 text-xs font-medium transition',
                filter === entry
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
              )}
            >
              {entry === 'all'
                ? t('taskSystem.filters.all', { defaultValue: 'All' })
                : entry === 'active'
                  ? t('taskSystem.filters.active', { defaultValue: 'Active' })
                  : t(`taskSystem.status.${entry.toLowerCase()}`, { defaultValue: entry.replace('_', ' ') })}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('taskSystem.search', { defaultValue: 'Search tasks' })}
              className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
          </label>
          <button type="button" onClick={() => void refresh(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" title={t('buttons.refresh')}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={!projectId}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            title={!projectId ? t('taskSystem.selectWorkspace', { defaultValue: 'Select a workspace to create a task' }) : undefined}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('taskSystem.newTask', { defaultValue: 'New task' })}</span>
          </button>
        </div>
      </div>

      {(error || actionError) && (
        <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6">
          <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{actionError || error}</span></div>
          {actionError && <button type="button" onClick={() => setActionError(null)}><X className="h-4 w-4" /></button>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && tasks.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('taskSystem.loading', { defaultValue: 'Loading tasks...' })}</div>
        ) : filteredTasks.length === 0 ? (
          <div className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-gradient-to-b from-muted/35 to-background p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Bot className="h-7 w-7" /></div>
            <h2 className="text-base font-semibold">{tasks.length === 0 ? t('taskSystem.empty.title', { defaultValue: 'Hand off your first task' }) : t('taskSystem.empty.filtered', { defaultValue: 'No tasks match this view' })}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {tasks.length === 0
                ? t('taskSystem.empty.description', { defaultValue: 'Choose Claude Code, Codex, OpenCode, Gemini, Qwen, or Cursor. Pixcode runs the configured CLI in this workspace and keeps the transcript here.' })
                : t('taskSystem.empty.adjust', { defaultValue: 'Change the filter or search phrase to see more work.' })}
            </p>
            {projectId && tasks.length === 0 && <button type="button" onClick={() => setShowCreate(true)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Sparkles className="h-4 w-4" />{t('taskSystem.newTask', { defaultValue: 'New task' })}</button>}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredTasks.map((task) => (
              <article key={task.id} className="group flex min-h-56 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
                <button type="button" onClick={() => setSelectedTask(task)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', STATUS_STYLE[task.status])}>
                      {(task.status === 'RUNNING' || task.status === 'AWAITING_INPUT') && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                      {t(`taskSystem.status.${task.status.toLowerCase()}`, { defaultValue: task.status.replace('_', ' ') })}
                    </span>
                    <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">{task.priority}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{task.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{task.error || task.summary || task.prompt}</p>
                </button>

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{task.agentType}{task.model ? ` · ${task.model}` : ''}</span>
                  {task.scheduledAt && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(task.scheduledAt)}</span>}
                  {!task.scheduledAt && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(task.createdAt)}</span>}
                  {task.recurrence && task.recurrence !== 'none' && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">{task.recurrence}</span>}
                </div>

                <div className="mt-3 flex items-center justify-end gap-1">
                  {isActiveTask(task) && (
                    <button type="button" disabled={busyTaskId === task.id} onClick={() => void runAction(task.id, () => cancelTask(task.id))} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50">
                      {t('taskSystem.cancel', { defaultValue: 'Cancel' })}
                    </button>
                  )}
                  {!isActiveTask(task) && (
                    <button type="button" disabled={busyTaskId === task.id} onClick={() => void runAction(task.id, () => deleteTask(task.id))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label={t('buttons.delete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showCreate && projectId && !followUpTask && (
        <TaskCreateDialog
          projectId={projectId}
          onClose={() => {
            setShowCreate(false);
            setFollowUpTask(null);
          }}
          onCreate={async (input) => { await createTask(input); }}
        />
      )}
      {selectedTask && (
        <TaskDetail
          task={tasks.find((task) => task.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
          getLogs={getTaskLogs}
          getInteractions={getTaskInteractions}
          answerInteraction={answerInteraction}
          onFollowUp={() => {
            setFollowUpTask(selectedTask);
            setSelectedTask(null);
            setShowCreate(true);
          }}
        />
      )}
      {showCreate && projectId && followUpTask && (
        <TaskCreateDialog
          projectId={projectId}
          predecessorId={followUpTask.id}
          predecessorTitle={followUpTask.title}
          onClose={() => {
            setShowCreate(false);
            setFollowUpTask(null);
          }}
          onCreate={async (input) => { await createTask(input); }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Sparkles; tone: 'primary' | 'success' | 'warning' }) {
  return (
    <div className="min-w-24 rounded-xl border border-border bg-background/75 px-3 py-2 shadow-sm backdrop-blur">
      <div className={cn('flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider', tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-primary')}><Icon className="h-3 w-3" />{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-none text-foreground">{value}</div>
    </div>
  );
}
