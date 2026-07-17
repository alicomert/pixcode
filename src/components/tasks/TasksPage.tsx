import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertCircle,
  Bot,
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

import { usePixBot } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';
import { api, authenticatedFetch } from '../../utils/api';

import { useNanoClawComposerAutocomplete } from './hooks/useNanoClawComposerAutocomplete';
import type { AgentType, BotMessage, WorkspaceOption } from './types';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MessageBubble({ message }: { message: BotMessage }) {
  const isUser = message.role === 'user';
  const badge = message.agentType === 'pixbot' || !message.agentType
    ? 'PixBot'
    : message.agentType === 'local'
      ? 'PixBot'
      : message.agentType;
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
            {badge && badge !== 'PixBot' ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
                {badge}
              </span>
            ) : null}
            {message.meta && typeof message.meta === 'object' && 'model' in message.meta && message.meta.model ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
                {String(message.meta.model)}
              </span>
            ) : null}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  );
}

function EmptyState({ llmConfigured }: { llmConfigured: boolean }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">PixBot</h2>
      <p className="max-w-lg text-sm text-muted-foreground">
        {llmConfigured
          ? 'API key bağlı. Model seç, sohbet et. Dosya için @, opsiyonel CLI için /opencode /claude.'
          : 'Önce API key + base URL bağla (OpenAI-uyumlu). Sistem /v1/models çeker; model seçip chatlersin.'}
      </p>
    </div>
  );
}

