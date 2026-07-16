import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Bot, Calendar, Clock, Loader2, Sparkles, X } from '@/lib/icons';

import type { LLMProvider } from '../../types/app';
import { useProviderModels } from '../../hooks/useProviderModels';
import { useTaskMeta } from '../../hooks/useTasks';
import type { CreateTaskInput } from '../../hooks/useTasks';

import type { AgentInfo, AgentType, TaskPriority, TaskRecurrence, TaskRole } from './types';

type TaskCreateDialogProps = {
  projectId: string;
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
};

const FALLBACK_AGENTS: AgentInfo[] = [
  { value: 'claude-code' as AgentType, label: 'Claude Code', provider: 'claude' },
  { value: 'codex' as AgentType, label: 'OpenAI Codex', provider: 'codex' },
  { value: 'cursor' as AgentType, label: 'Cursor CLI', provider: 'cursor' },
  { value: 'gemini' as AgentType, label: 'Gemini CLI', provider: 'gemini' },
  { value: 'qwen' as AgentType, label: 'Qwen Code', provider: 'qwen' },
  { value: 'opencode' as AgentType, label: 'OpenCode', provider: 'opencode' },
];

export function TaskCreateDialog({
  projectId,
  onClose,
  onCreate,
  predecessorTitle,
  predecessorId,
}: TaskCreateDialogProps) {
  const { t } = useTranslation('common');
  const { roles, agents } = useTaskMeta();
  const storedAgent = typeof window !== 'undefined'
    ? window.localStorage.getItem('selected-provider')
    : null;
  const defaultAgent: AgentType = storedAgent === 'claude'
    ? 'claude-code'
    : FALLBACK_AGENTS.some((agent) => agent.value === storedAgent)
      ? storedAgent as AgentType
      : 'opencode';

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentType, setAgentType] = useState<AgentType>(defaultAgent);
  const [model, setModel] = useState('');
  const [role, setRole] = useState<TaskRole>('fullstack');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [permissionMode, setPermissionMode] = useState('acceptEdits');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [continueSession, setContinueSession] = useState(Boolean(predecessorId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = AGENT_PROVIDER[agentType];
  const { models, loading: modelsLoading } = useProviderModels(provider, []);
  const visibleAgents = agents.length > 0 ? agents : FALLBACK_AGENTS;
  const visibleRoles = roles.length > 0 ? roles : [
    { value: 'fullstack' as TaskRole, label: 'Full stack', description: '', defaultAgent: 'opencode' as AgentType },
    { value: 'backend' as TaskRole, label: 'Backend', description: '', defaultAgent: 'codex' as AgentType },
    { value: 'frontend' as TaskRole, label: 'Frontend', description: '', defaultAgent: 'claude-code' as AgentType },
    { value: 'reviewer' as TaskRole, label: 'Reviewer', description: '', defaultAgent: 'codex' as AgentType },
    { value: 'tester' as TaskRole, label: 'Tester', description: '', defaultAgent: 'gemini' as AgentType },
    { value: 'custom' as TaskRole, label: 'Custom', description: '', defaultAgent: 'opencode' as AgentType },
  ];

  const freeModels = useMemo(() => models.filter((entry) => entry.free), [models]);

  useEffect(() => {
    setModel('');
  }, [provider]);

  const submit = async () => {
    if (!projectId || !title.trim() || !prompt.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate({
        projectId,
        title: title.trim(),
        prompt: prompt.trim(),
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-border bg-gradient-to-r from-primary/10 via-background to-amber-500/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('taskSystem.create.title', { defaultValue: 'Create an agent task' })}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {projectId || t('taskSystem.create.projectRequired', { defaultValue: 'Select a workspace first' })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t('buttons.close')}>
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

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">{t('taskSystem.create.taskTitle', { defaultValue: 'Task title' })}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('taskSystem.create.taskTitlePlaceholder', { defaultValue: 'Fix authentication and verify the flow' })}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                autoFocus
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">{t('taskSystem.create.priority', { defaultValue: 'Priority' })}</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
                <option value="low">{t('taskSystem.priority.low', { defaultValue: 'Low' })}</option>
                <option value="normal">{t('taskSystem.priority.normal', { defaultValue: 'Normal' })}</option>
                <option value="high">{t('taskSystem.priority.high', { defaultValue: 'High' })}</option>
                <option value="urgent">{t('taskSystem.priority.urgent', { defaultValue: 'Urgent' })}</option>
              </select>
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">{t('taskSystem.create.prompt', { defaultValue: 'Instructions' })}</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('taskSystem.create.promptPlaceholder', { defaultValue: 'Describe the outcome, constraints, and checks the agent should run.' })}
              rows={7}
              className="w-full resize-y rounded-xl border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Bot className="h-3.5 w-3.5" />{t('taskSystem.create.agent', { defaultValue: 'CLI agent' })}</span>
              <select value={agentType} onChange={(event) => setAgentType(event.target.value as AgentType)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
                {visibleAgents.map((agent) => (
                  <option key={agent.value} value={agent.value} disabled={agent.installed === false}>
                    {agent.label}{agent.installed === false ? ` - ${t('taskSystem.create.notInstalled', { defaultValue: 'not installed' })}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">{t('taskSystem.create.model', { defaultValue: 'Model' })}</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
                <option value="">{modelsLoading ? t('status.loading') : t('taskSystem.create.modelDefault', { defaultValue: 'Use CLI default' })}</option>
                {freeModels.length > 0 && <optgroup label={t('taskSystem.create.freeModels', { defaultValue: 'Free models' })}>{freeModels.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</optgroup>}
                <optgroup label={t('taskSystem.create.allModels', { defaultValue: 'All models' })}>{models.filter((entry) => !entry.free).map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</optgroup>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">{t('taskSystem.create.role', { defaultValue: 'Work role' })}</span>
              <select value={role} onChange={(event) => setRole(event.target.value as TaskRole)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
                {visibleRoles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">{t('taskSystem.create.permissions', { defaultValue: 'Permissions' })}</span>
              <select value={permissionMode} onChange={(event) => setPermissionMode(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
                <option value="plan">{t('taskSystem.permissions.plan', { defaultValue: 'Plan / read only' })}</option>
                <option value="default">{t('taskSystem.permissions.ask', { defaultValue: 'Ask when needed' })}</option>
                <option value="acceptEdits">{t('taskSystem.permissions.edits', { defaultValue: 'Allow workspace edits' })}</option>
                <option value="bypassPermissions">{t('taskSystem.permissions.bypass', { defaultValue: 'Autonomous (unsafe)' })}</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Calendar className="h-3.5 w-3.5" />{t('taskSystem.create.schedule', { defaultValue: 'Start time' })}</span>
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Clock className="h-3.5 w-3.5" />{t('taskSystem.create.recurrence', { defaultValue: 'Automation' })}</span>
              <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as TaskRecurrence)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none">
                <option value="none">{t('taskSystem.recurrence.none', { defaultValue: 'Run once' })}</option>
                <option value="hourly">{t('taskSystem.recurrence.hourly', { defaultValue: 'Every hour' })}</option>
                <option value="daily">{t('taskSystem.recurrence.daily', { defaultValue: 'Every day' })}</option>
                <option value="weekly">{t('taskSystem.recurrence.weekly', { defaultValue: 'Every week' })}</option>
              </select>
            </label>
          </div>

          {predecessorId && (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground">
              <input type="checkbox" checked={continueSession} onChange={(event) => setContinueSession(event.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>{t('taskSystem.create.continueSession', { defaultValue: 'Continue in the predecessor agent session and workspace context.' })}</span>
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/15 p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">{t('buttons.cancel')}</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!projectId || !title.trim() || !prompt.trim() || creating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? t('taskSystem.create.creating', { defaultValue: 'Creating...' }) : scheduledAt ? t('taskSystem.create.scheduleAction', { defaultValue: 'Schedule task' }) : t('taskSystem.create.action', { defaultValue: 'Create and run' })}
          </button>
        </div>
      </div>
    </div>
  );
}
