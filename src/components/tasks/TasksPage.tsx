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

import { usePixBot } from '../../hooks/useTasks';
import { cn } from '../../lib/utils';
import { api, authenticatedFetch } from '../../utils/api';

import { useNanoClawComposerAutocomplete } from './hooks/useNanoClawComposerAutocomplete';
import type { BotMessage, WorkspaceOption } from './types';

const MODEL_STORAGE_KEY = 'pixbot.selectedModel';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MessageBubble({ message }: { message: BotMessage }) {
  const isUser = message.role === 'user';
  const model = message.meta && typeof message.meta === 'object' && 'model' in message.meta
    ? String(message.meta.model || '')
    : '';
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
        {!isUser && model ? (
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{model}</div>
        ) : null}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
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
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(MODEL_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [models, setModels] = useState<LlmModel[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [showLlmSetup, setShowLlmSetup] = useState(false);
  const [setupKey, setSetupKey] = useState('');
  const [setupBase, setSetupBase] = useState('https://api.openai.com/v1');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const composer = useNanoClawComposerAutocomplete({
    projectId: boundProjectId || projectId,
    value: draft,
    setValue: setDraft,
    textareaRef,
  });

  const persistModel = (id: string) => {
    setSelectedModel(id);
    try { localStorage.setItem(MODEL_STORAGE_KEY, id); } catch { /* ignore */ }
  };

  const refreshLlm = useCallback(async () => {
    try {
      const statusRes = await authenticatedFetch('/api/tasks/bot/llm', { cache: 'no-store' });
      if (!statusRes.ok) {
        setLlmConfigured(false);
        return;
      }
      const status = await statusRes.json() as { configured?: boolean; defaultModel?: string | null };
      setLlmConfigured(Boolean(status.configured));
      if (!status.configured) {
        setModels([]);
        setShowLlmSetup(true);
        return;
      }
      const modelsRes = await authenticatedFetch('/api/tasks/bot/models', { cache: 'no-store' });
      if (!modelsRes.ok) {
        setModels([]);
        return;
      }
      const payload = await modelsRes.json() as { models?: LlmModel[] };
      const list = payload.models || [];
      setModels(list);
      setSelectedModel((current) => {
        if (current && list.some((m) => m.id === current)) return current;
        const next = status.defaultModel && list.some((m) => m.id === status.defaultModel)
          ? status.defaultModel
          : (list[0]?.id || '');
        try { if (next) localStorage.setItem(MODEL_STORAGE_KEY, next); } catch { /* ignore */ }
        return next;
      });
    } catch {
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void refreshLlm();
  }, [refreshLlm]);

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
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
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
    if (!llmConfigured) {
      setShowLlmSetup(true);
      setActionError('Önce API key bağla — ChatGPT gibi model seçip konuşursun.');
      return;
    }
    setDraft('');
    setActionError(null);
    try {
      await sendMessage(text, { model: selectedModel || undefined });
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  };

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
                disabled={!models.length}
                className="h-8 max-w-[min(100vw-10rem,16rem)] appearance-none rounded-lg border border-border bg-muted/40 py-1 pl-2.5 pr-7 text-xs font-medium outline-none hover:bg-muted focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              >
                {!models.length ? (
                  <option value="">Model yok — API bağla</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label || m.id}</option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowLlmSetup((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium',
              llmConfigured
                ? 'border-border text-muted-foreground hover:bg-muted'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {llmConfigured ? 'API' : 'API bağla'}
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
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', botLoading && 'animate-spin')} />
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

      {showLlmSetup && (
        <div className="border-b border-border bg-muted/20 px-4 py-4">
          <div className="mx-auto max-w-xl">
            <h3 className="text-sm font-semibold">API bağla (ChatGPT gibi kullan)</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              OpenAI-uyumlu herhangi bir endpoint. Kaydet → modeller <code className="rounded bg-muted px-1">/v1/models</code> ile gelir → seçip sohbet et.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-muted-foreground">
                Base URL
                <input
                  value={setupBase}
                  onChange={(e) => setSetupBase(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="text-[11px] text-muted-foreground">
                API Key
                <input
                  type="password"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="sk-…"
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
                className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {setupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>
              <button type="button" onClick={() => setShowLlmSetup(false)} className="h-10 rounded-xl border border-border px-3 text-sm text-muted-foreground">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

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
                      onClick={() => setShowLlmSetup(true)}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      API bağla
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
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => composer.onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                  onClick={(e) => composer.onSelect(e.currentTarget.selectionStart ?? 0)}
                  onKeyUp={(e) => composer.onSelect(e.currentTarget.selectionStart ?? 0)}
                  onKeyDown={(e) => {
                    if (composer.onKeyDown(e)) return;
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={1}
                  placeholder={llmConfigured ? 'Mesajını yaz… (@ dosya · Enter gönder)' : 'Önce API bağla…'}
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none"
                />
                <button
                  type="button"
                  disabled={!draft.trim() || sending}
                  onClick={() => void handleSend()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonalIcon className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                Model: {selectedModel || '—'} · Proje bağlamı {projectId !== 'general' ? 'açık' : 'kapalı (workspace seç)'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
