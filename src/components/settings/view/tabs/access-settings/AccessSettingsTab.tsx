import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input } from '../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../utils/api';

import { CheckCircle, Globe, RefreshCw, Shield } from '@/lib/icons';

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
  recommendations?: Array<{ mode: string; label: string; recommendedWhen: string }>;
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
  message?: string;
};

type HealthState = {
  url: string;
  reachable: boolean;
  https: boolean;
  statusCode?: number | null;
  message?: string;
};

const accessModes = ['lan', 'tailscale', 'cloudflare_tunnel', 'custom_domain'];

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export default function AccessSettingsTab() {
  const { t } = useTranslation('settings');
  const [endpoints, setEndpoints] = useState<EndpointsResponse | null>(null);
  const [remoteAccess, setRemoteAccess] = useState<RemoteAccessState | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleState | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    mode: 'tailscale',
    label: 'Tailscale private access',
    url: '',
    targetPort: '3001',
  });

  const localLinks = useMemo(() => {
    const lanLinks = endpoints?.endpoints || [];
    const loopback = remoteAccess?.localUrl ? [{ host: '127.0.0.1', label: t('access.links.local'), family: 'IPv4', url: remoteAccess.localUrl }] : [];
    return [...loopback, ...lanLinks];
  }, [endpoints?.endpoints, remoteAccess?.localUrl, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [networkData, remoteData, tailscaleData] = await Promise.all([
        readJson<EndpointsResponse>('/api/network/endpoints'),
        readJson<{ remoteAccess: RemoteAccessState }>('/api/platformization/remote-access'),
        readJson<{ tailscale: TailscaleState }>('/api/platformization/remote-access/tailscale'),
      ]);
      setEndpoints(networkData);
      setRemoteAccess(remoteData.remoteAccess);
      setTailscale(tailscaleData.tailscale);
      setForm((current) => ({
        ...current,
        targetPort: String(remoteData.remoteAccess?.configs?.[0]?.targetPort || networkData.port || current.targetPort),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((previous) => previous === url ? null : previous), 1500);
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

  return (
    <div className="space-y-6">
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

      <section className="grid gap-3 lg:grid-cols-3">
        <AccessCard
          title={t('access.cards.local.title')}
          description={t('access.cards.local.description')}
          status={endpoints ? t('access.status.ready') : t('access.status.detecting')}
        />
        <AccessCard
          title={t('access.cards.tailscale.title')}
          description={tailscale?.message || t('access.cards.tailscale.description')}
          status={tailscale?.pixcodeUrl ? t('access.status.ready') : t('access.status.guided')}
        />
        <AccessCard
          title={t('access.cards.public.title')}
          description={t('access.cards.public.description')}
          status={remoteAccess?.configs?.some((config) => config.public) ? t('access.status.configured') : t('access.status.optional')}
        />
      </section>

      <section className="rounded-md border border-border/60 bg-background">
        <div className="border-b border-border/60 bg-muted/20 px-3 py-2">
          <h4 className="text-sm font-semibold text-foreground">{t('access.links.title')}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('access.links.description')}</p>
        </div>
        <div className="divide-y divide-border/50">
          {localLinks.map((endpoint) => (
            <AccessLinkRow
              key={endpoint.url}
              label={endpoint.label}
              url={endpoint.url}
              badge={endpoint.family}
              copied={copiedUrl === endpoint.url}
              onCopy={() => void copyUrl(endpoint.url)}
              copyLabel={copiedUrl === endpoint.url ? t('access.copied') : t('access.copy')}
            />
          ))}
          {tailscale?.pixcodeUrl && (
            <AccessLinkRow
              label={t('access.links.tailscale')}
              url={tailscale.pixcodeUrl}
              badge="Tailscale"
              copied={copiedUrl === tailscale.pixcodeUrl}
              onCopy={() => void copyUrl(tailscale.pixcodeUrl || '')}
              copyLabel={copiedUrl === tailscale.pixcodeUrl ? t('access.copied') : t('access.copy')}
            />
          )}
          {localLinks.length === 0 && !tailscale?.pixcodeUrl && (
            <div className="px-3 py-6 text-sm text-muted-foreground">{t('access.links.empty')}</div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-md border border-border/60 bg-background px-3 py-3">
          <h4 className="text-sm font-semibold text-foreground">{t('access.setup.title')}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{t('access.setup.description')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={form.mode}
              onChange={(event) => setForm({ ...form, mode: event.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {accessModes.map((mode) => <option key={mode} value={mode}>{t(`access.modes.${mode}`)}</option>)}
            </select>
            <Input placeholder={t('access.fields.label')} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            <Input placeholder={t('access.fields.url')} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
            <Input placeholder={t('access.fields.port')} value={form.targetPort} onChange={(event) => setForm({ ...form, targetPort: event.target.value })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveAccessPath()} disabled={saving}>
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
        </div>

        <div className="rounded-md border border-border/60 bg-background">
          <div className="border-b border-border/60 bg-muted/20 px-3 py-2">
            <h4 className="text-sm font-semibold text-foreground">{t('access.configured.title')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('access.configured.description')}</p>
          </div>
          <div className="divide-y divide-border/50">
            {(remoteAccess?.configs || []).map((config) => (
              <div key={config.id} className="px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{config.label}</div>
                    <button
                      type="button"
                      className="mt-1 block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
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
              <div className="px-3 py-6 text-sm text-muted-foreground">{t('access.configured.empty')}</div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('access.team.title')}</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('access.team.description')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AccessCard({ title, description, status }: { title: string; description: string; status: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <Badge variant="secondary">{status}</Badge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function AccessLinkRow({
  label,
  url,
  badge,
  copied,
  copyLabel,
  onCopy,
}: {
  label: string;
  url: string;
  badge: string;
  copied: boolean;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <Badge variant="secondary">{badge}</Badge>
        </div>
        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{url}</div>
      </div>
      <Button type="button" size="sm" variant={copied ? 'default' : 'outline'} onClick={onCopy}>
        {copyLabel}
      </Button>
    </div>
  );
}
