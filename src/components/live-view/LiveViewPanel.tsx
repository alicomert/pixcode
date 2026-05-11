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
  command?: {
    id: string;
    label: string;
    displayCommand: string;
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
  } | null;
  port?: number | null;
  upstreamUrl?: string | null;
  error?: string | null;
  log?: string[];
};

type LiveViewStatus = {
  target: LiveViewTarget;
  session: LiveViewSession | null;
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
  const isRunning = status?.session?.status === 'running';
  const isStarting = status?.session?.status === 'starting';
  const canStart = Boolean(status?.target?.available || customCommand.trim());

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [shareUrl]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="truncate text-sm font-semibold text-foreground">
              {t('liveView.title', { defaultValue: 'Live View' })}
            </h2>
            {status?.target?.available && (
              <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {status.target.framework || status.target.label}
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
            <Button type="button" variant="outline" size="sm" onClick={() => void runAction('stop')} disabled={isBusy}>
              <SquareIcon className="h-4 w-4" />
              {t('liveView.stop', { defaultValue: 'Stop' })}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => void runAction('start')} disabled={!canStart || isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t('liveView.start', { defaultValue: 'Start' })}
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-border/60 p-4 lg:border-b-0 lg:border-r">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('liveView.detecting', { defaultValue: 'Detecting project runner…' })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {status?.target?.available ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  {status?.target?.label || t('liveView.noRunner', { defaultValue: 'No runner detected' })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {status?.target?.command?.displayCommand
                    || status?.target?.reason
                    || t('liveView.staticHint', { defaultValue: 'Static HTML will be served directly when index.html exists.' })}
                </p>
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
                <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('liveView.shareLink', { defaultValue: 'Share link' })}
                    </span>
                    <Badge variant={isRunning ? 'default' : 'outline'}>
                      {isStarting ? t('liveView.starting', { defaultValue: 'Starting' }) : status.session.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input value={shareUrl} readOnly className="text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => void copyShareUrl()} title={t('buttons.copy')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                      disabled={!shareUrl}
                      title={t('liveView.openExternal', { defaultValue: 'Open externally' })}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  {copied && <p className="text-xs text-emerald-500">{t('buttons.copied', { defaultValue: 'Copied' })}</p>}
                  <p className="text-xs text-muted-foreground">
                    {status.urls?.external
                      ? t('liveView.externalActive', { defaultValue: 'Secure tunnel is active; this link can be shared outside your network.' })
                      : t('liveView.localOnly', { defaultValue: 'External Access is off; this link is local to this Pixcode server.' })}
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {status?.session?.log?.length ? (
                <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                  {status.session.log.slice(-12).join('\n')}
                </pre>
              ) : null}
            </div>
          )}
        </aside>

        <div className="min-h-0 bg-muted/20">
          {frameSrc ? (
            <iframe
              key={`${frameSrc}:${reloadKey}`}
              title={t('liveView.frameTitle', { defaultValue: 'Project Live View' })}
              src={frameSrc}
              className="h-full min-h-[360px] w-full bg-white"
              sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
            />
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <Globe className="mx-auto h-10 w-10 text-muted-foreground" />
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
      </div>
    </section>
  );
}
