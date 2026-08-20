import { lazy, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Sidebar from '../sidebar/view/Sidebar';
import { QuickSettingsPanel } from '../quick-settings-panel';
import InAppNotificationCenter from '../notifications/InAppNotificationCenter';
import ErrorBoundary from '../main-content/view/ErrorBoundary';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useDeviceSettings } from '../../hooks/useDeviceSettings';
import { useSessionProtection } from '../../hooks/useSessionProtection';
import { useProjectsState } from '../../hooks/useProjectsState';

// Keep the desktop workbench and mobile layout out of the initial bundle when
// the other surface is not needed. Both areas pull in editors, terminal and
// task panels; loading them lazily trims first paint cost on phones without
// sacrificing the full desktop experience.
const VSCodeWorkbench = lazy(() => import('../vscode-workbench/view/VSCodeWorkbench'));
const MobileMainContent = lazy(() => import('../main-content/view/MainContent'));
const TerminalOnlyView = lazy(() => import('../terminal-only/view/TerminalOnlyView'));

function SurfaceFallback() {
  return <div className="flex min-h-0 flex-1 items-center justify-center bg-background" aria-busy="true" />;
}

export default function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { t } = useTranslation('common');
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { ws, sendMessage, latestMessage, isConnected } = useWebSocket();
  const wasConnectedRef = useRef(false);
  const mobileSidebarRef = useRef<HTMLDivElement | null>(null);

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

  const terminalOnly = new URLSearchParams(location.search).get('terminal') === '1';
  const enterTerminalOnly = () => {
    setSidebarOpen(false);
    const params = new URLSearchParams(location.search);
    params.set('terminal', '1');
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash });
  };
  const exitTerminalOnly = () => {
    setSidebarOpen(false);
    const params = new URLSearchParams(location.search);
    params.delete('terminal');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true });
  };

  // The shared quick-start action normally navigates to the chat workbench.
  // In terminal-only mode the user should stay on that focused surface after
  // the workspace is created; re-apply the mode once the project mutation has
  // completed instead of briefly leaving the terminal view.
  const quickStartTerminalWorkspace = async () => {
    await sidebarSharedProps.onQuickStartSession?.();
    const params = new URLSearchParams(window.location.search);
    params.set('terminal', '1');
    const search = params.toString();
    navigate({
      pathname: window.location.pathname,
      search: search ? `?${search}` : '',
      hash: window.location.hash,
    }, { replace: true });
  };

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
      // Only treat a large visual-viewport reduction while an editable
      // control is focused as a keyboard.  iOS also resizes the visual
      // viewport while the browser chrome expands/collapses; treating that
      // small delta as a keyboard makes the entire fixed app jump during
      // ordinary scrolling.
      const activeElement = document.activeElement;
      const isEditable = activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || activeElement instanceof HTMLElement && activeElement.isContentEditable;
      const viewportDelta = Math.max(0, window.innerHeight - vv.height);
      const keyboardHeight = isEditable && viewportDelta > 120 ? viewportDelta : 0;
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    };
    update();
    vv.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--keyboard-height');
    };
  }, []);

  // Keep the mobile drawer keyboard-accessible and prevent the page behind it
  // from scrolling while it is open.  The app itself owns the scroll areas;
  // allowing the document to scroll here causes a second scrollbar on iOS and
  // makes a swipe near the drawer edge dismiss/scroll the wrong surface.
  useEffect(() => {
    if (!isMobile || !sidebarOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          mobileSidebarRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeElement = document.activeElement;
          if (event.shiftKey && (activeElement === first || !mobileSidebarRef.current?.contains(activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && (activeElement === last || !mobileSidebarRef.current?.contains(activeElement))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    const focusFrame = window.requestAnimationFrame(() => {
      mobileSidebarRef.current
        ?.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isMobile, setSidebarOpen, sidebarOpen]);

  if (terminalOnly) {
    return (
      <div className="fixed inset-0 flex bg-gray-950" style={{ bottom: 'var(--keyboard-height, 0px)' }}>
        <ErrorBoundary
          showDetails
          onRetry={() => window.location.reload()}
        >
          <Suspense fallback={<SurfaceFallback />}>
            <TerminalOnlyView
              selectedProject={selectedProject}
              selectedSession={selectedSession}
              isMobile={isMobile}
              isLoading={isLoadingProjects}
              onQuickStartWorkspace={quickStartTerminalWorkspace}
              onExit={exitTerminalOnly}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  // Always hybrid (Both): full workbench + NanoClaw Tasks. No NC/Both/IDE switcher.
  return (
    <div className="fixed inset-0 flex bg-background" style={{ bottom: 'var(--keyboard-height, 0px)' }}>
      {isMobile ? (
        <div
          className={`fixed inset-0 z-50 flex transition-all duration-150 ease-out ${sidebarOpen ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
        >
          <button
            type="button"
            data-mobile-sidebar-close
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
            aria-label={t('sidebar.close', { defaultValue: 'Close navigation' })}
          />
          <div
            ref={mobileSidebarRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('sidebar.title', { defaultValue: 'Workspace navigation' })}
            className={`relative h-full w-[90vw] max-w-sm transform border-r border-border/40 bg-card transition-transform duration-150 ease-out sm:w-80 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            <Sidebar {...sidebarSharedProps} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary
          showDetails
          onRetry={() => window.location.reload()}
        >
          <Suspense fallback={<SurfaceFallback />}>
            {!isMobile ? (
              <VSCodeWorkbench
                sidebarProps={sidebarSharedProps}
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
                onEnterTerminalOnly={enterTerminalOnly}
                hidePixBot={false}
                showShellModeSwitcher={false}
              />
            ) : (
              <MobileMainContent
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
                onEnterTerminalOnly={enterTerminalOnly}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>

      <QuickSettingsPanel />
      {isMobile && <InAppNotificationCenter latestMessage={latestMessage} />}
    </div>
  );
}
