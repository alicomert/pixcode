import { useCallback, useEffect, useMemo, useState } from 'react';

import { authenticatedFetch } from '../../../../utils/api';

import { Bug, Clipboard, Globe, RefreshCw, Server } from '@/lib/icons';

type DiagnosticsPayload = {
  status: string;
  timestamp: string;
  version: string;
  runtime?: Record<string, unknown>;
  websocket?: { clients?: number };
  notifications?: Record<string, unknown>;
  providerHealth?: Record<string, { status?: string; auth?: string; cli?: string | null; checkedAt?: string }>;
  activeRuns?: unknown[];
  recentErrors?: Array<{ source?: string; message?: string }>;
};

function StatusPill({ value }: { value: string }) {
  const normalized = value || 'unknown';
  const tone = normalized === 'ok' || normalized === 'available' || normalized === 'configured'
    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
    : normalized === 'missing' || normalized === 'failed'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-border bg-muted text-muted-foreground';

  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{normalized}</span>;
}

export default function DiagnosticsSettingsTab() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDiagnostics = useCallback(async (manual = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(manual ? '/api/diagnostics/refresh' : '/api/diagnostics', {
        method: manual ? 'POST' : 'GET',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setDiagnostics((await response.json()) as DiagnosticsPayload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics(false);
  }, [loadDiagnostics]);

  const providerEntries = useMemo(
    () => Object.entries(diagnostics?.providerHealth || {}),
    [diagnostics?.providerHealth],
  );

  const copyBundle = async () => {
    if (!diagnostics) return;
    await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Diagnostics</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider health, WebSocket state, notifications, active runs, and recent errors.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadDiagnostics(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={copyBundle}
            disabled={!diagnostics}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy bundle'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Server className="h-4 w-4" />
              Runtime
            </div>
            <StatusPill value={diagnostics?.status || 'loading'} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">v{diagnostics?.version || '...'}</p>
          <p className="text-xs text-muted-foreground">{diagnostics?.timestamp || 'Waiting for diagnostics'}</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe className="h-4 w-4" />
            WebSocket
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{diagnostics?.websocket?.clients ?? 0}</p>
          <p className="text-xs text-muted-foreground">active clients</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Bug className="h-4 w-4" />
            Recent errors
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{diagnostics?.recentErrors?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">redacted support bundle</p>
        </div>
      </div>

      <section className="rounded-lg border border-border/70 bg-background">
        <div className="border-b border-border/70 px-4 py-3 text-sm font-semibold text-foreground">Providers</div>
        <div className="divide-y divide-border/70">
          {providerEntries.map(([provider, health]) => (
            <div key={provider} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium text-foreground">{provider}</div>
                <div className="text-xs text-muted-foreground">{health.checkedAt || 'not checked'}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill value={health.auth || 'unknown'} />
                <StatusPill value={health.status || 'unknown'} />
              </div>
            </div>
          ))}
          {providerEntries.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">Provider health has not been collected yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
