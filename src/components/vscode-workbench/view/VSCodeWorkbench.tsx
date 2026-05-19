import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import CodeEditor from '../../code-editor/view/CodeEditor';
import type { CodeEditorDiffInfo, CodeEditorFile } from '../../code-editor/types/types';
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
import type { WorkspaceType } from '../../project-creation-wizard/types';
import { cn } from '../../../lib/utils';
import type { AppTab, LLMProvider, Project, ProjectSession } from '../../../types/app';
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
  History,
  MessageSquare,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
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

type ResizeTarget = 'left' | 'right';

const LEFT_MIN_WIDTH = 260;
const LEFT_MAX_WIDTH = 520;
const LEFT_DEFAULT_WIDTH = 340;
const RIGHT_MIN_WIDTH = 320;
const RIGHT_MAX_WIDTH = 680;
const RIGHT_DEFAULT_WIDTH = 420;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isCenterSystemTab(activeTab: AppTab) {
  return (
    activeTab === 'orchestration'
    || activeTab === 'remote'
    || activeTab === 'controlRoom'
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
  onMenuClick,
  isLoading,
  onShowSettings,
  onQuickStartSession,
  onQuickStartOrchestration,
}: VSCodeWorkbenchProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_DEFAULT_WIDTH);
  const [rightPaneWidth, setRightPaneWidth] = useState(RIGHT_DEFAULT_WIDTH);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [activityPanel, setActivityPanel] = useState<ActivityPanel>('projects');
  const [resizeTarget, setResizeTarget] = useState<ResizeTarget | null>(null);
  const [openEditorTabs, setOpenEditorTabs] = useState<CodeEditorFile[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);

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
    setOpenEditorTabs([]);
    setActiveEditorPath(null);
  }, [selectedProject?.name]);

  const handleFileOpen = useCallback(
    (filePath: string, diffInfo: CodeEditorDiffInfo | null = null) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || filePath;
      const nextFile: CodeEditorFile = {
        name: fileName,
        path: filePath,
        projectName: selectedProject?.name,
        diffInfo,
      };

      setOpenEditorTabs((currentTabs) => {
        const existingIndex = currentTabs.findIndex((tab) => tab.path === filePath);
        if (existingIndex === -1) {
          return [...currentTabs, nextFile];
        }

        const nextTabs = [...currentTabs];
        nextTabs[existingIndex] = nextFile;
        return nextTabs;
      });
      setActiveEditorPath(filePath);
      setActiveTab('files');
    },
    [selectedProject?.name, setActiveTab],
  );

  const handleCloseEditorTab = useCallback((filePath: string) => {
    setOpenEditorTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.path !== filePath);
      setActiveEditorPath((currentActivePath) => {
        if (currentActivePath !== filePath) {
          return currentActivePath;
        }

        return nextTabs[nextTabs.length - 1]?.path ?? null;
      });
      return nextTabs;
    });
  }, []);

  const activeEditorFile = useMemo(
    () => openEditorTabs.find((tab) => tab.path === activeEditorPath) ?? openEditorTabs[0] ?? null,
    [activeEditorPath, openEditorTabs],
  );

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
    ],
    [t],
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
          autoConnect={false}
        />
      );
    }

    return (
      <WorkbenchWorkspacePanel
        selectedProject={selectedProject}
        onFileOpen={handleFileOpen}
        t={t}
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
        <WorkbenchProjectLanding
          projects={sidebarProps.projects}
          onProjectSelect={handleWorkbenchProjectSelect}
          onNewSession={sidebarProps.onNewSession}
          onOpenProject={() => openProjectWizard('existing')}
          onCloneProject={() => openProjectWizard('new')}
          onQuickStartSession={onQuickStartSession}
          onQuickStartOrchestration={onQuickStartOrchestration}
          onOpenControlRoom={() => setActiveTab('controlRoom')}
          t={t}
        />
      );
    }

    if (activeEditorFile) {
      return (
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/20">
            {openEditorTabs.map((tab) => {
              const active = tab.path === activeEditorFile.path;
              return (
                <button
                  key={tab.path}
                  type="button"
                  className={cn(
                    'group flex h-full min-w-0 max-w-52 items-center gap-2 border-r border-border px-3 text-xs transition-colors',
                    active ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                  onClick={() => setActiveEditorPath(tab.path)}
                  title={tab.path}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tab.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-0.5 text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCloseEditorTab(tab.path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCloseEditorTab(tab.path);
                      }
                    }}
                    aria-label={t('vscodeWorkbench.editor.closeTab', { file: tab.name, defaultValue: 'Close {{file}}' })}
                    title={t('vscodeWorkbench.editor.closeTab', { file: tab.name, defaultValue: 'Close {{file}}' })}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeEditor
              file={activeEditorFile}
              onClose={() => handleCloseEditorTab(activeEditorFile.path)}
              projectPath={selectedProject.path || selectedProject.fullPath}
              isSidebar
            />
          </div>
        </div>
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
    return (
      <WorkbenchCliPanel
        project={selectedProject}
        session={selectedSession}
        onSessionSelect={sidebarProps.onSessionSelect}
        onNewSession={sidebarProps.onNewSession}
        t={t}
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
        onShowSettings={onShowSettings}
        onQuickStartSession={onQuickStartSession}
        onQuickStartOrchestration={onQuickStartOrchestration}
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
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-1">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('vscodeWorkbench.panels.cli')}
              </span>
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
  onShowSettings: () => void;
  onQuickStartSession?: () => void | Promise<void>;
  onQuickStartOrchestration?: () => void | Promise<void>;
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
  onShowSettings,
  onQuickStartSession,
  onQuickStartOrchestration,
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
      ],
    },
    {
      label: 'Terminal',
      commands: [
        {
          label: t('vscodeWorkbench.panels.cli'),
          icon: Bot,
          action: () => onActivityPanel('terminal', 'shell'),
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

function WorkbenchWorkspacePanel({
  selectedProject,
  onFileOpen,
  t,
}: {
  selectedProject: Project | null;
  onFileOpen: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  t: TFunction<'common'>;
}) {
  const workspaceSlots = selectedProject ? [
    {
      id: 'workspace-1',
      label: 'Workspace 1',
      project: selectedProject,
    },
  ] : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-2">
        {workspaceSlots.length === 0 ? (
          <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {t('vscodeWorkbench.workspace.empty', { defaultValue: 'Open a project to create Workspace 1.' })}
          </div>
        ) : (
          <div className="space-y-1">
            {workspaceSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex min-w-0 items-center gap-2 rounded border border-primary/30 bg-primary/10 px-2.5 py-2"
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{slot.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {slot.project.displayName || slot.project.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileTree selectedProject={selectedProject} onFileOpen={onFileOpen} />
      </div>
    </div>
  );
}

function WorkbenchProjectLanding({
  projects,
  onProjectSelect,
  onNewSession,
  onOpenProject,
  onCloneProject,
  onQuickStartSession,
  onQuickStartOrchestration,
  onOpenControlRoom,
  t,
}: {
  projects: Project[];
  onProjectSelect: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onOpenProject: () => void;
  onCloneProject: () => void;
  onQuickStartSession?: () => void | Promise<void>;
  onQuickStartOrchestration?: () => void | Promise<void>;
  onOpenControlRoom: () => void;
  t: TFunction<'common'>;
}) {
  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('vscodeWorkbench.projects.startTitle', { defaultValue: 'Start a Pixcode workspace' })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('vscodeWorkbench.projects.startDescription', {
                defaultValue: 'Pick a folder and Pixcode will bind the explorer, terminal, and chat history to that workspace.',
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenProject}
              className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('vscodeWorkbench.projects.openProject', { defaultValue: 'Open Project' })}
            </button>
            <button
              type="button"
              onClick={onCloneProject}
              className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Github className="h-3.5 w-3.5" />
              {t('vscodeWorkbench.projects.cloneFromGithub', { defaultValue: 'Clone' })}
            </button>
          </div>
        </div>

        {projects.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.name}
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-md border border-border bg-card/40 p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => onProjectSelect(project)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onProjectSelect(project);
                  }
                }}
                title={getProjectPath(project)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {project.displayName || project.name}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {formatProjectPath(project)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {formatFileCount(project.fileCount, t)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    {t('vscodeWorkbench.projects.workHere', { defaultValue: 'Work in this folder' })}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded border border-border px-2 py-1 text-[11px] text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onProjectSelect(project);
                      onNewSession(project);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onProjectSelect(project);
                        onNewSession(project);
                      }
                    }}
                  >
                    {t('vscodeWorkbench.projects.startChat', { defaultValue: 'Chat' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <Folder className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">
              {t('vscodeWorkbench.projects.emptyTitle', { defaultValue: 'No project directories yet' })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('vscodeWorkbench.projects.emptyDescription', {
                defaultValue: 'Open a local folder or clone a repository to start.',
              })}
            </p>
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => { void onQuickStartSession?.(); }} className="rounded border border-border p-3 text-left text-xs hover:bg-muted">
            <MessageSquare className="mb-2 h-4 w-4" />
            {t('mainContent.landing.startChat')}
          </button>
          <button type="button" onClick={() => { void onQuickStartOrchestration?.(); }} className="rounded border border-border p-3 text-left text-xs hover:bg-muted">
            <Workflow className="mb-2 h-4 w-4" />
            {t('mainContent.landing.startOrchestration')}
          </button>
          <button type="button" onClick={onOpenControlRoom} className="rounded border border-border p-3 text-left text-xs hover:bg-muted">
            <Sparkles className="mb-2 h-4 w-4" />
            {t('mainContent.openControlRoom', { defaultValue: 'Open Control Room' })}
          </button>
        </div>
      </div>
    </div>
  );
}

const cliProviders: Array<{ id: LLMProvider; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'qwen', label: 'Qwen Code' },
  { id: 'opencode', label: 'OpenCode' },
];

function tagProjectSessions(
  sessions: ProjectSession[] | undefined,
  provider: LLMProvider,
  projectName: string,
): ProjectSession[] {
  return (sessions ?? []).map((session) => ({
    ...session,
    __provider: session.__provider ?? provider,
    __projectName: session.__projectName ?? projectName,
  }));
}

function getProjectCliSessions(project: Project | null): ProjectSession[] {
  if (!project) return [];

  return [
    ...tagProjectSessions(project.sessions, 'claude', project.name),
    ...tagProjectSessions(project.codexSessions, 'codex', project.name),
    ...tagProjectSessions(project.cursorSessions, 'cursor', project.name),
    ...tagProjectSessions(project.geminiSessions, 'gemini', project.name),
    ...tagProjectSessions(project.qwenSessions, 'qwen', project.name),
    ...tagProjectSessions(project.opencodeSessions, 'opencode', project.name),
  ];
}

function WorkbenchCliPanel({
  project,
  session,
  onSessionSelect,
  onNewSession,
  t,
}: {
  project: Project | null;
  session: ProjectSession | null;
  onSessionSelect: (session: ProjectSession) => void;
  onNewSession: (project: Project) => void;
  t: TFunction<'common'>;
}) {
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(() => {
    if (typeof window === 'undefined') return 'claude';
    const saved = window.localStorage.getItem('selected-provider') as LLMProvider | null;
    return cliProviders.some((provider) => provider.id === saved) ? saved as LLMProvider : 'claude';
  });
  const [showHistory, setShowHistory] = useState(false);
  const projectSessions = useMemo(() => getProjectCliSessions(project), [project]);

  const selectProvider = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    window.localStorage.setItem('selected-provider', provider);
  };

  const startNewSession = () => {
    if (!project) return;
    window.localStorage.setItem('selected-provider', selectedProvider);
    onNewSession(project);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
      <div className="shrink-0 border-b border-gray-800 bg-gray-900/95 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-gray-100">
              {project?.displayName || project?.name || t('vscodeWorkbench.noProject')}
            </div>
            <div className="text-[11px] text-gray-400">
              {t('vscodeWorkbench.cli.projectScoped', { defaultValue: 'Project-scoped CLI terminal' })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!project}
              onClick={startNewSession}
              title={t('vscodeWorkbench.cli.newSession', { defaultValue: 'New CLI session' })}
              aria-label={t('vscodeWorkbench.cli.newSession', { defaultValue: 'New CLI session' })}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                'rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50',
                showHistory && 'bg-gray-800',
              )}
              disabled={!project}
              onClick={() => setShowHistory((previous) => !previous)}
              title={t('vscodeWorkbench.cli.history', { defaultValue: 'History' })}
              aria-label={t('vscodeWorkbench.cli.history', { defaultValue: 'History' })}
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {cliProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={cn(
                'truncate rounded border px-2 py-1.5 text-[11px] font-medium transition-colors',
                selectedProvider === provider.id
                  ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800',
              )}
              onClick={() => selectProvider(provider.id)}
            >
              {provider.label}
            </button>
          ))}
        </div>
        {showHistory && (
          <div className="mt-2 max-h-36 overflow-y-auto rounded border border-gray-800 bg-gray-950">
            {projectSessions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-500">
                {t('vscodeWorkbench.cli.noHistory', { defaultValue: 'No sessions for this project yet.' })}
              </div>
            ) : (
              projectSessions.map((item) => (
                <button
                  key={`${item.__provider}-${item.id}`}
                  type="button"
                  className={cn(
                    'block w-full truncate px-3 py-2 text-left text-[11px] hover:bg-gray-800',
                    session?.id === item.id ? 'text-blue-200' : 'text-gray-300',
                  )}
                  onClick={() => onSessionSelect(item)}
                  title={(item.summary as string) || (item.title as string) || item.id}
                >
                  <span className="mr-1 text-gray-500">{item.__provider}</span>
                  {(item.summary as string) || (item.title as string) || (item.name as string) || item.id}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <StandaloneShell
          key={`${selectedProvider}-${session?.id || 'new'}-${project?.name || 'none'}`}
          project={project}
          session={session}
          showHeader
          autoConnect={false}
          isActive
        />
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
