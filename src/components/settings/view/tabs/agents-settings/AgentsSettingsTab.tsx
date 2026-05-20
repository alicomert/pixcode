import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentCategory, AgentProvider, AuthStatus } from '../../../types/types';

import type { AgentContext, AgentsSettingsTabProps } from './types';
import AgentCategoryContentSection from './sections/AgentCategoryContentSection';
import AgentCategoryTabsSection from './sections/AgentCategoryTabsSection';
import AgentSelectorSection from './sections/AgentSelectorSection';

import { Loader2, RefreshCw } from '@/lib/icons';
import { authenticatedFetch } from '@/utils/api';

const createHermesLoadingStatus = (): AuthStatus => ({
  authenticated: false,
  installed: null,
  email: null,
  method: null,
  error: null,
  loading: true,
  checkedAt: null,
  installedVersion: null,
  latestVersion: null,
  updateAvailable: false,
});

export default function AgentsSettingsTab({
  providerAuthStatus,
  onProviderLogin,
  onRefreshProviderAuth,
  onRefreshAllProviderAuth,
  claudePermissions,
  onClaudePermissionsChange,
  cursorPermissions,
  onCursorPermissionsChange,
  codexPermissionMode,
  onCodexPermissionModeChange,
  geminiPermissionMode,
  onGeminiPermissionModeChange,
  qwenPermissionMode,
  onQwenPermissionModeChange,
  opencodePermissions,
  onOpencodePermissionsChange,
  projects,
}: AgentsSettingsTabProps) {
  const { t } = useTranslation('settings');
  const [selectedAgent, setSelectedAgent] = useState<AgentProvider>('claude');
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>('account');
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [hermesAuthStatus, setHermesAuthStatus] = useState(createHermesLoadingStatus);

  // Previously we filtered Cursor out on Windows because the upstream
  // install command is `curl | bash`. Cursor now ships a cross-platform
  // cursor-agent binary (Git Bash / WSL / native), and users asked for
  // the card back so they can manage its permissions and auth status.
  // The auth-status probe handles the "not installed" case gracefully.
  const visibleAgents = useMemo<AgentProvider[]>(
    () => ['claude', 'cursor', 'codex', 'gemini', 'qwen', 'opencode', 'hermes'],
    [],
  );

  const refreshHermesStatus = useCallback(async () => {
    setHermesAuthStatus((current) => ({ ...current, loading: true }));
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/install-status');
      const status = await response.json();
      setHermesAuthStatus({
        authenticated: Boolean(status?.installed),
        installed: Boolean(status?.installed),
        email: status?.installed ? 'Local Hermes Agent' : null,
        method: status?.command || null,
        error: status?.installed ? null : typeof status?.error === 'string' ? status.error : 'Hermes Agent CLI is not installed',
        loading: false,
        checkedAt: new Date().toISOString(),
        installedVersion: typeof status?.version === 'string' ? status.version : null,
        latestVersion: null,
        updateAvailable: false,
      });
    } catch (error) {
      setHermesAuthStatus({
        authenticated: false,
        installed: false,
        email: null,
        method: null,
        error: error instanceof Error ? error.message : 'Unable to check Hermes Agent',
        loading: false,
        checkedAt: new Date().toISOString(),
        installedVersion: null,
        latestVersion: null,
        updateAvailable: false,
      });
    }
  }, []);

  useEffect(() => {
    void refreshHermesStatus();
  }, [refreshHermesStatus]);

  const agentContextById = useMemo<Record<AgentProvider, AgentContext>>(() => ({
    claude: {
      authStatus: providerAuthStatus.claude,
      onLogin: () => onProviderLogin('claude'),
    },
    cursor: {
      authStatus: providerAuthStatus.cursor,
      onLogin: () => onProviderLogin('cursor'),
    },
    codex: {
      authStatus: providerAuthStatus.codex,
      onLogin: () => onProviderLogin('codex'),
    },
    gemini: {
      authStatus: providerAuthStatus.gemini,
      onLogin: () => onProviderLogin('gemini'),
    },
    qwen: {
      authStatus: providerAuthStatus.qwen,
      onLogin: () => onProviderLogin('qwen'),
    },
    opencode: {
      authStatus: providerAuthStatus.opencode,
      onLogin: () => onProviderLogin('opencode'),
    },
    hermes: {
      authStatus: hermesAuthStatus,
      onLogin: () => onProviderLogin('hermes'),
    },
  }), [
    hermesAuthStatus,
    onProviderLogin,
    providerAuthStatus.claude,
    providerAuthStatus.codex,
    providerAuthStatus.cursor,
    providerAuthStatus.gemini,
    providerAuthStatus.qwen,
    providerAuthStatus.opencode,
  ]);

  const statusSummary = useMemo(() => {
    const statuses = visibleAgents.map((agent) => agent === 'hermes' ? hermesAuthStatus : providerAuthStatus[agent]);
    const updateCount = statuses.filter((status) => status?.updateAvailable).length;
    const lastCheckedAt = statuses
      .map((status) => status?.checkedAt ? new Date(status.checkedAt).getTime() : 0)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => right - left)[0] ?? null;

    return { updateCount, lastCheckedAt };
  }, [hermesAuthStatus, providerAuthStatus, visibleAgents]);

  const refreshAgentStatus = useCallback(async (provider: AgentProvider) => {
    if (provider === 'hermes') {
      await refreshHermesStatus();
      return;
    }

    await onRefreshProviderAuth?.(provider);
  }, [onRefreshProviderAuth, refreshHermesStatus]);

  const refreshAll = async () => {
    if (!onRefreshAllProviderAuth) return;
    setIsRefreshingAll(true);
    try {
      await onRefreshAllProviderAuth();
      await refreshHermesStatus();
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const lastCheckedLabel = statusSummary.lastCheckedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(statusSummary.lastCheckedAt)
    : t('agents.status.notChecked', { defaultValue: 'Not checked yet' });

  return (
    <div className="-mx-4 -mb-4 -mt-2 flex min-h-[300px] flex-col overflow-hidden md:-mx-6 md:-mb-6 md:-mt-2 md:min-h-[500px]">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {t('agents.status.title', { defaultValue: 'CLI status' })}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {statusSummary.updateCount > 0
              ? t('agents.status.updatesFound', {
                  count: statusSummary.updateCount,
                  defaultValue: '{{count}} update available',
                })
              : t('agents.status.lastChecked', {
                  value: lastCheckedLabel,
                  defaultValue: 'Last checked: {{value}}',
                })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={!onRefreshAllProviderAuth || isRefreshingAll}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t('agents.status.refresh', { defaultValue: 'Refresh CLI status' })}
        </button>
      </div>

      <AgentSelectorSection
        agents={visibleAgents}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        agentContextById={agentContextById}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <AgentCategoryTabsSection
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        <AgentCategoryContentSection
          selectedAgent={selectedAgent}
          selectedCategory={selectedCategory}
          agentContextById={agentContextById}
          onRefreshProviderAuth={refreshAgentStatus}
          claudePermissions={claudePermissions}
          onClaudePermissionsChange={onClaudePermissionsChange}
          cursorPermissions={cursorPermissions}
          onCursorPermissionsChange={onCursorPermissionsChange}
          codexPermissionMode={codexPermissionMode}
          onCodexPermissionModeChange={onCodexPermissionModeChange}
          geminiPermissionMode={geminiPermissionMode}
          onGeminiPermissionModeChange={onGeminiPermissionModeChange}
          qwenPermissionMode={qwenPermissionMode}
          onQwenPermissionModeChange={onQwenPermissionModeChange}
          opencodePermissions={opencodePermissions}
          onOpencodePermissionsChange={onOpencodePermissionsChange}
          projects={projects}
        />
      </div>
    </div>
  );
}
