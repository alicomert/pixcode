import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertCircle,
  Bot,
  ChevronDown,
  FolderOpen,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  SendHorizonalIcon,
  Sparkles,
  Terminal,
  X,
} from '@/lib/icons';

import { Markdown } from '../chat/view/subcomponents/Markdown';
import { usePixBot } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';
import { api, authenticatedFetch } from '../../utils/api';

import {
  AgentSlashBadge,
  composeAgentMessage,
  splitLeadingAgentToken,
  type AgentSlashMeta,
} from './agentSlash';
import { useNanoClawComposerAutocomplete } from './hooks/useNanoClawComposerAutocomplete';
import { PixbotProviderModal } from './PixbotProviderModal';
import type { BotMessage, WorkspaceOption } from './types';

const MODEL_STORAGE_KEY = 'pixbot.selectedModel';

type LlmModel = {
  id: string;
  value?: string;
  label: string;
  providerId?: string;
  providerName?: string;
};

type PixbotProvider = {
  id: string;
  name: string;
  baseUrl: string;
  hasApiKey?: boolean;
  catalogId?: string | null;
  enabled?: boolean;
  system?: boolean;
  modelCount?: number | null;
  lastError?: string | null;
  healthy?: boolean | null;
};

function modelValue(m: LlmModel) {
  return m.value || m.id;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MessageBubble({ message }: { message: BotMessage }) {
  const isUser = message.role === 'user';
  const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
  const model = meta && 'model' in meta ? String(meta.model || '') : '';
  const streaming = Boolean(meta && 'streaming' in meta && meta.streaming);
  const status = meta && 'status' in meta ? String(meta.status || '') : '';
  const mode = meta && 'mode' in meta ? String(meta.mode || '') : '';
  const providerName = meta && ('providerName' in meta || 'provider' in meta)
    ? String((meta as { providerName?: string; provider?: string }).providerName
      || (meta as { provider?: string }).provider || '')
    : '';

  const userSplit = isUser ? splitLeadingAgentToken(message.content) : null;
  const userAgent = userSplit?.meta || null;
  const userBody = userSplit?.rest ?? message.content;

  // Assistant CLI badge from agentType (claude-code → /claude)
  const assistantBadge = !isUser && message.agentType && message.agentType !== 'pixbot'
    ? splitLeadingAgentToken(
      `/${String(message.agentType).replace(/^claude-code$/i, 'claude').replace(/^grok-build$/i, 'grok')} `,
    ).meta
    : null;

  const routeLabel = [
    !assistantBadge && message.agentType && message.agentType !== 'pixbot' ? String(message.agentType) : null,
    !assistantBadge ? providerName : null,
    model && !String(model).includes('::') ? model : (model?.includes('::') ? model.split('::').pop() : null),
    mode === 'cli' && !assistantBadge ? 'CLI' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-[15px] leading-7',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/50 text-foreground',
        )}
      >
        {!isUser && (assistantBadge || routeLabel || streaming) ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
            {assistantBadge ? <AgentSlashBadge meta={assistantBadge} size="sm" /> : null}
            {routeLabel ? <span>{routeLabel}</span> : null}
            {streaming ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status?.startsWith('cli') ? `CLI ${status.replace(/^cli:?/, '') || ''}…`.trim()
                  : status === 'thinking' ? 'düşünüyor…'
                    : status === 'schedule' ? 'zamanlanıyor…'
                      : 'yazıyor…'}
              </span>
            ) : null}
          </div>
        ) : null}
        {isUser ? (
          <div className="space-y-2">
            {userAgent ? (
              <div className={cn(
                // Badge stays readable on primary bubble
                '[&_span]:border-white/30 [&_span]:bg-white/15 [&_span]:text-primary-foreground',
              )}
              >
                <AgentSlashBadge meta={userAgent} size="sm" />
              </div>
            ) : null}
            <div className="whitespace-pre-wrap break-words">{userBody}</div>
          </div>
        ) : (
          <div className={cn(
            'prose prose-sm max-w-none dark:prose-invert',
            'prose-p:my-2 prose-pre:my-2 prose-headings:mb-2 prose-headings:mt-3',
            'prose-code:before:content-none prose-code:after:content-none',
          )}
          >
            {message.content ? (
              <Markdown>{message.content}</Markdown>
            ) : streaming ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                yanıt geliyor…
              </span>
            ) : null}
          </div>
        )}
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
  const [boundProjectId, setBoundProjectId] = useState<string | undefined>(initialProjectId);
  const [boundLabel, setBoundLabel] = useState<string | undefined>(initialProjectLabel);

  useEffect(() => {
    setBoundProjectId(initialProjectId);
    setBoundLabel(initialProjectLabel);
  }, [initialProjectId, initialProjectLabel]);

  const projectId = boundProjectId || 'general';
  const projectLabel = boundLabel || (boundProjectId ? boundProjectId : 'General');

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
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projects]);

  const projectPath = workspaceList.find((w) => (w.id || w.name) === projectId)?.path
    || projects.find((w) => (w.id || w.name) === projectId)?.path
    || null;

  const {
    conversations,
    conversationId,
    setConversationId,
    messages,
    loading: botLoading,
    sending,
    error: botError,
    sendMessage,
    startNewChat,
    refresh: refreshBot,
  } = usePixBot(projectId, projectPath);

  const [draft, setDraft] = useState('');
  /** Slash agent chip in the composer (visual badge; wire message still uses /claude …). */
  const [agentChip, setAgentChip] = useState<AgentSlashMeta | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(MODEL_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [models, setModels] = useState<LlmModel[]>([]);
  const [providers, setProviders] = useState<PixbotProvider[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Keep draft free of leading /agent — promote to badge chip. */
  const setDraftSmart = useCallback((next: string) => {
    const split = splitLeadingAgentToken(next);
    if (split.meta) {
      setAgentChip(split.meta);
      setDraft(split.rest);
      return;
    }
    setDraft(next);
  }, []);

  const composer = useNanoClawComposerAutocomplete({
    projectId: boundProjectId || projectId,
    value: draft,
    setValue: setDraftSmart,
    textareaRef,
    onPickAgentChip: (meta) => {
      setAgentChip(meta);
    },
  });

  const persistModel = (value: string) => {
    setSelectedModel(value);
    try { localStorage.setItem(MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  };

  const applyModelsList = useCallback((list: LlmModel[], defaultModel?: string | null) => {
    setModels(list);
    setSelectedModel((current) => {
      if (current && list.some((m) => modelValue(m) === current || m.id === current)) {
        const hit = list.find((m) => modelValue(m) === current || m.id === current);
        return hit ? modelValue(hit) : current;
      }
      const byDefault = defaultModel
        ? list.find((m) => m.id === defaultModel || modelValue(m) === defaultModel)
        : null;
      const next = byDefault ? modelValue(byDefault) : (list[0] ? modelValue(list[0]) : '');
      try { if (next) localStorage.setItem(MODEL_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /** Full open: sync system providers + pull models (auto-select healthy). */
  const bootstrapLlm = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await authenticatedFetch('/api/tasks/bot/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ refresh: true }),
      });
      if (!res.ok) {
        // Fallback to lightweight config
        const statusRes = await authenticatedFetch('/api/tasks/bot/llm', { cache: 'no-store' });
        if (!statusRes.ok) {
          setLlmConfigured(false);
          setProviders([]);
          setModels([]);
          setProviderModalOpen(true);
          return;
        }
        const status = await statusRes.json() as {
          configured?: boolean;
          providers?: PixbotProvider[];
          activeProviderId?: string | null;
          defaultModel?: string | null;
        };
        setLlmConfigured(Boolean(status.configured));
        setProviders(status.providers || []);
        setActiveProviderId(status.activeProviderId || null);
        if (!status.configured) {
          setModels([]);
          setProviderModalOpen(true);
          return;
        }
        const modelsRes = await authenticatedFetch('/api/tasks/bot/models?refresh=1', { cache: 'no-store' });
        if (modelsRes.ok) {
          const payload = await modelsRes.json() as { models?: LlmModel[]; defaultModel?: string | null };
          applyModelsList(payload.models || [], payload.defaultModel || status.defaultModel);
        }
        return;
      }
      const payload = await res.json() as {
        configured?: boolean;
        providers?: PixbotProvider[];
        activeProviderId?: string | null;
        defaultModel?: string | null;
        models?: LlmModel[];
      };
      setLlmConfigured(Boolean(payload.configured));
      setProviders(payload.providers || []);
      setActiveProviderId(payload.activeProviderId || null);
      applyModelsList(payload.models || [], payload.defaultModel);
      if (!payload.configured) setProviderModalOpen(true);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [applyModelsList]);

  /** Quiet background re-pull (keeps selection if still valid). */
  const refreshModelsQuiet = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/tasks/bot/models/refresh', { method: 'POST' });
      if (!res.ok) return;
      const payload = await res.json() as {
        models?: LlmModel[];
        defaultModel?: string | null;
        activeProviderId?: string | null;
      };
      if (payload.activeProviderId) setActiveProviderId(payload.activeProviderId);
      applyModelsList(payload.models || [], payload.defaultModel);
      // Also refresh provider health counts
      const statusRes = await authenticatedFetch('/api/tasks/bot/llm', { cache: 'no-store' });
      if (statusRes.ok) {
        const status = await statusRes.json() as {
          configured?: boolean;
          providers?: PixbotProvider[];
          activeProviderId?: string | null;
        };
        setLlmConfigured(Boolean(status.configured));
        setProviders(status.providers || []);
        if (status.activeProviderId) setActiveProviderId(status.activeProviderId);
      }
    } catch {
      /* quiet */
    }
  }, [applyModelsList]);

  const refreshLlm = useCallback(async () => {
    await bootstrapLlm();
  }, [bootstrapLlm]);

  // On open: bootstrap once
  useEffect(() => {
    void bootstrapLlm();
  }, [bootstrapLlm]);

  // Background model refresh every 2 minutes + on window focus
  useEffect(() => {
    const interval = window.setInterval(() => { void refreshModelsQuiet(); }, 120_000);
    const onFocus = () => { void refreshModelsQuiet(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshModelsQuiet]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const bindProject = (project: WorkspaceOption) => {
    setBoundProjectId(project.id || project.name);
    setBoundLabel(project.label || project.name);
    setShowWorkspaces(false);
    onBindProject?.(project);
  };

  const handleSend = async () => {
    const wire = composeAgentMessage(agentChip, draft);
    if (!wire || sending) return;
    if (!llmConfigured && !agentChip) {
      setProviderModalOpen(true);
      setActionError('Önce bir provider ekle — listeden seç, key gir, modeller gelsin.');
      return;
    }
    setDraft('');
    setAgentChip(null);
    setActionError(null);
    try {
      // CLI agents: don't force HTTP composite model into the CLI runner
      const httpPicker = selectedModel.includes('::');
      const useHttpModel = !agentChip && httpPicker;
      await sendMessage(wire, {
        model: useHttpModel ? selectedModel || undefined : (agentChip ? undefined : selectedModel || undefined),
        agentType: agentChip?.agentType,
        forceCli: Boolean(agentChip),
      });
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0] || null;

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-background text-foreground'
    : 'flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground';

  return (
    <div className={shellClass}>
      {/* Top bar — ChatGPT-like */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setShowSidebar((v) => !v)}
            aria-label="Chats"
          >
            <Bot className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">PixBot</span>
            {/* Model picker — primary control */}
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => persistModel(e.target.value)}
                disabled={!models.length || modelsLoading}
                className="h-8 max-w-[min(100vw-10rem,18rem)] appearance-none rounded-lg border border-border bg-muted/40 py-1 pl-2.5 pr-7 text-xs font-medium outline-none hover:bg-muted focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              >
                {modelsLoading && !models.length ? (
                  <option value="">Modeller yükleniyor…</option>
                ) : !models.length ? (
                  <option value="">
                    {providers.length ? 'Model gelmedi — provider kontrol' : 'Provider ekle'}
                  </option>
                ) : (
                  models.map((m) => (
                    <option key={modelValue(m)} value={modelValue(m)}>{m.label || m.id}</option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {modelsLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setProviderModalOpen(true)}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium',
              llmConfigured && models.length
                ? 'border-border text-muted-foreground hover:bg-muted'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {llmConfigured
              ? (activeProvider
                ? `${activeProvider.name}${typeof activeProvider.modelCount === 'number' ? ` · ${activeProvider.modelCount}` : ''}`
                : `Providers · ${providers.length}`)
              : 'Provider ekle'}
          </button>
          <button
            type="button"
            onClick={() => setShowWorkspaces((v) => !v)}
            className="hidden h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground hover:bg-muted sm:inline-flex"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {projectLabel}
          </button>
          <button
            type="button"
            onClick={() => { void refreshBot(); void refreshLlm(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            title="Yenile (modeller + sohbet)"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (botLoading || modelsLoading) && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => void startNewChat()}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni
          </button>
          {onExit && (
            <button type="button" onClick={onExit} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {(botError || actionError) && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError || botError}</span>
          <button type="button" onClick={() => setActionError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <PixbotProviderModal
        open={providerModalOpen}
        onOpenChange={setProviderModalOpen}
        providers={providers}
        activeProviderId={activeProviderId}
        onChanged={async () => { await refreshLlm(); }}
      />

      {showWorkspaces && (
        <div className="border-b border-border bg-muted/15 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Proje (opsiyonel — tarama bağlamı için)</span>
            <button type="button" className="text-primary" onClick={() => { setBoundProjectId(undefined); setBoundLabel(undefined); setShowWorkspaces(false); }}>
              General
            </button>
          </div>
          <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
            {workspaceList.map((project) => (
              <button
                key={project.id || project.name}
                type="button"
                onClick={() => bindProject(project)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  (project.id || project.name) === boundProjectId
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted',
                )}
              >
                {project.label || project.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Conversation sidebar */}
        <aside className={cn(
          'w-56 shrink-0 flex-col border-r border-border bg-muted/10',
          showSidebar ? 'flex' : 'hidden',
          'lg:flex',
        )}
        >
          <button
            type="button"
            onClick={() => void startNewChat()}
            className="m-2 flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-sm font-medium hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Yeni sohbet
          </button>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void setConversationId(c.id)}
                className={cn(
                  'w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition',
                  conversationId === c.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                <div className="line-clamp-2 leading-snug">{c.title}</div>
                <div className="mt-0.5 text-[10px] opacity-70">{formatDate(c.updatedAt || c.createdAt)}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main chat column */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
              {botLoading && messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Yükleniyor…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">PixBot</h2>
                    <p className="mt-2 max-w-md text-sm text-muted-foreground">
                      {llmConfigured
                        ? 'Modeli seç, sor — ChatGPT gibi. Proje bağlıysa otomatik tarar; @ ile dosya ekle.'
                        : 'API key bağla, model seç, sohbet et.'}
                    </p>
                  </div>
                  {llmConfigured && models.length > 0 && (
                    <div className="flex max-w-lg flex-wrap justify-center gap-2">
                      {models.slice(0, 8).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => persistModel(m.id)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs transition',
                            selectedModel === m.id
                              ? 'border-primary bg-primary/15 font-medium'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          {m.label || m.id}
                        </button>
                      ))}
                    </div>
                  )}
                  {!llmConfigured && (
                    <button
                      type="button"
                      onClick={() => setProviderModalOpen(true)}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Provider ekle
                    </button>
                  )}
                </div>
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
              {sending && (
                <div className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Yazıyor…
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border bg-background/80 px-3 py-3 backdrop-blur sm:px-4">
            <div className="relative mx-auto max-w-3xl">
              {composer.open && (
                <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-y-auto rounded-2xl border border-border bg-popover shadow-xl">
                  <div className="sticky top-0 border-b border-border bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {composer.mode === 'at' ? (
                      <span className="inline-flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Dosyalar</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Terminal className="h-3 w-3" /> Komutlar</span>
                    )}
                  </div>
                  <ul className="p-1">
                    {composer.items.map((item, index) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm',
                            index === composer.activeIndex ? 'bg-primary/15' : 'hover:bg-muted',
                          )}
                          onMouseEnter={() => composer.setActiveIndex(index)}
                          onMouseDown={(e) => { e.preventDefault(); composer.applyItem(item); }}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                          {item.detail ? <span className="text-[11px] text-muted-foreground">{item.detail}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/20 p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/25">
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1.5">
                  {agentChip ? (
                    <div className="mb-1.5 shrink-0 pl-1">
                      <AgentSlashBadge
                        meta={agentChip}
                        onRemove={() => setAgentChip(null)}
                      />
                    </div>
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => composer.onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                    onClick={(e) => composer.onSelect(e.currentTarget.selectionStart ?? 0)}
                    onKeyUp={(e) => composer.onSelect(e.currentTarget.selectionStart ?? 0)}
                    onKeyDown={(e) => {
                      if (composer.onKeyDown(e)) return;
                      // Empty input + Backspace removes whole agent badge
                      if (
                        e.key === 'Backspace'
                        && agentChip
                        && !draft
                        && (e.currentTarget.selectionStart ?? 0) === 0
                      ) {
                        e.preventDefault();
                        setAgentChip(null);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={1}
                    placeholder={
                      agentChip
                        ? `${agentChip.title} ile yaz… (@ dosya · Enter)`
                        : (llmConfigured ? 'Mesajını yaz… (/claude /grok badge · @ dosya · Enter)' : 'Önce API bağla…')
                    }
                    className="max-h-40 min-h-[44px] min-w-[8rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={(!draft.trim() && !agentChip) || sending}
                  onClick={() => void handleSend()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonalIcon className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {agentChip
                  ? `Agent: ${agentChip.title} · CLI`
                  : `Model: ${selectedModel || '—'} · Proje ${projectId !== 'general' ? 'bağlı' : 'genel'}`}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
