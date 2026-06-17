import QRCode from 'qrcode';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input } from '../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../utils/api';

import {
  CheckCircle,
  Clipboard,
  Cloud,
  ExternalLink,
  Globe,
  Monitor,
  RefreshCw,
  Shield,
  Smartphone,
  Users,
} from '@/lib/icons';

type NetworkEndpoint = {
  host: string;
  label: string;
  family: string;
  scope?: string;
  kind?: string;
  usableForSameNetwork?: boolean;
  url: string;
};

type EndpointsResponse = {
  port: number;
  hostname: string;
  endpoints: NetworkEndpoint[];
};

type RemoteAccessConfig = {
  id: string;
  mode: string;
  label: string;
  url?: string | null;
  targetPort?: number;
  public?: boolean;
  privateOnly?: boolean;
  status?: string;
  notes?: string;
};

type RemoteAccessState = {
  host?: string;
  platform?: string;
  localUrl?: string;
  configs?: RemoteAccessConfig[];
};

type TailscaleState = {
  installed: boolean;
  loggedIn: boolean;
  backendState?: string | null;
  deviceName?: string | null;
  magicDnsName?: string | null;
  tailscaleIp?: string | null;
  pixcodeUrl?: string | null;
  installUrl?: string | null;
  installPlan?: {
    platform?: string;
    displayCommand?: string;
    docsUrl?: string;
    note?: string;
  } | null;
  message?: string;
};

type TailscaleActionResult = {
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string | null;
  authUrl?: string | null;
  message?: string;
  tailscale?: TailscaleState;
};

type HealthState = {
  url: string;
  reachable: boolean;
  https: boolean;
  statusCode?: number | null;
  message?: string;
};

type TunnelInstallHint = {
  title?: string;
  message?: string;
  commands?: string[];
  docsUrl?: string;
};

type TunnelState = {
  running: boolean;
  binary: string | null;
  provider?: string | null;
  url: string | null;
  error: string | null;
  installHint?: TunnelInstallHint | null;
};

type ExternalState = {
  tunnel: TunnelState;
};

type AccessQr = {
  key: string;
  label: string;
  url: string;
  qrUrl?: string;
  magicLogin?: boolean;
  dataUrl: string | null;
};

type QrLoginSettings = {
  enabled: boolean;
  ttlSeconds: number;
};

const DEFAULT_QR_LOGIN_SETTINGS: QrLoginSettings = {
  enabled: false,
  ttlSeconds: 300,
};

const accessModes = ['lan', 'tailscale', 'cloudflare_tunnel'];
const connectionOptions = ['sameNetwork', 'tailscale', 'cloudflare'] as const;

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

const renderQrDataUrl = async (url: string): Promise<string | null> => {
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 220 });
  } catch (err) {
    console.error('QR generation failed for', url, err);
    return null;
  }
};

async function buildAccessQr(
  entry: { key: string; label: string; url: string },
  qrLogin: QrLoginSettings,
): Promise<AccessQr> {
  let qrUrl = entry.url;
  let magicLogin = false;

  if (qrLogin.enabled) {
    try {
      const data = await readJson<{ qrUrl?: string }>('/api/auth/qr-login/token', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: entry.url }),
      });
      if (data.qrUrl) {
        qrUrl = data.qrUrl;
        magicLogin = true;
      }
    } catch (error) {
      console.warn('QR login token generation failed:', error);
    }
  }

  return {
    ...entry,
    qrUrl,
    magicLogin,
    dataUrl: await renderQrDataUrl(qrUrl),
  };
}

