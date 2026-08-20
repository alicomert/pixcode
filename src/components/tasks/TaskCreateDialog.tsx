import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';


import type { LLMProvider } from '../../types/app';
import { useProviderModels, type ModelEntry } from '../../hooks/useProviderModels';
import { useTaskMeta } from '../../hooks/useTasks';
import type { CreateTaskInput } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';

import type { AgentInfo, AgentType, TaskPriority, TaskRecurrence, TaskRole } from './types';

import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from '@/lib/icons';

type TaskCreateDialogProps = {
  projectId: string;
  projectLabel?: string;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void>;
  predecessorTitle?: string;
  predecessorId?: string;
};

const AGENT_PROVIDER: Record<AgentType, LLMProvider> = {
  'claude-code': 'claude',
  cursor: 'cursor',
  codex: 'codex',
  gemini: 'gemini',
  qwen: 'qwen',
  opencode: 'opencode',
  grok: 'claude', // map for auth UI; Grok uses its own CLI install
};

const FALLBACK_AGENTS: AgentInfo[] = [
  { value: 'claude-code', label: 'Claude Code', provider: 'claude' },
  { value: 'codex', label: 'OpenAI Codex', provider: 'codex' },
  { value: 'cursor', label: 'Cursor CLI', provider: 'cursor' },
  { value: 'gemini', label: 'Gemini CLI', provider: 'gemini' },
  { value: 'qwen', label: 'Qwen Code', provider: 'qwen' },
  { value: 'opencode', label: 'OpenCode', provider: 'opencode' },
];

function resolveDefaultAgent(agents: AgentInfo[]): AgentType {
  const stored = typeof window !== 'undefined'
    ? window.localStorage.getItem('selected-provider')
    : null;
  const preferred: AgentType | null = stored === 'claude'
    ? 'claude-code'
    : FALLBACK_AGENTS.some((agent) => agent.value === stored)
      ? (stored as AgentType)
      : null;

  const pool = agents.length > 0 ? agents : FALLBACK_AGENTS;
  const preferredEntry = preferred
    ? pool.find((agent) => agent.value === preferred && agent.installed !== false)
    : null;
  if (preferredEntry) return preferredEntry.value;

  // Prefer OpenCode when installed — free models without login (9router-style free tier).
  const openCode = pool.find((agent) => agent.value === 'opencode' && agent.installed !== false);
  if (openCode) return 'opencode';

  const firstInstalled = pool.find((agent) => agent.installed !== false);
  return firstInstalled?.value || 'opencode';
}

function pickDefaultModel(models: ModelEntry[], provider: LLMProvider): string {
  if (models.length === 0) return '';
  // OpenCode / free-first providers: auto-pick first free model (no auth needed for Zen free).
  const free = models.find((entry) => entry.free);
  if (free) return free.value;
  if (provider === 'opencode') {
    // Even if free flag is missing, prefer labels that look free/zen.
    const zenLike = models.find((entry) => /free|zen/i.test(`${entry.label} ${entry.value}`));
    if (zenLike) return zenLike.value;
  }
  return models[0]?.value || '';
}

