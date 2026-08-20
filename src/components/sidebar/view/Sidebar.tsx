import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import {
  PIXCODE_UPDATE_AVAILABLE_EVENT,
  compareVersions,
  useVersionCheck,
} from '../../../hooks/useVersionCheck';
import { useUiPreferences, type HistoryViewMode } from '../../../hooks/useUiPreferences';
import { useSidebarController } from '../hooks/useSidebarController';
import { authenticatedFetch } from '../../../utils/api';
import type { Project, LLMProvider } from '../../../types/app';
import type { SidebarProps } from '../types/types';
import type { WorkspaceType } from '../../project-creation-wizard/types';

import SidebarCollapsed from './subcomponents/SidebarCollapsed';
import SidebarContent from './subcomponents/SidebarContent';
import SidebarModals from './subcomponents/SidebarModals';
import type { SidebarProjectListProps } from './subcomponents/SidebarProjectList';
import type { SidebarFlatSessionListProps } from './subcomponents/SidebarFlatSessionList';

const VERSION_RELEASE_NOTES_SEEN_KEY = 'pixcode.version.releaseNotes.seenVersion';
const UPDATE_RESTART_PROMPT_SEEN_KEY = 'pixcode.update.pendingRestart.seenJob';

function Sidebar({
  projects,
  selectedProject,
  selectedSession,
  onProjectSelect,
  onSessionSelect,
  onNewSession,
  onProjectCreated,
  onQuickStartSession,
  onOpenControlRoom,
  onSessionDelete,
  onProjectDelete,
  isLoading,
  loadingProgress,
  onRefresh,
  onShowSettings,
  showSettings,
  settingsInitialTab,
  onCloseSettings,
  isMobile,
  modalsOnly = false,
}: SidebarProps) {
  const { t } = useTranslation(['sidebar', 'common']);
  const { isPWA } = useDeviceSettings({ trackMobile: false });
  const { updateAvailable, latestVersion, currentVersion, nodeVersion, releaseInfo, installMode } = useVersionCheck(
    'alicomert',
    'pixcode',
  );
  const autoShownVersionRef = useRef<string | null>(null);
  const { preferences, setPreference } = useUiPreferences();
  const { sidebarVisible, historyView } = preferences;
  const [newProjectInitialType, setNewProjectInitialType] = useState<WorkspaceType>('existing');

  const {
    isSidebarCollapsed,
    expandedProjects,
    editingProject,
    showNewProject,
    editingName,
    loadingSessions,
    initialSessionsLoaded,
    currentTime,
    isRefreshing,
    editingSession,
    editingSessionName,
    searchFilter,
    searchMode,
    setSearchMode,
    conversationResults,
    isSearching,
    searchProgress,
    clearConversationResults,
    deletingProjects,
    deleteConfirmation,
    sessionDeleteConfirmation,
    showVersionModal,
    filteredProjects,
    toggleProject,
    handleSessionClick,
    toggleStarProject,
    isProjectStarred,
    toggleStarSession,
    isSessionStarred,
    getProjectSessions,
    startEditing,
    cancelEditing,
    saveProjectName,
    showDeleteSessionConfirmation,
    confirmDeleteSession,
    requestProjectDelete,
    confirmDeleteProject,
    loadMoreSessions,
    handleProjectSelect,
    refreshProjects,
    updateSessionSummary,
    collapseSidebar: handleCollapseSidebar,
    expandSidebar: handleExpandSidebar,
    setShowNewProject,
    setEditingName,
    setEditingSession,
    setEditingSessionName,
    setSearchFilter,
    setDeleteConfirmation,
    setSessionDeleteConfirmation,
    setShowVersionModal,
  } = useSidebarController({
    projects,
    selectedProject,
    selectedSession,
    isLoading,
    isMobile,
    t,
    onRefresh,
    onProjectSelect,
    onSessionSelect,
    onSessionDelete,
    onProjectDelete,
    setSidebarVisible: (visible) => setPreference('sidebarVisible', visible),
    sidebarVisible,
  });

  useEffect(() => {
    const handleCreateProjectRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceType?: WorkspaceType }>).detail;
      const workspaceType = detail?.workspaceType;
      setNewProjectInitialType(
        workspaceType === 'new' || workspaceType === 'subfolder' || workspaceType === 'existing'
          ? workspaceType
          : 'existing',
      );
      setShowNewProject(true);
    };

    window.addEventListener('pixcode:create-project', handleCreateProjectRequest);

    return () => {
      window.removeEventListener('pixcode:create-project', handleCreateProjectRequest);
    };
  }, [setShowNewProject]);

  useEffect(() => {
    const handleUpdateAvailable = () => {
      setShowVersionModal(true);
    };

    window.addEventListener(PIXCODE_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable);
    return () => {
      window.removeEventListener(PIXCODE_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable);
    };
  }, [setShowVersionModal]);

  useEffect(() => {
    let cancelled = false;
    const checkPendingRestart = async () => {
      try {
        const response = await authenticatedFetch('/api/system/update-state', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json() as {
          state?: { pendingRestart?: { jobId?: string; toVersion?: string } | null };
          currentVersion?: string;
        };
        const pending = payload?.state?.pendingRestart;
        const promptKey = pending?.jobId || pending?.toVersion;
        if (!pending || !promptKey || cancelled) return;

        // Already on/ past the pending target → do not auto-open the stuck modal.
        const runningVersion = payload.currentVersion || currentVersion;
        if (pending.toVersion && runningVersion && compareVersions(runningVersion, pending.toVersion) >= 0) {
          window.localStorage.setItem(UPDATE_RESTART_PROMPT_SEEN_KEY, promptKey);
          return;
        }

        const seenPrompt = window.localStorage.getItem(UPDATE_RESTART_PROMPT_SEEN_KEY);
        if (seenPrompt === promptKey) return;

        window.localStorage.setItem(UPDATE_RESTART_PROMPT_SEEN_KEY, promptKey);
        setShowVersionModal(true);
      } catch {
        // Ignore transient auth/network failures; normal update check still runs.
      }
    };

    void checkPendingRestart();
    window.addEventListener('focus', checkPendingRestart);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', checkPendingRestart);
    };
  }, [currentVersion, setShowVersionModal]);

  useEffect(() => {
    if (!latestVersion || !releaseInfo) return;
    if (autoShownVersionRef.current === latestVersion) return;

    if (updateAvailable) {
      autoShownVersionRef.current = latestVersion;
      setShowVersionModal(true);
      return;
    }
    if (latestVersion === currentVersion) {
      const hasSeenCurrentReleaseNotes = window.localStorage.getItem(VERSION_RELEASE_NOTES_SEEN_KEY) === latestVersion;
      if (!hasSeenCurrentReleaseNotes) {
        window.localStorage.setItem(VERSION_RELEASE_NOTES_SEEN_KEY, latestVersion);
      }
    }
  }, [currentVersion, latestVersion, releaseInfo, setShowVersionModal, updateAvailable]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.toggle('pwa-mode', isPWA);
    document.body.classList.toggle('pwa-mode', isPWA);
  }, [isPWA]);

  const handleProjectCreated = (project?: Project) => {
    if (project) {
      onProjectCreated?.(project);
    }

    if (window.refreshProjects) {
      void window.refreshProjects();
      return;
    }

    if (!project) {
      window.location.reload();
    }
  };

  // Shared editing-session callbacks so the grouped and flat list use identical behavior.
  const startEditingSession = (sessionId: string, initialName: string) => {
    setEditingSession(sessionId);
    setEditingSessionName(initialName);
  };
  const cancelEditingSession = () => {
    setEditingSession(null);
    setEditingSessionName('');
  };
  const saveEditingSession = (
    projectName: string,
    sessionId: string,
    summary: string,
    provider: LLMProvider,
  ) => {
    void updateSessionSummary(projectName, sessionId, summary, provider);
  };

  const projectListProps: SidebarProjectListProps = {
    projects,
    filteredProjects,
    selectedProject,
    selectedSession,
    isLoading,
    loadingProgress,
    expandedProjects,
    editingProject,
    editingName,
    loadingSessions,
    initialSessionsLoaded,
    currentTime,
    editingSession,
    editingSessionName,
    deletingProjects,
    getProjectSessions,
    isProjectStarred,
    isSessionStarred,
    onEditingNameChange: setEditingName,
    onToggleProject: toggleProject,
    onProjectSelect: handleProjectSelect,
    onToggleStarProject: toggleStarProject,
    onToggleStarSession: toggleStarSession,
    onStartEditingProject: startEditing,
    onCancelEditingProject: cancelEditing,
    onSaveProjectName: (projectName) => {
      void saveProjectName(projectName);
    },
    onDeleteProject: requestProjectDelete,
    onSessionSelect: handleSessionClick,
    onDeleteSession: showDeleteSessionConfirmation,
    onLoadMoreSessions: (project) => {
      void loadMoreSessions(project);
    },
    onNewSession,
    onEditingSessionNameChange: setEditingSessionName,
    onStartEditingSession: startEditingSession,
    onCancelEditingSession: cancelEditingSession,
    onSaveEditingSession: saveEditingSession,
    t,
  };

  const flatListProps: SidebarFlatSessionListProps = {
    projects,
    filteredProjects,
    selectedSession,
    isLoading,
    loadingProgress,
    currentTime,
    editingSession,
    editingSessionName,
    getProjectSessions,
    isSessionStarred,
    onEditingSessionNameChange: setEditingSessionName,
    onStartEditingSession: startEditingSession,
    onCancelEditingSession: cancelEditingSession,
    onSaveEditingSession: saveEditingSession,
    onToggleStarSession: toggleStarSession,
    onProjectSelect: handleProjectSelect,
    onSessionSelect: handleSessionClick,
    onDeleteSession: showDeleteSessionConfirmation,
    t,
  };

  const openNewProjectWizard = (workspaceType: WorkspaceType = 'existing') => {
    setNewProjectInitialType(workspaceType);
    setShowNewProject(true);
  };

  const onCloseNewProject = () => setShowNewProject(false);
  const onCancelDeleteProject = () => setDeleteConfirmation(null);
  const onCancelDeleteSession = () => setSessionDeleteConfirmation(null);
  const onCloseVersionModal = () => setShowVersionModal(false);

  const sidebarModals = (
      <SidebarModals
        projects={projects}
        showSettings={showSettings}
        settingsInitialTab={settingsInitialTab}
        onCloseSettings={onCloseSettings}
        showNewProject={showNewProject}
        newProjectInitialType={newProjectInitialType}
        onCloseNewProject={onCloseNewProject}
        onProjectCreated={handleProjectCreated}
        deleteConfirmation={deleteConfirmation}
        onCancelDeleteProject={onCancelDeleteProject}
        onConfirmDeleteProject={confirmDeleteProject}
        sessionDeleteConfirmation={sessionDeleteConfirmation}
        onCancelDeleteSession={onCancelDeleteSession}
        onConfirmDeleteSession={confirmDeleteSession}
        showVersionModal={showVersionModal}
        onCloseVersionModal={onCloseVersionModal}
        releaseInfo={releaseInfo}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        nodeVersion={nodeVersion}
        installMode={installMode}
        isUpdateAvailable={updateAvailable}
        t={t}
      />
  );

  if (modalsOnly) {
    return sidebarModals;
  }

  return (
    <>
      {sidebarModals}

      {isSidebarCollapsed ? (
        <SidebarCollapsed
          onExpand={handleExpandSidebar}
          onOpenControlRoom={onOpenControlRoom}
          onShowSettings={onShowSettings}
          updateAvailable={updateAvailable}
          onShowVersionModal={() => setShowVersionModal(true)}
          t={t}
        />
      ) : (
        <>
          <SidebarContent
            isPWA={isPWA}
            isMobile={isMobile}
            isLoading={isLoading}
            projects={projects}
            searchFilter={searchFilter}
            onSearchFilterChange={setSearchFilter}
            onClearSearchFilter={() => setSearchFilter('')}
            searchMode={searchMode}
            onSearchModeChange={(mode: 'projects' | 'conversations') => {
              setSearchMode(mode);
              if (mode === 'projects') clearConversationResults();
            }}
            conversationResults={conversationResults}
            isSearching={isSearching}
            searchProgress={searchProgress}
            onConversationResultClick={(projectName: string, sessionId: string, provider: string, messageTimestamp?: string | null, messageSnippet?: string | null) => {
              const resolvedProvider = (provider || 'claude') as LLMProvider;
              const project = projects.find(p => p.name === projectName);
              const searchTarget = { __searchTargetTimestamp: messageTimestamp || null, __searchTargetSnippet: messageSnippet || null };
              const sessionObj = {
                id: sessionId,
                __provider: resolvedProvider,
                __projectName: projectName,
                ...searchTarget,
              };
              if (project) {
                handleProjectSelect(project);
                const sessions = getProjectSessions(project);
                const existing = sessions.find(s => s.id === sessionId);
                if (existing) {
                  handleSessionClick({ ...existing, ...searchTarget }, projectName);
                } else {
                  handleSessionClick(sessionObj, projectName);
                }
              } else {
                handleSessionClick(sessionObj, projectName);
              }
            }}
            onRefresh={() => {
              void refreshProjects();
            }}
            isRefreshing={isRefreshing}
            onCreateProject={() => openNewProjectWizard('existing')}
            onQuickStartSession={onQuickStartSession}
            onOpenControlRoom={onOpenControlRoom}
            onCollapseSidebar={handleCollapseSidebar}
            updateAvailable={updateAvailable}
            releaseInfo={releaseInfo}
            latestVersion={latestVersion}
            currentVersion={currentVersion}
            onShowVersionModal={() => setShowVersionModal(true)}
            onShowSettings={onShowSettings}
            projectListProps={projectListProps}
            flatListProps={flatListProps}
            historyView={historyView}
            onHistoryViewChange={(mode: HistoryViewMode) => setPreference('historyView', mode)}
            t={t}
          />
        </>
      )}

    </>
  );
}

export default Sidebar;
