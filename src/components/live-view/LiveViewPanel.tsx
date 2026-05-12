import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input } from '../../shared/view/ui';
import type { Project } from '../../types/app';
import { authenticatedFetch } from '../../utils/api';

import {
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  SquareIcon,
} from '@/lib/icons';

type LiveViewTarget = {
  available: boolean;
  kind: 'process' | 'static' | 'none';
  label?: string;
  framework?: string;
  reason?: string;
  managedRuntime?: {
    id: string;
    label?: string;
    status: 'missing' | 'installing' | 'installed' | 'system' | 'unsupported';
    installable?: boolean;
    reason?: string;
  } | null;
  command?: {
    id: string;
    label: string;
    displayCommand: string;
    custom?: boolean;
  };
};

type LiveViewSession = {
  shareId: string;
  sharePath: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  kind: 'process' | 'static';
  framework?: string;
  label?: string;
  command?: {
    id: string;
    label: string;
    displayCommand: string;
    custom?: boolean;
  } | null;
  port?: number | null;
  upstreamUrl?: string | null;
  error?: string | null;
  log?: string[];
  managedRuntime?: LiveViewTarget['managedRuntime'];
};

type LiveViewEnvironment = {
  id: string;
  mode: 'local-process' | 'static' | 'unavailable';
  status: 'ready' | LiveViewSession['status'] | 'unavailable';
  framework?: string | null;
  label?: string | null;
  command?: {
    id: string;
    label: string;
    displayCommand: string;
    custom?: boolean;
  } | null;
  runtime?: {
    id?: string;
    label?: string;
    version?: string | null;
    path?: string | null;
    status?: string;
    source?: string;
  } | null;
  managedRuntime?: LiveViewTarget['managedRuntime'];
  port?: number | null;
  upstreamUrl?: string | null;
  sharePath?: string | null;
  urls?: {
    local?: string | null;
    external?: string | null;
    preferred?: string | null;
  };
  tunnel?: {
    status?: 'active' | 'local-only' | string;
    url?: string | null;
    localUrl?: string | null;
    preferredUrl?: string | null;
  };
  logs: string[];
  diagnostics: {
    runnerKind?: 'process' | 'static' | 'none' | string;
    targetAvailable?: boolean;
    reason?: string | null;
    error?: string | null;
    exitCode?: number | null;
    exitSignal?: string | null;
    spawnErrorCode?: string | null;
    startedAt?: string | null;
    stoppedAt?: string | null;
    readyTimeoutMs?: number;
    staticServing?: boolean;
    customCommand?: boolean;
    publicTunnelReady?: boolean;
  };
};

type LiveViewStatus = {
  target: LiveViewTarget;
  session: LiveViewSession | null;
  environment?: LiveViewEnvironment;
  urls?: {
    local?: string | null;
    external?: string | null;
    preferred?: string | null;
  };
  tunnel?: {
    running?: boolean;
    url?: string | null;
  };
};

type LiveViewPanelProps = {
  selectedProject: Project;
  onAvailabilityChange?: (available: boolean) => void;
};

type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

type ViewportSize = {
  width: number;
  height: number;
};

const VIEWPORT_PRESETS: Record<Exclude<ViewportPreset, 'custom'>, ViewportSize> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const VIEWPORT_MIN = 240;
const VIEWPORT_MAX = 3840;

function clampViewportValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(VIEWPORT_MAX, Math.max(VIEWPORT_MIN, Math.round(value)));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Live View request failed');
  }
  return data;
}

