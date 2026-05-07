import React, { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../../../lib/utils';
import { useGsapCrossfade } from '../../../lib/animations';
import ChatInterface from '../../chat/view/ChatInterface';
import FileTree from '../../file-tree/view/FileTree';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import GitPanel from '../../git-panel/view/GitPanel';
import OrchestrationPage from '../../orchestration/OrchestrationPage';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import { QuickSettingsPanel } from '../../quick-settings-panel';
import type { MainContentProps } from '../types/types';
import type { AppTab, Project  } from '../../../types/app';
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

function isSidePanelTab(tab: AppTab): tab is 'files' | 'shell' | 'git' {
  return sidePanelTabs.has(tab);
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

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const activeSidePanelTab = isSidePanelTab(activeTab) ? activeTab : null;
  const showSidePanelSplit = Boolean(activeSidePanelTab && !isMobile && sidePanelMode === 'split');
  const showChatColumn = activeTab === 'chat' || showSidePanelSplit;

  // Subtle crossfade when switching tabs — drives a small fade+rise on the
  // active content column whenever activeTab changes.
  const tabContentRef = useRef<HTMLDivElement>(null);
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

  const handleActiveTabChange = useCallback((next: React.SetStateAction<AppTab>) => {
    const nextTab = typeof next === 'function' ? next(activeTab) : next;
    if (!isMobile && isSidePanelTab(nextTab)) {
      if (activeTab === nextTab) {
        setSidePanelMode((previous) => previous === 'split' ? 'full' : 'split');
      } else {
        setSidePanelMode('split');
      }
    } else {
      setSidePanelMode('split');
    }
    setActiveTab(nextTab);
  }, [activeTab, isMobile, setActiveTab]);

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
            <div className={cn('h-full min-h-0', showSidePanelSplit && 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(420px,48%)]')}>
              {showChatColumn && (
                <div className="min-h-0 overflow-hidden rounded-none lg:rounded-lg lg:border lg:border-border/60 lg:bg-background/70">
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

              {activeSidePanelTab && (
                <div className={cn(
                  'min-h-0 overflow-hidden rounded-lg border border-border/60 bg-card/40',
                  !showSidePanelSplit && 'h-full',
                )}>
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
