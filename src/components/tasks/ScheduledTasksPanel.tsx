import { useMemo, useState } from 'react';

import {
  AlertCircle,
  Clock,
  Loader2,
  Pause,
  Play,
  Trash2,
  X,
} from '@/lib/icons';

import { cn } from '../../lib/utils';

import type { ScheduledTask } from './types';

type FilterTab = 'active' | 'once' | 'all' | 'done';

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function scheduleLabel(task: ScheduledTask) {
  if (task.scheduleType === 'once') {
    return `Tek sefer · ${formatDate(task.scheduleValue || task.nextRunAt)}`;
  }
  if (task.scheduleType === 'cron') {
    return `Cron · ${task.cronExpression || task.scheduleValue || '—'}`;
  }
  if (task.scheduleType === 'interval') {
    const ms = Number(task.scheduleValue);
    if (Number.isFinite(ms) && ms > 0) {
      if (ms < 60_000) return `Her ${Math.round(ms / 1000)} sn`;
      if (ms < 3_600_000) return `Her ${Math.round(ms / 60_000)} dk`;
      return `Her ${Math.round(ms / 3_600_000)} sa`;
    }
    return `Interval · ${task.scheduleValue || '—'}`;
  }
  return task.scheduleType || 'Zamanlanmış';
}

function statusBadge(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return { label: 'Aktif', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
  if (s === 'paused') return { label: 'Duraklatıldı', className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200' };
  if (s === 'completed') return { label: 'Tamamlandı', className: 'border-border bg-muted text-muted-foreground' };
  if (s === 'cancelled') return { label: 'İptal', className: 'border-destructive/30 bg-destructive/10 text-destructive' };
  return { label: status || '—', className: 'border-border bg-muted text-muted-foreground' };
}

function cleanPrompt(prompt: string) {
  return String(prompt || '').replace(/^\s*\[agent:[^\]]+\]\s*/i, '').trim();
}

export function ScheduledTasksPanel({
  tasks,
  loading,
  error,
  onClose,
  onPause,
  onResume,
  onCancel,
  onDelete,
  onRefresh,
  className,
}: {
  tasks: ScheduledTask[];
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh?: () => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<FilterTab>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const active = tasks.filter((t) => t.status === 'active').length;
    const once = tasks.filter((t) => t.scheduleType === 'once').length;
    const done = tasks.filter((t) => t.status === 'completed' || t.status === 'cancelled').length;
    return { active, once, done, all: tasks.length };
  }, [tasks]);

  const filtered = useMemo(() => {
    if (filter === 'active') return tasks.filter((t) => t.status === 'active' || t.status === 'paused');
    if (filter === 'once') return tasks.filter((t) => t.scheduleType === 'once');
    if (filter === 'done') return tasks.filter((t) => t.status === 'completed' || t.status === 'cancelled');
    return tasks;
  }, [filter, tasks]);

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Zamanlanmış görevler</h2>
            {counts.active > 0 ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {counts.active} aktif
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Tek seferlik, cron ve aralıklı NanoClaw işleri
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              title="Yenile"
            >
              <Loader2 className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {([
          { id: 'active' as const, label: 'Aktif', n: counts.active },
          { id: 'once' as const, label: 'Tek sefer', n: counts.once },
          { id: 'done' as const, label: 'Biten', n: counts.done },
          { id: 'all' as const, label: 'Tümü', n: counts.all },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
              filter === tab.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {tab.label}
            {tab.n > 0 ? <span className="ml-1 opacity-70">{tab.n}</span> : null}
          </button>
        ))}
      </div>

      {(error || actionError) && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{actionError || error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Görevler yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {filter === 'active'
              ? 'Aktif görev yok. Sohbette “saat 17:15’te şunu yap” diye zamanlayabilirsin.'
              : 'Bu filtrede görev yok.'}
          </div>
        ) : (
          <ul className="space-y-2 pb-4">
            {filtered.map((task) => {
              const badge = statusBadge(task.status);
              const isSelected = selectedId === task.id;
              const busy = busyId === task.id;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : task.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2.5 text-left transition',
                      isSelected
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                          {task.title || cleanPrompt(task.prompt) || task.id}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className={cn('rounded-full border px-1.5 py-0.5 font-semibold', badge.className)}>
                            {badge.label}
                          </span>
                          <span>{scheduleLabel(task)}</span>
                          {(task.agent || task.agentType) ? (
                            <span className="rounded-full border border-border px-1.5 py-0.5">
                              {task.agent || task.agentType}
                              {task.model ? ` · ${String(task.model).includes('::') ? String(task.model).split('::').pop() : task.model}` : ''}
                            </span>
                          ) : null}
                        </div>
                        {task.status === 'active' && task.nextRunAt ? (
                          <div className="mt-1 text-[11px] text-primary">
                            Sonraki: {formatDate(task.nextRunAt)}
                          </div>
                        ) : null}
                        {(task.status === 'completed' || task.lastRunAt) && (task.resultText || task.lastResult) ? (
                          <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {(task.resultText || task.lastResult || '').slice(0, 140)}
                            {(task.resultText || task.lastResult || '').length > 140 ? '…' : ''}
                          </div>
                        ) : null}
                      </div>
                      {busy ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
                    </div>
                  </button>

                  {isSelected && (
                    <div className="mt-1 space-y-2 rounded-xl border border-border bg-muted/20 px-3 py-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prompt</div>
                        <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-foreground">
                          {cleanPrompt(task.prompt) || task.prompt}
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                        <div>
                          <dt className="text-muted-foreground">Tür</dt>
                          <dd className="font-medium">{task.scheduleType}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Değer</dt>
                          <dd className="truncate font-medium" title={task.scheduleValue || ''}>{task.scheduleValue || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Oluşturuldu</dt>
                          <dd className="font-medium">{formatDate(task.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Son çalıştırma</dt>
                          <dd className="font-medium">{formatDate(task.lastRunAt)}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">ID</dt>
                          <dd className="truncate font-mono text-[10px]">{task.id}</dd>
                        </div>
                      </dl>
                      {(task.resultText || task.lastResult) ? (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {task.status === 'completed' || task.lastRunAt ? 'Çıktı / cevap' : 'Son sonuç'}
                          </div>
                          <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-[12px] leading-5 text-foreground">
                            {task.resultText || task.lastResult}
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Aynı çıktı sohbete de düşer: “Zamanlanmış görev bitti” mesajı.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                          {task.status === 'active'
                            ? 'Henüz çalışmadı — çalışınca çıktı burada ve sohbette görünür.'
                            : task.status === 'completed'
                              ? 'Kayıtlı çıktı yok (agent boş döndü veya hata logda).'
                              : 'Bu görev için kayıtlı çıktı yok.'}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {task.status === 'active' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => onPause(task.id))}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                          >
                            <Pause className="h-3 w-3" />
                            Duraklat
                          </button>
                        ) : null}
                        {task.status === 'paused' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => onResume(task.id))}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" />
                            Devam
                          </button>
                        ) : null}
                        {task.status === 'active' || task.status === 'paused' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => onCancel(task.id))}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            İptal et
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runAction(task.id, async () => {
                            await onDelete(task.id);
                            setSelectedId(null);
                          })}
                          className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Sil
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Small badge button for the PixBot header. */
export function ScheduledTasksTrigger({
  activeCount,
  totalCount,
  onClick,
}: {
  activeCount: number;
  totalCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium',
        activeCount > 0
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
      title="Zamanlanmış görevler"
    >
      <Clock className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Görevler</span>
      {totalCount > 0 ? (
        <span className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
          activeCount > 0 ? 'bg-primary/20' : 'bg-muted',
        )}
        >
          {activeCount > 0 ? activeCount : totalCount}
        </span>
      ) : null}
    </button>
  );
}
