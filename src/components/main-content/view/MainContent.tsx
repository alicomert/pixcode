import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';

import { cn } from '../../../lib/utils';
import { motion, useGsapCrossfade } from '../../../lib/animations';
import ChatInterface from '../../chat/view/ChatInterface';
import FileTree from '../../file-tree/view/FileTree';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import GitPanel from '../../git-panel/view/GitPanel';
import OrchestrationPage from '../../orchestration/OrchestrationPage';
import LiveViewPanel from '../../live-view/LiveViewPanel';
import RemoteConsole from '../../remote-console/RemoteConsole';
import ControlRoomPage from '../../control-room/ControlRoomPage';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import { QuickSettingsPanel } from '../../quick-settings-panel';
import type { MainContentProps } from '../types/types';
import type { AppTab, Project } from '../../../types/app';
import { useTaskMaster } from '../../../contexts/TaskMasterContext';
import { useTasksSettings } from '../../../contexts/TasksSettingsContext';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useChangedFilesMonitor, type ChangedFilesTrackingMode } from '../../../hooks/useChangedFilesMonitor';
import { useEditorSidebar } from '../../code-editor/hooks/useEditorSidebar';
import EditorSidebar from '../../code-editor/view/EditorSidebar';
import { TaskMasterPanel } from '../../task-master';
import type { ChangedFileEntry } from '../../../utils/changedFiles';
import { api, authenticatedFetch } from '../../../utils/api';

import MainContentHeader from './subcomponents/MainContentHeader';
import MainContentStateView from './subcomponents/MainContentStateView';
import ChangedFilesActivityRail from './subcomponents/ChangedFilesActivityRail';
import ErrorBoundary from './ErrorBoundary';

type TaskMasterContextValue = {
  currentProject?: Project | null;
  setCurrentProject?: ((project: Project) => void) | null;
};

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  isTaskMasterReady: boolean | null;
};

type FileWithDiffResponse = {
  currentContent?: string;
  oldContent?: string;
  error?: string;
};

const sidePanelTabs = new Set<AppTab>(['files', 'shell', 'git', 'changes', 'liveView']);
const SIDE_PANEL_MIN_WIDTH = 40;
const SIDE_PANEL_MAX_WIDTH = 50;
const SIDE_PANEL_DEFAULT_WIDTH = 46;
const COMMAND_CENTER_MODE_STORAGE_KEY = 'command-center-tracking-mode';

function isSidePanelTab(tab: AppTab): tab is 'files' | 'shell' | 'git' | 'changes' | 'liveView' {
  return sidePanelTabs.has(tab);
}

