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
};

type CatalogEntry = {
  id: string;
  name: string;
  api: string | null;
  env?: string | null;
  modelCount?: number;
  requiresKey?: boolean;
  featured?: boolean;
  doc?: string | null;
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
  const [providers, setProviders] = useState<PixbotProvider[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [showLlmSetup, setShowLlmSetup] = useState(false);
  const [addMode, setAddMode] = useState<'catalog' | 'custom'>('catalog');
  const [catalogQ, setCatalogQ] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [setupBase, setSetupBase] = useState('http://127.0.0.1:11434/v1');
  const [pendingCatalogId, setPendingCatalogId] = useState<string | null>(null);
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

  const persistModel = (value: string) => {
    setSelectedModel(value);
    try { localStorage.setItem(MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  };

  const refreshLlm = useCallback(async () => {
    try {
      const statusRes = await authenticatedFetch('/api/tasks/bot/llm', { cache: 'no-store' });
      if (!statusRes.ok) {
        setLlmConfigured(false);
        setProviders([]);
        return;
      }
      const status = await statusRes.json() as {
        configured?: boolean;
        defaultModel?: string | null;
        providers?: PixbotProvider[];
        activeProviderId?: string | null;
      };
      setLlmConfigured(Boolean(status.configured));
      setProviders(status.providers || []);
      setActiveProviderId(status.activeProviderId || null);
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
        if (current && list.some((m) => modelValue(m) === current || m.id === current)) {
          const hit = list.find((m) => modelValue(m) === current || m.id === current);
          return hit ? modelValue(hit) : current;
        }
        const byDefault = status.defaultModel
          ? list.find((m) => m.id === status.defaultModel || modelValue(m) === status.defaultModel)
          : null;
        const next = byDefault ? modelValue(byDefault) : (list[0] ? modelValue(list[0]) : '');
        try { if (next) localStorage.setItem(MODEL_STORAGE_KEY, next); } catch { /* ignore */ }
        return next;
      });
    } catch {
      setModels([]);
    }
  }, []);

  const loadCatalog = useCallback(async (q = '') => {
    setCatalogLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      qs.set('limit', '60');
      const res = await authenticatedFetch(`/api/tasks/bot/catalog?${qs}`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json() as { providers?: CatalogEntry[] };
      setCatalog(payload.providers || []);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLlm();
  }, [refreshLlm]);

  useEffect(() => {
    if (!showLlmSetup || addMode !== 'catalog') return;
    const t = window.setTimeout(() => { void loadCatalog(catalogQ); }, 250);
    return () => window.clearTimeout(t);
  }, [showLlmSetup, addMode, catalogQ, loadCatalog]);

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

  const addProvider = async (body: Record<string, unknown>) => {
    setSetupBusy(true);
    setSetupError(null);
    try {
      const res = await authenticatedFetch('/api/tasks/bot/providers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json() as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          msg = (await res.text().catch(() => msg)) || msg;
        }
        throw new Error(msg);
      }
      setSetupKey('');
      setPendingCatalogId(null);
      setSetupName('');
      await refreshLlm();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSetupBusy(false);
    }
  };

  const addCustomProvider = async () => {
    if (!setupBase.trim()) {
      setSetupError('Base URL yaz (API key zorunlu değil).');
      return;
    }
    await addProvider({
      name: setupName.trim() || undefined,
      baseUrl: setupBase.trim(),
      apiKey: setupKey.trim() || undefined,
    });
  };

  const addCatalogProvider = async (entry: CatalogEntry) => {
    if (!entry.api) {
      setSetupError('Bu catalog kaydında API base URL yok — Custom ile ekle.');
      return;
    }
    setPendingCatalogId(entry.id);
    await addProvider({
      name: entry.name,
      baseUrl: entry.api,
      catalogId: entry.id,
      // Never forced — local / open proxies work without a key
      apiKey: setupKey.trim() || undefined,
    });
  };

  const removeProvider = async (id: string) => {
    setSetupBusy(true);
    setSetupError(null);
    try {
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refreshLlm();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSetupBusy(false);
    }
  };

  const activateProvider = async (id: string) => {
    setSetupBusy(true);
    try {
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(id)}/activate`, { method: 'POST' });
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
      setActionError('Önce bir provider ekle (catalog veya Custom). API key yerel için zorunlu değil.');
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
                disabled={!models.length}
                className="h-8 max-w-[min(100vw-10rem,18rem)] appearance-none rounded-lg border border-border bg-muted/40 py-1 pl-2.5 pr-7 text-xs font-medium outline-none hover:bg-muted focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              >
                {!models.length ? (
                  <option value="">Model yok — provider ekle</option>
                ) : (
                  models.map((m) => (
                    <option key={modelValue(m)} value={modelValue(m)}>{m.label || m.id}</option>
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
            {llmConfigured
              ? (activeProvider ? activeProvider.name : `Providers · ${providers.length}`)
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
        <div className="border-b border-border bg-muted/20 px-3 py-3 sm:px-4">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Providers</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Catalog (models.dev) veya kendi OpenAI-uyumlu sunucun. Birden fazla bağla; API key opsiyonel (Ollama vb.).
                </p>
              </div>
              <button type="button" onClick={() => setShowLlmSetup(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Connected list */}
            {providers.length > 0 && (
              <ul className="space-y-1.5">
                {providers.map((p) => {
                  const active = p.id === activeProviderId;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => void activateProvider(p.id)}
                        disabled={setupBusy}
                      >
                        <div className="truncate font-medium">{p.name}{active ? ' · aktif' : ''}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {p.baseUrl}
                          {p.hasApiKey ? ' · key' : ' · key yok'}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                        onClick={() => void removeProvider(p.id)}
                        disabled={setupBusy}
                      >
                        Sil
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Add mode tabs */}
            <div className="flex gap-1 rounded-xl border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setAddMode('catalog')}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-medium',
                  addMode === 'catalog' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                Catalog
              </button>
              <button
                type="button"
                onClick={() => { setAddMode('custom'); setPendingCatalogId(null); }}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-medium',
                  addMode === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                Custom
              </button>
            </div>

            {addMode === 'catalog' ? (
              <div className="space-y-2">
                <input
                  value={catalogQ}
                  onChange={(e) => setCatalogQ(e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="Ara: openrouter, groq, deepseek, ollama…"
                />
                <input
                  type="password"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="API key (opsiyonel — tıklayınca listedekine eklenir)"
                  autoComplete="off"
                />
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background">
                  {catalogLoading && (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> models.dev yükleniyor…
                    </div>
                  )}
                  {!catalogLoading && !catalog.length && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">Sonuç yok — Custom ile base URL ekle.</div>
                  )}
                  {catalog.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={setupBusy}
                      onClick={() => void addCatalogProvider(entry)}
                      className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-muted/60 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {entry.name}
                          {entry.featured ? <span className="ml-1 text-[10px] text-primary">★</span> : null}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {entry.api || '—'}
                          {typeof entry.modelCount === 'number' ? ` · ${entry.modelCount} model` : ''}
                          {entry.requiresKey ? ' · key önerilir' : ' · key opsiyonel'}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] text-muted-foreground">
                    İsim
                    <input
                      value={setupName}
                      onChange={(e) => setSetupName(e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      placeholder="Ollama / LiteLLM / …"
                    />
                  </label>
                  <label className="text-[11px] text-muted-foreground">
                    API Key <span className="font-normal opacity-70">(opsiyonel)</span>
                    <input
                      type="password"
                      value={setupKey}
                      onChange={(e) => setSetupKey(e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      placeholder="boş bırakılabilir"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <label className="block text-[11px] text-muted-foreground">
                  Base URL
                  <input
                    value={setupBase}
                    onChange={(e) => setSetupBase(e.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="http://127.0.0.1:11434/v1"
                  />
                </label>
                <button
                  type="button"
                  disabled={setupBusy || !setupBase.trim()}
                  onClick={() => void addCustomProvider()}
                  className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {setupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Custom ekle
                </button>
              </div>
            )}

            {setupError && <p className="text-xs text-destructive">{setupError}</p>}
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
