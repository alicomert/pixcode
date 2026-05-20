import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../utils/api';

import { AlertCircle, Check, Download, Loader2, RefreshCw, Terminal, Workflow } from '@/lib/icons';

type HermesInstallStatus = {
  installed: boolean;
  command: string | null;
  version: string | null;
  error: string | null;
};

const emptyStatus: HermesInstallStatus = {
  installed: false,
  command: null,
  version: null,
  error: null,
};

export default function HermesSettingsTab() {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<HermesInstallStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/install-status', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      setStatus({
        installed: Boolean(body?.installed),
        command: typeof body?.command === 'string' ? body.command : null,
        version: typeof body?.version === 'string' ? body.version : null,
        error: typeof body?.error === 'string' ? body.error : null,
      });
    } catch (error) {
      setStatus({
        ...emptyStatus,
        error: error instanceof Error ? error.message : t('hermes.statusFailed', { defaultValue: 'Unable to check Hermes Agent.' }),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const openHermesTerminal = (mode: 'start' | 'install') => {
    window.dispatchEvent(new CustomEvent('pixcode:hermes-terminal', {
      detail: { mode },
    }));
  };

  const statusLabel = status.installed
    ? status.version || t('hermes.ready', { defaultValue: 'Ready' })
    : t('hermes.notInstalled', { defaultValue: 'Not installed' });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          <span className="font-mono text-lg font-semibold leading-none">H</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">
            {t('hermes.title', { defaultValue: 'Hermes Agent' })}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('hermes.description', {
              defaultValue: 'Manage Hermes Agent as a Pixcode-controlled project terminal with MCP access to projects, provider status, and visible CLI launches.',
            })}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : status.installed ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <div className="text-sm font-semibold text-foreground">
                {t('hermes.statusTitle', { defaultValue: 'Install status' })}
              </div>
            </div>
            <div className="mt-2 text-sm text-foreground">{statusLabel}</div>
            {status.command && (
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={status.command}>
                {status.command}
              </div>
            )}
            {status.error && !status.installed && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
                {status.error}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => openHermesTerminal('start')}
            >
              <Terminal className="mr-2 h-4 w-4" />
              {t('hermes.start', { defaultValue: 'Start Hermes' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openHermesTerminal('install')}
            >
              <Download className="mr-2 h-4 w-4" />
              {status.installed
                ? t('hermes.repair', { defaultValue: 'Repair command' })
                : t('hermes.install', { defaultValue: 'Install' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refreshStatus()}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('hermes.refresh', { defaultValue: 'Refresh' })}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {t('hermes.pixcodeControlTitle', { defaultValue: 'Pixcode control' })}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('hermes.pixcodeControlDescription', {
                defaultValue: 'Pixcode configures the Hermes MCP server before launch, so Hermes can inspect workspaces and open provider terminals inside the visible Pixcode UI when you ask it to.',
              })}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