export default function AccessSettingsTab() {
  const { t } = useTranslation('settings');
  const [endpoints, setEndpoints] = useState<EndpointsResponse | null>(null);
  const [remoteAccess, setRemoteAccess] = useState<RemoteAccessState | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleState | null>(null);
  const [external, setExternal] = useState<ExternalState | null>(null);
  const [qrLogin, setQrLogin] = useState<QrLoginSettings>(DEFAULT_QR_LOGIN_SETTINGS);
  const [networkQrs, setNetworkQrs] = useState<AccessQr[]>([]);
  const [externalQrs, setExternalQrs] = useState<AccessQr[]>([]);
  const [tailscaleQr, setTailscaleQr] = useState<AccessQr | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [qrLoginBusy, setQrLoginBusy] = useState(false);
  const [tailscaleBusy, setTailscaleBusy] = useState<'install' | 'login' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [tailscaleAction, setTailscaleAction] = useState<TailscaleActionResult | null>(null);
  const [tunnelInstallHint, setTunnelInstallHint] = useState<TunnelInstallHint | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [qrRefreshNonce, setQrRefreshNonce] = useState(0);
  const [form, setForm] = useState({
    mode: 'custom_domain',
    label: '',
    url: '',
    targetPort: '3001',
  });

  const localLinks = useMemo(() => {
    const loopback = remoteAccess?.localUrl
      ? [{ host: '127.0.0.1', label: t('access.local.thisDevice'), family: 'IPv4', url: remoteAccess.localUrl }]
      : [];
    return [...loopback, ...(endpoints?.endpoints || [])];
  }, [endpoints?.endpoints, remoteAccess?.localUrl, t]);

  const sameNetworkLinks = useMemo(() => endpoints?.endpoints || [], [endpoints?.endpoints]);
  const primaryLanUrl = sameNetworkLinks[0]?.url || remoteAccess?.localUrl || '';
  const tunnelUrl = external?.tunnel?.url || '';
  const tailscaleUrl = tailscale?.pixcodeUrl || '';

  const hydrateExternalQrs = useCallback(async (externalData: ExternalState | null, qrSettings = DEFAULT_QR_LOGIN_SETTINGS) => {
    const urls: Array<{ key: string; label: string; url: string }> = [];
    if (externalData?.tunnel?.running && externalData.tunnel.url) {
      urls.push({
        key: `tunnel:${externalData.tunnel.url}`,
        label: t('access.cloudflare.qrLabel'),
        url: externalData.tunnel.url,
      });
    }

    setExternalQrs(await Promise.all(urls.map((entry) => buildAccessQr(entry, qrSettings))));
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [networkData, remoteData, tailscaleData, externalData, qrLoginData] = await Promise.all([
        readJson<EndpointsResponse>('/api/network/endpoints'),
        readJson<{ remoteAccess: RemoteAccessState }>('/api/platformization/remote-access'),
        readJson<{ tailscale: TailscaleState }>('/api/platformization/remote-access/tailscale'),
        readJson<ExternalState>('/api/network/external'),
        readJson<{ settings: QrLoginSettings }>('/api/auth/qr-login/settings'),
      ]);
      const nextQrLogin = qrLoginData.settings || DEFAULT_QR_LOGIN_SETTINGS;
      setEndpoints(networkData);
      setRemoteAccess(remoteData.remoteAccess);
      setTailscale(tailscaleData.tailscale);
      setExternal(externalData);
      setQrLogin(nextQrLogin);
      setTunnelInstallHint(externalData.tunnel?.installHint ?? null);
      await hydrateExternalQrs(externalData, nextQrLogin);
      setTailscaleQr(tailscaleData.tailscale.pixcodeUrl ? await buildAccessQr({
        key: `tailscale:${tailscaleData.tailscale.pixcodeUrl}`,
        label: t('access.links.tailscale'),
        url: tailscaleData.tailscale.pixcodeUrl,
      }, nextQrLogin) : null);
      setForm((current) => ({
        ...current,
        targetPort: String(remoteData.remoteAccess?.configs?.[0]?.targetPort || networkData.port || current.targetPort),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hydrateExternalQrs, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      const generated = await Promise.all(sameNetworkLinks.map((endpoint) => buildAccessQr({
        key: endpoint.url,
        label: endpoint.label,
        url: endpoint.url,
      }, qrLogin)));
      if (!cancelled) {
        setNetworkQrs(generated);
      }
    };
    void generate();
    return () => {
      cancelled = true;
    };
  }, [sameNetworkLinks, qrLogin, qrRefreshNonce]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((previous) => (previous === url ? null : previous)), 1500);
    } catch {
      setCopiedUrl(null);
    }
  };

  const saveAccessPath = async () => {
    setSaving(true);
    setError(null);
    try {
      await readJson('/api/platformization/remote-access/configs', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const saveDetectedAccessPath = async (mode: string, label: string, url: string) => {
    if (!url) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await readJson('/api/platformization/remote-access/configs', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          label,
          url,
          targetPort: endpoints?.port || form.targetPort,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const checkUrl = async (url = form.url) => {
    if (!url.trim()) {
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const data = await readJson<{ health: HealthState }>('/api/platformization/remote-access/health', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      setHealth(data.health);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const toggleTunnel = async () => {
    setTunnelBusy(true);
    setExternalError(null);
    try {
      const isRunning = Boolean(external?.tunnel?.running);
      const response = await authenticatedFetch('/api/network/tunnel', {
        method: isRunning ? 'DELETE' : 'POST',
        body: isRunning ? undefined : JSON.stringify({ provider: 'cloudflare' }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        installHint?: TunnelInstallHint;
        tunnel?: TunnelState;
      };

      if (!response.ok) {
        setTunnelInstallHint(body.installHint ?? body.tunnel?.installHint ?? null);
        if (body.tunnel) {
          const nextExternal = { tunnel: body.tunnel };
          setExternal(nextExternal);
          await hydrateExternalQrs(nextExternal);
        }
        if (response.status === 424) {
          setExternalError(t('access.cloudflare.installNeeded'));
          return;
        }
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      await load();
    } catch (err) {
      setExternalError(err instanceof Error ? err.message : String(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const runTailscaleAction = async (action: 'install' | 'login') => {
    setTailscaleBusy(action);
    setTailscaleAction(null);
    setError(null);
    try {
      const data = await readJson<{ result: TailscaleActionResult }>(`/api/platformization/remote-access/tailscale/${action}`, {
        method: 'POST',
      });
      setTailscaleAction(data.result);
      if (data.result.tailscale) {
        setTailscale(data.result.tailscale);
        setTailscaleQr(data.result.tailscale.pixcodeUrl ? {
          key: `tailscale:${data.result.tailscale.pixcodeUrl}`,
          label: t('access.links.tailscale'),
          url: data.result.tailscale.pixcodeUrl,
          dataUrl: await renderQrDataUrl(data.result.tailscale.pixcodeUrl),
        } : null);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTailscaleBusy(null);
    }
  };

  const updateQrLogin = async (enabled: boolean) => {
    setQrLoginBusy(true);
    setError(null);
    try {
      const data = await readJson<{ settings: QrLoginSettings }>('/api/auth/qr-login/settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          ttlSeconds: qrLogin.ttlSeconds,
        }),
      });
      setQrLogin(data.settings || DEFAULT_QR_LOGIN_SETTINGS);
      setQrRefreshNonce((value) => value + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setQrLoginBusy(false);
    }
  };

  const renderQrCard = (entry: AccessQr) => {
    const isCopied = copiedUrl === entry.url;
    return (
      <div
        key={entry.key}
        className="flex min-w-0 flex-col gap-4 rounded-md border border-border/60 bg-background p-4 sm:flex-row sm:items-center"
      >
        <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-md bg-white p-1">
          {entry.dataUrl ? (
            <img src={entry.dataUrl} alt={t('access.qrAlt', { url: entry.url })} className="h-full w-full" />
          ) : (
            <QrFallback />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">{entry.label}</div>
            {entry.magicLogin && <Badge variant="secondary">{t('access.quickLogin.badge')}</Badge>}
          </div>
          <button
            type="button"
            title={entry.url}
            onClick={() => void copyUrl(entry.url)}
            className="mt-1 block w-full break-all text-left font-mono text-sm font-medium leading-relaxed text-foreground hover:text-primary"
          >
            {entry.url}
          </button>
          {entry.magicLogin && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('access.quickLogin.qrNote')}</p>
          )}
          <Button
            type="button"
            size="sm"
            variant={isCopied ? 'default' : 'outline'}
            className="mt-2 h-8 px-2 text-xs"
            onClick={() => void copyUrl(entry.url)}
          >
            <Clipboard className="h-3.5 w-3.5" />
            {isCopied ? t('access.copied') : t('access.copy')}
          </Button>
        </div>
      </div>
    );
  };

  const tunnelHint = tunnelInstallHint || external?.tunnel?.installHint || null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('access.title')}</h3>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t('access.description')}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('access.refresh')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="rounded-md border border-primary/20 bg-primary/5 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{t('access.guide.title')}</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('access.guide.description')}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {connectionOptions.map((option, index) => (
            <div key={option} className="rounded-md border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <h5 className="text-sm font-semibold text-foreground">{t(`access.options.${option}.title`)}</h5>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(`access.options.${option}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{t('access.quickLogin.title')}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('access.quickLogin.description')}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {qrLogin.enabled
                  ? t('access.quickLogin.enabledNote', { seconds: qrLogin.ttlSeconds })
                  : t('access.quickLogin.disabledNote')}
              </p>
            </div>
          </div>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={qrLogin.enabled}
              disabled={qrLoginBusy}
              onChange={(event) => void updateQrLogin(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {qrLogin.enabled ? t('access.quickLogin.enabled') : t('access.quickLogin.disabled')}
          </label>
        </div>
      </section>

      <section className="space-y-5">
        <ConnectionPanel
          icon={<Monitor className="h-5 w-5" />}
          title={t('access.local.title')}
          description={t('access.local.description')}
          badge={sameNetworkLinks.length ? t('access.status.ready') : t('access.status.detecting')}
        >
          <div className="space-y-4">
            <div className="rounded-md border border-border/60 bg-muted/20 p-4">
              <div className="text-xs font-medium uppercase text-muted-foreground">{t('access.local.thisDevice')}</div>
              <div className="mt-1 truncate font-mono text-xs text-foreground">{remoteAccess?.localUrl || '-'}</div>
              {remoteAccess?.localUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant={copiedUrl === remoteAccess.localUrl ? 'default' : 'outline'}
                  className="mt-2 h-8 px-2 text-xs"
                  onClick={() => void copyUrl(remoteAccess.localUrl || '')}
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copiedUrl === remoteAccess.localUrl ? t('access.copied') : t('access.copy')}
                </Button>
              )}
            </div>
            {networkQrs.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {networkQrs.map(renderQrCard)}
              </div>
            ) : (
              <div className="rounded-md border border-border/60 bg-background p-4 text-sm text-muted-foreground">
                {loading ? t('access.local.loading') : t('access.local.empty')}
              </div>
            )}
            {primaryLanUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void saveDetectedAccessPath('lan', t('access.local.saveLabel'), primaryLanUrl)}
                disabled={saving}
              >
                {t('access.local.save')}
              </Button>
            )}
          </div>
        </ConnectionPanel>

        <ConnectionPanel
          icon={<Cloud className="h-5 w-5" />}
          title={t('access.cloudflare.title')}
          description={t('access.cloudflare.description')}
          badge={external?.tunnel?.running ? t('access.cloudflare.running') : t('access.status.optional')}
          tone="amber"
        >
          <div className="space-y-4">
            {externalError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {externalError}
              </div>
            )}
            <div className="flex flex-col gap-4 rounded-md border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{t('access.cloudflare.secureLink')}</span>
                  {external?.tunnel?.running && (
                    <Badge variant="secondary">
                      {t('access.cloudflare.running')} · {external.tunnel.binary}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('access.cloudflare.help')}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full flex-shrink-0 sm:w-auto" onClick={() => void toggleTunnel()} disabled={tunnelBusy}>
                {tunnelBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {external?.tunnel?.running ? t('access.cloudflare.stop') : t('access.cloudflare.start')}
              </Button>
            </div>

            {externalQrs.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {externalQrs.map(renderQrCard)}
              </div>
            )}

            {tunnelUrl && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveDetectedAccessPath('cloudflare_tunnel', t('access.cloudflare.saveLabel'), tunnelUrl)}
                  disabled={saving}
                >
                  {t('access.cloudflare.save')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void checkUrl(tunnelUrl)} disabled={checking}>
                  {checking && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {t('access.check')}
                </Button>
              </div>
            )}

            {tunnelHint && (
              <InstallHint hint={tunnelHint} fallbackTitle={t('access.cloudflare.installTitle')} />
            )}
          </div>
        </ConnectionPanel>
      </section>

      <section className="space-y-5">
        <ConnectionPanel
          icon={<Users className="h-5 w-5" />}
          title={t('access.tailscale.title')}
          description={tailscale?.message || t('access.tailscale.description')}
          badge={tailscaleUrl ? t('access.status.ready') : t('access.status.guided')}
        >
          <div className="space-y-4">
            {tailscaleUrl ? (
              <>
                {tailscaleQr && renderQrCard(tailscaleQr)}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveDetectedAccessPath('tailscale', t('access.tailscale.saveLabel'), tailscaleUrl)}
                    disabled={saving}
                  >
                    {t('access.tailscale.save')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void checkUrl(tailscaleUrl)} disabled={checking}>
                    {checking && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    {t('access.check')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border/60 bg-background p-4">
                <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted-foreground">
                  <li>{t('access.tailscale.steps.installServer')}</li>
                  <li>{t('access.tailscale.steps.installUserDevice')}</li>
                  <li>{t('access.tailscale.steps.login')}</li>
                  <li>{t('access.tailscale.steps.refresh')}</li>
                </ol>
                {tailscale?.installPlan?.displayCommand && (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                    <div className="text-xs font-medium text-foreground">{t('access.tailscale.installCommand')}</div>
                    <code className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">
                      {tailscale.installPlan.displayCommand}
                    </code>
                    {tailscale.installPlan.note && (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{tailscale.installPlan.note}</p>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!tailscale?.installed && (
                    <Button type="button" size="sm" onClick={() => void runTailscaleAction('install')} disabled={tailscaleBusy !== null}>
                      {tailscaleBusy === 'install' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      {t('access.tailscale.installDevice')}
                    </Button>
                  )}
                  {tailscale?.installed && !tailscale?.loggedIn && (
                    <Button type="button" size="sm" onClick={() => void runTailscaleAction('login')} disabled={tailscaleBusy !== null}>
                      {tailscaleBusy === 'login' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      {t('access.tailscale.signIn')}
                    </Button>
                  )}
                  {tailscale?.installUrl && (
                    <a
                      href={tailscale.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('access.tailscale.openInstall')}
                    </a>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {t('access.refresh')}
                  </Button>
                </div>
                {tailscaleAction && (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                    <div className="font-medium text-foreground">{tailscaleAction.message || (tailscaleAction.ok ? t('access.tailscale.actionDone') : t('access.tailscale.needsAttention'))}</div>
                    {tailscaleAction.authUrl && (
                      <a href={tailscaleAction.authUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('access.tailscale.openLogin')}
                      </a>
                    )}
                    {(tailscaleAction.stdout || tailscaleAction.stderr || tailscaleAction.error) && (
                      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] text-muted-foreground">
                        {[tailscaleAction.stdout, tailscaleAction.stderr, tailscaleAction.error].filter(Boolean).join('\n')}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ConnectionPanel>

        <ConnectionPanel
          icon={<Smartphone className="h-5 w-5" />}
          title={t('access.advanced.title')}
          description={t('access.advanced.description')}
          badge={t('access.advanced.badge')}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('access.fields.mode')}</span>
              <select
                value={form.mode}
                onChange={(event) => setForm({ ...form, mode: event.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {accessModes.map((mode) => <option key={mode} value={mode}>{t(`access.modes.${mode}`)}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('access.fields.label')}</span>
              <Input placeholder={t('access.fields.label')} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('access.fields.url')}</span>
              <Input placeholder={t('access.fields.url')} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('access.fields.port')}</span>
              <Input placeholder={t('access.fields.port')} value={form.targetPort} onChange={(event) => setForm({ ...form, targetPort: event.target.value })} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveAccessPath()} disabled={saving || !form.url.trim()}>
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {t('access.save')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void checkUrl()} disabled={checking || !form.url.trim()}>
              {checking && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {t('access.check')}
            </Button>
          </div>
          {health && (
            <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-foreground">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>{health.reachable ? t('access.health.reachable') : t('access.health.unreachable')}</span>
                <Badge variant={health.https ? 'secondary' : 'destructive'}>{health.https ? 'HTTPS' : 'HTTP'}</Badge>
              </div>
              <div className="mt-1 text-muted-foreground">{health.message}</div>
            </div>
          )}
        </ConnectionPanel>
      </section>

      <section className="rounded-md border border-border/60 bg-background">
        <div className="border-b border-border/60 bg-muted/20 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-foreground">{t('access.configured.title')}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('access.configured.description')}</p>
        </div>
        <div className="divide-y divide-border/50">
          {(remoteAccess?.configs || []).map((config) => (
            <div key={config.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{config.label}</div>
                  <button
                    type="button"
                    className="mt-1 block max-w-full break-all text-left font-mono text-xs leading-relaxed text-muted-foreground hover:text-foreground"
                    onClick={() => config.url && void copyUrl(config.url)}
                  >
                    {config.url || t('access.configured.noUrl')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{t(`access.modes.${config.mode}`, { defaultValue: config.mode })}</Badge>
                  <Badge variant={config.public ? 'destructive' : 'secondary'}>
                    {config.public ? t('access.configured.public') : t('access.configured.private')}
                  </Badge>
                </div>
              </div>
              {config.url && (
                <Button className="mt-2" type="button" size="sm" variant="outline" onClick={() => void checkUrl(config.url || '')}>
                  {t('access.check')}
                </Button>
              )}
            </div>
          ))}
          {(remoteAccess?.configs || []).length === 0 && (
            <div className="p-5 text-sm text-muted-foreground">{t('access.configured.empty')}</div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('access.team.title')}</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('access.team.description')}</p>
          </div>
        </div>
      </section>

      <div className="sr-only">
        {localLinks.map((endpoint) => (
          <span key={endpoint.url}>{endpoint.url}</span>
        ))}
      </div>
    </div>
  );
}

function ConnectionPanel({
  icon,
  title,
  description,
  badge,
  tone = 'primary',
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  tone?: 'primary' | 'amber';
  children: ReactNode;
}) {
  const toneClass = tone === 'amber'
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : 'bg-primary/10 text-primary';

  return (
    <section className="rounded-md border border-border/60 bg-background">
      <div className="border-b border-border/60 bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">{badge}</Badge>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function InstallHint({ hint, fallbackTitle }: { hint: TunnelInstallHint; fallbackTitle: string }) {
  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-100">
      <div className="font-semibold">{hint.title || fallbackTitle}</div>
      {hint.message && <p className="mt-1 leading-5">{hint.message}</p>}
      {Boolean(hint.commands?.length) && (
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {hint.commands?.map((command) => (
            <li key={command} className="font-mono text-[11px]">{command}</li>
          ))}
        </ul>
      )}
      {hint.docsUrl && (
        <a href={hint.docsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium underline">
          <ExternalLink className="h-3 w-3" />
          {hint.docsUrl}
        </a>
      )}
    </div>
  );
}

function QrFallback() {
  return <div className="text-xs text-muted-foreground">QR</div>;
}
