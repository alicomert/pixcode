import { useTranslation } from 'react-i18next';

import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';
import type { AppTab, Project, ProjectSession } from '../../../../types/app';
import { usePlugins } from '../../../../contexts/PluginsContext';

type MainContentTitleProps = {
  activeTab: AppTab;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isMobile?: boolean;
};

function getTabTitle(activeTab: AppTab, t: (key: string) => string, pluginDisplayName?: string) {
  if (activeTab.startsWith('plugin:') && pluginDisplayName) {
    return pluginDisplayName;
  }

  if (activeTab === 'files') {
    return t('mainContent.projectFiles');
  }

  if (activeTab === 'orchestration') {
    return t('tabs.orchestration');
  }

  if (activeTab === 'remote') {
    return t('tabs.remote');
  }

  if (activeTab === 'controlRoom') {
    return t('tabs.controlRoom');
  }

  if (activeTab === 'git') {
    return t('tabs.git');
  }

  if (activeTab === 'changes') {
    return t('tabs.changes');
  }

  if (activeTab === 'liveView') {
    return t('tabs.liveView');
  }

  return 'Project';
}

function getSessionTitle(session: ProjectSession): string {
  if (session.__provider === 'cursor') {
    return (session.name as string) || 'Untitled Session';
  }

  // Codex/Gemini/Qwen/OpenCode all carry the prompt summary in `summary`,
  // with a `name` fallback for renamed sessions. Anything else lands on
  // 'New Session' so a freshly-spawned session that hasn't synced its
  // metadata yet doesn't render an empty title.
  return (session.summary as string)
    || (session.name as string)
    || (session.title as string)
    || 'New Session';
}

export default function MainContentTitle({
  activeTab,
  selectedProject,
  selectedSession,
  isMobile = false,
}: MainContentTitleProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();

  const pluginDisplayName = activeTab.startsWith('plugin:')
    ? plugins.find((p) => p.name === activeTab.replace('plugin:', ''))?.displayName
    : undefined;

  const showSessionIcon = activeTab === 'chat' && Boolean(selectedSession);
  const showChatNewSession = activeTab === 'chat' && !selectedSession;
  const projectLabel = selectedProject?.displayName || 'Server';
  const projectPathLabel = selectedProject?.path || selectedProject?.fullPath;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {showSessionIcon && (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <SessionProviderLogo provider={selectedSession?.__provider} className="h-4 w-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {activeTab === 'chat' && selectedSession ? (
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
              {getSessionTitle(selectedSession)}
            </h2>
            <div className="truncate text-[11px] leading-tight text-muted-foreground">
              {isMobile && projectPathLabel ? `${projectLabel} · ${projectPathLabel}` : projectLabel}
            </div>
          </div>
        ) : showChatNewSession ? (
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight text-foreground">{t('mainContent.newSession')}</h2>
            <div className="truncate text-xs leading-tight text-muted-foreground">
              {isMobile && projectPathLabel ? `${projectLabel} · ${projectPathLabel}` : projectLabel}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
              {getTabTitle(activeTab, t, pluginDisplayName)}
            </h2>
            <div className="truncate text-[11px] leading-tight text-muted-foreground">
              {isMobile && projectPathLabel ? `${projectLabel} · ${projectPathLabel}` : projectLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
