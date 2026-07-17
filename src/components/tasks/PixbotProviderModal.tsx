import { useCallback, useEffect, useMemo, useState } from 'react';

import { Loader2, Plus, Search, X } from '@/lib/icons';

import { Dialog, DialogContent, DialogTitle } from '@/shared/view/ui';

import { cn } from '../../lib/utils';
import { authenticatedFetch } from '../../utils/api';

type CatalogEntry = {
  id: string;
  name: string;
  api: string | null;
  env?: string | null;
  modelCount?: number;
  requiresKey?: boolean;
  featured?: boolean;
};

type ConnectedProvider = {
  id: string;
  name: string;
  baseUrl: string;
  hasApiKey?: boolean;
  system?: boolean;
  modelCount?: number | null;
  lastError?: string | null;
  healthy?: boolean | null;
};

type LiveModel = { id: string; label?: string; value?: string };

type Step = 'list' | 'key' | 'models' | 'manage';

export function PixbotProviderModal({
  open,
  onOpenChange,
  providers,
  activeProviderId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ConnectedProvider[];
  activeProviderId?: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>('list');
  const [catalogQ, setCatalogQ] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [liveModels, setLiveModels] = useState<LiveModel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const resetWizard = useCallback(() => {
    setStep('list');
    setSelected(null);
    setCustomMode(false);
    setName('');
    setBaseUrl('http://127.0.0.1:11434/v1');
    setApiKey('');
    setError(null);
    setPendingProviderId(null);
    setLiveModels([]);
    setPicked(new Set());
  }, []);

  useEffect(() => {
    if (!open) {
      resetWizard();
      return;
    }
    setStep(providers.length ? 'manage' : 'list');
  }, [open, providers.length, resetWizard]);

  const loadCatalog = useCallback(async (q = '') => {
    setCatalogLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      qs.set('limit', '80');
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
    if (!open || (step !== 'list' && step !== 'manage')) return;
    if (step === 'list' || customMode) {
      const t = window.setTimeout(() => { void loadCatalog(catalogQ); }, 200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, step, catalogQ, loadCatalog, customMode]);

  const pickCatalog = (entry: CatalogEntry) => {
    setSelected(entry);
    setCustomMode(false);
    setName(entry.name);
    setBaseUrl(entry.api || '');
    setApiKey('');
    setError(null);
    setStep('key');
  };

  const startCustom = () => {
    setSelected(null);
    setCustomMode(true);
    setName('');
    setBaseUrl('http://127.0.0.1:11434/v1');
    setApiKey('');
    setError(null);
    setStep('key');
  };

  const connectAndFetchModels = async () => {
    if (!baseUrl.trim()) {
      setError('Base URL gerekli.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authenticatedFetch('/api/tasks/bot/providers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || selected?.name || undefined,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          catalogId: selected?.id || undefined,
          activate: true,
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json() as { error?: string };
          if (j.error) msg = j.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const result = await res.json() as { provider?: { id: string } };
      const providerId = result.provider?.id;
      if (!providerId) throw new Error('Provider kaydedilemedi.');
      setPendingProviderId(providerId);

      const modelsRes = await authenticatedFetch(
        `/api/tasks/bot/models?providerId=${encodeURIComponent(providerId)}&refresh=1`,
        { cache: 'no-store' },
      );
      if (!modelsRes.ok) throw new Error('Modeller çekilemedi — key/URL kontrol et.');
      const modelsPayload = await modelsRes.json() as { models?: LiveModel[] };
      const list = (modelsPayload.models || []).map((m) => ({
        id: m.id,
        label: m.label || m.id,
        value: m.value,
      }));
      setLiveModels(list);
      setPicked(new Set(list.map((m) => m.id))); // default: all selected
      setStep('models');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finishModels = async (mode: 'all' | 'selected') => {
    if (!pendingProviderId) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const enabledModels = mode === 'all'
        ? null
        : Array.from(picked);
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(pendingProviderId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabledModels: mode === 'all' ? null : enabledModels,
        }),
      });
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(pendingProviderId)}/activate`, {
        method: 'POST',
      });
      await onChanged();
      onOpenChange(false);
      resetWizard();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeProvider = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activateProvider = async (id: string) => {
    setBusy(true);
    try {
      await authenticatedFetch(`/api/tasks/bot/providers/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = useMemo(() => {
    if (step === 'manage') return 'Providers';
    if (step === 'key') return customMode ? 'Custom provider' : (selected?.name || 'API key');
    if (step === 'models') return 'Modelleri seç';
    return 'Provider ekle';
  }, [step, customMode, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] w-[min(100vw-1.5rem,28rem)] overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => onOpenChange(false)}
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex max-h-[min(70vh,520px)] flex-col overflow-hidden">
          {step === 'manage' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
                {providers.length === 0 && (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    Henüz provider yok. Aşağıdan ekle — OpenCode gibi isim seç, key gir, modeller gelsin.
                  </p>
                )}
                {providers.map((p) => {
                  const active = p.id === activeProviderId;
                  const healthy = p.healthy === true || (typeof p.modelCount === 'number' && p.modelCount > 0);
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2',
                        active ? 'border-primary/40 bg-primary/5' : 'border-border',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        disabled={busy}
                        onClick={() => void activateProvider(p.id)}
                      >
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <span className={cn('h-1.5 w-1.5 rounded-full', healthy ? 'bg-emerald-500' : 'bg-amber-500')} />
                          <span className="truncate">{p.name}{active ? ' · aktif' : ''}{p.system ? ' · sistem' : ''}</span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {typeof p.modelCount === 'number' ? `${p.modelCount} model · ` : ''}
                          {p.baseUrl}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                        disabled={busy}
                        onClick={() => void removeProvider(p.id)}
                      >
                        {p.system ? 'Gizle' : 'Sil'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                  onClick={() => { setStep('list'); void loadCatalog(''); }}
                >
                  <Plus className="h-4 w-4" />
                  Provider ekle
                </button>
              </div>
            </div>
          )}

          {step === 'list' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <p className="mb-2 text-[12px] text-muted-foreground">
                Listeden seç → API key (gerekirse) → modeller otomatik gelir.
              </p>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={catalogQ}
                  onChange={(e) => setCatalogQ(e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-background py-1 pl-9 pr-3 text-sm"
                  placeholder="Ara: openrouter, groq, ollama…"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={startCustom}
                className="mb-2 w-full rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <div className="font-medium">Custom OpenAI-compatible</div>
                <div className="text-[11px] text-muted-foreground">Kendi base URL + opsiyonel key</div>
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
                {catalogLoading && (
                  <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yükleniyor…
                  </div>
                )}
                {!catalogLoading && catalog.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => pickCatalog(entry)}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {entry.name}
                        {entry.featured ? <span className="ml-1 text-[10px] text-primary">★</span> : null}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {entry.requiresKey ? 'API key' : 'Key opsiyonel'}
                        {typeof entry.modelCount === 'number' ? ` · ${entry.modelCount} model` : ''}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
              {providers.length > 0 && (
                <button
                  type="button"
                  className="mt-2 text-center text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setStep('manage')}
                >
                  ← Bağlı provider’lara dön
                </button>
              )}
            </div>
          )}

          {step === 'key' && (
            <div className="space-y-3 p-4">
              <p className="text-[12px] text-muted-foreground">
                {selected?.requiresKey
                  ? 'Bu provider genelde API key ister. Key yoksa boş bırakıp dene (yerel/proxy).'
                  : 'API key zorunlu değil — Ollama gibi yereller için boş bırak.'}
              </p>
              {(customMode || !selected) && (
                <label className="block text-[11px] text-muted-foreground">
                  İsim
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="Benim gateway"
                  />
                </label>
              )}
              <label className="block text-[11px] text-muted-foreground">
                Base URL
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-mono"
                  placeholder="https://…"
                />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                API Key <span className="opacity-70">(opsiyonel)</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder={selected?.env || 'sk-…'}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="h-10 flex-1 rounded-xl border border-border text-sm"
                  onClick={() => setStep(providers.length ? 'manage' : 'list')}
                  disabled={busy}
                >
                  Geri
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 flex-[2] items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={busy || !baseUrl.trim()}
                  onClick={() => void connectAndFetchModels()}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Bağla · modelleri getir
                </button>
              </div>
            </div>
          )}

          {step === 'models' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
                {liveModels.length
                  ? `${liveModels.length} model geldi. Hepsini ekle veya seçtiklerini bırak.`
                  : 'Model listesi boş — yine de provider kaydedildi. Key/URL’yi sonra güncelleyebilirsin.'}
              </p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                {liveModels.map((m) => {
                  const on = picked.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                        on ? 'border-primary/30 bg-primary/5' : 'border-border opacity-70',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0 truncate font-mono text-[12px]">{m.label || m.id}</span>
                    </label>
                  );
                })}
              </div>
              {error && <p className="px-4 text-xs text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2 border-t border-border p-3">
                <button
                  type="button"
                  className="h-10 flex-1 rounded-xl border border-border text-sm"
                  disabled={busy}
                  onClick={() => {
                    setPicked(new Set(liveModels.map((m) => m.id)));
                  }}
                >
                  Tümünü seç
                </button>
                <button
                  type="button"
                  className="h-10 flex-1 rounded-xl border border-border text-sm"
                  disabled={busy}
                  onClick={() => setPicked(new Set())}
                >
                  Temizle
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={busy || (liveModels.length > 0 && picked.size === 0)}
                  onClick={() => void finishModels(
                    liveModels.length > 0 && picked.size === liveModels.length ? 'all' : 'selected',
                  )}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Tamam · {picked.size || liveModels.length || 0} model
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
