import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import { cn } from '../../../lib/utils';
import { motion, useGsapCrossfade } from '../../../lib/animations';
import ChatInterface from '../../chat/view/ChatInterface';
import FileTree from '../../file-tree/view/FileTree';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import GitPanel from '../../git-panel/view/GitPanel';
import OrchestrationPage from '../../orchestration/OrchestrationPage';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import { QuickSettingsPanel } from '../../quick-settings-panel';
import type { MainContentProps } from '../types/types';
import type { AppTab, Project } from '../../../types/app';
import { useTaskMaster } from '../../../contexts/TaskMasterContext';
import { useTasksSettings } from '../../../contexts/TasksSettingsContext';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useEditorSidebar } from '../../code-editor/hooks/useEditorSidebar';
import EditorSidebar from '../../code-editor/view/EditorSidebar';
import { TaskMasterPanel } from '../../task-master';

import MainContentHeader from './subcomponents/MainContentHeader';
import MainContentStateView from './subcomponents/MainContentStateView';
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

const sidePanelTabs = new Set<AppTab>(['files', 'shell', 'git']);
const SIDE_PANEL_MIN_WIDTH = 32;
const SIDE_PANEL_MAX_WIDTH = 62;
const SIDE_PANEL_DEFAULT_WIDTH = 46;

function isSidePanelTab(tab: AppTab): tab is 'files' | 'shell' | 'git' {
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
  const { autoExpandTools, showRawParameters, showThinking, autoScrollToBottom, sendByCtrlEnter } = preferences;

  const { currentProject, setCurrentProject } = useTaskMaster() as TaskMasterContextValue;
  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings() as TasksSettingsContextValue;
  const [sidePanelMode, setSidePanelMode] = useState<'split' | 'full'>('split');
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_DEFAULT_WIDTH);
  const [isDraggingSidePanel, setIsDraggingSidePanel] = useState(false);
  const [canUseSidePanelSplit, setCanUseSidePanelSplit] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth >= 1024
  ));

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const activeSidePanelTab = isSidePanelTab(activeTab) ? activeTab : null;
  const showSidePanelSplit = Boolean(activeSidePanelTab && !isMobile && canUseSidePanelSplit && sidePanelMode === 'split');
  const showChatColumn = activeTab === 'chat' || showSidePanelSplit;

  // Subtle crossfade when switching tabs — drives a small fade+rise on the
  // active content column whenever activeTab changes.
  const tabContentRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const chatPaneRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
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

  const renderSidePanel = (tab: 'files' | 'shell' | 'git') => {
    if (tab === 'files') {
      return <FileTree selectedProject={selectedProject} onFileOpen={handleFileOpen} />;
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

  const handleActiveTabChange = useCallback((next: React.SetStateAction<AppTab>) => {
    const nextTab = typeof next === 'function' ? next(activeTab) : next;
    if (!isMobile && canUseSidePanelSplit && isSidePanelTab(nextTab)) {
      if (activeTab === nextTab) {
        setSidePanelMode((previous) => previous === 'split' ? 'full' : 'split');
      } else {
        setSidePanelMode('split');
      }
    } else {
      setSidePanelMode('split');
    }
    setActiveTab(nextTab);
  }, [activeTab, canUseSidePanelSplit, isMobile, setActiveTab]);

  const handleSidePanelResizeStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!splitContainerRef.current || !showSidePanelSplit) {
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
  }, [showSidePanelSplit]);

  useEffect(() => {
    if (!showSidePanelSplit) {
      setIsDraggingSidePanel(false);
    }
  }, [showSidePanelSplit]);

  useEffect(() => {
    if (!showSidePanelSplit || prefersReducedMotion()) {
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
        { opacity: 0, x: 40, scale: 0.985 },
        {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: motion.duration.enter,
          ease: motion.ease.soft,
          clearProps: 'transform,opacity',
        },
      );
    }, splitContainerRef);

    return () => context.revert();
  }, [activeSidePanelTab, showSidePanelSplit]);

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
        activeSidePanelTab={activeSidePanelTab}
        sidePanelMode={sidePanelMode}
        canUseSidePanelSplit={canUseSidePanelSplit}
        isMobile={isMobile}
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
            !editingFile && !showSidePanelSplit && 'mx-auto w-full max-w-[1100px] px-4 md:px-8',
            !editingFile && showSidePanelSplit && 'w-full px-3 md:px-4',
            !editingFile && activeTab === 'orchestration' && 'max-w-none px-0 md:px-0',
          )}
        >
          {(showChatColumn || activeSidePanelTab) && (
            <div
              ref={splitContainerRef}
              className={cn(
                'h-full min-h-0',
                showSidePanelSplit && 'flex overflow-hidden',
                isDraggingSidePanel && 'select-none',
              )}
            >
              {showChatColumn && (
                <div
                  ref={chatPaneRef}
                  className={cn(
                    'min-h-0 overflow-hidden',
                    showSidePanelSplit && 'min-w-[320px] flex-none',
                    !showSidePanelSplit && 'h-full',
                  )}
                  style={showSidePanelSplit ? { width: `${100 - sidePanelWidth}%` } : undefined}
                >
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
              )}

              {showSidePanelSplit && (
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
                      isDraggingSidePanel && 'h-28 bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.35)]',
                    )}
                  />
                </button>
              )}

              {activeSidePanelTab && (
                <div
                  ref={sidePanelRef}
                  className={cn(
                    'min-h-0 overflow-hidden rounded-lg border border-border/60 bg-card/40',
                    showSidePanelSplit && 'min-w-[360px] flex-none shadow-sm',
                    !showSidePanelSplit && 'h-full',
                  )}
                  style={showSidePanelSplit ? { width: `${sidePanelWidth}%` } : undefined}
                >
                  {renderSidePanel(activeSidePanelTab)}
                </div>
              )}
            </div>
          )}

          {activeTab === 'orchestration' && (
            <div className="h-full overflow-hidden">
              <OrchestrationPage selectedProject={selectedProject} />
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
      </div>
      <QuickSettingsPanel />
    </div>
  );
}

export default React.memo(MainContent);
