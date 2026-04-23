import { useRef, useState } from 'react';
import { Check, Copy, LogIn, Download, ExternalLink, Loader2, X } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import {
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_INSTALL_COMMANDS,
} from '../../../../../../provider-auth/types';
import { copyTextToClipboard } from '../../../../../../../utils/clipboard';
import { authenticatedFetch } from '../../../../../../../utils/api';
import type { AgentProvider, AuthStatus } from '../../../../../types/types';

// Providers whose CLI can be installed by Pixcode itself (npm global). Cursor
// ships via a bash script we don't want to pipe through our server; its
// "Install now" button is hidden. The list mirrors the backend's
// PROVIDER_INSTALL_COMMANDS map in provider.routes.ts.
const AUTO_INSTALLABLE: readonly AgentProvider[] = ['claude', 'codex', 'gemini', 'qwen'];

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: AuthStatus;
  onLogin: () => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  claude: {
    name: 'Claude',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-900 dark:text-blue-100',
    subtextClass: 'text-blue-700 dark:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-900 dark:text-purple-100',
    subtextClass: 'text-purple-700 dark:text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-gray-300 dark:border-gray-600',
    textClass: 'text-gray-900 dark:text-gray-100',
    subtextClass: 'text-gray-700 dark:text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 active:bg-gray-950 dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500',
  },
  gemini: {
    name: 'Gemini',
    description: 'Google Gemini AI assistant',
    bgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderClass: 'border-indigo-200 dark:border-indigo-800',
    textClass: 'text-indigo-900 dark:text-indigo-100',
    subtextClass: 'text-indigo-700 dark:text-indigo-300',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
  qwen: {
    name: 'Qwen Code',
    description: 'Alibaba Qwen3-Coder CLI (Gemini CLI fork)',
    bgClass: 'bg-orange-50 dark:bg-orange-900/20',
    borderClass: 'border-orange-200 dark:border-orange-800',
    textClass: 'text-orange-900 dark:text-orange-100',
    subtextClass: 'text-orange-700 dark:text-orange-300',
    buttonClass: 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800',
  },
};

// ---------- Install-runner dialog ----------
type InstallState = 'idle' | 'running' | 'done' | 'error';

