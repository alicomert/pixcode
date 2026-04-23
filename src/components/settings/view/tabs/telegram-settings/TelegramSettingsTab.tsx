import { Send as TelegramIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from '@/lib/icons';

import { authenticatedFetch } from '../../../../../utils/api';

type BotState = {
  running: boolean;
  username: string | null;
  error: { code?: string; message?: string } | null;
  configured?: boolean;
};

type LinkState = {
  paired: boolean;
  telegramUsername: string | null;
  language: string;
  notificationsEnabled: boolean;
  bridgeEnabled: boolean;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  verifiedAt: string | null;
};

type StatusResponse = {
  bot: BotState;
  link: LinkState | null;
};

const Section = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border/60 bg-background p-4">
    <div className="mb-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
    {children}
  </div>
);

export default function TelegramSettingsTab() {
  const { t, i18n } = useTranslation('settings');

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'token' | 'stop' | 'remove' | 'pair' | 'unpair' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch('/api/telegram/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StatusResponse;
      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const handleSaveToken = async () => {
    setBusy('token');
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/bot', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setToken('');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleStopBot = async () => {
    setBusy('stop');
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/bot/stop', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveBot = async () => {
    setBusy('remove');
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/bot', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateCode = async () => {
    setBusy('pair');
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/pairing-code', {
        method: 'POST',
        body: JSON.stringify({ language: i18n.language }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleUnpair = async () => {
    setBusy('unpair');
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/link', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const patchLink = async (payload: Partial<Pick<LinkState, 'language' | 'notificationsEnabled' | 'bridgeEnabled'>>) => {
    setError(null);
    try {
      const res = await authenticatedFetch('/api/telegram/link', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const botConfigured = status?.bot?.configured;
  const botRunning = status?.bot?.running;
  const link = status?.link;
  const isPaired = Boolean(link?.paired);
  const pairingCode = link?.pairingCode ?? null;

  const pairingRemainingMs = useMemo(() => {
    if (!link?.pairingExpiresAt) return null;
    const expires = Date.parse(link.pairingExpiresAt);
    return Number.isFinite(expires) ? Math.max(0, expires - Date.now()) : null;
  }, [link?.pairingExpiresAt]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TelegramIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{t('telegram.title')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('telegram.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Bot token section */}
      <Section title={t('telegram.botToken')} description={t('telegram.botTokenHelp') as string}>
        {botRunning && status?.bot?.username && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            {t('telegram.botRunning', { username: status.bot.username })}
          </div>
        )}
        {botConfigured && !botRunning && (
          <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {t('telegram.botStopped')}
          </div>
        )}

        {!botRunning && (
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('telegram.botTokenPlaceholder') as string}
              className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
            />
            <button
              type="button"
              onClick={() => void handleSaveToken()}
              disabled={!token.trim() || busy === 'token'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === 'token' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {busy === 'token' ? t('telegram.saving') : t('telegram.saveToken')}
            </button>
          </div>
        )}

        {botRunning && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleStopBot()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              {busy === 'stop' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {t('telegram.stopBot')}
            </button>
            <button
              type="button"
              onClick={() => void handleRemoveBot()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('telegram.removeToken')}
            </button>
          </div>
        )}
      </Section>

      {/* Pairing section — only useful once the bot is running */}
      {botRunning && (
        <Section title={t('telegram.pairing.title')} description={t('telegram.pairing.description') as string}>
          {isPaired ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                {t('telegram.pairing.verified')}
                {link?.telegramUsername && (
                  <span className="ml-2 font-mono text-xs">@{link.telegramUsername}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleUnpair()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('telegram.linkedAccount.unpair')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {pairingCode ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('telegram.pairing.code')}
                    </div>
                    <div className="font-mono text-2xl font-semibold tracking-[0.3em] text-foreground">
                      {pairingCode}
                    </div>
                    {pairingRemainingMs !== null && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {Math.ceil(pairingRemainingMs / 60000)} min
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerateCode()}
                    disabled={busy === 'pair'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                  >
                    {busy === 'pair' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t('telegram.pairing.regenerate')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGenerateCode()}
                  disabled={busy === 'pair'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === 'pair' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {t('telegram.pairing.regenerate')}
                </button>
              )}
              <div className="text-xs text-muted-foreground">{t('telegram.pairing.notPaired')}</div>
            </div>
          )}
        </Section>
      )}

      {/* Preferences — only meaningful once paired */}
      {isPaired && link && (
        <Section title={t('telegram.notifications.title')} description={t('telegram.notifications.description') as string}>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5">
              <span className="text-sm font-medium text-foreground">{t('telegram.notifications.title')}</span>
              <input
                type="checkbox"
                checked={link.notificationsEnabled}
                onChange={(e) => void patchLink({ notificationsEnabled: e.target.checked })}
                className="h-4 w-4"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-foreground">{t('telegram.bridge.title')}</div>
                <div className="text-xs text-muted-foreground">{t('telegram.bridge.description')}</div>
              </div>
              <input
                type="checkbox"
                checked={link.bridgeEnabled}
                onChange={(e) => void patchLink({ bridgeEnabled: e.target.checked })}
                className="h-4 w-4"
              />
            </label>
          </div>
        </Section>
      )}
    </div>
  );
}
