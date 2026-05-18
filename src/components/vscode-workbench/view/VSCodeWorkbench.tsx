import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import ChatInterface from '../../chat/view/ChatInterface';
import CodeEditor from '../../code-editor/view/CodeEditor';
import { useEditorSidebar } from '../../code-editor/hooks/useEditorSidebar';
import ControlRoomPage from '../../control-room/ControlRoomPage';
import FileTree from '../../file-tree/view/FileTree';
import GitPanel from '../../git-panel/view/GitPanel';
import MainContentStateView from '../../main-content/view/subcomponents/MainContentStateView';
import OrchestrationPage from '../../orchestration/OrchestrationPage';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import RemoteConsole from '../../remote-console/RemoteConsole';
import Sidebar from '../../sidebar/view/Sidebar';
import type { SidebarProps } from '../../sidebar/types/types';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import { TaskMasterPanel } from '../../task-master';
import type { WorkspaceType } from '../../project-creation-wizard/types';
import { useTaskMaster } from '../../../contexts/TaskMasterContext';
import { useTasksSettings } from '../../../contexts/TasksSettingsContext';
import { cn } from '../../../lib/utils';
import type { AppTab, Project } from '../../../types/app';
import type { MainContentProps } from '../../main-content/types/types';

import {
  Bot,
  ChevronDown,
  Code2,
  Columns,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Github,
  MessageSquare,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Sparkles,
  Terminal,
  Workflow,
} from '@/lib/icons';

type VSCodeWorkbenchProps = MainContentProps & {
  sidebarProps: SidebarProps;
};

type ActivityPanel = 'explorer' | 'projects' | 'sourceControl' | 'terminal';
type RightPanel = 'cli' | 'terminal';

type ResizeTarget = 'left' | 'right';

const LEFT_MIN_WIDTH = 260;
const LEFT_MAX_WIDTH = 520;
const LEFT_DEFAULT_WIDTH = 340;
const RIGHT_MIN_WIDTH = 320;
const RIGHT_MAX_WIDTH = 680;
const RIGHT_DEFAULT_WIDTH = 420;

type TaskMasterContextValue = {
  currentProject?: Project | null;
  setCurrentProject?: ((project: Project) => void) | null;
};

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isCenterSystemTab(activeTab: AppTab) {
  return (
    activeTab === 'orchestration'
    || activeTab === 'remote'
    || activeTab === 'controlRoom'
    || activeTab === 'tasks'
    || activeTab.startsWith('plugin:')
  );
}

function activityForTab(activeTab: AppTab): ActivityPanel {
  if (activeTab === 'git' || activeTab === 'changes') return 'sourceControl';
  if (activeTab === 'shell') return 'terminal';
  return 'explorer';
}

function getProjectPath(project: Project) {
  return project.fullPath || project.path || project.displayName || project.name;
}

function formatProjectPath(project: Project) {
  const rawPath = getProjectPath(project);
  const normalized = rawPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length === 0) {
    return rawPath || project.name;
  }

  return `/${parts[parts.length - 1]}`;
}

function formatFileCount(fileCount: Project['fileCount'], t: TFunction<'common'>) {
  if (typeof fileCount !== 'number' || !Number.isFinite(fileCount)) {
    return t('vscodeWorkbench.projects.fileCountPending', { defaultValue: 'Files pending' });
  }

  return t('vscodeWorkbench.projects.fileCount', {
    count: fileCount,
    formattedCount: fileCount.toLocaleString(),
    defaultValue: '{{formattedCount}} files',
  });
}

