import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Clipboard, Cloud, Globe, RefreshCw, Smartphone } from '@/lib/icons';

import { authenticatedFetch } from '../../../../../utils/api';

type NetworkEndpoint = {
  host: string;
  label: string;
  family: string;
  url: string;
};

type EndpointsResponse = {
  port: number;
  hostname: string;
  endpoints: NetworkEndpoint[];
};

type UpnpState = {
  mapped: boolean;
  port: number | null;
  externalIp: string | null;
  externalUrl: string | null;
  error: string | null;
};

type TunnelState = {
  running: boolean;
  binary: string | null;
  url: string | null;
  error: string | null;
};

type ExternalState = { upnp: UpnpState; tunnel: TunnelState };

type EndpointQr = {
  key: string;
  label: string;
  url: string;
  dataUrl: string | null;
};

const renderQrDataUrl = async (url: string): Promise<string | null> => {
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 220 });
  } catch (err) {
    console.error('QR generation failed for', url, err);
    return null;
  }
};

export default function MobileSettingsTab() {
  const { t } = useTranslation('settings');

  const [data, setData] = useState<EndpointsResponse | null>(null);
  const [qrs, setQrs] = useState<EndpointQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [external, setExternal] = useState<ExternalState | null>(null);
  const [externalQrs, setExternalQrs] = useState<EndpointQr[]>([]);
  const [upnpBusy, setUpnpBusy] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/network/endpoints');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as EndpointsResponse;
      setData(json);

      const generated = await Promise.all(
        json.endpoints.map(async (endpoint) => ({
          key: endpoint.url,
          label: endpoint.label,
          url: endpoint.url,
          dataUrl: await renderQrDataUrl(endpoint.url),
        })),
      );
      setQrs(generated);
    } catch (err) {
      console.error('Failed to load network endpoints', err);
      setError(t('mobile.error') as string);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadExternalState = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/network/external');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as ExternalState;
      setExternal(json);

      const urls: { key: string; label: string; url: string }[] = [];
      if (json.upnp.mapped && json.upnp.externalUrl) {
        urls.push({ key: `upnp:${json.upnp.externalUrl}`, label: 'UPnP', url: json.upnp.externalUrl });
      }
      if (json.tunnel.running && json.tunnel.url) {
        urls.push({ key: `tunnel:${json.tunnel.url}`, label: json.tunnel.binary || 'tunnel', url: json.tunnel.url });
      }
      const generated = await Promise.all(
        urls.map(async (u) => ({ ...u, dataUrl: await renderQrDataUrl(u.url) })),
      );
      setExternalQrs(generated);
    } catch (err) {
      console.error('Failed to load external state', err);
    }
  }, []);

  useEffect(() => {
    void loadEndpoints();
    void loadExternalState();
  }, [loadEndpoints, loadExternalState]);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((prev) => (prev === url ? null : prev)), 1500);
    } catch (err) {
      console.error('Clipboard copy failed', err);
    }
  };

  const toggleUpnp = async () => {
    setUpnpBusy(true);
    setExternalError(null);
    try {
      const isMapped = external?.upnp.mapped;
      const response = await authenticatedFetch('/api/network/upnp', {
        method: isMapped ? 'DELETE' : 'POST',
      });
      const body = (await response.json()) as { error?: string; upnp?: UpnpState };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      await loadExternalState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExternalError(msg);
    } finally {
      setUpnpBusy(false);
    }
  };

  const toggleTunnel = async () => {
    setTunnelBusy(true);
    setExternalError(null);
    try {
      const isRunning = external?.tunnel.running;
      const response = await authenticatedFetch('/api/network/tunnel', {
        method: isRunning ? 'DELETE' : 'POST',
      });
      const body = (await response.json()) as { error?: string; tunnel?: TunnelState };
      if (!response.ok) {
        if (response.status === 424) {
          setExternalError(t('mobile.external.tunnelUnavailable') as string);
        } else {
          throw new Error(body.error || `HTTP ${response.status}`);
        }
      }
      await loadExternalState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExternalError(msg);
    } finally {
      setTunnelBusy(false);
    }
  };

  const renderQrCard = (entry: EndpointQr) => {
    const isCopied = copiedUrl === entry.url;
    return (
      <div
        key={entry.key}
        className="flex items-center gap-4 rounded-xl border border-border/60 bg-background p-4"
      >
        <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-lg bg-white p-1">
          {entry.dataUrl ? (
            <img src={entry.dataUrl} alt={`QR for ${entry.url}`} className="h-full w-full" />
          ) : (
            <div className="text-xs text-muted-foreground">—</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {entry.label}
          </div>
          <button
            type="button"
            onClick={() => void handleCopy(entry.url)}
            className="mt-1 block w-full truncate text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
            title={entry.url}
          >
            {entry.url}
          </button>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(entry.url)}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Clipboard className="h-3 w-3" />
              {isCopied ? t('mobile.copied') : t('mobile.copy')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{t('mobile.title')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('mobile.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadEndpoints();
            void loadExternalState();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('mobile.refresh')}
        </button>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-4">
          <li>{t('mobile.steps.sameNetwork')}</li>
          <li>{t('mobile.steps.scan')}</li>
          <li>{t('mobile.steps.login')}</li>
        </ol>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('mobile.loading')}
        </div>
      )}

      {data && qrs.length === 0 && !loading && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          {t('mobile.noEndpoints')}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">{qrs.map(renderQrCard)}</div>

      {/* External access */}
      <div className="border-t border-border/40 pt-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('mobile.external.title')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('mobile.external.description')}</p>
          </div>
        </div>

        {externalError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
            {externalError}
          </div>
        )}

        {/* UPnP row */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{t('mobile.external.upnpTitle')}</span>
              {external?.upnp.mapped && (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                  {t('mobile.external.upnpEnabled')}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('mobile.external.upnpDescription')}</p>
            {external?.upnp.error && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{external.upnp.error}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void toggleUpnp()}
            disabled={upnpBusy}
            className="ml-3 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            {upnpBusy && <RefreshCw className="h-3 w-3 animate-spin" />}
            {external?.upnp.mapped ? t('mobile.external.upnpDisable') : t('mobile.external.upnpEnable')}
          </button>
        </div>

        {/* Tunnel row */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{t('mobile.external.tunnelTitle')}</span>
              {external?.tunnel.running && (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                  {t('mobile.external.tunnelRunning')} · {external.tunnel.binary}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('mobile.external.tunnelDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => void toggleTunnel()}
            disabled={tunnelBusy}
            className="ml-3 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            {tunnelBusy && <RefreshCw className="h-3 w-3 animate-spin" />}
            {external?.tunnel.running ? t('mobile.external.tunnelStop') : t('mobile.external.tunnelStart')}
          </button>
        </div>

        {externalQrs.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">{externalQrs.map(renderQrCard)}</div>
        )}
      </div>

      {data && (
        <div className="border-t border-border/40 pt-3 text-[11px] text-muted-foreground/80">
          {t('mobile.hostLabel')}: <span className="font-mono">{data.hostname}</span>{' '}
          · {t('mobile.portLabel')}: <span className="font-mono">{data.port}</span>
        </div>
      )}
    </div>
  );
}
