import { useState } from 'react';
import { Check, Copy, LogIn, Download, ExternalLink } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import {
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_INSTALL_COMMANDS,
} from '../../../../../../provider-auth/types';
import { copyTextToClipboard } from '../../../../../../../utils/clipboard';
import type { AgentProvider, AuthStatus } from '../../../../../types/types';

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

export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const [copied, setCopied] = useState(false);

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

              <div className="flex items-stretch overflow-hidden rounded-md border border-amber-300/60 bg-white dark:border-amber-800/60 dark:bg-gray-900">
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
