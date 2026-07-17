import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Sidebar from '../sidebar/view/Sidebar';
import MainContent from '../main-content/view/MainContent';
import VSCodeWorkbench from '../vscode-workbench/view/VSCodeWorkbench';
import { QuickSettingsPanel } from '../quick-settings-panel';
import InAppNotificationCenter from '../notifications/InAppNotificationCenter';
import { TasksPage } from '../tasks/TasksPage';
import ShellModeSwitcher from '../shell-mode/ShellModeSwitcher';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useDeviceSettings } from '../../hooks/useDeviceSettings';
import { useSessionProtection } from '../../hooks/useSessionProtection';
import { useProjectsState } from '../../hooks/useProjectsState';
import { useUiPreferences } from '../../hooks/useUiPreferences';
import { Settings } from '@/lib/icons';

export default function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { t } = useTranslation('common');
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { ws, sendMessage, latestMessage, isConnected } = useWebSocket();
  const { preferences } = useUiPreferences();
  const shellMode = preferences.shellMode || 'hybrid';
  const wasConnectedRef = useRef(false);

  const {
    activeSessions,
    processingSessions,
    markSessionAsActive,
    markSessionAsInactive,
    markSessionAsProcessing,
    markSessionAsNotProcessing,
    replaceTemporarySession,
  } = useSessionProtection();

  const {
    selectedProject,
    selectedSession,
    activeTab,
    sidebarOpen,
    isLoadingProjects,
    externalMessageUpdate,
    setActiveTab,
    setSidebarOpen,
    setIsInputFocused,
    setShowSettings,
    openSettings,
    refreshProjectsSilently,
    sidebarSharedProps,
  } = useProjectsState({
    sessionId,
    navigate,
    latestMessage,
    isMobile,
    activeSessions,
  });

  useEffect(() => {
    if (location.pathname.endsWith('/tasks')) {
      setActiveTab('tasks');
    }
  }, [location.pathname, setActiveTab]);

  useEffect(() => {
    // Expose a non-blocking refresh for chat/session flows.
    // Full loading refreshes are still available through direct fetchProjects calls.
    window.refreshProjects = refreshProjectsSilently;

    return () => {
      if (window.refreshProjects === refreshProjectsSilently) {
        delete window.refreshProjects;
      }
    };
  }, [refreshProjectsSilently]);

  useEffect(() => {
    window.openSettings = openSettings;

    return () => {
      if (window.openSettings === openSettings) {
        delete window.openSettings;
      }
    };
  }, [openSettings]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.type !== 'notification:navigate') {
        return;
      }

      if (typeof message.provider === 'string' && message.provider.trim()) {
        localStorage.setItem('selected-provider', message.provider);
      }

      setActiveTab('chat');
      setSidebarOpen(false);
      void refreshProjectsSilently();

      if (typeof message.sessionId === 'string' && message.sessionId) {
        navigate(`/session/${message.sessionId}`);
        return;
      }

      navigate('/');
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [navigate, refreshProjectsSilently, setActiveTab, setSidebarOpen]);

  // Permission recovery: query pending permissions on WebSocket reconnect or session change
  useEffect(() => {
    const isReconnect = isConnected && !wasConnectedRef.current;

    if (isReconnect) {
      wasConnectedRef.current = true;
    } else if (!isConnected) {
      wasConnectedRef.current = false;
    }

    if (isConnected && selectedSession?.id) {
      sendMessage({
        type: 'get-pending-permissions',
        sessionId: selectedSession.id
      });
    }
  }, [isConnected, selectedSession?.id, sendMessage]);

  useEffect(() => {
    if (!latestMessage) {
      return;
    }

    // Only workspace watcher events should drive the file explorer.
    // `projects_updated` (provider metadata under ~/.claude etc.) used to
    // trigger a full HTTP file-tree re-scan on every agent session write —
    // that caused the explorer to spam /files, drop nodes under the scan
    // budget, and look like a constant refresh loop.
    if (latestMessage.type !== 'project_files_updated') {
      return;
    }

    const eventProjectName = typeof latestMessage.projectName === 'string'
      ? latestMessage.projectName
      : selectedProject?.name ?? null;

    window.dispatchEvent(new CustomEvent('pixcode:file-tree-refresh', {
      detail: {
        projectName: eventProjectName,
        changeType: typeof latestMessage.changeType === 'string' ? latestMessage.changeType : null,
        changedFile: typeof latestMessage.changedFile === 'string' ? latestMessage.changedFile : null,
        oldContent: typeof latestMessage.oldContent === 'string' ? latestMessage.oldContent : null,
        currentContent: typeof latestMessage.currentContent === 'string' ? latestMessage.currentContent : null,
      },
    }));
  }, [latestMessage, selectedProject?.name]);

  // Adjust the app container to stay above the virtual keyboard on iOS Safari.
  // On Chrome for Android the layout viewport already shrinks when the keyboard opens,
  // so inset-0 adjusts automatically. On iOS the layout viewport stays full-height and
  // the keyboard overlays it — we use the Visual Viewport API to track keyboard height
  // and apply it as a CSS variable that shifts the container's bottom edge up.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Only resize matters — keyboard open/close changes vv.height.
      // Do NOT listen to scroll: on iOS Safari, scrolling content changes
      // vv.offsetTop which would make --keyboard-height fluctuate during
      // normal scrolling, causing the container to bounce up and down.
      const kb = Math.max(0, window.innerHeight - vv.height);
      document.documentElement.style.setProperty('--keyboard-height', `${kb}px`);
    };
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  // Mode 1 — NanoClaw control plane only (no VS Code chrome). Messaging always NanoClaw.
  if (shellMode === 'nanoclaw' && !isMobile) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background" style={{ bottom: 'var(--keyboard-height, 0px)' }}>
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">PixBot</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">NanoClaw control</span>
          </div>
          <div className="flex items-center gap-2">
            <ShellModeSwitcher compact />
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              title={t('navigation.settings')}
            >
              <Settings className="h-4 w-4" />
            </button>
            <InAppNotificationCenter latestMessage={latestMessage} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <TasksPage
            projectId={selectedProject?.name || 'general'}
            projectLabel={selectedProject?.displayName || selectedProject?.name || 'General (no coding project)'}
            projects={(sidebarSharedProps.projects || []).map((project: { name: string; displayName?: string; fullPath?: string; path?: string }) => ({
              id: project.name,
              name: project.name,
              label: project.displayName || project.name,
              path: project.fullPath || project.path,
            }))}
          />
        </div>
        <QuickSettingsPanel />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-background" style={{ bottom: 'var(--keyboard-height, 0px)' }}>
      {isMobile ? (
        <div
          className={`fixed inset-0 z-50 flex transition-all duration-150 ease-out ${sidebarOpen ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
        >
          <button
            className="fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-150 ease-out"
            onClick={(event) => {
              event.stopPropagation();
              setSidebarOpen(false);
            }}
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSidebarOpen(false);
            }}
            aria-label={t('versionUpdate.ariaLabels.closeSidebar')}
          />
          <div
            className={`relative h-full w-[85vw] max-w-sm transform border-r border-border/40 bg-card transition-transform duration-150 ease-out sm:w-80 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            <Sidebar {...sidebarSharedProps} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {!isMobile && shellMode === 'hybrid' ? (
          <div className="pointer-events-none absolute right-3 top-1.5 z-[60]">
            <div className="pointer-events-auto">
              <ShellModeSwitcher compact />
            </div>
          </div>
        ) : null}
        {!isMobile ? (
          <VSCodeWorkbench
            sidebarProps={sidebarSharedProps}
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            activeTab={shellMode === 'pixcode' && activeTab === 'tasks' ? 'chat' : activeTab}
            setActiveTab={setActiveTab}
            ws={ws}
            sendMessage={sendMessage}
            latestMessage={latestMessage}
            isMobile={isMobile}
            onMenuClick={() => setSidebarOpen(true)}
            isLoading={isLoadingProjects}
            onInputFocusChange={setIsInputFocused}
            onSessionActive={markSessionAsActive}
            onSessionInactive={markSessionAsInactive}
            onSessionProcessing={markSessionAsProcessing}
            onSessionNotProcessing={markSessionAsNotProcessing}
            processingSessions={processingSessions}
            onReplaceTemporarySession={replaceTemporarySession}
            onNavigateToSession={(targetSessionId: string) => navigate(`/session/${targetSessionId}`)}
            onShowSettings={() => setShowSettings(true)}
            externalMessageUpdate={externalMessageUpdate}
            onQuickStartSession={sidebarSharedProps.onQuickStartSession}
            hidePixBot={shellMode === 'pixcode'}
            showShellModeSwitcher={shellMode === 'pixcode'}
          />
        ) : (
          <MainContent
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            ws={ws}
            sendMessage={sendMessage}
            latestMessage={latestMessage}
            isMobile={isMobile}
            onMenuClick={() => setSidebarOpen(true)}
            isLoading={isLoadingProjects}
            onInputFocusChange={setIsInputFocused}
            onSessionActive={markSessionAsActive}
            onSessionInactive={markSessionAsInactive}
            onSessionProcessing={markSessionAsProcessing}
            onSessionNotProcessing={markSessionAsNotProcessing}
            processingSessions={processingSessions}
            onReplaceTemporarySession={replaceTemporarySession}
            onNavigateToSession={(targetSessionId: string) => navigate(`/session/${targetSessionId}`)}
            onShowSettings={() => setShowSettings(true)}
            externalMessageUpdate={externalMessageUpdate}
            onQuickStartSession={sidebarSharedProps.onQuickStartSession}
          />
        )}
      </div>

      <QuickSettingsPanel />
      {isMobile && <InAppNotificationCenter latestMessage={latestMessage} />}
    </div>
  );
}