type LlmModel = { id: string; label: string; ownedBy?: string | null };

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

  const projectId = boundProjectId || 'general';
  const projectLabel = boundLabel || (boundProjectId ? boundProjectId : 'General (no coding project)');

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
  } = usePixBot(projectId);

  const [draft, setDraft] = useState('');
  const [agentType, setAgentType] = useState<AgentType | 'pixbot'>('pixbot');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [models, setModels] = useState<LlmModel[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [showLlmSetup, setShowLlmSetup] = useState(false);
  const [setupKey, setSetupKey] = useState('');
  const [setupBase, setSetupBase] = useState('https://api.openai.com/v1');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const composer = useNanoClawComposerAutocomplete({
    projectId: boundProjectId || projectId,
    value: draft,
    setValue: setDraft,
    textareaRef,
    onPickAgent: (agent) => setAgentType(agent),
  });

  const refreshLlm = useCallback(async () => {
    try {
      const statusRes = await authenticatedFetch('/api/tasks/bot/llm', { cache: 'no-store' });
      if (statusRes.ok) {
        const status = await statusRes.json() as { configured?: boolean; baseUrl?: string | null; defaultModel?: string | null };
        setLlmConfigured(Boolean(status.configured));
        if (status.baseUrl) setLlmBaseUrl(status.baseUrl);
        if (status.defaultModel && !selectedModel) setSelectedModel(status.defaultModel);
      }
      if (!statusRes.ok) return;
      const modelsRes = await authenticatedFetch('/api/tasks/bot/models', { cache: 'no-store' });
      if (!modelsRes.ok) {
        setModels([]);
        return;
      }
      const payload = await modelsRes.json() as { models?: LlmModel[] };
      const list = payload.models || [];
      setModels(list);
      if (list.length && !selectedModel) {
        setSelectedModel(list[0].id);
      }
    } catch {
      setModels([]);
    }
  }, [selectedModel]);

  useEffect(() => {
    void refreshLlm();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const saveLlm = async () => {
    setSetupBusy(true);
    setSetupError(null);
    try {
      const res = await authenticatedFetch('/api/tasks/bot/llm', {
        method: 'PUT',
        body: JSON.stringify({
          apiKey: setupKey,
          baseUrl: setupBase || 'https://api.openai.com/v1',
          model: selectedModel || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setShowLlmSetup(false);
      setSetupKey('');
      await refreshLlm();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSetupBusy(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setActionError(null);
    try {
      // Default: PixBot OpenAI-compatible API. CLI only when message has /opencode etc.
      await sendMessage(text, {
        model: selectedModel || undefined,
      });
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-background text-foreground'
    : 'flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground';

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
              {projectLabel}
              {' · '}
              {llmConfigured
                ? (selectedModel || models[0]?.id || 'API')
                : 'API key gerekli'}
              {llmBaseUrl ? ` · ${llmBaseUrl.replace(/^https?:\/\//, '')}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLlmSetup((v) => !v)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs',
              llmConfigured
                ? 'border-border text-muted-foreground hover:bg-muted'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
            )}
            title="PixBot LLM (API key)"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {llmConfigured ? 'API' : 'API bağla'}
          </button>
          <button
            type="button"
            onClick={() => setShowWorkspaces((v) => !v)}
            className="hidden h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:bg-muted sm:inline-flex"
            title="Workspace"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Workspace
          </button>
          <button
            type="button"
            onClick={() => { void refreshBot(); void refreshLlm(); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title={t('buttons.refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', botLoading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => void startNewChat()}
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
              title="Exit"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {(botError || actionError) && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{actionError || botError}</span>
          </div>
          {actionError && (
            <button type="button" onClick={() => setActionError(null)}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {showLlmSetup && (
        <div className="border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
          <div className="mb-2 text-xs font-semibold text-foreground">PixBot LLM (OpenAI-uyumlu)</div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            API key + base URL kaydedilir → <code className="rounded bg-muted px-1">/v1/models</code> çekilir → model seçip chat.
            Örnek base: <code className="rounded bg-muted px-1">https://api.openai.com/v1</code> veya gateway’in.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-muted-foreground">
              Base URL
              <input
                value={setupBase}
                onChange={(e) => setSetupBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              API Key
              <input
                type="password"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                placeholder="sk-… veya gateway key"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                autoComplete="off"
              />
            </label>
          </div>
          {setupError && <p className="mt-2 text-xs text-destructive">{setupError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={setupBusy || !setupKey.trim()}
              onClick={() => void saveLlm()}
              className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {setupBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Kaydet ve modelleri çek
            </button>
            <button
              type="button"
              onClick={() => setShowLlmSetup(false)}
              className="h-9 rounded-xl border border-border px-3 text-xs text-muted-foreground"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {showWorkspaces && (
        <div className="border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Bind workspace (optional)</span>
            <button
              type="button"
              className="text-xs text-primary"
              onClick={() => {
                setBoundProjectId(undefined);
                setBoundLabel(undefined);
                setShowWorkspaces(false);
              }}
            >
              Use general
            </button>
          </div>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {workspaceList.map((project) => (
              <button
                key={project.id || project.name}
                type="button"
                onClick={() => bindProject(project)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs',
                  (project.id || project.name) === boundProjectId
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {project.label || project.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)]">
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

        <section className="flex min-h-0 min-w-0 flex-col">
          <div ref={scrollerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {botLoading && messages.length === 0 ? (
              <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : messages.length === 0 ? (
              <EmptyState llmConfigured={llmConfigured} />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                PixBot düşünüyor…
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-card/40 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!models.length}
                className="h-8 min-w-[12rem] max-w-full flex-1 rounded-lg border border-border bg-background px-2 text-xs sm:flex-none"
              >
                {!models.length ? (
                  <option value="">API bağla → modeller yüklensin</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label || m.id}</option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => void refreshLlm()}
                className="h-8 rounded-lg border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted"
              >
                Yenile
              </button>
              <span className="text-[10px] text-muted-foreground">
                <kbd className="rounded border border-border px-1">/</kbd> CLI ·{' '}
                <kbd className="rounded border border-border px-1">@</kbd> dosya
              </span>
            </div>
            <div className="relative flex items-end gap-2">
              {composer.open && (
                <div
                  className="absolute bottom-full left-0 right-12 z-30 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-xl"
                  role="listbox"
                >
                  <div className="sticky top-0 flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {composer.mode === 'at' ? (
                      <><FolderOpen className="h-3 w-3" /> Dosyalar</>
                    ) : (
                      <><Terminal className="h-3 w-3" /> Komutlar</>
                    )}
                  </div>
                  <ul className="p-1">
                    {composer.items.map((item, index) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                            index === composer.activeIndex ? 'bg-primary/15' : 'hover:bg-muted',
                          )}
                          onMouseEnter={() => composer.setActiveIndex(index)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            composer.applyItem(item);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                          {item.detail ? (
                            <span className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                              {item.kind === 'command' && item.insert.startsWith('/')
                                ? item.insert.trim()
                                : item.detail}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  composer.onChange(event.target.value, event.target.selectionStart ?? event.target.value.length);
                }}
                onClick={(event) => composer.onSelect(event.currentTarget.selectionStart ?? 0)}
                onKeyUp={(event) => composer.onSelect(event.currentTarget.selectionStart ?? 0)}
                onKeyDown={(event) => {
                  if (composer.onKeyDown(event)) return;
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder={llmConfigured ? 'PixBot’a yaz…  @dosya  ·  /opencode (CLI opsiyonel)' : 'Önce API bağla (üstte API bağla)…'}
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
      </div>
    </div>
  );
}