function useInstaller(agent: AgentProvider) {
  const [state, setState] = useState<InstallState>('idle');
  const [log, setLog] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    setState('running');
    setLog('');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await authenticatedFetch(`/api/providers/${agent}/install`, {
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneEvent: { success: boolean; error?: string; message?: string } | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (;;) {
          const sep = buffer.indexOf('\n\n');
          if (sep === -1) break;
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of raw.split('\n')) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
          }
          if (dataLines.length === 0) continue;
          try {
            const parsed = JSON.parse(dataLines.join('\n'));
            if (event === 'log' && typeof parsed.chunk === 'string') {
              setLog((prev) => prev + parsed.chunk);
            } else if (event === 'done') {
              doneEvent = parsed;
            }
          } catch {
            // bad frame — ignore
          }
        }
      }

      if (!doneEvent) throw new Error('Install stream ended unexpectedly');
      if (doneEvent.success) {
        setState('done');
      } else {
        setError(doneEvent.error || 'Install failed');
        setState('error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setState('idle');
      } else {
        setError(err?.message || 'Install failed');
        setState('error');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const reset = () => {
    setState('idle');
    setLog('');
    setError(null);
  };

  return { state, log, error, run, cancel, reset };
}

export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const [copied, setCopied] = useState(false);
  const installer = useInstaller(agent);

  // Fall back to a neutral config for unknown providers so we never crash the
  // render path (a defensive net on top of the registered provider list).
  const config = agentConfig[agent] ?? {
    name: PROVIDER_DISPLAY_NAMES[agent] ?? String(agent),
    bgClass: 'bg-muted/50',
    borderClass: 'border-border',
    textClass: 'text-foreground',
    subtextClass: 'text-muted-foreground',
    buttonClass: 'bg-foreground text-background hover:opacity-90',
  };

  const displayName = PROVIDER_DISPLAY_NAMES[agent] ?? config.name;
  const installCommand = PROVIDER_INSTALL_COMMANDS[agent];

  // Surface a clear "CLI not installed" state before we try to render the
  // login/reauth controls — those are meaningless if the binary isn't
  // on PATH yet. `installed === null` means the backend hasn't reported
  // yet (old payload or still loading) — fall through to the normal flow.
  if (authStatus.installed === false && installCommand) {
    const copyCommand = async () => {
      const success = await copyTextToClipboard(installCommand);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    return (
      <div className="space-y-6">
        <div className="mb-4 flex items-center gap-3">
          <SessionProviderLogo provider={agent} className="h-6 w-6" />
          <div>
            <h3 className="text-lg font-medium text-foreground">{displayName}</h3>
            <p className="text-sm text-muted-foreground">
              {t(`agents.account.${agent}.description`, { defaultValue: '' })}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="font-medium text-amber-900 dark:text-amber-100">
                  {displayName} is not installed
                </div>
                <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">
                  Pixcode couldn&apos;t find the <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">{agent === 'cursor' ? 'cursor-agent' : agent}</code> binary
                  on this host. Install it first and then come back to log in.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {AUTO_INSTALLABLE.includes(agent) && (
                  <button
                    onClick={() => void installer.run()}
                    disabled={installer.state === 'running'}
                    className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    {installer.state === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {installer.state === 'running' ? 'Installing…' : 'Install now'}
                  </button>
                )}
                <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-amber-300/60 bg-white dark:border-amber-800/60 dark:bg-gray-900">
                  <code className="flex-1 truncate px-3 py-2 font-mono text-xs text-foreground">
                    {installCommand}
                  </code>
                  <button
                    onClick={() => void copyCommand()}
                    className="flex items-center gap-1.5 border-l border-amber-300/60 bg-amber-100/70 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                    aria-label="Copy install command"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {agent === 'qwen' && (
                <a
                  href="https://github.com/QwenLM/qwen-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-800 hover:underline dark:text-amber-200"
                >
                  View the Qwen Code docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Install stream output */}
              {(installer.state !== 'idle' || installer.log) && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/80">
                      {installer.state === 'running'
                        ? 'Installing…'
                        : installer.state === 'done'
                          ? 'Install complete'
                          : installer.state === 'error'
                            ? 'Install failed'
                            : 'Output'}
                    </div>
                    <div className="flex items-center gap-2">
                      {installer.state === 'running' && (
                        <button
                          onClick={installer.cancel}
                          className="text-xs text-amber-800 hover:underline dark:text-amber-200"
                        >
                          Cancel
                        </button>
                      )}
                      {(installer.state === 'done' || installer.state === 'error') && (
                        <button
                          onClick={installer.reset}
                          className="text-amber-800 dark:text-amber-200"
                          aria-label="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="max-h-40 overflow-y-auto rounded-md border border-amber-200 bg-white/80 p-3 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-amber-900/50 dark:bg-gray-900/80 dark:text-gray-100">{installer.log || ' '}</pre>
                  {installer.state === 'done' && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-emerald-700 dark:text-emerald-300">
                        Refresh this tab or try Login to check the new install.
                      </div>
                      <button
                        onClick={() => { installer.reset(); onLogin(); }}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Continue to Login
                      </button>
                    </div>
                  )}
                  {installer.state === 'error' && installer.error && (
                    <div className="text-xs text-red-600 dark:text-red-400">{installer.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {authStatus.error && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {t('agents.error', { error: authStatus.error })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{displayName}</h3>
          <p className="text-sm text-muted-foreground">{t(`agents.account.${agent}.description`, { defaultValue: '' })}</p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus.authenticated ? (
                  t('agents.authStatus.loggedInAs', {
                    email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                  })
                ) : (
                  t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus.loading ? (
                <Badge variant="secondary" className="bg-muted">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus.authenticated ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          {authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: displayName })}
                  </div>
                </div>
                <Button
                  onClick={onLogin}
                  className={`${config.buttonClass} text-white`}
                  size="sm"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && (
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm text-red-600 dark:text-red-400">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