export default function LiveViewPanel({ selectedProject, onAvailabilityChange }: LiveViewPanelProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LiveViewStatus | null>(null);
  const [customCommand, setCustomCommand] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewportPreset, setViewportPreset] = useState<ViewportPreset>('desktop');
  const [viewportSize, setViewportSize] = useState<ViewportSize>(VIEWPORT_PRESETS.desktop);

  const endpoint = useMemo(
    () => `/api/live-view/${encodeURIComponent(selectedProject.name)}`,
    [selectedProject.name],
  );

  const loadStatus = useCallback(async () => {
    setError(null);
    const response = await authenticatedFetch(`${endpoint}/status`, { cache: 'no-store' });
    const nextStatus = await readJson(response) as LiveViewStatus;
    setStatus(nextStatus);
    onAvailabilityChange?.(Boolean(nextStatus.target?.available || nextStatus.session));
  }, [endpoint, onAvailabilityChange]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadStatus()
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.session || (status.session.status !== 'starting' && status.session.status !== 'running')) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadStatus().catch(() => undefined);
    }, status.session.status === 'starting' ? 1800 : 5000);

    return () => window.clearInterval(timer);
  }, [loadStatus, status?.session]);

  const runAction = useCallback(async (action: 'start' | 'restart' | 'stop') => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`${endpoint}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'stop' ? {} : { customCommand }),
      });
      const data = await readJson(response);
      const nextStatus = await authenticatedFetch(`${endpoint}/status`, { cache: 'no-store' });
      const fresh = await readJson(nextStatus) as LiveViewStatus;
      if (action === 'stop') {
        setStatus({
          ...fresh,
          session: null,
          urls: fresh.urls,
        });
        onAvailabilityChange?.(Boolean(fresh.target?.available));
        setReloadKey((current) => current + 1);
        return;
      }

      setStatus({
        ...fresh,
        session: data.session ?? fresh.session,
        urls: data.urls ?? fresh.urls,
      });
      onAvailabilityChange?.(true);
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setIsBusy(false);
    }
  }, [customCommand, endpoint, onAvailabilityChange]);

  const shareUrl = status?.urls?.preferred || status?.urls?.local || status?.session?.sharePath || '';
  const frameSrc = status?.session?.sharePath || null;
  const environment = status?.environment || null;
  const environmentDiagnostics = environment ? environment.diagnostics : null;
  const command = environment?.command || status?.session?.command || status?.target?.command || null;
  const isCustomCommand = Boolean(command && command.custom);
  const environmentLogs = environment ? environment.logs?.slice(-10) || [] : status?.session?.log?.slice(-10) || [];
  const isRunning = status?.session?.status === 'running';
  const isStarting = status?.session?.status === 'starting';
  const targetUnavailableReason = !status?.target?.available ? environmentDiagnostics?.reason || status?.target?.reason || null : null;
  const managedRuntime = environment?.managedRuntime || status?.target?.managedRuntime || status?.session?.managedRuntime || null;
  const managedRuntimePending = Boolean(managedRuntime?.installable && managedRuntime.status === 'missing' && !status?.session);
  const isPreparingManagedRuntime = Boolean(isBusy && managedRuntimePending);
  const sessionError = status?.session?.status === 'error'
    ? status.session.error || t('liveView.runnerErrorFallback', { defaultValue: 'The runner stopped before the preview became available.' })
    : null;
  const sessionLogs = environmentLogs.slice(-8);
  const canStart = Boolean(status?.target?.available || customCommand.trim());
  const environmentModeLabel = environment?.mode === 'local-process'
    ? t('liveView.environmentLocalProcess', { defaultValue: 'Local process' })
    : environment?.mode === 'static'
      ? t('liveView.environmentStatic', { defaultValue: 'Static files' })
      : t('liveView.environmentUnavailable', { defaultValue: 'Unavailable' });
  const environmentStatusLabel = environment?.status
    ? t(`liveView.status.${environment.status}`, { defaultValue: environment.status })
    : t('status.pending', { defaultValue: 'Pending' });
  const environmentTunnelLabel = environment?.tunnel?.status === 'active'
    ? t('liveView.tunnelActive', { defaultValue: 'Tunnel active' })
    : t('liveView.tunnelLocalOnly', { defaultValue: 'Local only' });

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [shareUrl]);

  const selectViewportPreset = useCallback((preset: Exclude<ViewportPreset, 'custom'>) => {
    setViewportPreset(preset);
    setViewportSize(VIEWPORT_PRESETS[preset]);
  }, []);

  const updateViewportDimension = useCallback((dimension: keyof ViewportSize, rawValue: string) => {
    const parsed = Number(rawValue);
    setViewportPreset('custom');
    setViewportSize((current) => ({
      ...current,
      [dimension]: clampViewportValue(parsed, current[dimension]),
    }));
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="truncate text-sm font-semibold text-foreground">
              {t('liveView.title', { defaultValue: 'Live View' })}
            </h2>
            {(environment?.framework || status?.target?.available) && (
              <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {environment?.framework || status?.target?.framework || status?.target?.label}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('liveView.subtitle', {
              defaultValue: 'Run this project locally and share it through the active secure tunnel when one is running.',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadStatus()} disabled={isBusy}>
            <RefreshCw className="h-4 w-4" />
            {t('buttons.refresh')}
          </Button>
          {status?.session ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void runAction('restart')} disabled={isBusy || isStarting}>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('liveView.restart', { defaultValue: 'Restart' })}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void runAction('stop')} disabled={isBusy}>
                <SquareIcon className="h-4 w-4" />
                {t('liveView.stop', { defaultValue: 'Stop' })}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => void runAction('start')} disabled={!canStart || isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isPreparingManagedRuntime
                ? t('liveView.preparingRuntime', { defaultValue: 'Preparing runtime…' })
                : t('liveView.start', { defaultValue: 'Start' })}
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('liveView.detecting', { defaultValue: 'Detecting project runner…' })}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="space-y-2 border-b border-border/60 bg-card/30 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {status?.target?.available ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                )}
                <span className="truncate">
                  {environment?.label || status?.target?.label || t('liveView.noRunner', { defaultValue: 'No runner detected' })}
                </span>
                {(environment || status?.session) && (
                  <Badge variant={isRunning ? 'default' : 'outline'} className="ml-auto shrink-0">
                    {isStarting ? t('liveView.starting', { defaultValue: 'Starting' }) : environmentStatusLabel}
                  </Badge>
                )}
              </div>

              {status?.session && (
                <div className="flex min-w-0 items-center gap-2">
                  <Input value={shareUrl} readOnly className="h-8 min-w-0 flex-1 text-xs" />
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => void copyShareUrl()} title={t('buttons.copy')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                    disabled={!shareUrl}
                    title={t('liveView.openExternal', { defaultValue: 'Open externally' })}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {isPreparingManagedRuntime && (
                <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('liveView.preparingRuntime', { defaultValue: 'Preparing runtime…' })}
                  </div>
                  <p className="mt-2 text-xs text-sky-800/90 dark:text-sky-200/90">
                    {t('liveView.preparingRuntimeDescription', {
                      defaultValue: 'Pixcode is downloading and installing the runtime locally. This can take a moment on first use.',
                    })}
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {sessionError && (
                <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {t('liveView.runnerError', { defaultValue: 'Runner error' })}
                  </div>
                  <p className="mt-2 text-xs text-destructive/90">
                    {sessionError}
                  </p>
                  {sessionLogs.length > 0 && (
                    <pre className="mt-2 max-h-28 overflow-auto rounded-md border border-destructive/20 bg-background/70 p-2 text-xs text-muted-foreground">
                      {sessionLogs.join('\n')}
                    </pre>
                  )}
                </div>
              )}

              {targetUnavailableReason && !sessionError && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4" />
                    {t('liveView.runnerUnavailable', { defaultValue: 'Runner unavailable' })}
                  </div>
                  <p className="mt-2 text-xs text-amber-800/90 dark:text-amber-200/90">
                    {targetUnavailableReason}
                  </p>
                </div>
              )}

              {managedRuntimePending && !targetUnavailableReason && (
                <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300">
                    <RefreshCw className="h-4 w-4" />
                    {t('liveView.managedRuntimePreparing', { defaultValue: 'Pixcode will prepare the runtime' })}
                  </div>
                  <p className="mt-2 text-xs text-sky-800/90 dark:text-sky-200/90">
                    {status?.target?.reason || t('liveView.managedRuntimeDescription', {
                      defaultValue: 'Press Start and Pixcode will prepare the required local runtime automatically.',
                    })}
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
              {frameSrc ? (
                <div
                  className="mx-auto min-h-[260px] overflow-hidden rounded-md border border-border/70 bg-white shadow-sm"
                  style={{
                    width: `${viewportSize.width}px`,
                    height: `${viewportSize.height}px`,
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    key={`${frameSrc}:${reloadKey}:${viewportSize.width}x${viewportSize.height}`}
                    title={t('liveView.frameTitle', { defaultValue: 'Project Live View' })}
                    src={frameSrc}
                    className="h-full w-full bg-white"
                    sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[260px] items-center justify-center p-5 text-center">
                  <div className="max-w-sm">
                    <Globe className="mx-auto h-9 w-9 text-muted-foreground" />
                    <h3 className="mt-3 text-sm font-semibold text-foreground">
                      {t('liveView.emptyTitle', { defaultValue: 'Start Live View' })}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('liveView.emptyDescription', {
                        defaultValue: 'Pixcode will detect the project stack, start the local web server, and expose it here.',
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <details className="shrink-0 border-t border-border/60 bg-background/95">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                {t('liveView.controls', { defaultValue: 'Runner, share and logs' })}
              </summary>
              <div className="max-h-64 space-y-3 overflow-auto px-3 pb-3">
                {environment && (
                  <div aria-label={t('liveView.environment', { defaultValue: 'Environment' })} className="grid gap-2 rounded-md border border-border/60 bg-muted/25 p-3 text-xs">
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                      <span className="text-muted-foreground">{t('liveView.environment', { defaultValue: 'Environment' })}</span>
                      <span className="font-medium text-foreground">{environmentModeLabel}</span>
                    </div>
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                      <span className="text-muted-foreground">{t('liveView.statusLabel', { defaultValue: 'Status' })}</span>
                      <span className="font-medium text-foreground">{environmentStatusLabel}</span>
                    </div>
                    {environment.framework && (
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">{t('liveView.framework', { defaultValue: 'Framework' })}</span>
                        <span className="font-medium text-foreground">{environment.framework}</span>
                      </div>
                    )}
                    {command && (
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">{t('liveView.command', { defaultValue: 'Command' })}</span>
                        <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
                          {command.displayCommand}
                          {isCustomCommand && (
                            <Badge variant="outline" className="ml-2 align-middle">
                              {t('liveView.custom', { defaultValue: 'Custom' })}
                            </Badge>
                          )}
                        </span>
                      </div>
                    )}
                    {(environment.port || environment.upstreamUrl) && (
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">{t('liveView.upstream', { defaultValue: 'Upstream' })}</span>
                        <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
                          {environment.upstreamUrl || `:${environment.port}`}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                      <span className="text-muted-foreground">{t('liveView.publicTunnel', { defaultValue: 'Public tunnel' })}</span>
                      <span className="font-medium text-foreground">{environmentTunnelLabel}</span>
                    </div>
                    {environmentDiagnostics?.reason && (
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">{t('liveView.diagnostics', { defaultValue: 'Diagnostics' })}</span>
                        <span className="min-w-0 break-words text-muted-foreground">{environmentDiagnostics.reason}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('liveView.viewport', { defaultValue: 'Viewport' })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {viewportSize.width} × {viewportSize.height}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['desktop', 'tablet', 'mobile'] as const).map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant={viewportPreset === preset ? 'default' : 'outline'}
                        size="sm"
                        className="h-8"
                        onClick={() => selectViewportPreset(preset)}
                      >
                        {t(`liveView.viewport${preset[0].toUpperCase()}${preset.slice(1)}`, {
                          defaultValue: preset[0].toUpperCase() + preset.slice(1),
                        })}
                      </Button>
                    ))}
                    <label className="sr-only" htmlFor="live-view-width">
                      {t('liveView.viewportWidth', { defaultValue: 'Width' })}
                    </label>
                    <Input
                      id="live-view-width"
                      type="number"
                      min={VIEWPORT_MIN}
                      max={VIEWPORT_MAX}
                      value={viewportSize.width}
                      onChange={(event) => updateViewportDimension('width', event.target.value)}
                      className="h-8 w-20 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <label className="sr-only" htmlFor="live-view-height">
                      {t('liveView.viewportHeight', { defaultValue: 'Height' })}
                    </label>
                    <Input
                      id="live-view-height"
                      type="number"
                      min={VIEWPORT_MIN}
                      max={VIEWPORT_MAX}
                      value={viewportSize.height}
                      onChange={(event) => updateViewportDimension('height', event.target.value)}
                      className="h-8 w-20 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="live-view-command">
                    {t('liveView.customCommand', { defaultValue: 'Custom command' })}
                  </label>
                  <Input
                    id="live-view-command"
                    value={customCommand}
                    onChange={(event) => setCustomCommand(event.target.value)}
                    placeholder={t('liveView.customPlaceholder', { defaultValue: 'npm run dev, python app.py, go run .' })}
                    disabled={isBusy || isRunning || isStarting}
                  />
                </div>

                {status?.session && (
                  <p className="text-xs text-muted-foreground">
                    {status.urls?.external
                      ? t('liveView.externalActive', { defaultValue: 'Secure tunnel is active; this link can be shared outside your network.' })
                      : t('liveView.localOnly', { defaultValue: 'External Access is off; this link is local to this Pixcode server.' })}
                  </p>
                )}

                {copied && <p className="text-xs text-emerald-500">{t('buttons.copied', { defaultValue: 'Copied' })}</p>}

                {environmentLogs.length ? (
                  <pre className="max-h-32 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                    {environmentLogs.join('\n')}
                  </pre>
                ) : null}
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