export function TaskCreateDialog({
  projectId,
  projectLabel,
  onClose,
  onCreate,
  predecessorTitle,
  predecessorId,
}: TaskCreateDialogProps) {
  const { t } = useTranslation('common');
  const { roles, agents } = useTaskMeta();
  const visibleAgents = agents.length > 0 ? agents : FALLBACK_AGENTS;

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentType, setAgentType] = useState<AgentType>(() => resolveDefaultAgent([]));
  const [model, setModel] = useState('');
  const [role, setRole] = useState<TaskRole>('fullstack');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [permissionMode, setPermissionMode] = useState('acceptEdits');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [continueSession, setContinueSession] = useState(Boolean(predecessorId));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const creatingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    creatingRef.current = creating;
  }, [creating]);

  // This full-screen task flow is a modal bottom sheet on mobile. Lock the
  // page behind it, keep keyboard focus inside, and restore the trigger on
  // close/unmount.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeElement = document.activeElement;
          if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }

      if (event.key !== 'Escape' || creatingRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[data-task-create-close]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const provider = AGENT_PROVIDER[agentType];
  const { models, loading: modelsLoading, error: modelsError, refresh: refreshModels } = useProviderModels(provider, []);

  const freeModels = useMemo(() => models.filter((entry) => entry.free), [models]);
  const paidModels = useMemo(() => models.filter((entry) => !entry.free), [models]);

  // Once meta agents load, align default CLI with installed + chat preference.
  useEffect(() => {
    if (agents.length === 0) return;
    setAgentType((current) => {
      const stillValid = agents.some((agent) => agent.value === current && agent.installed !== false);
      return stillValid ? current : resolveDefaultAgent(agents);
    });
  }, [agents]);

  // OpenCode free catalog rotates — force a live refresh when this CLI is selected.
  // Matches 9router-style free tier freshness without waiting on a stale 6h cache.
  useEffect(() => {
    if (provider !== 'opencode') return;
    void refreshModels();
  }, [provider, refreshModels]);

  // When CLI changes or catalog loads: auto-select free / first model.
  useEffect(() => {
    if (modelsLoading) return;
    setModel((current) => {
      if (current && models.some((entry) => entry.value === current)) return current;
      return pickDefaultModel(models, provider);
    });
  }, [models, modelsLoading, provider]);

  const selectedAgent = visibleAgents.find((agent) => agent.value === agentType) || FALLBACK_AGENTS.find((a) => a.value === agentType);
  const canSubmit = Boolean(projectId && prompt.trim() && !creating && selectedAgent?.installed !== false);

  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const trimmedPrompt = prompt.trim();
      const autoTitle = title.trim()
        || trimmedPrompt.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 80)
        || 'Untitled task';
      await onCreate({
        projectId,
        title: autoTitle,
        prompt: trimmedPrompt,
        agentType,
        model: model || undefined,
        role,
        priority,
        permissionMode,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        recurrence,
        continueSession,
        predecessorTaskId: predecessorId,
      });
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixcode-task-create-title"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span id="pixcode-task-create-title">
                {t('taskSystem.create.title', { defaultValue: 'New background task' })}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('taskSystem.create.flowHint', {
                defaultValue: 'Pick a CLI, then a model from that CLI. Free models are preferred when available.',
              })}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {projectLabel || projectId || t('taskSystem.create.projectRequired', { defaultValue: 'Select a workspace first' })}
            </p>
          </div>
          <button type="button" data-task-create-close onClick={onClose} disabled={creating} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50" aria-label={t('buttons.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {predecessorTitle && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
              {t('taskSystem.create.followUp', { defaultValue: 'Follow-up to' })}: <strong>{predecessorTitle}</strong>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1 — CLI */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. {t('taskSystem.create.agent', { defaultValue: 'CLI agent' })}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleAgents.map((agent) => {
                const selected = agentType === agent.value;
                const disabled = agent.installed === false;
                return (
                  <button
                    key={agent.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setAgentType(agent.value)}
                    className={cn(
                      'relative flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition',
                      selected
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40',
                      disabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 text-primary">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      {agent.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {disabled
                        ? t('taskSystem.create.notInstalled', { defaultValue: 'not installed' })
                        : agent.authenticated === false
                          ? t('taskSystem.create.notAuthed', { defaultValue: 'not signed in' })
                          : agent.value === 'opencode'
                            ? t('taskSystem.create.freeReady', { defaultValue: 'free models ready' })
                            : t('taskSystem.create.ready', { defaultValue: 'ready' })}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 — Model from that CLI */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. {t('taskSystem.create.model', { defaultValue: 'Model' })}
                <span className="ml-1.5 font-normal normal-case text-muted-foreground/80">
                  ({selectedAgent?.label || provider})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => void refreshModels()}
                disabled={modelsLoading}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {modelsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {t('buttons.refresh', { defaultValue: 'Refresh' })}
              </button>
            </div>

            {modelsError && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {modelsError}
              </p>
            )}

            {freeModels.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                  <Zap className="h-3 w-3" />
                  {t('taskSystem.create.freeModels', { defaultValue: 'Free models' })}
                  {provider === 'opencode' && (
                    <span className="font-normal text-muted-foreground">
                      — {t('taskSystem.create.opencodeFreeHint', { defaultValue: 'no login required for Zen free' })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {freeModels.map((entry) => {
                    const selected = model === entry.value;
                    return (
                      <button
                        key={entry.value}
                        type="button"
                        onClick={() => setModel(entry.value)}
                        className={cn(
                          'max-w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition',
                          selected
                            ? 'border-teal-500/50 bg-teal-500/15 font-semibold text-teal-800 dark:text-teal-200'
                            : 'border-border bg-card text-foreground hover:border-teal-500/30',
                        )}
                        title={entry.value}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {paidModels.length > 0 && (
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {t('taskSystem.create.allModels', { defaultValue: 'Other models' })}
                </div>
              )}
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none"
              >
                <option value="">
                  {modelsLoading
                    ? t('status.loading')
                    : t('taskSystem.create.modelDefault', { defaultValue: 'Use CLI default' })}
                </option>
                {freeModels.length > 0 && (
                  <optgroup label={t('taskSystem.create.freeModels', { defaultValue: 'Free models' })}>
                    {freeModels.map((entry) => (
                      <option key={`free-${entry.value}`} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {paidModels.length > 0 && (
                  <optgroup label={t('taskSystem.create.allModels', { defaultValue: 'All models' })}>
                    {paidModels.map((entry) => (
                      <option key={`paid-${entry.value}`} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {model && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  {model}
                  {freeModels.some((entry) => entry.value === model) && (
                    <span className="ml-2 rounded-full bg-teal-500/15 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase text-teal-700 dark:text-teal-300">
                      free
                    </span>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* Step 3 — Instructions */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              3. {t('taskSystem.create.prompt', { defaultValue: 'Instructions' })}
            </h3>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('taskSystem.create.promptPlaceholder', {
                defaultValue: 'Describe the outcome, constraints, and checks the agent should run.',
              })}
              rows={6}
              className="w-full resize-y rounded-xl border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              autoFocus
            />
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">
                {t('taskSystem.create.taskTitleOptional', { defaultValue: 'Title (optional — auto from first line)' })}
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('taskSystem.create.taskTitlePlaceholder', { defaultValue: 'Fix authentication and verify the flow' })}
                className="h-9 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none"
              />
            </label>
          </section>

          {/* Advanced */}
          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
            >
              {t('taskSystem.create.advanced', { defaultValue: 'Advanced' })}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition', showAdvanced && 'rotate-180')} />
            </button>
            {showAdvanced && (
              <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{t('taskSystem.create.role', { defaultValue: 'Work role' })}</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as TaskRole)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
                    {(roles.length > 0 ? roles : [
                      { value: 'fullstack' as TaskRole, label: 'Full stack' },
                      { value: 'backend' as TaskRole, label: 'Backend' },
                      { value: 'frontend' as TaskRole, label: 'Frontend' },
                      { value: 'reviewer' as TaskRole, label: 'Reviewer' },
                      { value: 'tester' as TaskRole, label: 'Tester' },
                      { value: 'custom' as TaskRole, label: 'Custom' },
                    ]).map((entry) => (
                      <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{t('taskSystem.create.priority', { defaultValue: 'Priority' })}</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{t('taskSystem.create.permissions', { defaultValue: 'Permissions' })}</span>
                  <select value={permissionMode} onChange={(event) => setPermissionMode(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
                    <option value="plan">Plan / read only</option>
                    <option value="default">Ask when needed</option>
                    <option value="acceptEdits">Allow workspace edits</option>
                    <option value="bypassPermissions">Autonomous (unsafe)</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{t('taskSystem.create.schedule', { defaultValue: 'Start time' })}</span>
                  <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm" />
                </label>
                <label className="space-y-1 text-xs md:col-span-2">
                  <span className="text-muted-foreground">{t('taskSystem.create.recurrence', { defaultValue: 'Automation' })}</span>
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as TaskRecurrence)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
                    <option value="none">Run once</option>
                    <option value="hourly">Every hour</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                  </select>
                </label>
                {predecessorId && (
                  <label className="flex items-start gap-2 text-sm md:col-span-2">
                    <input type="checkbox" checked={continueSession} onChange={(event) => setContinueSession(event.target.checked)} className="mt-0.5" />
                    <span>{t('taskSystem.create.continueSession', { defaultValue: 'Continue in the predecessor agent session.' })}</span>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {selectedAgent?.label || agentType}
            {model ? ` · ${model}` : ` · ${t('taskSystem.create.modelDefault', { defaultValue: 'CLI default' })}`}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
              {t('buttons.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {creating
                ? t('taskSystem.create.creating', { defaultValue: 'Creating...' })
                : scheduledAt
                  ? t('taskSystem.create.scheduleAction', { defaultValue: 'Schedule task' })
                  : t('taskSystem.create.action', { defaultValue: 'Create and run' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