function clampSidePanelWidth(width: number) {
  return Math.min(SIDE_PANEL_MAX_WIDTH, Math.max(SIDE_PANEL_MIN_WIDTH, width));
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function MainContent({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  latestMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  onSessionActive,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  processingSessions,
  onReplaceTemporarySession,
  onNavigateToSession,
  onShowSettings,
  externalMessageUpdate,
  onQuickStartSession,
  onQuickStartOrchestration,
}: MainContentProps) {
  const { preferences } = useUiPreferences();
  const {
    autoExpandTools,
    showRawParameters,
    showThinking,
    autoScrollToBottom,
    sendByCtrlEnter,
  } = preferences;

  const { currentProject, setCurrentProject } = useTaskMaster() as TaskMasterContextValue;
  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings() as TasksSettingsContextValue;
  const [sidePanelMode, setSidePanelMode] = useState<'split' | 'full'>('split');
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_DEFAULT_WIDTH);
  const [isDraggingSidePanel, setIsDraggingSidePanel] = useState(false);
  const [liveViewAvailable, setLiveViewAvailable] = useState(false);
  const [changeTrackingMode, setChangeTrackingMode] = useState<ChangedFilesTrackingMode>(() => {
    if (typeof window === 'undefined') {
      return 'local';
    }

    return window.localStorage.getItem(COMMAND_CENTER_MODE_STORAGE_KEY) === 'git' ? 'git' : 'local';
  });
  const [mainSurfaceTab, setMainSurfaceTab] = useState<AppTab>(() => (isSidePanelTab(activeTab) ? 'chat' : activeTab));
  const [canUseSidePanelSplit, setCanUseSidePanelSplit] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth >= 1024
  ));

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const activeSidePanelTab = isSidePanelTab(activeTab) ? activeTab : null;
  const showSidePanelSplit = Boolean(activeSidePanelTab && !isMobile && canUseSidePanelSplit && sidePanelMode === 'split');

  // Subtle crossfade when switching tabs — drives a small fade+rise on the
  // active content column whenever activeTab changes.
  const tabContentRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const chatPaneRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const sidePanelTransitionRectRef = useRef<DOMRect | null>(null);
  useGsapCrossfade(tabContentRef, activeTab);

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });
  const sidePanelMainTab: AppTab = mainSurfaceTab === 'orchestration' ? 'orchestration' : 'chat';
  const visiblePrimaryTab = activeSidePanelTab ? sidePanelMainTab : activeTab;
  const showSidePanelWithChat = Boolean(showSidePanelSplit);
  const dockEditorInsideFilesPanel = Boolean(activeSidePanelTab === 'files' && editingFile && !isMobile);
  const showChatColumn = visiblePrimaryTab === 'chat' && (!activeSidePanelTab || showSidePanelWithChat);
  const showOrchestrationColumn = visiblePrimaryTab === 'orchestration' && showSidePanelWithChat;

  const {
    changedFiles,
    isLoading: changedFilesLoading,
    error: changedFilesError,
    lastCheckedAt: lastChangedFilesCheckedAt,
    latestDetectedFile,
    refresh: refreshChangedFiles,
  } = useChangedFilesMonitor(selectedProject, Boolean(selectedProject), latestMessage, changeTrackingMode);
  const [focusedChangedFilePath, setFocusedChangedFilePath] = useState<string | null>(null);
  const lastHandledDetectedAtRef = useRef(0);
  const changedFilePaths = useMemo(() => changedFiles.map((file) => file.path), [changedFiles]);

  const hydrateChangedFileDiffInfo = useCallback(async (file: ChangedFileEntry) => {
    if (file.diffInfo) {
      return file.diffInfo;
    }

    if (!selectedProject) {
      return null;
    }

    try {
      const response = await authenticatedFetch(
        `/api/git/file-with-diff?project=${encodeURIComponent(selectedProject.name)}&file=${encodeURIComponent(file.path)}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as FileWithDiffResponse;
      if (
        response.ok
        && !data.error
        && typeof data.currentContent === 'string'
        && typeof data.oldContent === 'string'
      ) {
        return {
          old_string: data.oldContent,
          new_string: data.currentContent,
        };
      }
    } catch {
      // Non-git projects fall back to showing newly-created file content below.
    }

    if (file.status === 'A' || file.status === 'U') {
      try {
        const response = await api.readFile(selectedProject.name, file.path);
        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { content?: unknown };
        if (typeof data.content === 'string') {
          return {
            old_string: '',
            new_string: data.content,
          };
        }
      } catch {
        return null;
      }
    }

    return null;
  }, [selectedProject]);

  const handleChangedFileOpen = useCallback((file: ChangedFileEntry) => {
    setFocusedChangedFilePath(file.path);
    handleFileOpen(file.path, file.diffInfo ?? null);

    if (!isMobile && canUseSidePanelSplit) {
      setSidePanelMode('split');
    }

    setActiveTab('files');

    if (!file.diffInfo) {
      void hydrateChangedFileDiffInfo(file).then((diffInfo) => {
        if (diffInfo) {
          handleFileOpen(file.path, diffInfo);
        }
      });
    }
  }, [canUseSidePanelSplit, handleFileOpen, hydrateChangedFileDiffInfo, isMobile, setActiveTab]);

  const closeSidePanel = useCallback(() => {
    setSidePanelMode('split');
    setActiveTab(sidePanelMainTab);
  }, [setActiveTab, sidePanelMainTab]);

  const renderSidePanel = (tab: 'files' | 'shell' | 'git' | 'changes' | 'liveView') => {
    if (tab === 'files') {
      if (dockEditorInsideFilesPanel) {
        return (
          <div className="flex h-full min-w-0 overflow-hidden">
            {!editorExpanded && (
              <div className="h-full min-w-[220px] max-w-[50%] flex-[0_0_46%] overflow-hidden border-r border-border/60">
                <FileTree
                  selectedProject={selectedProject}
                  onFileOpen={handleFileOpen}
                  changedFilePaths={changedFilePaths}
                  focusedFilePath={focusedChangedFilePath}
                />
              </div>
            )}
            <EditorSidebar
              editingFile={editingFile}
              isMobile={isMobile}
              editorExpanded={editorExpanded}
              editorWidth={editorWidth}
              hasManualWidth={hasManualWidth}
              resizeHandleRef={resizeHandleRef}
              onResizeStart={handleResizeStart}
              onCloseEditor={handleCloseEditor}
              onToggleEditorExpand={handleToggleEditorExpand}
              projectPath={selectedProject?.path}
              fillSpace
            />
          </div>
        );
      }

      return (
        <FileTree
          selectedProject={selectedProject}
          onFileOpen={handleFileOpen}
          changedFilePaths={changedFilePaths}
          focusedFilePath={focusedChangedFilePath}
        />
      );
    }

    if (tab === 'shell') {
      return (
        <StandaloneShell
          project={selectedProject}
          session={selectedSession}
          showHeader={false}
          isActive={activeTab === 'shell'}
        />
      );
    }

    if (tab === 'changes') {
      return (
        <ChangedFilesActivityRail
          changedFiles={changedFiles}
          isLoading={changedFilesLoading}
          error={changedFilesError}
          latestChangedFilePath={latestDetectedFile?.path ?? focusedChangedFilePath}
          lastCheckedAt={lastChangedFilesCheckedAt}
          trackingMode={changeTrackingMode}
          onTrackingModeChange={setChangeTrackingMode}
          onRefresh={() => { void refreshChangedFiles('manual'); }}
          onOpenFile={handleChangedFileOpen}
          variant="panel"
        />
      );
    }

    if (tab === 'liveView') {
      if (!selectedProject) {
        return null;
      }

      return (
        <LiveViewPanel
          selectedProject={selectedProject}
          onAvailabilityChange={setLiveViewAvailable}
        />
      );
    }

    return <GitPanel selectedProject={selectedProject} isMobile={isMobile} onFileOpen={handleFileOpen} />;
  };

  useEffect(() => {
    const selectedProjectName = selectedProject?.name;
    const currentProjectName = currentProject?.name;

    if (selectedProject && selectedProjectName !== currentProjectName) {
      setCurrentProject?.(selectedProject);
    }
  }, [selectedProject, currentProject?.name, setCurrentProject]);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  useEffect(() => {
    if (!selectedProject) {
      setLiveViewAvailable(false);
      return;
    }

    let cancelled = false;
    authenticatedFetch(`/api/live-view/${encodeURIComponent(selectedProject.name)}/status`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled) {
          setLiveViewAvailable(Boolean(data?.target?.available || data?.session));
        }
      })
      .catch(() => {
        if (!cancelled) setLiveViewAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateSplitCapability = () => {
      setCanUseSidePanelSplit(window.innerWidth >= 1024);
    };

    updateSplitCapability();
    window.addEventListener('resize', updateSplitCapability);
    return () => {
      window.removeEventListener('resize', updateSplitCapability);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(COMMAND_CENTER_MODE_STORAGE_KEY, changeTrackingMode);
  }, [changeTrackingMode]);

  useEffect(() => {
    if (!isSidePanelTab(activeTab)) {
      setMainSurfaceTab(activeTab);
    }
  }, [activeTab]);

  const handleActiveTabChange = useCallback((next: React.SetStateAction<AppTab>) => {
    const nextTab = typeof next === 'function' ? next(activeTab) : next;
    if (!isMobile && canUseSidePanelSplit && isSidePanelTab(nextTab)) {
      if (activeTab === nextTab) {
        sidePanelTransitionRectRef.current = sidePanelRef.current?.getBoundingClientRect() ?? null;
        setSidePanelMode((previous) => previous === 'split' ? 'full' : 'split');
      } else {
        setSidePanelMode('split');
      }
    } else {
      setSidePanelMode('split');
      setMainSurfaceTab(nextTab);
    }
    setActiveTab(nextTab);
  }, [activeTab, canUseSidePanelSplit, isMobile, setActiveTab]);

  const handleSidePanelResizeStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!splitContainerRef.current || !showSidePanelWithChat) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDraggingSidePanel(true);

    const updateWidth = (clientX: number) => {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const nextWidth = ((rect.right - clientX) / rect.width) * 100;
      setSidePanelWidth(clampSidePanelWidth(nextWidth));
    };

    updateWidth(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateWidth(moveEvent.clientX);
    };

    const handlePointerEnd = () => {
      setIsDraggingSidePanel(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd, { once: true });
    window.addEventListener('pointercancel', handlePointerEnd, { once: true });
  }, [showSidePanelWithChat]);

  useLayoutEffect(() => {
    const previousRect = sidePanelTransitionRectRef.current;
    const sidePanel = sidePanelRef.current;
    if (!previousRect || !sidePanel || prefersReducedMotion()) {
      sidePanelTransitionRectRef.current = null;
      return;
    }

    const nextRect = sidePanel.getBoundingClientRect();
    if (nextRect.width <= 0 || nextRect.height <= 0) {
      sidePanelTransitionRectRef.current = null;
      return;
    }

    const deltaX = previousRect.left - nextRect.left;
    const scaleX = previousRect.width / nextRect.width;
    const transformOrigin = 'right center';

    gsap.fromTo(
      sidePanel,
      { x: deltaX, scaleX, opacity: 0.94, transformOrigin },
      {
        x: 0,
        scaleX: 1,
        opacity: 1,
        duration: motion.duration.enter,
        ease: motion.ease.soft,
        clearProps: 'transform,opacity,transformOrigin',
      },
    );

    sidePanelTransitionRectRef.current = null;
  }, [sidePanelMode, showSidePanelSplit]);

  useEffect(() => {
    if (!showSidePanelSplit) {
      setIsDraggingSidePanel(false);
    }
  }, [showSidePanelSplit]);

  useEffect(() => {
    if (!showSidePanelWithChat || prefersReducedMotion()) {
      return;
    }

    const chatPane = chatPaneRef.current;
    const sidePanel = sidePanelRef.current;
    if (!chatPane || !sidePanel) {
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        chatPane,
        { opacity: 0.92, x: -14 },
        {
          opacity: 1,
          x: 0,
          duration: motion.duration.base,
          ease: motion.ease.out,
          clearProps: 'transform,opacity',
        },
      );
      gsap.fromTo(
        sidePanel,
        { opacity: 0, x: 28, scaleX: 0.96, transformOrigin: 'right center' },
        {
          opacity: 1,
          x: 0,
          scaleX: 1,
          duration: motion.duration.enter,
          ease: motion.ease.soft,
          clearProps: 'transform,opacity,transformOrigin',
        },
      );
    }, splitContainerRef);

    return () => context.revert();
  }, [activeSidePanelTab, showSidePanelWithChat]);

  useEffect(() => {
    if (!latestDetectedFile) {
      return;
    }

    if (latestDetectedFile.detectedAt === lastHandledDetectedAtRef.current) {
      return;
    }

    lastHandledDetectedAtRef.current = latestDetectedFile.detectedAt;
    setFocusedChangedFilePath(latestDetectedFile.path);
  }, [latestDetectedFile]);

  useEffect(() => {
    if (!focusedChangedFilePath) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setFocusedChangedFilePath(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [focusedChangedFilePath]);

  if (isLoading) {
    return <MainContentStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (!selectedProject) {
    return (
      <MainContentStateView
        mode="empty"
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        onQuickStartSession={onQuickStartSession}
        onQuickStartOrchestration={onQuickStartOrchestration}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MainContentHeader
        activeTab={activeTab}
        setActiveTab={handleActiveTabChange}
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        shouldShowTasksTab={shouldShowTasksTab}
        liveViewAvailable={liveViewAvailable}
        activeSidePanelTab={activeSidePanelTab}
        sidePanelMode={sidePanelMode}
        canUseSidePanelSplit={canUseSidePanelSplit}
        isMobile={isMobile}
        onCloseSidePanel={activeSidePanelTab ? closeSidePanel : undefined}
        onMenuClick={onMenuClick}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/*
          Center the main content column when no editor is open so chat and
          tab views don't hug the sidebar (ChatGPT-style breathing room).
          When the editor is docked we hand the full flex area back so the
          editor + content split fills the viewport.
        */}
        <div
          ref={tabContentRef}
          className={cn(
            'flex min-h-0 min-w-[200px] flex-1 flex-col overflow-hidden',
            editorExpanded && 'hidden',
            !editingFile && !activeSidePanelTab && !showSidePanelSplit && 'mx-auto w-full max-w-[1100px] px-4 md:px-8',
            !editingFile && activeSidePanelTab && !showSidePanelWithChat && 'w-full px-3 md:px-4',
            !editingFile && showSidePanelWithChat && 'w-full px-3 md:px-4',
            !editingFile && activeTab === 'orchestration' && 'max-w-none px-0 md:px-0',
            !editingFile && activeTab === 'remote' && 'max-w-none px-0 md:px-0',
            !editingFile && activeTab === 'controlRoom' && 'max-w-none px-0 md:px-0',
          )}
        >
          {(showChatColumn || showOrchestrationColumn || activeSidePanelTab) && (
            <div
              ref={splitContainerRef}
              className={cn(
                'h-full min-h-0',
                showSidePanelWithChat && 'flex overflow-hidden',
                isDraggingSidePanel && 'select-none',
              )}
            >
              {showChatColumn && (
                <div
                  ref={chatPaneRef}
                  className={cn(
                    'min-h-0 overflow-hidden',
                    showSidePanelWithChat && 'min-w-[320px] flex-none transition-[width,opacity,transform] duration-300 ease-out',
                    isDraggingSidePanel && 'transition-none',
                    !showSidePanelWithChat && 'h-full',
                  )}
                  style={showSidePanelWithChat ? { width: `${100 - sidePanelWidth}%` } : undefined}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-1">
                    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                      <ErrorBoundary showDetails>
                        <ChatInterface
                          selectedProject={selectedProject}
                          selectedSession={selectedSession}
                          ws={ws}
                          sendMessage={sendMessage}
                          latestMessage={latestMessage}
                          onFileOpen={handleFileOpen}
                          onInputFocusChange={onInputFocusChange}
                          onSessionActive={onSessionActive}
                          onSessionInactive={onSessionInactive}
                          onSessionProcessing={onSessionProcessing}
                          onSessionNotProcessing={onSessionNotProcessing}
                          processingSessions={processingSessions}
                          onReplaceTemporarySession={onReplaceTemporarySession}
                          onNavigateToSession={onNavigateToSession}
                          onShowSettings={onShowSettings}
                          autoExpandTools={autoExpandTools}
                          showRawParameters={showRawParameters}
                          showThinking={showThinking}
                          autoScrollToBottom={autoScrollToBottom}
                          sendByCtrlEnter={sendByCtrlEnter}
                          externalMessageUpdate={externalMessageUpdate}
                          onShowAllTasks={tasksEnabled ? () => handleActiveTabChange('tasks') : null}
                        />
                      </ErrorBoundary>
                    </div>
                  </div>
                </div>
              )}

              {showOrchestrationColumn && (
                <div
                  ref={chatPaneRef}
                  className={cn(
                    'min-h-0 overflow-hidden',
                    showSidePanelWithChat && 'min-w-[320px] flex-none transition-[width,opacity,transform] duration-300 ease-out',
                    isDraggingSidePanel && 'transition-none',
                  )}
                  style={showSidePanelWithChat ? { width: `${100 - sidePanelWidth}%` } : undefined}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-1">
                    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                      <OrchestrationPage selectedProject={selectedProject} />
                    </div>
                  </div>
                </div>
              )}

              {showSidePanelWithChat && (
                <button
                  type="button"
                  className="group relative z-20 mx-1 flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onPointerDown={handleSidePanelResizeStart}
                  aria-label="Resize side panel"
                  title="Drag to resize"
                >
                  <span className="absolute inset-y-3 -left-2 -right-2 rounded-full" />
                  <span
                    className={cn(
                      'h-16 w-1 rounded-full bg-border transition-all duration-200 group-hover:h-24 group-hover:bg-foreground/40',
                      isDraggingSidePanel && 'h-28 bg-foreground/55 shadow-[0_0_18px_rgba(120,120,120,0.22)]',
                    )}
                  />
                </button>
              )}

              {activeSidePanelTab && (
                <div
                  ref={sidePanelRef}
                  className={cn(
                    'min-h-0 overflow-hidden rounded-lg border border-border/60 bg-card/40',
                    showSidePanelWithChat && 'min-w-[360px] flex-none shadow-sm transition-[width,opacity,transform] duration-300 ease-out',
                    isDraggingSidePanel && 'transition-none',
                    !showSidePanelWithChat && 'h-full w-full',
                  )}
                  style={showSidePanelWithChat ? { width: `${sidePanelWidth}%` } : undefined}
                >
                  {renderSidePanel(activeSidePanelTab)}
                </div>
              )}
            </div>
          )}

          {!activeSidePanelTab && activeTab === 'orchestration' && (
            <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <OrchestrationPage selectedProject={selectedProject} />
              </div>
            </div>
          )}

          {!activeSidePanelTab && activeTab === 'remote' && (
            <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <RemoteConsole />
              </div>
            </div>
          )}

          {!activeSidePanelTab && activeTab === 'controlRoom' && (
            <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <ControlRoomPage selectedProject={selectedProject} />
              </div>
            </div>
          )}

          {shouldShowTasksTab && <TaskMasterPanel isVisible={activeTab === 'tasks'} />}

          <div className={`h-full overflow-hidden ${activeTab === 'preview' ? 'block' : 'hidden'}`} />

          {activeTab.startsWith('plugin:') && (
            <div className="h-full overflow-hidden">
              <PluginTabContent
                pluginName={activeTab.replace('plugin:', '')}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
              />
            </div>
          )}
        </div>

        {!dockEditorInsideFilesPanel && (
          <EditorSidebar
            editingFile={editingFile}
            isMobile={isMobile}
            editorExpanded={editorExpanded}
            editorWidth={editorWidth}
            hasManualWidth={hasManualWidth}
            resizeHandleRef={resizeHandleRef}
            onResizeStart={handleResizeStart}
            onCloseEditor={handleCloseEditor}
            onToggleEditorExpand={handleToggleEditorExpand}
            projectPath={selectedProject.path}
            fillSpace={activeTab === 'files'}
          />
        )}
      </div>
      <QuickSettingsPanel />
    </div>
  );
}

export default React.memo(MainContent);