function VSCodeWorkbench({
  sidebarProps,
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
  onQuickStartTasks,
}: VSCodeWorkbenchProps) {
  const { t } = useTranslation('common');
  const { currentProject, setCurrentProject } = useTaskMaster() as TaskMasterContextValue;
  const { tasksEnabled } = useTasksSettings() as TasksSettingsContextValue;
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_DEFAULT_WIDTH);
  const [rightPaneWidth, setRightPaneWidth] = useState(RIGHT_DEFAULT_WIDTH);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [activityPanel, setActivityPanel] = useState<ActivityPanel>(() => activityForTab(activeTab));
  const [rightPanel, setRightPanel] = useState<RightPanel>('cli');
  const [resizeTarget, setResizeTarget] = useState<ResizeTarget | null>(null);

  const {
    editingFile,
    handleFileOpen,
    handleCloseEditor,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });

  useEffect(() => {
    const selectedProjectName = selectedProject?.name;
    const currentProjectName = currentProject?.name;

    if (selectedProject && selectedProjectName !== currentProjectName) {
      setCurrentProject?.(selectedProject);
    }
  }, [currentProject?.name, selectedProject, setCurrentProject]);

  useEffect(() => {
    if (isCenterSystemTab(activeTab)) {
      return;
    }

    if (activeTab === 'chat' && activityPanel === 'projects') {
      return;
    }

    setActivityPanel(activityForTab(activeTab));
  }, [activeTab, activityPanel]);

  useEffect(() => {
    if (!tasksEnabled && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [activeTab, setActiveTab, tasksEnabled]);

  const activityButtons = useMemo(
    () => [
      {
        id: 'explorer' as const,
        icon: Folder,
        label: t('vscodeWorkbench.activity.explorer'),
        tab: 'files' as AppTab,
      },
      {
        id: 'projects' as const,
        icon: FileText,
        label: t('vscodeWorkbench.activity.projects'),
        tab: 'chat' as AppTab,
      },
      {
        id: 'sourceControl' as const,
        icon: GitBranch,
        label: t('vscodeWorkbench.activity.sourceControl'),
        tab: 'git' as AppTab,
      },
      {
        id: 'terminal' as const,
        icon: Terminal,
        label: t('vscodeWorkbench.activity.terminal'),
        tab: 'shell' as AppTab,
      },
    ],
    [t],
  );

  const systemButtons = useMemo(
    () => [
      {
        id: 'orchestration',
        icon: Workflow,
        label: t('tabs.orchestration'),
        tab: 'orchestration' as AppTab,
      },
      {
        id: 'controlRoom',
        icon: Sparkles,
        label: t('tabs.controlRoom'),
        tab: 'controlRoom' as AppTab,
      },
      {
        id: 'remote',
        icon: Server,
        label: t('tabs.remote'),
        tab: 'remote' as AppTab,
      },
      ...(tasksEnabled
        ? [{
            id: 'tasks',
            icon: Play,
            label: t('tabs.tasks'),
            tab: 'tasks' as AppTab,
          }]
        : []),
    ],
    [t, tasksEnabled],
  );

  const startResize = useCallback((target: ResizeTarget, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setResizeTarget(target);
  }, []);

  useEffect(() => {
    if (!resizeTarget) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (resizeTarget === 'left') {
        setLeftPaneWidth(clamp(event.clientX - rect.left, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH));
        return;
      }

      setRightPaneWidth(clamp(rect.right - event.clientX, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
    };

    const stopResize = () => setResizeTarget(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizeTarget]);

  const selectActivityPanel = useCallback((panel: ActivityPanel, tab: AppTab) => {
    setActivityPanel(panel);
    setIsLeftCollapsed(false);
    if (panel === 'projects') {
      setActiveTab('chat');
      return;
    }

    if (tab !== 'chat' || !isCenterSystemTab(activeTab)) {
      setActiveTab(tab);
    }
  }, [activeTab, setActiveTab]);

  const openSystemTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  const openProjectWizard = useCallback((type: WorkspaceType) => {
    window.dispatchEvent(new CustomEvent('pixcode:create-project', {
      detail: { workspaceType: type },
    }));
  }, []);

  const handleWorkbenchProjectSelect = useCallback((project: Project) => {
    sidebarProps.onProjectSelect(project);
    setActiveTab('chat');
  }, [setActiveTab, sidebarProps]);

  const renderLeftPanel = () => {
    if (activityPanel === 'projects') {
      return (
        <WorkbenchProjectsPanel
          projects={sidebarProps.projects}
          selectedProject={selectedProject}
          onProjectSelect={handleWorkbenchProjectSelect}
          onNewSession={sidebarProps.onNewSession}
          onOpenProject={() => openProjectWizard('existing')}
          onCloneProject={() => openProjectWizard('new')}
          onRefresh={sidebarProps.onRefresh}
          isRefreshing={sidebarProps.isLoading}
          t={t}
        />
      );
    }

    if (activityPanel === 'sourceControl') {
      return <GitPanel selectedProject={selectedProject} isMobile={false} onFileOpen={handleFileOpen} />;
    }

    if (activityPanel === 'terminal') {
      return (
        <StandaloneShell
          project={selectedProject}
          session={selectedSession}
          showHeader
          isActive={activeTab === 'shell'}
        />
      );
    }

    return (
      <FileTree
        selectedProject={selectedProject}
        onFileOpen={handleFileOpen}
      />
    );
  };

  const renderCenterPanel = () => {
    if (isLoading) {
      return <MainContentStateView mode="loading" isMobile={false} onMenuClick={onMenuClick} />;
    }

    if (activeTab === 'orchestration' && selectedProject) {
      return <OrchestrationPage selectedProject={selectedProject} />;
    }

    if (activeTab === 'remote') {
      return <RemoteConsole />;
    }

    if (activeTab === 'controlRoom') {
      return <ControlRoomPage selectedProject={selectedProject} />;
    }

    if (activeTab === 'tasks') {
      return <TaskMasterPanel isVisible />;
    }

    if (activeTab.startsWith('plugin:')) {
      return (
        <PluginTabContent
          pluginName={activeTab.replace('plugin:', '')}
          selectedProject={selectedProject}
          selectedSession={selectedSession}
        />
      );
    }

    if (!selectedProject) {
      return (
        <MainContentStateView
          mode="empty"
          isMobile={false}
          onMenuClick={onMenuClick}
          onQuickStartSession={onQuickStartSession}
          onQuickStartOrchestration={onQuickStartOrchestration}
          onQuickStartTasks={onQuickStartTasks}
          onOpenControlRoom={() => setActiveTab('controlRoom')}
        />
      );
    }

    if (editingFile) {
      return (
        <CodeEditor
          file={editingFile}
          onClose={handleCloseEditor}
          projectPath={selectedProject.path || selectedProject.fullPath}
          isSidebar
        />
      );
    }

    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="max-w-md px-6 text-center">
          <Code2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground/60" />
          <div className="text-sm font-medium text-foreground">
            {t('vscodeWorkbench.editor.emptyTitle')}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {selectedProject.displayName || selectedProject.name}
          </p>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (rightPanel === 'terminal') {
      return (
        <StandaloneShell
          project={selectedProject}
          session={selectedSession}
          showHeader
          isActive={rightPanel === 'terminal'}
        />
      );
    }

    return (
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
        autoExpandTools
        showRawParameters={false}
        showThinking
        autoScrollToBottom
        sendByCtrlEnter={false}
        externalMessageUpdate={externalMessageUpdate}
        onShowAllTasks={tasksEnabled ? () => setActiveTab('tasks') : null}
        compactComposer
      />
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <Sidebar {...sidebarProps} isMobile={false} modalsOnly />
      <WorkbenchMenuBar
        t={t}
        onOpenProject={openProjectWizard}
        onActivityPanel={selectActivityPanel}
        onSystemTab={openSystemTab}
        onSetRightPanel={setRightPanel}
        onShowSettings={onShowSettings}
        onQuickStartSession={onQuickStartSession}
        onQuickStartOrchestration={onQuickStartOrchestration}
        onQuickStartTasks={onQuickStartTasks}
      />

      <div
        ref={containerRef}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 overflow-hidden',
          resizeTarget && 'select-none',
        )}
      >
        <aside className="flex h-full w-12 shrink-0 flex-col border-r border-border bg-muted/30">
          <div className="flex h-11 items-center justify-center border-b border-border">
            <Columns className="h-5 w-5 text-primary" />
          </div>

          <div className="flex flex-1 flex-col items-center gap-1 py-2">
            {activityButtons.map((item) => (
              <ActivityButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={!isLeftCollapsed && activityPanel === item.id && !isCenterSystemTab(activeTab)}
                onClick={() => selectActivityPanel(item.id, item.tab)}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-1 border-t border-border py-2">
            {systemButtons.map((item) => (
              <ActivityButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={activeTab === item.tab}
                onClick={() => openSystemTab(item.tab)}
              />
            ))}
            <ActivityButton
              label={isLeftCollapsed ? t('vscodeWorkbench.activity.showPanel') : t('vscodeWorkbench.activity.hidePanel')}
              icon={isLeftCollapsed ? PanelLeftOpen : PanelLeftClose}
              active={false}
              onClick={() => setIsLeftCollapsed((previous) => !previous)}
            />
            <ActivityButton
              label={t('navigation.settings')}
              icon={Settings}
              active={false}
              onClick={onShowSettings}
            />
          </div>
        </aside>

        {!isLeftCollapsed && (
          <>
            <section
              className="h-full shrink-0 overflow-hidden border-r border-border bg-background"
              style={{ width: leftPaneWidth }}
            >
              <div className="flex h-10 items-center justify-between border-b border-border px-3">
                <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`vscodeWorkbench.panels.${activityPanel}`)}
                </div>
              </div>
              <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">
                {renderLeftPanel()}
              </div>
            </section>

            <ResizeHandle
              label={t('vscodeWorkbench.resize.left')}
              active={resizeTarget === 'left'}
              onPointerDown={(event) => startResize('left', event)}
            />
          </>
        )}

        <main className="min-w-0 flex-1 overflow-hidden border-r border-border bg-background">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isCenterSystemTab(activeTab)
                  ? t(`tabs.${activeTab === 'controlRoom' ? 'controlRoom' : activeTab}`)
                  : t('vscodeWorkbench.panels.editor')}
              </span>
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {selectedProject?.displayName || selectedProject?.name || t('vscodeWorkbench.noProject')}
            </span>
          </div>
          <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">
            {renderCenterPanel()}
          </div>
        </main>

        <ResizeHandle
          label={t('vscodeWorkbench.resize.right')}
          active={resizeTarget === 'right'}
          onPointerDown={(event) => startResize('right', event)}
        />

        <aside
          className="h-full shrink-0 overflow-hidden bg-background"
          style={{ width: rightPaneWidth }}
        >
          <div className="flex h-10 items-center justify-between border-b border-border px-2">
            <div className="flex min-w-0 items-center gap-1">
              <RightPanelButton
                active={rightPanel === 'cli'}
                icon={Bot}
                label={t('vscodeWorkbench.panels.cli')}
                onClick={() => setRightPanel('cli')}
              />
              <RightPanelButton
                active={rightPanel === 'terminal'}
                icon={Terminal}
                label={t('vscodeWorkbench.panels.terminal')}
                onClick={() => setRightPanel('terminal')}
              />
            </div>
          </div>
          <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">
            {renderRightPanel()}
          </div>
        </aside>
      </div>
    </div>
  );
}

type WorkbenchMenuBarProps = {
  t: TFunction<'common'>;
  onOpenProject: (type: WorkspaceType) => void;
  onActivityPanel: (panel: ActivityPanel, tab: AppTab) => void;
  onSystemTab: (tab: AppTab) => void;
  onSetRightPanel: (panel: RightPanel) => void;
  onShowSettings: () => void;
  onQuickStartSession?: () => void | Promise<void>;
  onQuickStartOrchestration?: () => void | Promise<void>;
  onQuickStartTasks?: () => void | Promise<void>;
};

type WorkbenchMenuCommand = {
  label: string;
  icon?: IconComponent;
  action?: () => void | Promise<void>;
  type?: WorkspaceType;
};

function WorkbenchMenuBar({
  t,
  onOpenProject,
  onActivityPanel,
  onSystemTab,
  onSetRightPanel,
  onShowSettings,
  onQuickStartSession,
  onQuickStartOrchestration,
  onQuickStartTasks,
}: WorkbenchMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menuItems = useMemo(() => [
    {
      label: 'File',
      commands: [
        {
          label: t('vscodeWorkbench.menu.openProject', { defaultValue: 'Open Project...' }),
          icon: FolderOpen,
          type: 'existing' as WorkspaceType,
        },
        {
          label: t('vscodeWorkbench.menu.cloneFromGithub', { defaultValue: 'Clone Repository...' }),
          icon: Github,
          type: 'new' as WorkspaceType,
        },
        {
          label: t('vscodeWorkbench.menu.newChat', { defaultValue: 'New Chat' }),
          icon: MessageSquare,
          action: onQuickStartSession,
        },
        {
          label: t('navigation.settings'),
          icon: Settings,
          action: onShowSettings,
        },
      ],
    },
    {
      label: 'Edit',
      commands: [
        {
          label: t('vscodeWorkbench.menu.newChat', { defaultValue: 'New Chat' }),
          icon: Plus,
          action: onQuickStartSession,
        },
      ],
    },
    {
      label: 'Selection',
      commands: [
        {
          label: t('vscodeWorkbench.menu.openProjects', { defaultValue: 'Open Projects' }),
          icon: Folder,
          action: () => onActivityPanel('projects', 'chat'),
        },
      ],
    },
    {
      label: 'View',
      commands: [
        {
          label: t('vscodeWorkbench.activity.explorer'),
          icon: Folder,
          action: () => onActivityPanel('explorer', 'files'),
        },
        {
          label: t('vscodeWorkbench.activity.projects'),
          icon: FileText,
          action: () => onActivityPanel('projects', 'chat'),
        },
        {
          label: t('vscodeWorkbench.activity.sourceControl'),
          icon: GitBranch,
          action: () => onActivityPanel('sourceControl', 'git'),
        },
      ],
    },
    {
      label: 'Go',
      commands: [
        {
          label: t('tabs.controlRoom'),
          icon: Sparkles,
          action: () => onSystemTab('controlRoom'),
        },
        {
          label: t('tabs.remote'),
          icon: Server,
          action: () => onSystemTab('remote'),
        },
      ],
    },
    {
      label: 'Run',
      commands: [
        {
          label: t('tabs.orchestration'),
          icon: Workflow,
          action: onQuickStartOrchestration ?? (() => onSystemTab('orchestration')),
        },
        {
          label: t('tabs.tasks'),
          icon: Play,
          action: onQuickStartTasks ?? (() => onSystemTab('tasks')),
        },
      ],
    },
    {
      label: 'Terminal',
      commands: [
        {
          label: t('vscodeWorkbench.panels.cli'),
          icon: Bot,
          action: () => onSetRightPanel('cli'),
        },
        {
          label: t('vscodeWorkbench.panels.terminal'),
          icon: Terminal,
          action: () => onSetRightPanel('terminal'),
        },
      ],
    },
    {
      label: 'Help',
      commands: [
        {
          label: t('navigation.settings'),
          icon: Settings,
          action: onShowSettings,
        },
      ],
    },
  ], [
    onActivityPanel,
    onQuickStartOrchestration,
    onQuickStartSession,
    onQuickStartTasks,
    onSetRightPanel,
    onShowSettings,
    onSystemTab,
    t,
  ]);

  const runCommand = (command: WorkbenchMenuCommand) => {
    setOpenMenu(null);
    if (command.type) {
      onOpenProject(command.type);
      return;
    }

    void command.action?.();
  };

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-muted/20 px-2 text-xs text-muted-foreground">
      <div className="flex h-full items-center gap-0.5">
        {menuItems.map((menu) => (
          <div key={menu.label} className="relative h-full">
            <button
              type="button"
              className={cn(
                'flex h-full items-center gap-1 rounded px-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                openMenu === menu.label && 'bg-muted text-foreground',
              )}
              onClick={() => setOpenMenu((current) => (current === menu.label ? null : menu.label))}
            >
              {menu.label}
              <ChevronDown className="h-3 w-3" />
            </button>

            {openMenu === menu.label && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-52 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-xl shadow-black/10">
                {menu.commands.map((command) => {
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.label}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      onClick={() => runCommand(command)}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="truncate">{command.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type WorkbenchProjectsPanelProps = {
  projects: Project[];
  selectedProject: Project | null;
  onProjectSelect: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onOpenProject: () => void;
  onCloneProject: () => void;
  onRefresh: () => Promise<void> | void;
  isRefreshing: boolean;
  t: TFunction<'common'>;
};

function WorkbenchProjectsPanel({
  projects,
  selectedProject,
  onProjectSelect,
  onNewSession,
  onOpenProject,
  onCloneProject,
  onRefresh,
  isRefreshing,
  t,
}: WorkbenchProjectsPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenProject}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('vscodeWorkbench.projects.openProject', { defaultValue: 'Open Project' })}</span>
          </button>
          <button
            type="button"
            onClick={onCloneProject}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Github className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('vscodeWorkbench.projects.cloneFromGithub', { defaultValue: 'Clone' })}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('vscodeWorkbench.projects.directoryList', { defaultValue: 'Directories' })}
        </span>
        <button
          type="button"
          onClick={() => { void onRefresh(); }}
          disabled={isRefreshing}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          title={t('vscodeWorkbench.projects.refresh', { defaultValue: 'Refresh projects' })}
          aria-label={t('vscodeWorkbench.projects.refresh', { defaultValue: 'Refresh projects' })}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <div>
              <Folder className="mx-auto mb-3 h-7 w-7 text-muted-foreground/70" />
              <div className="text-sm font-medium text-foreground">
                {t('vscodeWorkbench.projects.emptyTitle', { defaultValue: 'No project directories yet' })}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('vscodeWorkbench.projects.emptyDescription', {
                  defaultValue: 'Open a local folder or clone a repository to start.',
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => {
              const isSelected = selectedProject?.name === project.name;
              return (
                <div
                  key={project.name}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group w-full cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    isSelected
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-muted/40',
                  )}
                  title={getProjectPath(project)}
                  onClick={() => onProjectSelect(project)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onProjectSelect(project);
                    }
                  }}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {project.displayName || project.name}
                    </span>
                    {isSelected && (
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {t('vscodeWorkbench.projects.selected', { defaultValue: 'Selected' })}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-mono">{formatProjectPath(project)}</span>
                    <span className="shrink-0">{formatFileCount(project.fileCount, t)}</span>
                  </div>
                  <div className="mt-2 flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        onProjectSelect(project);
                        onNewSession(project);
                      }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      {t('vscodeWorkbench.projects.startChat', { defaultValue: 'Chat' })}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;

function ActivityButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active && 'bg-primary/10 text-primary',
      )}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {active && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-primary" />}
      <Icon className="h-5 w-5" />
    </button>
  );
}

function RightPanelButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active && 'bg-muted text-foreground',
      )}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function ResizeHandle({
  label,
  active,
  onPointerDown,
}: {
  label: string;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      className={cn(
        'group relative z-10 flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active && 'bg-primary/5',
      )}
      onPointerDown={onPointerDown}
    >
      <span
        className={cn(
          'h-full w-px bg-border transition-colors group-hover:bg-primary/60',
          active && 'bg-primary',
        )}
      />
    </button>
  );
}

export default VSCodeWorkbench;
