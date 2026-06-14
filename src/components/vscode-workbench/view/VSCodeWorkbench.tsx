import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import CodeEditor from '../../code-editor/view/CodeEditor';
import type { CodeEditorDiffInfo, CodeEditorFile } from '../../code-editor/types/types';
import ControlRoomPage from '../../control-room/ControlRoomPage';
import FileTree from '../../file-tree/view/FileTree';
import GitPanel from '../../git-panel/view/GitPanel';
import SessionProviderLogo from '../../llm-logo-provider/SessionProviderLogo';
import MainContentStateView from '../../main-content/view/subcomponents/MainContentStateView';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import { useProviderAuthStatus } from '../../provider-auth/hooks/useProviderAuthStatus';
import {
  PROVIDER_DISPLAY_NAMES,
} from '../../provider-auth/types';
import RemoteConsole from '../../remote-console/RemoteConsole';
import Sidebar from '../../sidebar/view/Sidebar';
import type { SidebarProps } from '../../sidebar/types/types';
import type { ShellPermissionOverride } from '../../shell/types/types';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import type { WorkspaceType } from '../../project-creation-wizard/types';
import { DarkModeToggle } from '../../../shared/view/ui';
import { cn } from '../../../lib/utils';
import { authenticatedFetch } from '../../../utils/api';
import type { AppTab, LLMProvider, Project, ProjectSession } from '../../../types/app';
import type { MainContentProps } from '../../main-content/types/types';

import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns,
  Copy,
  Download,
  Edit2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Github,
  History,
  Loader2,
  Maximize2,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Sparkles,
  Star,
  Terminal,
  Workflow,
  X,
} from '@/lib/icons';

type VSCodeWorkbenchProps = MainContentProps & {
  sidebarProps: SidebarProps;
};

type ActivityPanel = 'explorer' | 'projects' | 'sourceControl' | 'terminal' | 'hermes';

type ResizeTarget = 'left' | 'right' | 'bottom';
type WorkbenchBottomTerminalViewMode = 'half' | 'full';

type WorkbenchWorkspaceTab = {
  id: string;
  projectName: string;
  path: string;
  label: string;
  starred: boolean;
};

type EditorTabContextMenu = {
  filePath: string;
  x: number;
  y: number;
} | null;

type WorkspaceTabContextMenu = {
  tabId: string;
  x: number;
  y: number;
} | null;

type ProviderInstallState = {
  provider: LLMProvider | null;
  state: 'idle' | 'running' | 'done' | 'error';
  log: string;
  error: string | null;
};

type WorkbenchCliTerminalMode = 'provider';

type WorkbenchBottomTerminalMode = 'shell' | 'hermes' | 'hermes-install';

type WorkbenchBottomTerminalOptions = {
  forceNewSession?: boolean;
  command?: string | null;
  title?: string | null;
  project?: Project | null;
};

const HERMES_DEFAULT_COMMAND = 'hermes --yolo';
const HERMES_HISTORY_COMMAND = 'hermes sessions browse';
const HERMES_MODEL_COMMAND = 'hermes model';
const HERMES_CRON_COMMAND = 'hermes cron list';
const HERMES_STATUS_COMMAND = 'hermes status --deep';

type PendingHermesLaunch = {
  projectPath: string;
  command?: string | null;
  title?: string | null;
  forceNewSession?: boolean;
};

type HermesTerminalLaunchEvent = {
  id: number;
  provider: LLMProvider;
  projectPath: string | null;
  prompt: string | null;
  startupInput: string | null;
  forceNewSession?: boolean;
  permissionMode?: string | null;
  skipPermissions?: boolean;
  bypassPermissions?: boolean;
  source: string;
  createdAt: string;
};

type HermesInstallStatus = {
  installed: boolean;
  command: string | null;
  version: string | null;
  error: string | null;
};

type HermesControlPlaneSession = {
  id?: string;
  title?: string | null;
  source?: string | null;
  startedAt?: string | null;
  model?: string | null;
  messageCount?: number;
};

type HermesControlPlaneCronJob = {
  id?: string;
  name?: string;
  schedule?: string;
  state?: string;
  enabled?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
};

type HermesControlPlaneProfile = {
  name: string;
  path: string;
  isDefault?: boolean;
  isActive?: boolean;
  model?: {
    provider?: string | null;
    default?: string | null;
    baseUrl?: string | null;
  };
  auth?: {
    configured?: boolean;
    activeProvider?: string | null;
    selectedProvider?: string | null;
  };
  tools?: {
    toolsets?: string[];
    pixcodeMcpReady?: boolean;
    pixcodeMcpToolCount?: number;
    missingPixcodeMcpTools?: string[];
    hermesCliReady?: boolean;
  };
  sessions?: {
    exists?: boolean;
    total?: number;
    recent?: HermesControlPlaneSession[];
  };
  cron?: {
    exists?: boolean;
    total?: number;
    active?: number;
    recent?: HermesControlPlaneCronJob[];
  };
};

type HermesControlPlaneCapability = {
  id?: string;
  label: string;
  ready: boolean;
  detail?: string;
};

type HermesControlPlane = {
  ok?: boolean;
  generatedAt?: string;
  projectPath?: string | null;
  install?: HermesInstallStatus;
  gateway?: {
    running?: boolean;
    baseUrl?: string | null;
  };
  activeProfile?: string | null;
  profiles?: HermesControlPlaneProfile[];
  activeProfileSummary?: HermesControlPlaneProfile | null;
  managedProfile?: HermesControlPlaneProfile | null;
  capabilities?: HermesControlPlaneCapability[];
  recommendations?: string[];
};

type HermesInstallJobState = {
  state: 'idle' | 'running' | 'done' | 'error';
  log: string;
  error: string | null;
  jobId: string | null;
  startAfterInstall: boolean;
};

type WorkbenchCliProjectState = {
  provider: LLMProvider;
  isTerminalOpen: boolean;
  sessionId: string | null;
  updatedAt: number;
};

type WorkbenchCliTab = {
  id: string;
  provider: LLMProvider;
  title: string;
  session: ProjectSession | null;
  runId: number;
  forceNewSession: boolean;
  startupInput: string | null;
  hermesLaunchId: number | null;
  permissionOverride: ShellPermissionOverride | null;
};

type WorkbenchEditorProjectState = {
  tabs: CodeEditorFile[];
  activePath: string | null;
  splitPath: string | null;
  updatedAt: number;
};

type WorkbenchHermesProjectState = {
  isOpen: boolean;
  viewMode: WorkbenchBottomTerminalViewMode;
  command: string | null;
  title: string | null;
  updatedAt: number;
};

const LEFT_MIN_WIDTH = 260;
const LEFT_MAX_WIDTH = 520;
const LEFT_DEFAULT_WIDTH = 340;
const RIGHT_MIN_WIDTH = 320;
const RIGHT_MAX_WIDTH = 680;
const RIGHT_DEFAULT_WIDTH = 420;
const RIGHT_RESIZE_STEP = 80;
const BOTTOM_TERMINAL_MIN_HEIGHT = 150;
const BOTTOM_TERMINAL_MAX_HEIGHT = 560;
const BOTTOM_TERMINAL_DEFAULT_HEIGHT = 256;
const WORKBENCH_WORKSPACE_TABS_STORAGE_KEY = 'pixcode.workbench.workspaceTabs.v1';
const WORKBENCH_CLI_STATE_STORAGE_KEY = 'pixcode.workbench.cliState.v1';
const WORKBENCH_EDITOR_STATE_STORAGE_KEY = 'pixcode.workbench.editorState.v1';
const WORKBENCH_HERMES_STATE_STORAGE_KEY = 'pixcode.workbench.hermesState.v1';
const DEFAULT_WORKSPACE_TAB_LIMIT = 10;
const CLI_PROVIDER_IDS: LLMProvider[] = ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'];
const MAX_PERSISTED_EDITOR_TABS = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isCenterSystemTab(activeTab: AppTab) {
  return (
    activeTab === 'remote'
    || activeTab === 'controlRoom'
    || activeTab.startsWith('plugin:')
  );
}

function activityForTab(activeTab: AppTab): ActivityPanel {
  if (activeTab === 'git' || activeTab === 'changes') return 'sourceControl';
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

function getWorkspaceTabId(project: Project) {
  return (project.fullPath || project.path || project.name).replace(/\\/g, '/');
}

function getProjectCliStateKey(project: Project | null) {
  return project ? getProjectPath(project).replace(/\\/g, '/') : null;
}

function getProjectEditorStateKey(project: Project | null) {
  return project ? getProjectPath(project).replace(/\\/g, '/') : null;
}

function isCliProvider(value: unknown): value is LLMProvider {
  return typeof value === 'string' && CLI_PROVIDER_IDS.includes(value as LLMProvider);
}

function isCodeEditorFile(value: unknown): value is CodeEditorFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const file = value as Partial<CodeEditorFile>;
  return typeof file.name === 'string' && typeof file.path === 'string';
}

function readWorkspaceTabs(): WorkbenchWorkspaceTab[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKBENCH_WORKSPACE_TABS_STORAGE_KEY) ?? '[]') as WorkbenchWorkspaceTab[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((tab) => typeof tab.id === 'string' && typeof tab.projectName === 'string')
      .slice(0, DEFAULT_WORKSPACE_TAB_LIMIT);
  } catch {
    return [];
  }
}

function writeWorkspaceTabs(tabs: WorkbenchWorkspaceTab[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      WORKBENCH_WORKSPACE_TABS_STORAGE_KEY,
      JSON.stringify(tabs.slice(0, DEFAULT_WORKSPACE_TAB_LIMIT)),
    );
  } catch {
    // Workspace tabs are a convenience layer. If storage is unavailable, the
    // selected project still works normally.
  }
}

function readWorkbenchCliStates(): Record<string, WorkbenchCliProjectState> {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKBENCH_CLI_STATE_STORAGE_KEY) ?? '{}') as Record<string, WorkbenchCliProjectState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function readWorkbenchCliState(projectKey: string | null): WorkbenchCliProjectState | null {
  if (!projectKey) return null;

  const state = readWorkbenchCliStates()[projectKey];
  if (!state || !isCliProvider(state.provider)) return null;

  return {
    provider: state.provider,
    isTerminalOpen: Boolean(state.isTerminalOpen),
    sessionId: typeof state.sessionId === 'string' ? state.sessionId : null,
    updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
  };
}

function writeWorkbenchCliState(projectKey: string | null, state: WorkbenchCliProjectState) {
  if (!projectKey || typeof window === 'undefined') return;

  try {
    const currentStates = readWorkbenchCliStates();
    window.localStorage.setItem(
      WORKBENCH_CLI_STATE_STORAGE_KEY,
      JSON.stringify({
        ...currentStates,
        [projectKey]: state,
      }),
    );
  } catch {
    // The CLI panel still works without persistence; it just falls back to the picker.
  }
}

function readWorkbenchEditorStates(): Record<string, WorkbenchEditorProjectState> {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKBENCH_EDITOR_STATE_STORAGE_KEY) ?? '{}') as Record<string, WorkbenchEditorProjectState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function readWorkbenchEditorState(projectKey: string | null): WorkbenchEditorProjectState | null {
  if (!projectKey) return null;

  const state = readWorkbenchEditorStates()[projectKey];
  if (!state || !Array.isArray(state.tabs)) return null;

  const tabs = state.tabs.filter(isCodeEditorFile).slice(0, MAX_PERSISTED_EDITOR_TABS);
  const activePath = typeof state.activePath === 'string' && tabs.some((tab) => tab.path === state.activePath)
    ? state.activePath
    : tabs[0]?.path ?? null;
  const splitPath = typeof state.splitPath === 'string' && tabs.some((tab) => tab.path === state.splitPath)
    ? state.splitPath
    : null;

  return {
    tabs,
    activePath,
    splitPath,
    updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
  };
}

function writeWorkbenchEditorState(projectKey: string | null, state: WorkbenchEditorProjectState) {
  if (!projectKey || typeof window === 'undefined') return;

  try {
    const currentStates = readWorkbenchEditorStates();
    window.localStorage.setItem(
      WORKBENCH_EDITOR_STATE_STORAGE_KEY,
      JSON.stringify({
        ...currentStates,
        [projectKey]: {
          ...state,
          tabs: state.tabs.slice(0, MAX_PERSISTED_EDITOR_TABS),
        },
      }),
    );
  } catch {
    // The editor still opens files normally; workspace tab restore is only a convenience.
  }
}

function readWorkbenchHermesStates(): Record<string, WorkbenchHermesProjectState> {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKBENCH_HERMES_STATE_STORAGE_KEY) ?? '{}') as Record<string, WorkbenchHermesProjectState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function readWorkbenchHermesState(projectKey: string | null): WorkbenchHermesProjectState | null {
  if (!projectKey) return null;

  const state = readWorkbenchHermesStates()[projectKey];
  if (!state || typeof state !== 'object') return null;

  return {
    isOpen: Boolean(state.isOpen),
    viewMode: state.viewMode === 'full' ? 'full' : 'half',
    command: typeof state.command === 'string' && state.command.trim() ? state.command : HERMES_DEFAULT_COMMAND,
    title: typeof state.title === 'string' && state.title.trim() ? state.title : null,
    updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
  };
}

function writeWorkbenchHermesState(projectKey: string | null, state: WorkbenchHermesProjectState) {
  if (!projectKey || typeof window === 'undefined') return;

  try {
    const currentStates = readWorkbenchHermesStates();
    window.localStorage.setItem(
      WORKBENCH_HERMES_STATE_STORAGE_KEY,
      JSON.stringify({
        ...currentStates,
        [projectKey]: state,
      }),
    );
  } catch {
    // Hermes still runs through the backend PTY cache; persistence only controls
    // which project terminal the workbench restores when switching workspaces.
  }
}

function createWorkspaceTab(project: Project, label: string): WorkbenchWorkspaceTab {
  return {
    id: getWorkspaceTabId(project),
    projectName: project.name,
    path: getProjectPath(project),
    label,
    starred: false,
  };
}

function getSessionTitle(session: ProjectSession) {
  return (
    (typeof session.summary === 'string' && session.summary)
    || (typeof session.title === 'string' && session.title)
    || (typeof session.name === 'string' && session.name)
    || session.id
  );
}

function getSessionTimestamp(session: ProjectSession) {
  return (
    (typeof session.updated_at === 'string' && session.updated_at)
    || (typeof session.lastActivity === 'string' && session.lastActivity)
    || (typeof session.created_at === 'string' && session.created_at)
    || (typeof session.createdAt === 'string' && session.createdAt)
    || null
  );
}

function formatSessionTime(session: ProjectSession) {
  const timestamp = getSessionTimestamp(session);
  if (!timestamp) return '';

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
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
}: VSCodeWorkbenchProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_DEFAULT_WIDTH);
  const [rightPaneWidth, setRightPaneWidth] = useState(RIGHT_DEFAULT_WIDTH);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [cliHeaderContent, setCliHeaderContent] = useState<ReactNode | null>(null);
  const [isBottomTerminalOpen, setIsBottomTerminalOpen] = useState(false);
  const [bottomTerminalMode, setBottomTerminalMode] = useState<WorkbenchBottomTerminalMode>('shell');
  const [bottomTerminalRunId, setBottomTerminalRunId] = useState(0);
  const [bottomTerminalForceNewSession, setBottomTerminalForceNewSession] = useState(false);
  const [bottomTerminalCommand, setBottomTerminalCommand] = useState<string | null>(null);
  const [bottomTerminalTitle, setBottomTerminalTitle] = useState<string | null>(null);
  const [bottomTerminalProject, setBottomTerminalProject] = useState<Project | null>(null);
  const [bottomTerminalHeight, setBottomTerminalHeight] = useState(BOTTOM_TERMINAL_DEFAULT_HEIGHT);
  const [bottomTerminalViewMode, setBottomTerminalViewMode] = useState<WorkbenchBottomTerminalViewMode>('half');
  const [hermesCliLaunch, setHermesCliLaunch] = useState<HermesTerminalLaunchEvent | null>(null);
  const [hermesInstallStatus, setHermesInstallStatus] = useState<HermesInstallStatus | null>(null);
  const [hermesInstallJob, setHermesInstallJob] = useState<HermesInstallJobState>({
    state: 'idle',
    log: '',
    error: null,
    jobId: null,
    startAfterInstall: false,
  });
  const [hermesControlPlane, setHermesControlPlane] = useState<HermesControlPlane | null>(null);
  const [hermesControlPlaneLoading, setHermesControlPlaneLoading] = useState(false);
  const [hermesControlPlaneRepairing, setHermesControlPlaneRepairing] = useState(false);
  const [hermesControlPlaneError, setHermesControlPlaneError] = useState<string | null>(null);
  const [activityPanel, setActivityPanel] = useState<ActivityPanel>('projects');
  const [resizeTarget, setResizeTarget] = useState<ResizeTarget | null>(null);
  const [openEditorTabs, setOpenEditorTabs] = useState<CodeEditorFile[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  const [splitEditorFile, setSplitEditorFile] = useState<CodeEditorFile | null>(null);
  const [editorTabContextMenu, setEditorTabContextMenu] = useState<EditorTabContextMenu>(null);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkbenchWorkspaceTab[]>(readWorkspaceTabs);
  const [workspaceTabContextMenu, setWorkspaceTabContextMenu] = useState<WorkspaceTabContextMenu>(null);
  const [pendingHermesLaunch, setPendingHermesLaunch] = useState<PendingHermesLaunch | null>(null);
  const editorTabStripRef = useRef<HTMLDivElement>(null);
  const hermesInstallEventSourceRef = useRef<EventSource | null>(null);
  const hasPrimedHermesTerminalLaunchesRef = useRef(false);
  const lastHermesTerminalLaunchIdRef = useRef(0);
  const editorStateProjectKey = useMemo(() => getProjectEditorStateKey(selectedProject), [selectedProject]);
  const selectedProjectStateKey = useMemo(() => getProjectCliStateKey(selectedProject), [selectedProject]);
  const isRestoringEditorStateRef = useRef(false);
  const lastRestoredEditorProjectKeyRef = useRef<string | null>(null);
  const lastRestoredHermesProjectKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isCenterSystemTab(activeTab)) {
      return;
    }

    if (activeTab === 'chat' && activityPanel === 'projects') {
      return;
    }

    if (activityPanel === 'hermes') {
      return;
    }

    setActivityPanel(activityForTab(activeTab));
  }, [activeTab, activityPanel]);

  useEffect(() => {
    if (lastRestoredEditorProjectKeyRef.current === editorStateProjectKey) {
      return;
    }

    lastRestoredEditorProjectKeyRef.current = editorStateProjectKey;
    isRestoringEditorStateRef.current = true;
    setSplitEditorFile(null);
    setEditorTabContextMenu(null);

    const savedState = readWorkbenchEditorState(editorStateProjectKey);
    const restoredTabs = savedState?.tabs ?? [];

    setOpenEditorTabs(restoredTabs);
    setActiveEditorPath(savedState?.activePath ?? restoredTabs[0]?.path ?? null);
    setSplitEditorFile(savedState?.splitPath
      ? restoredTabs.find((tab) => tab.path === savedState.splitPath) ?? null
      : null);
  }, [editorStateProjectKey]);

  useEffect(() => {
    if (isRestoringEditorStateRef.current) {
      isRestoringEditorStateRef.current = false;
      return;
    }

    if (!editorStateProjectKey) {
      return;
    }

    const activePath = activeEditorPath && openEditorTabs.some((tab) => tab.path === activeEditorPath)
      ? activeEditorPath
      : openEditorTabs[0]?.path ?? null;
    const splitPath = splitEditorFile && openEditorTabs.some((tab) => tab.path === splitEditorFile.path)
      ? splitEditorFile.path
      : null;

    writeWorkbenchEditorState(editorStateProjectKey, {
      tabs: openEditorTabs,
      activePath,
      splitPath,
      updatedAt: Date.now(),
    });
  }, [activeEditorPath, editorStateProjectKey, openEditorTabs, splitEditorFile]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setWorkspaceTabs((currentTabs) => {
      const tabId = getWorkspaceTabId(selectedProject);
      const existing = currentTabs.find((tab) => tab.id === tabId);
      if (existing) {
        return currentTabs.map((tab) => (
          tab.id === tabId
            ? {
                ...existing,
                projectName: selectedProject.name,
                path: getProjectPath(selectedProject),
              }
            : tab
        ));
      }

      const nextLabel = `Workspace ${currentTabs.length + 1}`;
      return [
        ...currentTabs,
        createWorkspaceTab(selectedProject, nextLabel),
      ].slice(-DEFAULT_WORKSPACE_TAB_LIMIT);
    });
  }, [selectedProject]);

  useEffect(() => {
    writeWorkspaceTabs(workspaceTabs);
  }, [workspaceTabs]);

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

  const closeAllTabs = useCallback(() => {
    setOpenEditorTabs([]);
    setActiveEditorPath(null);
    setSplitEditorFile(null);
    setEditorTabContextMenu(null);
  }, []);

  const copyPath = useCallback((filePath: string) => {
    void navigator.clipboard?.writeText(filePath);
    setEditorTabContextMenu(null);
  }, []);

  const splitRight = useCallback((filePath: string, move = false) => {
    const file = openEditorTabs.find((tab) => tab.path === filePath);
    if (!file) return;

    setSplitEditorFile(file);
    if (move) {
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
    }

    setEditorTabContextMenu(null);
  }, [openEditorTabs]);

  const handleEditorTabContextMenu = useCallback((
    event: React.MouseEvent<HTMLButtonElement>,
    filePath: string,
  ) => {
    event.preventDefault();
    setEditorTabContextMenu({
      filePath,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const scrollEditorTabs = useCallback((direction: 'left' | 'right') => {
    editorTabStripRef.current?.scrollBy({
      left: direction === 'left' ? -180 : 180,
      behavior: 'smooth',
    });
  }, []);

  const openBottomTerminal = useCallback((mode: WorkbenchBottomTerminalMode, options: WorkbenchBottomTerminalOptions = {}) => {
    const nextProject = options.project ?? selectedProject ?? null;
    const nextCommand = mode === 'hermes' ? (options.command || HERMES_DEFAULT_COMMAND) : null;
    const nextTitle = mode === 'hermes' ? (options.title || null) : null;
    setBottomTerminalMode(mode);
    setBottomTerminalForceNewSession(Boolean(options.forceNewSession));
    setBottomTerminalCommand(nextCommand);
    setBottomTerminalTitle(nextTitle);
    setBottomTerminalProject(nextProject);
    setIsBottomTerminalOpen(true);
    setBottomTerminalViewMode('half');
    setBottomTerminalRunId((current) => current + 1);
    if (mode === 'hermes') {
      writeWorkbenchHermesState(getProjectCliStateKey(nextProject), {
        isOpen: true,
        viewMode: 'half',
        command: nextCommand,
        title: nextTitle,
        updatedAt: Date.now(),
      });
    }
  }, [selectedProject]);

  const refreshHermesInstallStatus = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/install-status');
      const status = await response.json();
      setHermesInstallStatus({
        installed: Boolean(status?.installed),
        command: typeof status?.command === 'string' ? status.command : null,
        version: typeof status?.version === 'string' ? status.version : null,
        error: typeof status?.error === 'string' ? status.error : null,
      });
    } catch {
      setHermesInstallStatus({
        installed: false,
        command: null,
        version: null,
        error: null,
      });
    }
  }, []);

  const refreshHermesControlPlane = useCallback(async () => {
    setHermesControlPlaneLoading(true);
    setHermesControlPlaneError(null);

    try {
      const params = new URLSearchParams();
      if (selectedProject) {
        params.set('projectPath', getProjectPath(selectedProject));
      }
      const query = params.toString();
      const response = await authenticatedFetch(`/api/orchestration/hermes/control-plane${query ? `?${query}` : ''}`);
      const body = await response.json().catch(() => null);
      if (!body || (!response.ok && !body.profiles && !body.capabilities)) {
        throw new Error(body?.error?.message || body?.error || `HTTP ${response.status}`);
      }
      setHermesControlPlane(body as HermesControlPlane);
    } catch (error) {
      setHermesControlPlaneError(
        error instanceof Error
          ? error.message
          : t('vscodeWorkbench.hermes.controlPlaneFailed', { defaultValue: 'Unable to read Hermes control plane.' }),
      );
    } finally {
      setHermesControlPlaneLoading(false);
    }
  }, [selectedProject, t]);

  const startHermesApiInstall = useCallback(async ({ force = false, startAfterInstall = false }: { force?: boolean; startAfterInstall?: boolean } = {}) => {
    try { hermesInstallEventSourceRef.current?.close(); } catch { /* noop */ }
    hermesInstallEventSourceRef.current = null;

    openBottomTerminal('hermes-install');
    setHermesInstallJob({
      state: 'running',
      log: '',
      error: null,
      jobId: null,
      startAfterInstall,
    });

    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/install', {
        method: 'POST',
        body: JSON.stringify({
          force,
          skipBrowser: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.jobId) {
        throw new Error(body?.error?.message || body?.error || `HTTP ${response.status}`);
      }

      const jobId = String(body.jobId);
      setHermesInstallJob((current) => ({ ...current, jobId }));

      const token = window.localStorage.getItem('auth-token') || '';
      const streamUrl = `/api/orchestration/hermes/install/${encodeURIComponent(jobId)}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const stream = new EventSource(streamUrl);
      hermesInstallEventSourceRef.current = stream;

      stream.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          if (typeof payload.chunk === 'string') {
            setHermesInstallJob((current) => ({
              ...current,
              log: `${current.log}${payload.chunk}`,
            }));
          }
        } catch {
          // Ignore malformed stream frames.
        }
      });

      stream.addEventListener('done', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          if (!payload.success) {
            throw new Error(payload.error || t('vscodeWorkbench.hermes.installFailed', { defaultValue: 'Hermes install failed.' }));
          }

          setHermesInstallJob((current) => ({
            ...current,
            state: 'done',
            error: null,
          }));
          void refreshHermesInstallStatus().then(() => {
            if (startAfterInstall) {
              openBottomTerminal('hermes');
            }
          });
        } catch (error) {
          setHermesInstallJob((current) => ({
            ...current,
            state: 'error',
            error: error instanceof Error ? error.message : t('vscodeWorkbench.hermes.installFailed', { defaultValue: 'Hermes install failed.' }),
          }));
        } finally {
          try { stream.close(); } catch { /* noop */ }
          hermesInstallEventSourceRef.current = null;
        }
      });

      stream.onerror = () => {
        setHermesInstallJob((current) => (
          current.state === 'running'
            ? {
                ...current,
                state: 'error',
                error: t('vscodeWorkbench.hermes.installStreamLost', { defaultValue: 'Hermes install stream closed early. The install may still be running.' }),
              }
            : current
        ));
      };
    } catch (error) {
      setHermesInstallJob({
        state: 'error',
        log: '',
        error: error instanceof Error ? error.message : t('vscodeWorkbench.hermes.installFailed', { defaultValue: 'Hermes install failed.' }),
        jobId: null,
        startAfterInstall,
      });
    }
  }, [openBottomTerminal, refreshHermesInstallStatus, t]);

  useEffect(() => () => {
    try { hermesInstallEventSourceRef.current?.close(); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    void refreshHermesInstallStatus();
  }, [refreshHermesInstallStatus]);

  useEffect(() => {
    void refreshHermesControlPlane();
  }, [refreshHermesControlPlane, hermesInstallStatus?.installed]);

  useEffect(() => {
    if (lastRestoredHermesProjectKeyRef.current === selectedProjectStateKey) {
      return;
    }

    lastRestoredHermesProjectKeyRef.current = selectedProjectStateKey;
    const savedState = readWorkbenchHermesState(selectedProjectStateKey);
    if (!savedState?.isOpen) {
      if (bottomTerminalMode === 'hermes') {
        setIsBottomTerminalOpen(false);
        setBottomTerminalProject(selectedProject ?? null);
      }
      return;
    }

    setBottomTerminalMode('hermes');
    setBottomTerminalForceNewSession(false);
    setBottomTerminalCommand(savedState.command || HERMES_DEFAULT_COMMAND);
    setBottomTerminalTitle(savedState.title);
    setBottomTerminalProject(selectedProject ?? null);
    setIsBottomTerminalOpen(true);
    setBottomTerminalViewMode(savedState.viewMode);
    setBottomTerminalRunId((current) => current + 1);
  }, [bottomTerminalMode, selectedProject, selectedProjectStateKey]);

  useEffect(() => {
    if (!pendingHermesLaunch || !selectedProject) {
      return;
    }

    if (getProjectPath(selectedProject) !== pendingHermesLaunch.projectPath) {
      return;
    }

    setPendingHermesLaunch(null);
    openBottomTerminal('hermes', {
      command: pendingHermesLaunch.command,
      title: pendingHermesLaunch.title,
      forceNewSession: pendingHermesLaunch.forceNewSession,
    });
  }, [openBottomTerminal, pendingHermesLaunch, selectedProject]);

  const activeEditorFile = useMemo(
    () => openEditorTabs.find((tab) => tab.path === activeEditorPath) ?? openEditorTabs[0] ?? null,
    [activeEditorPath, openEditorTabs],
  );
  const terminalProject = bottomTerminalProject ?? selectedProject;

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

      if (resizeTarget === 'bottom') {
        setBottomTerminalHeight(clamp(rect.bottom - event.clientY, BOTTOM_TERMINAL_MIN_HEIGHT, BOTTOM_TERMINAL_MAX_HEIGHT));
        return;
      }

      setRightPaneWidth(clamp(rect.right - event.clientX, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
    };

    const stopResize = () => setResizeTarget(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
    document.body.style.cursor = resizeTarget === 'bottom' ? 'ns-resize' : 'col-resize';
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
    if (panel === 'terminal') {
      if (!selectedProject) {
        setActivityPanel('projects');
        setActiveTab('chat');
        return;
      }

      if (isBottomTerminalOpen && bottomTerminalMode === 'shell' && bottomTerminalViewMode === 'full') {
        setBottomTerminalViewMode('half');
      } else if (isBottomTerminalOpen && bottomTerminalMode === 'shell') {
        setIsBottomTerminalOpen(false);
      } else {
        openBottomTerminal('shell');
      }

      if (activeTab === 'shell') {
        setActiveTab('files');
      }
      return;
    }

    if (panel === 'hermes') {
      setActivityPanel('hermes');
      setIsLeftCollapsed(false);
      if (isCenterSystemTab(activeTab)) {
        setActiveTab('files');
      }
      void refreshHermesControlPlane();
      return;
    }

    setActivityPanel(panel);
    setIsLeftCollapsed(false);
    if (panel === 'projects') {
      setActiveTab('chat');
      return;
    }

    if (tab !== 'chat' || !isCenterSystemTab(activeTab)) {
      setActiveTab(tab);
    }
  }, [activeTab, bottomTerminalMode, bottomTerminalViewMode, isBottomTerminalOpen, openBottomTerminal, refreshHermesControlPlane, selectedProject, setActiveTab]);

  const openHermesAgent = useCallback((options: WorkbenchBottomTerminalOptions = {}) => {
    if (!selectedProject) {
      const fallbackProject = sidebarProps.projects[0];
      if (fallbackProject) {
        setPendingHermesLaunch({
          projectPath: getProjectPath(fallbackProject),
          command: options.command,
          title: options.title,
          forceNewSession: options.forceNewSession,
        });
        sidebarProps.onProjectSelect(fallbackProject);
        setActivityPanel('explorer');
        setActiveTab('files');
        return;
      }

      setActivityPanel('projects');
      setActiveTab('chat');
      return;
    }

    if (hermesInstallStatus?.installed !== true) {
      void startHermesApiInstall({ startAfterInstall: true });
      return;
    }

    openBottomTerminal('hermes', options);
  }, [hermesInstallStatus?.installed, openBottomTerminal, selectedProject, setActiveTab, sidebarProps, startHermesApiInstall]);

  const startNewHermesSession = useCallback(() => {
    if (hermesInstallStatus?.installed !== true) {
      void startHermesApiInstall({ startAfterInstall: true });
      return;
    }

    openBottomTerminal('hermes', {
      command: HERMES_DEFAULT_COMMAND,
      forceNewSession: true,
      project: bottomTerminalProject ?? selectedProject,
    });
  }, [bottomTerminalProject, hermesInstallStatus?.installed, openBottomTerminal, selectedProject, startHermesApiInstall]);

  const openHermesHistory = useCallback(() => {
    if (hermesInstallStatus?.installed !== true) {
      void startHermesApiInstall({ startAfterInstall: true });
      return;
    }

    openBottomTerminal('hermes', {
      command: HERMES_HISTORY_COMMAND,
      title: t('vscodeWorkbench.hermes.history', { defaultValue: 'Hermes history' }),
      forceNewSession: true,
      project: bottomTerminalProject ?? selectedProject,
    });
  }, [bottomTerminalProject, hermesInstallStatus?.installed, openBottomTerminal, selectedProject, startHermesApiInstall, t]);

  const installHermesAgent = useCallback(() => {
    void startHermesApiInstall({ force: true });
  }, [startHermesApiInstall]);

  const repairHermesControlPlane = useCallback(async () => {
    if (hermesInstallStatus?.installed !== true) {
      void startHermesApiInstall({ startAfterInstall: true });
      return;
    }

    setHermesControlPlaneRepairing(true);
    setHermesControlPlaneError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/control-plane/repair', {
        method: 'POST',
        body: JSON.stringify({
          projectPath: selectedProject ? getProjectPath(selectedProject) : undefined,
          forceRestart: true,
        }),
      });
      const body = await response.json().catch(() => null);
      const controlPlane = body?.controlPlane ?? body;
      if (!controlPlane || (!response.ok && !controlPlane.profiles && !controlPlane.capabilities)) {
        throw new Error(body?.error?.message || body?.error || `HTTP ${response.status}`);
      }
      setHermesControlPlane(controlPlane as HermesControlPlane);
    } catch (error) {
      setHermesControlPlaneError(
        error instanceof Error
          ? error.message
          : t('vscodeWorkbench.hermes.controlPlaneRepairFailed', { defaultValue: 'Unable to repair Hermes control plane.' }),
      );
    } finally {
      setHermesControlPlaneRepairing(false);
      void refreshHermesInstallStatus();
    }
  }, [hermesInstallStatus?.installed, refreshHermesInstallStatus, selectedProject, startHermesApiInstall, t]);

  const openHermesModelSettings = useCallback(() => {
    openHermesAgent({
      command: HERMES_MODEL_COMMAND,
      title: t('vscodeWorkbench.hermes.modelSettings', { defaultValue: 'Hermes model' }),
      forceNewSession: true,
      project: selectedProject,
    });
  }, [openHermesAgent, selectedProject, t]);

  const openHermesCronJobs = useCallback(() => {
    openHermesAgent({
      command: HERMES_CRON_COMMAND,
      title: t('vscodeWorkbench.hermes.cronJobs', { defaultValue: 'Hermes cron' }),
      forceNewSession: true,
      project: selectedProject,
    });
  }, [openHermesAgent, selectedProject, t]);

  const openHermesStatus = useCallback(() => {
    openHermesAgent({
      command: HERMES_STATUS_COMMAND,
      title: t('vscodeWorkbench.hermes.deepStatus', { defaultValue: 'Hermes status' }),
      forceNewSession: true,
      project: selectedProject,
    });
  }, [openHermesAgent, selectedProject, t]);

  const closeBottomTerminal = useCallback(() => {
    if (bottomTerminalMode === 'hermes') {
      writeWorkbenchHermesState(getProjectCliStateKey(bottomTerminalProject), {
        isOpen: false,
        viewMode: 'half',
        command: bottomTerminalCommand || HERMES_DEFAULT_COMMAND,
        title: bottomTerminalTitle,
        updatedAt: Date.now(),
      });
    }
    setIsBottomTerminalOpen(false);
    setBottomTerminalProject(null);
  }, [bottomTerminalCommand, bottomTerminalMode, bottomTerminalProject, bottomTerminalTitle]);

  const showBottomTerminalFull = useCallback(() => {
    setBottomTerminalViewMode('full');
    if (bottomTerminalMode === 'hermes') {
      writeWorkbenchHermesState(getProjectCliStateKey(bottomTerminalProject), {
        isOpen: true,
        viewMode: 'full',
        command: bottomTerminalCommand || HERMES_DEFAULT_COMMAND,
        title: bottomTerminalTitle,
        updatedAt: Date.now(),
      });
    }
  }, [bottomTerminalCommand, bottomTerminalMode, bottomTerminalProject, bottomTerminalTitle]);

  const showBottomTerminalHalf = useCallback(() => {
    setBottomTerminalViewMode('half');
    if (bottomTerminalMode === 'hermes') {
      writeWorkbenchHermesState(getProjectCliStateKey(bottomTerminalProject), {
        isOpen: true,
        viewMode: 'half',
        command: bottomTerminalCommand || HERMES_DEFAULT_COMMAND,
        title: bottomTerminalTitle,
        updatedAt: Date.now(),
      });
    }
  }, [bottomTerminalCommand, bottomTerminalMode, bottomTerminalProject, bottomTerminalTitle]);

  useEffect(() => {
    const handleHermesTerminalRequest = (event: Event) => {
      const detail: CustomEvent<{ mode?: string; command?: string; title?: string }>['detail'] = (
        event as CustomEvent<{ mode?: string; command?: string; title?: string }>
      ).detail;
      if (detail?.mode === 'install') {
        installHermesAgent();
        return;
      }

      if (detail?.mode === 'command' && detail.command) {
        openHermesAgent({
          command: detail.command,
          title: detail.title || detail.command,
          forceNewSession: true,
        });
        return;
      }

      openHermesAgent({ command: HERMES_DEFAULT_COMMAND });
    };

    window.addEventListener('pixcode:hermes-terminal', handleHermesTerminalRequest);
    return () => window.removeEventListener('pixcode:hermes-terminal', handleHermesTerminalRequest);
  }, [installHermesAgent, openHermesAgent]);

  const shrinkCliPanel = useCallback(() => {
    setRightPaneWidth((current) => clamp(current - RIGHT_RESIZE_STEP, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
  }, []);

  const expandCliPanel = useCallback(() => {
    setRightPaneWidth((current) => clamp(current + RIGHT_RESIZE_STEP, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
  }, []);

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
    setActivityPanel('explorer');
    setActiveTab('files');
  }, [setActiveTab, sidebarProps]);

  const handleWorkspaceTabSelect = useCallback((tab: WorkbenchWorkspaceTab) => {
    const project = sidebarProps.projects.find((candidate) => (
      candidate.name === tab.projectName || getWorkspaceTabId(candidate) === tab.id
    ));
    if (project) {
      handleWorkbenchProjectSelect(project);
    }
  }, [handleWorkbenchProjectSelect, sidebarProps.projects]);

  const handleWorkspaceTabClose = useCallback((tabId: string) => {
    setWorkspaceTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      const closingSelected = selectedProject && getWorkspaceTabId(selectedProject) === tabId;
      if (closingSelected) {
        const fallbackTab = nextTabs[nextTabs.length - 1];
        const fallbackProject = fallbackTab
          ? sidebarProps.projects.find((candidate) => (
            candidate.name === fallbackTab.projectName || getWorkspaceTabId(candidate) === fallbackTab.id
          ))
          : null;
        if (fallbackProject) {
          window.setTimeout(() => handleWorkbenchProjectSelect(fallbackProject), 0);
        }
      }
      return nextTabs;
    });
  }, [handleWorkbenchProjectSelect, selectedProject, sidebarProps.projects]);

  const closeOtherWorkspaces = useCallback((tabId: string) => {
    setWorkspaceTabs((currentTabs) => currentTabs.filter((tab) => tab.id === tabId));
  }, []);

  const closeAllWorkspaces = useCallback(() => {
    setWorkspaceTabs([]);
  }, []);

  const handleWorkspaceTabRename = useCallback((tabId: string, label: string) => {
    const nextLabel = label.trim();
    if (!nextLabel) return;

    setWorkspaceTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === tabId ? { ...tab, label: nextLabel } : tab
    )));
  }, []);

  const handleWorkspaceTabStar = useCallback((tabId: string) => {
    setWorkspaceTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === tabId ? { ...tab, starred: !tab.starred } : tab
    )));
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem('auth-token') || '';
    const streamUrl = `/api/orchestration/hermes/terminal-launches/stream?after=${lastHermesTerminalLaunchIdRef.current}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const stream = new EventSource(streamUrl);

    const handleTerminalLaunch = (event: MessageEvent) => {
      try {
        const latest = JSON.parse(event.data) as HermesTerminalLaunchEvent;
        if (!latest || typeof latest.id !== 'number' || latest.id <= lastHermesTerminalLaunchIdRef.current) {
          return;
        }

        lastHermesTerminalLaunchIdRef.current = Math.max(
          lastHermesTerminalLaunchIdRef.current,
          latest.id,
        );
        if (!hasPrimedHermesTerminalLaunchesRef.current) {
          return;
        }

        const requestedProject = latest.projectPath
          ? sidebarProps.projects.find((project) => getProjectPath(project).replace(/\\/g, '/') === latest.projectPath?.replace(/\\/g, '/'))
          : selectedProject;
        if (requestedProject && requestedProject !== selectedProject) {
          handleWorkbenchProjectSelect(requestedProject);
        }

        setIsRightCollapsed(false);
        setHermesCliLaunch(latest);
      } catch {
        // Hermes control streaming is best-effort; normal workbench use should not be interrupted.
      }
    };

    const handleReady = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { latestId?: number };
        if (typeof payload.latestId === 'number') {
          lastHermesTerminalLaunchIdRef.current = Math.max(lastHermesTerminalLaunchIdRef.current, payload.latestId);
        }
      } catch {
        // Ignore malformed stream frames.
      } finally {
        hasPrimedHermesTerminalLaunchesRef.current = true;
      }
    };

    stream.addEventListener('terminal-launch', handleTerminalLaunch);
    stream.addEventListener('ready', handleReady);

    return () => {
      stream.removeEventListener('terminal-launch', handleTerminalLaunch);
      stream.removeEventListener('ready', handleReady);
      stream.close();
    };
  }, [handleWorkbenchProjectSelect, selectedProject, sidebarProps.projects]);

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
      return <GitPanel selectedProject={selectedProject} isMobile={false} compact onFileOpen={handleFileOpen} />;
    }

    if (activityPanel === 'hermes') {
      return (
        <WorkbenchHermesPanel
          project={selectedProject}
          installStatus={hermesInstallStatus}
          controlPlane={hermesControlPlane}
          loading={hermesControlPlaneLoading}
          repairing={hermesControlPlaneRepairing}
          error={hermesControlPlaneError}
          onRefresh={() => void refreshHermesControlPlane()}
          onRepair={() => void repairHermesControlPlane()}
          onStartHermes={() => openHermesAgent()}
          onNewSession={startNewHermesSession}
          onHistory={openHermesHistory}
          onInstall={installHermesAgent}
          onModel={openHermesModelSettings}
          onCron={openHermesCronJobs}
          onStatus={openHermesStatus}
          t={t}
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
          onOpenHermesAgent={openHermesAgent}
          onShowSettings={onShowSettings}
          t={t}
        />
      );
    }

    if (activeEditorFile) {
      return (
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-muted/20">
            <button
              type="button"
              className="flex h-full w-8 shrink-0 items-center justify-center border-r border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => scrollEditorTabs('left')}
              aria-label={t('vscodeWorkbench.editor.scrollLeft', { defaultValue: 'Scroll tabs left' })}
              title={t('vscodeWorkbench.editor.scrollLeft', { defaultValue: 'Scroll tabs left' })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div
              ref={editorTabStripRef}
              className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {openEditorTabs.map((tab) => {
                const active = tab.path === activeEditorFile.path;
                return (
                  <button
                    key={tab.path}
                    type="button"
                    className={cn(
                      'group flex h-9 w-44 shrink-0 items-center gap-2 border-r border-border px-2.5 text-xs transition-colors',
                      active ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                    onClick={() => setActiveEditorPath(tab.path)}
                    onContextMenu={(event) => handleEditorTabContextMenu(event, tab.path)}
                    title={tab.path}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{tab.name}</span>
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
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="flex h-full w-8 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => scrollEditorTabs('right')}
              aria-label={t('vscodeWorkbench.editor.scrollRight', { defaultValue: 'Scroll tabs right' })}
              title={t('vscodeWorkbench.editor.scrollRight', { defaultValue: 'Scroll tabs right' })}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-full w-8 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setEditorTabContextMenu({
                filePath: activeEditorFile.path,
                x: window.innerWidth - 220,
                y: 84,
              })}
              aria-label={t('vscodeWorkbench.editor.moreActions', { defaultValue: 'More tab actions' })}
              title={t('vscodeWorkbench.editor.moreActions', { defaultValue: 'More tab actions' })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {splitEditorFile ? (
              <div className="flex h-full min-w-0">
                {activeEditorFile && (
                  <div className="min-w-0 flex-1 border-r border-border">
                    <CodeEditor
                      file={activeEditorFile}
                      onClose={() => handleCloseEditorTab(activeEditorFile.path)}
                      projectPath={selectedProject.path || selectedProject.fullPath}
                      isSidebar
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-2">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{splitEditorFile.name}</span>
                    </div>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setSplitEditorFile(null)}
                      aria-label={t('vscodeWorkbench.editor.closeSplit', { defaultValue: 'Close split editor' })}
                      title={t('vscodeWorkbench.editor.closeSplit', { defaultValue: 'Close split editor' })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="h-[calc(100%-2rem)] min-h-0 overflow-hidden">
                    <CodeEditor
                      file={splitEditorFile}
                      onClose={() => setSplitEditorFile(null)}
                      projectPath={selectedProject.path || selectedProject.fullPath}
                      isSidebar
                    />
                  </div>
                </div>
              </div>
            ) : (
              <CodeEditor
                file={activeEditorFile}
                onClose={() => handleCloseEditorTab(activeEditorFile.path)}
                projectPath={selectedProject.path || selectedProject.fullPath}
                isSidebar
              />
            )}
          </div>
          {editorTabContextMenu && (
            <EditorTabContextMenu
              context={editorTabContextMenu}
              file={openEditorTabs.find((tab) => tab.path === editorTabContextMenu.filePath) ?? null}
              onClose={() => setEditorTabContextMenu(null)}
              onCloseTab={handleCloseEditorTab}
              onCloseAll={closeAllTabs}
              onCopyPath={copyPath}
              onSplitRight={(filePath) => splitRight(filePath)}
              onSplitMoveRight={(filePath) => splitRight(filePath, true)}
              t={t}
            />
          )}
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
        hermesCliLaunch={hermesCliLaunch}
        onSessionSelect={sidebarProps.onSessionSelect}
        onHeaderContentChange={setCliHeaderContent}
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
        onOpenHermesAgent={openHermesAgent}
        onShowSettings={onShowSettings}
        onQuickStartSession={onQuickStartSession}
      />
      <WorkbenchWorkspaceTabs
        tabs={workspaceTabs}
        projects={sidebarProps.projects}
        selectedProject={selectedProject}
        onSelect={handleWorkspaceTabSelect}
        onClose={handleWorkspaceTabClose}
        onCloseOthers={closeOtherWorkspaces}
        onCloseAll={closeAllWorkspaces}
        onRename={handleWorkspaceTabRename}
        onToggleStar={handleWorkspaceTabStar}
        contextMenu={workspaceTabContextMenu}
        onContextMenuChange={setWorkspaceTabContextMenu}
        onAdd={() => openProjectWizard('existing')}
        isCliPanelCollapsed={isRightCollapsed}
        onToggleCliPanel={() => setIsRightCollapsed((previous) => !previous)}
        t={t}
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
                active={item.id === 'terminal'
                  ? isBottomTerminalOpen
                  : !isLeftCollapsed && activityPanel === item.id && !isCenterSystemTab(activeTab)}
                onClick={() => selectActivityPanel(item.id, item.tab)}
              />
            ))}
            <HermesActivityButton
              label={t('vscodeWorkbench.activity.hermes', { defaultValue: 'Hermes Agent' })}
              active={!isLeftCollapsed && activityPanel === 'hermes'}
              onClick={() => selectActivityPanel('hermes', 'files')}
            />
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
          <div className="relative flex h-[calc(100%-2.5rem)] min-h-0 flex-col overflow-hidden">
            <div className={cn('min-h-0 flex-1 overflow-hidden', isBottomTerminalOpen && bottomTerminalViewMode === 'half' && 'border-b border-border')}>
              {renderCenterPanel()}
            </div>
            {isBottomTerminalOpen && (
              <WorkbenchBottomTerminal
                project={terminalProject}
                mode={bottomTerminalMode}
                hermesInstallStatus={hermesInstallStatus}
                hermesInstallJob={hermesInstallJob}
                runId={bottomTerminalRunId}
                forceNewSession={bottomTerminalForceNewSession}
                command={bottomTerminalCommand}
                commandTitle={bottomTerminalTitle}
                height={bottomTerminalHeight}
                viewMode={bottomTerminalViewMode}
                isActive
                onResizeStart={(event) => startResize('bottom', event)}
                onShowFull={showBottomTerminalFull}
                onShowHalf={showBottomTerminalHalf}
                onStartHermes={startNewHermesSession}
                onOpenHistory={openHermesHistory}
                onInstallHermes={installHermesAgent}
                onClose={closeBottomTerminal}
                t={t}
              />
            )}
          </div>
        </main>

        {!isRightCollapsed && (
          <>
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
                <div className="min-w-0 flex-1 overflow-hidden">
                  {cliHeaderContent || (
                    <div className="flex min-w-0 items-center gap-1">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('vscodeWorkbench.panels.cli')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={shrinkCliPanel}
                    aria-label={t('vscodeWorkbench.cli.shrinkPanel', { defaultValue: 'Shrink CLI panel' })}
                    title={t('vscodeWorkbench.cli.shrinkPanel', { defaultValue: 'Shrink CLI panel' })}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={expandCliPanel}
                    aria-label={t('vscodeWorkbench.cli.expandPanel', { defaultValue: 'Expand CLI panel' })}
                    title={t('vscodeWorkbench.cli.expandPanel', { defaultValue: 'Expand CLI panel' })}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setIsRightCollapsed(true)}
                    aria-label={t('vscodeWorkbench.cli.hidePanel', { defaultValue: 'Hide CLI panel' })}
                    title={t('vscodeWorkbench.cli.hidePanel', { defaultValue: 'Hide CLI panel' })}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">
                {renderRightPanel()}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

type WorkbenchMenuBarProps = {
  t: TFunction<'common'>;
  onOpenProject: (type: WorkspaceType) => void;
  onActivityPanel: (panel: ActivityPanel, tab: AppTab) => void;
  onSystemTab: (tab: AppTab) => void;
  onOpenHermesAgent: () => void;
  onShowSettings: () => void;
  onQuickStartSession?: () => void | Promise<void>;
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
  onOpenHermesAgent,
  onShowSettings,
  onQuickStartSession,
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
        {
          label: t('vscodeWorkbench.activity.hermes', { defaultValue: 'Hermes Agent' }),
          icon: Workflow,
          action: () => onActivityPanel('hermes', 'files'),
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
          label: t('vscodeWorkbench.hermes.title', { defaultValue: 'Hermes Agent' }),
          icon: Workflow,
          action: onOpenHermesAgent,
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
    onQuickStartSession,
    onOpenHermesAgent,
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

function WorkbenchWorkspaceTabs({
  tabs,
  projects,
  selectedProject,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
  onRename,
  onToggleStar,
  contextMenu,
  onContextMenuChange,
  onAdd,
  isCliPanelCollapsed,
  onToggleCliPanel,
  t,
}: {
  tabs: WorkbenchWorkspaceTab[];
  projects: Project[];
  selectedProject: Project | null;
  onSelect: (tab: WorkbenchWorkspaceTab) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  onRename: (tabId: string, label: string) => void;
  onToggleStar: (tabId: string) => void;
  contextMenu: WorkspaceTabContextMenu;
  onContextMenuChange: (contextMenu: WorkspaceTabContextMenu) => void;
  onAdd: () => void;
  isCliPanelCollapsed: boolean;
  onToggleCliPanel: () => void;
  t: TFunction<'common'>;
}) {
  const selectedId = selectedProject ? getWorkspaceTabId(selectedProject) : null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const workspaceTabStripRef = useRef<HTMLDivElement>(null);

  const tabsWithProjects = useMemo(() => (
    tabs
      .map((tab) => ({
        tab,
        project: projects.find((project) => (
          project.name === tab.projectName || getWorkspaceTabId(project) === tab.id
        )),
      }))
      .filter((entry): entry is { tab: WorkbenchWorkspaceTab; project: Project } => Boolean(entry.project))
  ), [projects, tabs]);

  const startRename = (tab: WorkbenchWorkspaceTab) => {
    onContextMenuChange(null);
    setEditingId(tab.id);
    setDraftLabel(tab.label);
  };

  const submitRename = () => {
    if (!editingId) return;
    onRename(editingId, draftLabel);
    setEditingId(null);
    setDraftLabel('');
  };

  const openWorkspaceContextMenu = (event: React.MouseEvent, tab: WorkbenchWorkspaceTab) => {
    event.preventDefault();
    onSelect(tab);
    onContextMenuChange({
      tabId: tab.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const scrollWorkspaceTabs = (direction: 'left' | 'right') => {
    workspaceTabStripRef.current?.scrollBy({
      left: direction === 'left' ? -220 : 220,
      behavior: 'smooth',
    });
  };

  const contextMenuEntry = contextMenu
    ? tabsWithProjects.find((entry) => entry.tab.id === contextMenu.tabId) ?? null
    : null;

  return (
    <div className="relative flex h-9 shrink-0 items-center border-b border-border bg-background text-xs">
      <button
        type="button"
        className="flex h-full w-8 shrink-0 items-center justify-center border-r border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => scrollWorkspaceTabs('left')}
        aria-label={t('vscodeWorkbench.workspace.scrollLeft', { defaultValue: 'Scroll workspaces left' })}
        title={t('vscodeWorkbench.workspace.scrollLeft', { defaultValue: 'Scroll workspaces left' })}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div
        ref={workspaceTabStripRef}
        className="flex h-full min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabsWithProjects.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-8 min-w-0 items-center gap-2 border-r border-border px-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t('vscodeWorkbench.workspace.openFirst', { defaultValue: 'Open a workspace' })}
            </span>
          </button>
        ) : (
          tabsWithProjects.map(({ tab, project }) => {
            const active = tab.id === selectedId;
            return (
              <div
                key={tab.id}
                onContextMenu={(event) => openWorkspaceContextMenu(event, tab)}
                className={cn(
                  'group relative flex h-8 w-52 shrink-0 items-center border-r border-border px-2 transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                )}
                title={`${tab.label} - ${formatProjectPath(project)}`}
              >
                <button
                  type="button"
                  onClick={() => onToggleStar(tab.id)}
                  className={cn(
                    'mr-1 rounded p-0.5 transition hover:bg-muted',
                    tab.starred ? 'text-amber-500' : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100',
                  )}
                  aria-label={t('vscodeWorkbench.workspace.toggleStar', { name: tab.label, defaultValue: 'Star {{name}}' })}
                  title={t('vscodeWorkbench.workspace.toggleStar', { name: tab.label, defaultValue: 'Star {{name}}' })}
                >
                  <Star className="h-3.5 w-3.5" />
                </button>

                {editingId === tab.id ? (
                  <input
                    value={draftLabel}
                    autoFocus
                    onChange={(event) => setDraftLabel(event.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitRename();
                      if (event.key === 'Escape') {
                        setEditingId(null);
                        setDraftLabel('');
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-primary/40 bg-background px-1 py-0.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(tab)}
                    onDoubleClick={() => startRename(tab)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-medium">{tab.label}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{formatProjectPath(project)}</div>
                  </button>
                )}

                <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onClose(tab.id)}
                    className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                    aria-label={t('vscodeWorkbench.workspace.close', { name: tab.label, defaultValue: 'Close {{name}}' })}
                    title={t('vscodeWorkbench.workspace.close', { name: tab.label, defaultValue: 'Close {{name}}' })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-8 w-10 shrink-0 items-center justify-center border-r border-border bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={t('vscodeWorkbench.workspace.add', { defaultValue: 'Add workspace' })}
          title={t('vscodeWorkbench.workspace.add', { defaultValue: 'Add workspace' })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        className="flex h-full w-8 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => scrollWorkspaceTabs('right')}
        aria-label={t('vscodeWorkbench.workspace.scrollRight', { defaultValue: 'Scroll workspaces right' })}
        title={t('vscodeWorkbench.workspace.scrollRight', { defaultValue: 'Scroll workspaces right' })}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          'flex h-full w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition hover:bg-muted hover:text-foreground',
          isCliPanelCollapsed && 'bg-muted/40 text-foreground',
        )}
        onClick={onToggleCliPanel}
        aria-label={isCliPanelCollapsed
          ? t('vscodeWorkbench.cli.showPanel', { defaultValue: 'Show CLI panel' })
          : t('vscodeWorkbench.cli.hidePanel', { defaultValue: 'Hide CLI panel' })}
        title={isCliPanelCollapsed
          ? t('vscodeWorkbench.cli.showPanel', { defaultValue: 'Show CLI panel' })
          : t('vscodeWorkbench.cli.hidePanel', { defaultValue: 'Hide CLI panel' })}
      >
        {isCliPanelCollapsed ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
      </button>
      {contextMenu && contextMenuEntry && (
        <WorkspaceTabContextMenu
          context={contextMenu}
          tab={contextMenuEntry.tab}
          onClose={() => onContextMenuChange(null)}
          onRename={() => startRename(contextMenuEntry.tab)}
          onToggleStar={() => onToggleStar(contextMenuEntry.tab.id)}
          onCloseTab={() => onClose(contextMenuEntry.tab.id)}
          onCloseOthers={() => onCloseOthers(contextMenuEntry.tab.id)}
          onCloseAll={onCloseAll}
          t={t}
        />
      )}
    </div>
  );
}

function WorkspaceTabContextMenu({
  context,
  tab,
  onClose,
  onRename,
  onToggleStar,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  t,
}: {
  context: NonNullable<WorkspaceTabContextMenu>;
  tab: WorkbenchWorkspaceTab;
  onClose: () => void;
  onRename: () => void;
  onToggleStar: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  t: TFunction<'common'>;
}) {
  useEffect(() => {
    const closeOnPointer = () => onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', closeOnPointer);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeOnPointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const runAction = (action: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
    onClose();
  };

  return (
    <div
      className="fixed z-50 w-48 overflow-hidden rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-xl shadow-black/10"
      style={{ left: context.x, top: context.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={runAction(onRename)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
      >
        <Edit2 className="h-3.5 w-3.5" />
        {t('vscodeWorkbench.workspace.rename', { defaultValue: 'Rename' })}
      </button>
      <button
        type="button"
        onClick={runAction(onToggleStar)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
      >
        <Star className="h-3.5 w-3.5" />
        {tab.starred
          ? t('vscodeWorkbench.workspace.unstar', { defaultValue: 'Unstar' })
          : t('vscodeWorkbench.workspace.star', { defaultValue: 'Star' })}
      </button>
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        onClick={runAction(onCloseTab)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
        {t('vscodeWorkbench.workspace.closeAction', { defaultValue: 'Close workspace' })}
      </button>
      <button
        type="button"
        onClick={runAction(onCloseOthers)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
      >
        <PanelLeftClose className="h-3.5 w-3.5" />
        {t('vscodeWorkbench.workspace.closeOthers', { defaultValue: 'Close others' })}
      </button>
      <button
        type="button"
        onClick={runAction(onCloseAll)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-muted dark:text-red-300"
      >
        <X className="h-3.5 w-3.5" />
        {t('vscodeWorkbench.workspace.closeAll', { defaultValue: 'Close all' })}
      </button>
    </div>
  );
}

function EditorTabContextMenu({
  context,
  file,
  onClose,
  onCloseTab,
  onCloseAll,
  onCopyPath,
  onSplitRight,
  onSplitMoveRight,
  t,
}: {
  context: NonNullable<EditorTabContextMenu>;
  file: CodeEditorFile | null;
  onClose: () => void;
  onCloseTab: (filePath: string) => void;
  onCloseAll: () => void;
  onCopyPath: (filePath: string) => void;
  onSplitRight: (filePath: string) => void;
  onSplitMoveRight: (filePath: string) => void;
  t: TFunction<'common'>;
}) {
  useEffect(() => {
    const close = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!file) return null;

  const items = [
    {
      id: 'close',
      label: t('vscodeWorkbench.editor.context.close', { defaultValue: 'Close' }),
      icon: X,
      action: () => onCloseTab(file.path),
    },
    {
      id: 'closeAllTabs',
      label: t('vscodeWorkbench.editor.context.closeAll', { defaultValue: 'Close All' }),
      icon: X,
      action: onCloseAll,
    },
    {
      id: 'copyPath',
      label: t('vscodeWorkbench.editor.context.copyPath', { defaultValue: 'Copy Path' }),
      icon: Copy,
      action: () => onCopyPath(file.path),
    },
    {
      id: 'splitRight',
      label: t('vscodeWorkbench.editor.context.splitRight', { defaultValue: 'Split Right' }),
      icon: Columns,
      action: () => onSplitRight(file.path),
    },
    {
      id: 'splitMoveRight',
      label: t('vscodeWorkbench.editor.context.splitMoveRight', { defaultValue: 'Split and Move Right' }),
      icon: PanelLeftOpen,
      action: () => onSplitMoveRight(file.path),
    },
  ];

  return (
    <div
      className="fixed z-[80] w-56 overflow-hidden rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-xl shadow-black/15"
      style={{ left: context.x, top: context.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        <div className="truncate font-medium text-foreground">{file.name}</div>
        <div className="truncate font-mono">{file.path}</div>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.action}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function WorkbenchBottomTerminal({
  project,
  mode,
  hermesInstallStatus,
  hermesInstallJob,
  runId,
  forceNewSession,
  command,
  commandTitle,
  height,
  viewMode,
  isActive,
  onResizeStart,
  onShowFull,
  onShowHalf,
  onStartHermes,
  onOpenHistory,
  onInstallHermes,
  onClose,
  t,
}: {
  project: Project | null;
  mode: WorkbenchBottomTerminalMode;
  hermesInstallStatus: HermesInstallStatus | null;
  hermesInstallJob: HermesInstallJobState;
  runId: number;
  forceNewSession: boolean;
  command: string | null;
  commandTitle: string | null;
  height: number;
  viewMode: WorkbenchBottomTerminalViewMode;
  isActive: boolean;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onShowFull: () => void;
  onShowHalf: () => void;
  onStartHermes: () => void;
  onOpenHistory: () => void;
  onInstallHermes: () => void;
  onClose: () => void;
  t: TFunction<'common'>;
}) {
  const isHermes = mode === 'hermes' || mode === 'hermes-install';
  const isHermesInstalled = hermesInstallStatus?.installed === true;
  const title = mode === 'hermes-install'
    ? t('vscodeWorkbench.hermes.installTitle', { defaultValue: 'Install Hermes Agent' })
    : mode === 'hermes'
      ? commandTitle || t('vscodeWorkbench.hermes.title', { defaultValue: 'Hermes Agent' })
      : t('vscodeWorkbench.terminal.title', { defaultValue: 'Terminal' });
  const hermesCommand = command || 'hermes';
  const isFullScreen = viewMode === 'full';

  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gray-950 text-gray-100',
        isFullScreen ? 'absolute inset-0 z-30' : 'shrink-0',
      )}
      style={{ height: isFullScreen ? '100%' : height }}
    >
      {!isFullScreen && (
        <button
          type="button"
          className="absolute inset-x-0 top-0 z-10 h-1 cursor-ns-resize bg-transparent hover:bg-blue-500/40"
          onPointerDown={onResizeStart}
          aria-label={t('vscodeWorkbench.terminal.resize', { defaultValue: 'Resize terminal' })}
          title={t('vscodeWorkbench.terminal.resize', { defaultValue: 'Resize terminal' })}
        />
      )}
      <div className="flex h-8 items-center justify-between border-b border-gray-800 bg-gray-900 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {isHermes
            ? <HermesLogo className="h-4 w-4" />
            : <Terminal className="h-3.5 w-3.5 text-blue-300" />}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-300">
            {title}
          </span>
          <span className="truncate font-mono text-[10px] text-gray-500">
            {project ? getProjectPath(project) : t('vscodeWorkbench.noProject')}
          </span>
          {isHermes && isHermesInstalled && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
              {t('vscodeWorkbench.hermes.mcpLive', { defaultValue: 'Pixcode MCP Live' })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isHermes && (
            <>
              {!isHermesInstalled && (
                <button
                  type="button"
                  className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  onClick={onInstallHermes}
                  aria-label={t('vscodeWorkbench.hermes.install', { defaultValue: 'Install' })}
                  title={t('vscodeWorkbench.hermes.install', { defaultValue: 'Install' })}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                onClick={onOpenHistory}
                aria-label={t('vscodeWorkbench.hermes.history', { defaultValue: 'Hermes history' })}
                title={t('vscodeWorkbench.hermes.history', { defaultValue: 'Hermes history' })}
              >
                <History className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                onClick={onStartHermes}
                aria-label={t('vscodeWorkbench.hermes.newSession', { defaultValue: 'New Hermes session' })}
                title={t('vscodeWorkbench.hermes.newSession', { defaultValue: 'New Hermes session' })}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {isFullScreen ? (
            <button
              type="button"
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              onClick={onShowHalf}
              aria-label={t('vscodeWorkbench.terminal.halfScreen', { defaultValue: 'Half screen terminal' })}
              title={t('vscodeWorkbench.terminal.halfScreen', { defaultValue: 'Half screen terminal' })}
            >
              <Columns className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              onClick={onShowFull}
              aria-label={t('vscodeWorkbench.terminal.fullScreen', { defaultValue: 'Full screen terminal' })}
              title={t('vscodeWorkbench.terminal.fullScreen', { defaultValue: 'Full screen terminal' })}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
            onClick={onClose}
            aria-label={t('vscodeWorkbench.terminal.close', { defaultValue: 'Close terminal' })}
            title={t('vscodeWorkbench.terminal.close', { defaultValue: 'Close terminal' })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="h-[calc(100%-2rem)] min-h-0">
        {mode === 'hermes-install' ? (
          <HermesInstallLogPanel installJob={hermesInstallJob} onRetry={onInstallHermes} onStart={onStartHermes} t={t} />
        ) : mode === 'hermes' ? (
          <StandaloneShell
            key={`hermes-terminal-${project ? getProjectPath(project) : 'none'}-${runId}`}
            project={project}
            session={null}
            command={hermesCommand}
            isPlainShell
            forceNewSession={forceNewSession}
            showHeader={false}
            autoConnect={Boolean(project)}
            isActive={isActive}
            title={title}
          />
        ) : (
          <StandaloneShell
            key={`bottom-terminal-${mode}-${project ? getProjectPath(project) : 'none'}-${runId}`}
            project={project}
            session={null}
            isPlainShell
            forceNewSession={forceNewSession}
            showHeader={false}
            autoConnect={Boolean(project)}
            isActive={isActive}
            title={title}
          />
        )}
      </div>
    </section>
  );
}

function HermesInstallLogPanel({
  installJob,
  onRetry,
  onStart,
  t,
}: {
  installJob: HermesInstallJobState;
  onRetry: () => void;
  onStart: () => void;
  t: TFunction<'common'>;
}) {
  const running = installJob.state === 'running';
  const done = installJob.state === 'done';
  const error = installJob.state === 'error';
  const installLogRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!installLogRef.current) return;
    installLogRef.current.scrollTop = installLogRef.current.scrollHeight;
  }, [installJob.error, installJob.log, installJob.state]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800 px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-gray-300">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" /> : <Workflow className="h-3.5 w-3.5 text-emerald-300" />}
          <span className="truncate">
            {running
              ? t('vscodeWorkbench.hermes.installRunning', { defaultValue: 'Installing Hermes through Pixcode API...' })
              : done
                ? t('vscodeWorkbench.hermes.installDone', { defaultValue: 'Hermes installed and Pixcode MCP configured.' })
                : error
                  ? t('vscodeWorkbench.hermes.installError', { defaultValue: 'Hermes install failed.' })
                  : t('vscodeWorkbench.hermes.installReady', { defaultValue: 'Ready to install Hermes.' })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {done && (
            <button
              type="button"
              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
              onClick={onStart}
            >
              {t('vscodeWorkbench.hermes.start', { defaultValue: 'Start Hermes' })}
            </button>
          )}
          {error && (
            <button
              type="button"
              className="rounded bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-100 hover:bg-gray-700"
              onClick={onRetry}
            >
              {t('vscodeWorkbench.hermes.retryInstall', { defaultValue: 'Retry install' })}
            </button>
          )}
        </div>
      </div>
      {installJob.error && (
        <div className="border-b border-red-900/60 bg-red-950/40 px-3 py-2 text-[11px] text-red-100">
          {installJob.error}
        </div>
      )}
      <pre ref={installLogRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-gray-200">
        {installJob.log || t('vscodeWorkbench.hermes.installWaiting', { defaultValue: 'Waiting for Hermes install logs...' })}
      </pre>
    </div>
  );
}

function WorkbenchHermesPanel({
  project,
  installStatus,
  controlPlane,
  loading,
  repairing,
  error,
  onRefresh,
  onRepair,
  onStartHermes,
  onNewSession,
  onHistory,
  onInstall,
  onModel,
  onCron,
  onStatus,
  t,
}: {
  project: Project | null;
  installStatus: HermesInstallStatus | null;
  controlPlane: HermesControlPlane | null;
  loading: boolean;
  repairing: boolean;
  error: string | null;
  onRefresh: () => void;
  onRepair: () => void;
  onStartHermes: () => void;
  onNewSession: () => void;
  onHistory: () => void;
  onInstall: () => void;
  onModel: () => void;
  onCron: () => void;
  onStatus: () => void;
  t: TFunction<'common'>;
}) {
  const profiles = controlPlane?.profiles ?? [];
  const managedProfile = controlPlane?.managedProfile
    ?? profiles.find((profile) => profile.name === 'pixcode')
    ?? profiles.find((profile) => profile.isActive)
    ?? profiles[0]
    ?? null;
  const activeProfile = controlPlane?.activeProfileSummary ?? profiles.find((profile) => profile.isActive) ?? managedProfile;
  const isInstalled = installStatus?.installed === true || controlPlane?.install?.installed === true;
  const gatewayRunning = Boolean(controlPlane?.gateway?.running);
  const mcpToolCount = managedProfile?.tools?.pixcodeMcpToolCount ?? activeProfile?.tools?.pixcodeMcpToolCount ?? 0;
  const missingMcpTools = managedProfile?.tools?.missingPixcodeMcpTools?.length
    ?? activeProfile?.tools?.missingPixcodeMcpTools?.length
    ?? 0;
  const totalSessions = profiles.reduce((sum, profile) => sum + Number(profile.sessions?.total || 0), 0);
  const totalCronJobs = profiles.reduce((sum, profile) => sum + Number(profile.cron?.total || 0), 0);
  const activeCronJobs = profiles.reduce((sum, profile) => sum + Number(profile.cron?.active || 0), 0);
  const capabilities = controlPlane?.capabilities ?? [];
  const recommendations = controlPlane?.recommendations ?? [];
  const recentSessions = managedProfile?.sessions?.recent ?? activeProfile?.sessions?.recent ?? [];
  const recentCronJobs = managedProfile?.cron?.recent ?? activeProfile?.cron?.recent ?? [];
  const modelLabel = [
    activeProfile?.model?.provider,
    activeProfile?.model?.default,
  ].filter(Boolean).join(' / ');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
            <HermesLogo className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {t('vscodeWorkbench.hermes.title', { defaultValue: 'Hermes Agent' })}
              </span>
              <span className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                controlPlane?.ok
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-200',
              )}>
                {controlPlane?.ok
                  ? t('vscodeWorkbench.hermes.controlReady', { defaultValue: 'Control ready' })
                  : t('vscodeWorkbench.hermes.needsRepair', { defaultValue: 'Needs repair' })}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={project ? getProjectPath(project) : undefined}>
              {project ? getProjectPath(project) : t('vscodeWorkbench.noProject')}
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onRefresh}
            aria-label={t('vscodeWorkbench.hermes.refreshControl', { defaultValue: 'Refresh Hermes control plane' })}
            title={t('vscodeWorkbench.hermes.refreshControl', { defaultValue: 'Refresh Hermes control plane' })}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-200">
            {error}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <HermesControlMetric
            icon={Download}
            label={t('vscodeWorkbench.hermes.installState', { defaultValue: 'Install' })}
            value={isInstalled ? t('vscodeWorkbench.hermes.ready', { defaultValue: 'Ready' }) : t('vscodeWorkbench.cli.notInstalled', { defaultValue: 'Not installed' })}
            ok={isInstalled}
          />
          <HermesControlMetric
            icon={Server}
            label={t('vscodeWorkbench.hermes.restGateway', { defaultValue: 'REST' })}
            value={gatewayRunning ? t('common.enabled', { defaultValue: 'Enabled' }) : t('common.disabled', { defaultValue: 'Disabled' })}
            ok={gatewayRunning}
          />
          <HermesControlMetric
            icon={Workflow}
            label={t('vscodeWorkbench.hermes.mcpTools', { defaultValue: 'MCP tools' })}
            value={`${mcpToolCount}`}
            detail={t('vscodeWorkbench.hermes.mcpMissing', { count: missingMcpTools, defaultValue: '{{count}} missing' })}
            ok={mcpToolCount > 0 && missingMcpTools === 0}
          />
          <HermesControlMetric
            icon={History}
            label={t('vscodeWorkbench.hermes.sessions', { defaultValue: 'Sessions' })}
            value={totalSessions.toLocaleString()}
            detail={t('vscodeWorkbench.hermes.cronSummary', { count: activeCronJobs, total: totalCronJobs, defaultValue: '{{count}}/{{total}} cron active' })}
            ok={totalSessions > 0 || totalCronJobs > 0}
          />
        </div>

        <div className="mt-3 rounded-md border border-border bg-card/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('vscodeWorkbench.hermes.profile', { defaultValue: 'Profile' })}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">
                {activeProfile?.name || controlPlane?.activeProfile || t('vscodeWorkbench.hermes.unknown', { defaultValue: 'Unknown' })}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={activeProfile?.path}>
                {activeProfile?.path || '-'}
              </div>
            </div>
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
              activeProfile?.auth?.configured
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-200',
            )}>
              {activeProfile?.auth?.configured
                ? t('vscodeWorkbench.hermes.authReady', { defaultValue: 'Auth ready' })
                : t('vscodeWorkbench.hermes.authMissing', { defaultValue: 'Auth missing' })}
            </span>
          </div>
          <div className="mt-2 truncate text-[11px] text-muted-foreground">
            {modelLabel || t('vscodeWorkbench.hermes.modelNotSelected', { defaultValue: 'No model selected' })}
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1.5 rounded bg-emerald-600 px-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={isInstalled ? onStartHermes : onInstall}
            disabled={repairing}
          >
            {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HermesLogo className="h-3.5 w-3.5" />}
            {isInstalled
              ? t('vscodeWorkbench.hermes.start', { defaultValue: 'Start Hermes' })
              : t('vscodeWorkbench.hermes.install', { defaultValue: 'Install' })}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <HermesControlAction icon={Plus} label={t('vscodeWorkbench.hermes.newSession', { defaultValue: 'New Hermes session' })} onClick={onNewSession} disabled={!isInstalled} />
            <HermesControlAction icon={History} label={t('vscodeWorkbench.hermes.history', { defaultValue: 'Hermes history' })} onClick={onHistory} disabled={!isInstalled} />
            <HermesControlAction icon={Settings} label={t('vscodeWorkbench.hermes.modelSettings', { defaultValue: 'Hermes model' })} onClick={onModel} disabled={!isInstalled} />
            <HermesControlAction icon={Workflow} label={t('vscodeWorkbench.hermes.cronJobs', { defaultValue: 'Hermes cron' })} onClick={onCron} disabled={!isInstalled} />
            <HermesControlAction icon={Server} label={t('vscodeWorkbench.hermes.deepStatus', { defaultValue: 'Hermes status' })} onClick={onStatus} disabled={!isInstalled} />
            <HermesControlAction icon={RefreshCw} label={t('vscodeWorkbench.hermes.repairControl', { defaultValue: 'Repair control' })} onClick={onRepair} disabled={!isInstalled || repairing} loading={repairing} />
          </div>
        </div>

        {capabilities.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('vscodeWorkbench.hermes.capabilities', { defaultValue: 'Capabilities' })}
            </div>
            {capabilities.map((capability) => (
              <div key={capability.id || capability.label} className="flex items-start gap-2 rounded border border-border bg-card/50 px-2.5 py-2">
                {capability.ready ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground">{capability.label}</div>
                  {capability.detail && (
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {capability.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {recentSessions.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('vscodeWorkbench.hermes.recentSessions', { defaultValue: 'Recent sessions' })}
            </div>
            {recentSessions.slice(0, 3).map((session) => (
              <div key={session.id || session.startedAt} className="rounded border border-border bg-card/50 px-2.5 py-2">
                <div className="truncate text-xs font-medium text-foreground">
                  {session.title || session.id || t('mainContent.untitledSession', { defaultValue: 'Untitled Session' })}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {session.model || session.source || '-'} - {session.messageCount ?? 0} msg
                </div>
              </div>
            ))}
          </div>
        )}

        {recentCronJobs.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('vscodeWorkbench.hermes.cronJobs', { defaultValue: 'Hermes cron' })}
            </div>
            {recentCronJobs.slice(0, 3).map((job) => (
              <div key={job.id || job.name} className="rounded border border-border bg-card/50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{job.name || job.id}</span>
                  <span className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                    job.state === 'active'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {job.state || (job.enabled ? 'active' : 'paused')}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {job.schedule || '-'}
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('vscodeWorkbench.hermes.recommendations', { defaultValue: 'Recommendations' })}
            </div>
            {recommendations.slice(0, 3).map((recommendation) => (
              <div key={recommendation} className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-200">
                {recommendation}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HermesControlMetric({
  icon: Icon,
  label,
  value,
  detail,
  ok,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  detail?: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn(
        'mt-1 truncate text-sm font-semibold',
        ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300',
      )}>
        {value}
      </div>
      {detail && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

function HermesControlAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  loading = false,
}: {
  icon: IconComponent;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded border border-border px-2 text-[11px] font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
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
  void t;

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <FileTree selectedProject={selectedProject} onFileOpen={onFileOpen} />
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
  onOpenHermesAgent,
  onShowSettings,
  t,
}: {
  projects: Project[];
  onProjectSelect: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onOpenProject: () => void;
  onCloneProject: () => void;
  onQuickStartSession?: () => void | Promise<void>;
  onOpenHermesAgent: () => void;
  onShowSettings: () => void;
  t: TFunction<'common'>;
}) {
  const recentProjects = projects.slice(0, 6);
  const welcomeActionCards = 'grid gap-2';
  const welcomeAppearancePanel = 'mt-4 rounded-md border border-border bg-card/70 p-3 sm:p-4';

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <section className="min-w-0">
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Pixcode
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {t('vscodeWorkbench.welcome.title', { defaultValue: 'Hoş geldin' })}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('vscodeWorkbench.welcome.description', {
                defaultValue: 'Bir proje aç, GitHub’dan klonla veya Hermes’i alt terminalde başlat.',
              })}
            </p>
          </div>

          <div
            className={welcomeActionCards}
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
          >
            <button
              type="button"
              onClick={onOpenProject}
              className="group flex min-h-24 flex-col items-start justify-between rounded-md border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
            >
              <FolderOpen className="h-5 w-5 text-blue-400" />
              <span className="mt-4 text-sm font-semibold text-foreground">
                {t('vscodeWorkbench.welcome.openProject', { defaultValue: 'Proje Aç' })}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('vscodeWorkbench.welcome.openProjectDescription', { defaultValue: 'Yerel klasörü workspace olarak bağla.' })}
              </span>
            </button>

            <button
              type="button"
              onClick={onCloneProject}
              className="group flex min-h-24 flex-col items-start justify-between rounded-md border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
            >
              <Github className="h-5 w-5 text-foreground" />
              <span className="mt-4 text-sm font-semibold text-foreground">
                {t('vscodeWorkbench.welcome.cloneProject', { defaultValue: 'Klonla' })}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('vscodeWorkbench.welcome.cloneProjectDescription', { defaultValue: 'GitHub reposunu seçtiğin klasöre çek.' })}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenHermesAgent}
              className="group flex min-h-24 flex-col items-start justify-between rounded-md border border-emerald-700/70 bg-emerald-950/20 p-4 text-left transition hover:border-emerald-400/70 hover:bg-emerald-950/30"
            >
              <HermesLogo className="h-5 w-5" />
              <span className="mt-4 text-sm font-semibold text-foreground">
                {t('vscodeWorkbench.welcome.startHermes', { defaultValue: 'Hermes’i Başlat' })}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('vscodeWorkbench.welcome.startHermesDescription', { defaultValue: 'Aktif projede agent terminalini aç.' })}
              </span>
            </button>
          </div>

          <div className={welcomeAppearancePanel}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {t('vscodeWorkbench.welcome.appearanceTitle', { defaultValue: 'Görünüm' })}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('vscodeWorkbench.welcome.appearanceDescription', { defaultValue: 'Pixcode koyu modla başlar; gerekirse açık moda geçebilirsin.' })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2">
                  <span className="text-xs font-medium text-foreground">
                    {t('vscodeWorkbench.welcome.darkMode', { defaultValue: 'Koyu mod' })}
                  </span>
                  <DarkModeToggle ariaLabel={t('vscodeWorkbench.welcome.themeToggle', { defaultValue: 'Tema modunu değiştir' })} />
                </div>
                <button
                  type="button"
                  onClick={onShowSettings}
                  className="inline-flex items-center justify-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Settings className="h-3.5 w-3.5" />
                  {t('vscodeWorkbench.welcome.themeSettings', { defaultValue: 'Tema ayarları' })}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('vscodeWorkbench.welcome.recentProjects', { defaultValue: 'Son projeler' })}
              </h3>
              {onQuickStartSession && (
                <button
                  type="button"
                  onClick={() => { void onQuickStartSession(); }}
                  className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t('vscodeWorkbench.welcome.newChat', { defaultValue: 'Yeni sohbet' })}
                </button>
              )}
            </div>

            {recentProjects.length > 0 ? (
              <div className="grid gap-2 xl:grid-cols-2">
                {recentProjects.map((project) => (
                  <div
                    key={project.name}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer rounded-md border border-border bg-card/60 p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
          </div>
        </section>
      </div>
    </div>
  );
}

const cliProviders: Array<{ id: LLMProvider; label: string }> = CLI_PROVIDER_IDS.map((id) => ({
  id,
  label: PROVIDER_DISPLAY_NAMES[id] ?? id,
}));

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
  hermesCliLaunch,
  onSessionSelect,
  onHeaderContentChange,
  t,
}: {
  project: Project | null;
  session: ProjectSession | null;
  hermesCliLaunch: HermesTerminalLaunchEvent | null;
  onSessionSelect: (session: ProjectSession) => void;
  onHeaderContentChange: (content: ReactNode | null) => void;
  t: TFunction<'common'>;
}) {
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(() => {
    if (typeof window === 'undefined') return 'claude';
    const saved = window.localStorage.getItem('selected-provider') as LLMProvider | null;
    return cliProviders.some((provider) => provider.id === saved) ? saved as LLMProvider : 'claude';
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [terminalSession, setTerminalSession] = useState<ProjectSession | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [pendingFreshSession, setPendingFreshSession] = useState(false);
  const [terminalMode, setTerminalMode] = useState<WorkbenchCliTerminalMode>('provider');
  const [terminalStartupInput, setTerminalStartupInput] = useState<string | null>(null);
  const [terminalHermesLaunchId, setTerminalHermesLaunchId] = useState<number | null>(null);
  const [terminalPermissionOverride, setTerminalPermissionOverride] = useState<ShellPermissionOverride | null>(null);
  const [terminalLaunch] = useState({
    runId: 0,
    forceNewSession: false,
  });
  const [cliTabs, setCliTabs] = useState<WorkbenchCliTab[]>([]);
  const [activeCliTabId, setActiveCliTabId] = useState<string | null>(null);
  const [installState, setInstallState] = useState<ProviderInstallState>({
    provider: null,
    state: 'idle',
    log: '',
    error: null,
  });
  const installEventSourceRef = useRef<EventSource | null>(null);
  const {
    providerAuthStatus,
    refreshProviderAuthStatuses,
  } = useProviderAuthStatus({ initialLoading: false });
  const projectSessions = useMemo(() => getProjectCliSessions(project), [project]);
  const selectedProviderStatus = providerAuthStatus[selectedProvider];
  const sessionForShell = terminalSession?.__provider === selectedProvider ? terminalSession : null;
  const activeCliTab = cliTabs.find((tab) => tab.id === activeCliTabId) || cliTabs[0] || null;
  const activeHistorySessionId = terminalSession?.id ?? session?.id ?? null;
  const canStartSelectedProvider = Boolean(project && selectedProviderStatus?.installed !== false && installState.state !== 'running');
  const canAutoConnect = Boolean((isTerminalOpen || cliTabs.length > 0) && terminalMode === 'provider' && canStartSelectedProvider);
  const projectCliStateKey = useMemo(() => getProjectCliStateKey(project), [project]);
  const lastRestoredProjectKeyRef = useRef<string | null>(null);
  const lastHermesCliLaunchIdRef = useRef(0);

  const createCliTabTitle = useCallback((provider: LLMProvider, currentTabs = cliTabs) => {
    const base = PROVIDER_DISPLAY_NAMES[provider] ?? provider;
    const count = currentTabs.filter((tab) => tab.provider === provider).length + 1;
    return `${base} #${count}`;
  }, [cliTabs]);

  const openCliTab = useCallback((input: Omit<WorkbenchCliTab, 'id' | 'title'> & { title?: string }) => {
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCliTabs((currentTabs) => {
      const nextTab: WorkbenchCliTab = {
        ...input,
        id,
        title: input.title || createCliTabTitle(input.provider, currentTabs),
      };
      return [...currentTabs, nextTab];
    });
    setActiveCliTabId(id);
    setIsTerminalOpen(true);
    setTerminalMode('provider');
    return id;
  }, [createCliTabTitle]);

  const renameCliTab = useCallback((tabId: string) => {
    const tab = cliTabs.find((item) => item.id === tabId);
    if (!tab) return;
    const nextTitle = window.prompt('CLI tab name', tab.title)?.trim();
    if (!nextTitle) return;
    setCliTabs((currentTabs) => currentTabs.map((item) => (
      item.id === tabId ? { ...item, title: nextTitle } : item
    )));
  }, [cliTabs]);

  const closeCliTab = useCallback((tabId: string) => {
    setCliTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (activeCliTabId === tabId) {
        setActiveCliTabId(nextTabs[nextTabs.length - 1]?.id || null);
      }
      if (nextTabs.length === 0) {
        setIsTerminalOpen(false);
      }
      return nextTabs;
    });
  }, [activeCliTabId]);

  const openProviderPickerForNewTab = useCallback(() => {
    setShowHistory(false);
    setShowProviderPicker(true);
  }, []);

  const cliHeaderTabs = useMemo(() => (
    <div className="flex min-w-0 items-center gap-1">
      {cliTabs.length === 0 && (
        <div className="flex min-w-0 items-center gap-1 pr-1">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('vscodeWorkbench.panels.cli')}
          </span>
        </div>
      )}
      {cliTabs.length > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cliTabs.map((tab) => {
            const isActive = tab.id === (activeCliTab?.id || activeCliTabId);
            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex h-7 min-w-[112px] max-w-[200px] shrink-0 items-center gap-1.5 rounded border px-2 text-[11px]',
                  isActive
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => setActiveCliTabId(tab.id)}
                  onDoubleClick={() => renameCliTab(tab.id)}
                  title="Double-click to rename"
                >
                  <SessionProviderLogo provider={tab.provider} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tab.title}</span>
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeCliTab(tab.id);
                  }}
                  aria-label="Close CLI tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        disabled={!project || installState.state === 'running'}
        onClick={openProviderPickerForNewTab}
        title="New CLI tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  ), [activeCliTab?.id, activeCliTabId, cliTabs, closeCliTab, installState.state, openProviderPickerForNewTab, project, renameCliTab, t]);

  useEffect(() => {
    onHeaderContentChange(cliHeaderTabs);
    return () => onHeaderContentChange(null);
  }, [cliHeaderTabs, onHeaderContentChange]);

  useEffect(() => {
    const providers = cliProviders.map((provider) => provider.id);
    void refreshProviderAuthStatuses(providers);
  }, [refreshProviderAuthStatuses]);

  useEffect(() => {
    if (lastRestoredProjectKeyRef.current === projectCliStateKey) {
      return;
    }

    lastRestoredProjectKeyRef.current = projectCliStateKey;
    setShowHistory(false);
    setPendingFreshSession(false);
    setTerminalMode('provider');
    setTerminalPermissionOverride(null);
    setCliTabs([]);
    setActiveCliTabId(null);

    const savedState = readWorkbenchCliState(projectCliStateKey);
    if (!savedState) {
      setIsTerminalOpen(false);
      setTerminalSession(null);
      return;
    }

    setSelectedProvider(savedState.provider);
    window.localStorage.setItem('selected-provider', savedState.provider);
    const restoredSession = savedState.sessionId
      ? projectSessions.find((item) => item.id === savedState.sessionId && item.__provider === savedState.provider) ?? null
      : null;
    setTerminalSession(restoredSession);
    setIsTerminalOpen(savedState.isTerminalOpen);
    if (savedState.isTerminalOpen) {
      openCliTab({
        provider: savedState.provider,
        session: restoredSession,
        runId: Date.now(),
        forceNewSession: false,
        startupInput: null,
        hermesLaunchId: null,
        permissionOverride: null,
      });
    }
  }, [openCliTab, projectCliStateKey, projectSessions]);

  useEffect(() => {
    return () => {
      try { installEventSourceRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  const persistCliState = useCallback((nextState: Omit<WorkbenchCliProjectState, 'updatedAt'>) => {
    writeWorkbenchCliState(projectCliStateKey, {
      ...nextState,
      updatedAt: Date.now(),
    });
  }, [projectCliStateKey]);

  const selectProvider = useCallback((provider: LLMProvider) => {
    const status = providerAuthStatus[provider];
    if (status?.installed === false) {
      return;
    }

    setTerminalMode('provider');
    setTerminalPermissionOverride(null);
    setSelectedProvider(provider);
    window.localStorage.setItem('selected-provider', provider);
    persistCliState({
      provider,
      isTerminalOpen,
      sessionId: terminalSession?.id ?? null,
    });
  }, [isTerminalOpen, persistCliState, providerAuthStatus, terminalSession?.id]);

  const startProviderInstall = useCallback(async (provider: LLMProvider) => {
    setInstallState({
      provider,
      state: 'running',
      log: '',
      error: null,
    });

    try { installEventSourceRef.current?.close(); } catch { /* noop */ }
    installEventSourceRef.current = null;

    try {
      const response = await authenticatedFetch(`/api/providers/${provider}/install`, {
        method: 'POST',
        body: '{}',
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      if (body.data?.manual) {
        throw new Error(body.data?.message || t('vscodeWorkbench.cli.manualInstall', {
          defaultValue: 'This CLI needs manual installation.',
        }));
      }

      const jobId = body.data?.jobId;
      if (!jobId) {
        throw new Error(t('vscodeWorkbench.cli.installNoJob', {
          defaultValue: 'Install did not return a job id.',
        }));
      }

      const token = window.localStorage.getItem('auth-token') || '';
      const streamUrl = `/api/providers/${provider}/install/${jobId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const stream = new EventSource(streamUrl);
      installEventSourceRef.current = stream;

      stream.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          if (typeof payload.chunk === 'string') {
            setInstallState((current) => ({
              ...current,
              log: `${current.log}${payload.chunk}`,
            }));
          }
        } catch {
          // Ignore malformed stream frames.
        }
      });

      stream.addEventListener('done', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          if (!payload.success) {
            throw new Error(payload.error || t('vscodeWorkbench.cli.installFailed', {
              defaultValue: 'Install failed.',
            }));
          }

          setInstallState((current) => ({
            ...current,
            state: 'done',
            error: null,
          }));
          void refreshProviderAuthStatuses([provider], { force: true });
          setSelectedProvider(provider);
          window.localStorage.setItem('selected-provider', provider);
        } catch (error) {
          setInstallState((current) => ({
            ...current,
            state: 'error',
            error: error instanceof Error ? error.message : t('vscodeWorkbench.cli.installFailed', {
              defaultValue: 'Install failed.',
            }),
          }));
        } finally {
          try { stream.close(); } catch { /* noop */ }
          installEventSourceRef.current = null;
        }
      });

      stream.onerror = () => {
        setInstallState((current) => (
          current.state === 'running'
            ? {
                ...current,
                state: 'error',
                error: t('vscodeWorkbench.cli.installStreamLost', {
                  defaultValue: 'Install stream closed early. The install may still be running.',
                }),
              }
            : current
        ));
      };
    } catch (error) {
      setInstallState({
        provider,
        state: 'error',
        log: '',
        error: error instanceof Error ? error.message : t('vscodeWorkbench.cli.installFailed', {
          defaultValue: 'Install failed.',
        }),
      });
    }
  }, [refreshProviderAuthStatuses, t]);

  const startTerminalForProvider = useCallback((provider: LLMProvider, { forceNewSession = false }: { forceNewSession?: boolean } = {}) => {
    if (!project) return;
    const status = providerAuthStatus[provider];
    if (status?.installed === false || installState.state === 'running') return;
    setTerminalMode('provider');
    setTerminalStartupInput(null);
    setTerminalHermesLaunchId(null);
    setTerminalPermissionOverride(null);
    setTerminalSession(null);
    setShowHistory(false);
    setShowProviderPicker(false);
    setPendingFreshSession(false);
    setSelectedProvider(provider);
    window.localStorage.setItem('selected-provider', provider);
    setIsTerminalOpen(true);
    openCliTab({
      provider,
      session: null,
      runId: Date.now(),
      forceNewSession,
      startupInput: null,
      hermesLaunchId: null,
      permissionOverride: null,
    });
    persistCliState({
      provider,
      isTerminalOpen: true,
      sessionId: null,
    });
  }, [installState.state, openCliTab, persistCliState, project, providerAuthStatus]);

  const startTerminal = useCallback(({ forceNewSession = false }: { forceNewSession?: boolean } = {}) => {
    startTerminalForProvider(selectedProvider, { forceNewSession });
  }, [selectedProvider, startTerminalForProvider]);

  const startSelectedCliSession = useCallback(() => {
    startTerminal({ forceNewSession: pendingFreshSession });
  }, [pendingFreshSession, startTerminal]);

  useEffect(() => {
    if (!hermesCliLaunch || lastHermesCliLaunchIdRef.current === hermesCliLaunch.id) {
      return;
    }

    lastHermesCliLaunchIdRef.current = hermesCliLaunch.id;
    const provider = hermesCliLaunch.provider;
    if (!CLI_PROVIDER_IDS.includes(provider)) {
      return;
    }
    const launchBypass = hermesCliLaunch.bypassPermissions === true || hermesCliLaunch.skipPermissions === true;
    const launchPermissionMode = typeof hermesCliLaunch.permissionMode === 'string' && hermesCliLaunch.permissionMode.trim()
      ? hermesCliLaunch.permissionMode.trim()
      : (launchBypass ? 'bypassPermissions' : null);

    setTerminalMode('provider');
    setSelectedProvider(provider);
    setTerminalStartupInput(hermesCliLaunch.startupInput || null);
    setTerminalHermesLaunchId(hermesCliLaunch.id);
    setTerminalPermissionOverride(launchPermissionMode || launchBypass ? {
      permissionMode: launchPermissionMode,
      skipPermissions: launchBypass,
    } : null);
    window.localStorage.setItem('selected-provider', provider);
    setTerminalSession(null);
    setShowHistory(false);
    setPendingFreshSession(false);
    setIsTerminalOpen(true);
    openCliTab({
      provider,
      session: null,
      runId: Date.now(),
      forceNewSession: hermesCliLaunch.forceNewSession === true,
      startupInput: hermesCliLaunch.startupInput || null,
      hermesLaunchId: hermesCliLaunch.id,
      permissionOverride: launchPermissionMode || launchBypass ? {
        permissionMode: launchPermissionMode,
        skipPermissions: launchBypass,
      } : null,
    });
    persistCliState({
      provider,
      isTerminalOpen: true,
      sessionId: null,
    });
  }, [hermesCliLaunch, openCliTab, persistCliState]);

  const closeTerminal = useCallback(() => {
    if (activeCliTabId) {
      closeCliTab(activeCliTabId);
      return;
    }
    setTerminalMode('provider');
    setTerminalStartupInput(null);
    setTerminalHermesLaunchId(null);
    setTerminalPermissionOverride(null);
    setShowHistory(false);
    setIsTerminalOpen(false);
    setPendingFreshSession(false);
    persistCliState({
      provider: selectedProvider,
      isTerminalOpen: false,
      sessionId: terminalSession?.id ?? null,
    });
  }, [activeCliTabId, closeCliTab, persistCliState, selectedProvider, terminalSession?.id]);

  const handleHistorySessionSelect = useCallback((nextSession: ProjectSession) => {
    const provider = nextSession.__provider ?? 'claude';
    setTerminalMode('provider');
    setTerminalStartupInput(null);
    setTerminalHermesLaunchId(null);
    setTerminalPermissionOverride(null);
    setSelectedProvider(provider);
    window.localStorage.setItem('selected-provider', provider);
    setTerminalSession(nextSession);
    onSessionSelect(nextSession);
    setShowHistory(false);
    setPendingFreshSession(false);
    setIsTerminalOpen(true);
    openCliTab({
      provider,
      session: nextSession,
      runId: Date.now(),
      forceNewSession: false,
      startupInput: null,
      hermesLaunchId: null,
      permissionOverride: null,
      title: getSessionTitle(nextSession).slice(0, 32),
    });
    persistCliState({
      provider,
      isTerminalOpen: true,
      sessionId: nextSession.id,
    });
  }, [onSessionSelect, openCliTab, persistCliState]);

  if (isTerminalOpen || cliTabs.length > 0) {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
        <WorkbenchCliPanelToolbar
          project={project}
          provider={activeCliTab?.provider || selectedProvider}
          session={activeCliTab?.session || sessionForShell}
          historyCount={projectSessions.length}
          historyOpen={showHistory}
          canStart={canStartSelectedProvider}
          onToggleHistory={() => setShowHistory((previous) => !previous)}
          onNewSession={openProviderPickerForNewTab}
          onCloseTerminal={closeTerminal}
          t={t}
        />

        {showHistory && (
          <div className="absolute inset-x-2 top-10 z-30 max-h-[48%] overflow-hidden rounded-md border border-gray-800 bg-gray-950 shadow-2xl shadow-black/40">
            <WorkbenchSessionHistory
              sessions={projectSessions}
              activeSessionId={activeHistorySessionId}
              onSessionSelect={handleHistorySessionSelect}
              t={t}
            />
          </div>
        )}

        {showProviderPicker && (
          <div className="absolute inset-x-2 top-10 z-30 max-h-[58%] overflow-hidden rounded-md border border-gray-800 bg-gray-950 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-gray-800 px-2.5 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">New CLI tab</div>
              <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100" onClick={() => setShowProviderPicker(false)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid max-h-72 gap-1 overflow-y-auto p-2">
              {cliProviders.map((provider) => {
                const status = providerAuthStatus[provider.id];
                const isLocked = status?.installed === false;
                const isInstalling = installState.provider === provider.id && installState.state === 'running';
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 rounded border px-2 py-2 text-left transition-colors',
                      isLocked
                        ? 'border-amber-800/70 bg-amber-950/30 text-amber-100'
                        : 'border-gray-800 bg-gray-900 text-gray-200 hover:border-blue-500/60 hover:bg-blue-500/10',
                    )}
                    onClick={() => {
                      if (isLocked) {
                        void startProviderInstall(provider.id);
                        return;
                      }
                      startTerminalForProvider(provider.id, { forceNewSession: true });
                    }}
                  >
                    <SessionProviderLogo provider={provider.id} className={cn('h-4 w-4 shrink-0', isLocked && 'opacity-70 grayscale')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold">{provider.label}</span>
                      <span className="block truncate text-[10px] text-gray-500">
                        {isInstalling ? 'Installing...' : isLocked ? 'Install first' : 'Open new tab'}
                      </span>
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {cliTabs.length === 0 ? (
            <StandaloneShell
              key={`${selectedProvider}-${sessionForShell?.id || 'new'}-${project?.name || 'none'}-${terminalLaunch.runId}`}
              project={project}
              session={sessionForShell}
              provider={selectedProvider}
              forceNewSession={terminalLaunch.forceNewSession}
              startupInput={terminalStartupInput}
              hermesLaunchId={terminalHermesLaunchId}
              permissionOverride={terminalPermissionOverride}
              showHeader
              autoConnect={canAutoConnect}
              isActive
              onClose={closeTerminal}
            />
          ) : cliTabs.map((tab) => (
            <div key={tab.id} className={cn('absolute inset-0', tab.id === activeCliTab?.id ? 'block' : 'hidden')}>
              <StandaloneShell
                key={`${tab.id}-${tab.runId}`}
                project={project}
                session={tab.session}
                provider={tab.provider}
                forceNewSession={tab.forceNewSession}
                startupInput={tab.startupInput}
                hermesLaunchId={tab.hermesLaunchId}
                permissionOverride={tab.permissionOverride}
                showHeader
                autoConnect={canAutoConnect}
                isActive={tab.id === activeCliTab?.id}
                onClose={() => closeCliTab(tab.id)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
      <div className="flex min-h-0 flex-1 flex-col border-b border-gray-800 bg-gray-900/95 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-gray-100">
              {project?.displayName || project?.name || t('vscodeWorkbench.noProject')}
            </div>
            <div className="text-[11px] text-gray-400">
              {t('vscodeWorkbench.cli.chooseDescription', { defaultValue: 'Choose a CLI, then start a full-height terminal.' })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!canStartSelectedProvider}
              onClick={startSelectedCliSession}
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
        <div className="mb-2 flex items-center gap-2 rounded border border-gray-800 bg-gray-950 px-2.5 py-2">
          <Terminal className="h-4 w-4 shrink-0 text-blue-300" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-gray-200">
              {t('vscodeWorkbench.cli.chooseTitle', { defaultValue: 'Start a CLI terminal' })}
            </div>
            <div className="truncate text-[10px] text-gray-500">
              {t('vscodeWorkbench.cli.projectScoped', { defaultValue: 'Project-scoped CLI terminal' })}
            </div>
          </div>
        </div>
        <div className="grid min-h-0 gap-1.5 overflow-y-auto pr-1">
          {cliProviders.map((provider) => {
            const status = providerAuthStatus[provider.id];
            const isSelected = selectedProvider === provider.id;
            const isLocked = status?.installed === false;
            const isChecking = Boolean(status?.loading);
            const isInstalling = installState.provider === provider.id && installState.state === 'running';
            const hasUpdate = Boolean(status?.updateAvailable && status.latestVersion && !isLocked);
            const statusText = isInstalling
              ? t('vscodeWorkbench.cli.installing', { defaultValue: 'Installing...' })
              : isChecking
                ? t('vscodeWorkbench.cli.checking', { defaultValue: 'Checking...' })
                : isLocked
                  ? t('vscodeWorkbench.cli.notInstalled', { defaultValue: 'Not installed' })
                  : hasUpdate
                    ? t('vscodeWorkbench.cli.updateAvailable', {
                        version: status?.latestVersion,
                        defaultValue: 'Update {{version}}',
                      })
                    : status?.installedVersion || t('vscodeWorkbench.cli.ready', { defaultValue: 'Ready' });

            return (
              <div
                key={provider.id}
                className={cn(
                  'group flex min-w-0 items-center gap-2 rounded border px-2 py-2 transition-colors',
                  isSelected && !isLocked
                    ? 'border-blue-500 bg-blue-500/15 text-blue-100'
                    : 'border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-700 hover:bg-gray-800',
                  isLocked && 'border-amber-800/70 bg-amber-950/30 text-amber-100',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    if (isLocked) {
                      void startProviderInstall(provider.id);
                      return;
                    }
                    selectProvider(provider.id);
                  }}
                  title={PROVIDER_DISPLAY_NAMES[provider.id] ?? provider.label}
                >
                  <SessionProviderLogo provider={provider.id} className={cn('h-4 w-4 shrink-0', isLocked && 'opacity-70 grayscale')} />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold">{provider.label}</div>
                    <div className={cn(
                      'truncate text-[10px]',
                      isLocked ? 'text-amber-300' : hasUpdate ? 'text-amber-200' : 'text-gray-500',
                    )}
                    >
                      {statusText}
                    </div>
                  </div>
                  {isSelected && !isLocked && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-200" />}
                </button>

                {(isLocked || hasUpdate) && (
                  <button
                    type="button"
                    disabled={isInstalling}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-800 text-amber-200 hover:bg-gray-700 disabled:opacity-50"
                    onClick={() => void startProviderInstall(provider.id)}
                    aria-label={isLocked
                      ? t('vscodeWorkbench.cli.installProvider', { provider: provider.label, defaultValue: 'Install {{provider}}' })
                      : t('vscodeWorkbench.cli.updateProvider', { provider: provider.label, defaultValue: 'Update {{provider}}' })}
                    title={isLocked
                      ? t('vscodeWorkbench.cli.installProvider', { provider: provider.label, defaultValue: 'Install {{provider}}' })
                      : t('vscodeWorkbench.cli.updateProvider', { provider: provider.label, defaultValue: 'Update {{provider}}' })}
                  >
                    {isInstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isLocked ? <Download className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {showHistory && (
          <WorkbenchSessionHistory
            sessions={projectSessions}
            activeSessionId={activeHistorySessionId}
            onSessionSelect={handleHistorySessionSelect}
            t={t}
          />
        )}

        {(installState.state === 'running' || installState.state === 'done' || installState.state === 'error') && (
          <div className="mt-2 rounded border border-gray-800 bg-gray-950 p-2">
            <div className="flex items-center gap-2 text-[11px] text-gray-300">
              {installState.state === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />}
              {installState.state === 'done' && <Check className="h-3.5 w-3.5 text-emerald-300" />}
              {installState.state === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-300" />}
              <span className="truncate">
                {installState.provider ? PROVIDER_DISPLAY_NAMES[installState.provider] : t('vscodeWorkbench.cli.provider', { defaultValue: 'Provider' })}
                {' '}
                {installState.state === 'running'
                  ? t('vscodeWorkbench.cli.installRunning', { defaultValue: 'is installing' })
                  : installState.state === 'done'
                    ? t('vscodeWorkbench.cli.installDone', { defaultValue: 'is ready' })
                    : t('vscodeWorkbench.cli.installError', { defaultValue: 'needs attention' })}
              </span>
            </div>
            {installState.error && (
              <div className="mt-1 text-[11px] text-red-300">{installState.error}</div>
            )}
            {installState.log && (
              <pre className="mt-2 max-h-20 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-gray-300">
                {installState.log}
              </pre>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={!canStartSelectedProvider}
          onClick={startSelectedCliSession}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
        >
          <Terminal className="h-4 w-4" />
          {t('vscodeWorkbench.cli.startSelected', {
            provider: PROVIDER_DISPLAY_NAMES[selectedProvider] ?? selectedProvider,
            defaultValue: 'Start {{provider}}',
          })}
        </button>
      </div>
    </div>
  );
}

function WorkbenchCliPanelToolbar({
  project,
  provider,
  session,
  historyCount,
  historyOpen,
  canStart,
  onToggleHistory,
  onNewSession,
  onCloseTerminal,
  t,
}: {
  project: Project | null;
  provider: LLMProvider;
  session: ProjectSession | null;
  historyCount: number;
  historyOpen: boolean;
  canStart: boolean;
  onToggleHistory: () => void;
  onNewSession: () => void;
  onCloseTerminal: () => void;
  t: TFunction<'common'>;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-gray-800 bg-gray-900/95 px-2">
      <div className="flex min-w-0 items-center gap-2">
        <SessionProviderLogo provider={provider} className="h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-gray-100">
            {PROVIDER_DISPLAY_NAMES[provider] ?? provider}
          </div>
          <div className="truncate text-[10px] text-gray-500">
            {session
              ? getSessionTitle(session)
              : project?.displayName || project?.name || t('vscodeWorkbench.cli.newSession', { defaultValue: 'New CLI session' })}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn(
            'relative rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50',
            historyOpen && 'bg-gray-800',
          )}
          disabled={!project}
          onClick={onToggleHistory}
          title={t('vscodeWorkbench.cli.history', { defaultValue: 'History' })}
          aria-label={t('vscodeWorkbench.cli.history', { defaultValue: 'History' })}
        >
          <History className="h-3.5 w-3.5" />
          {historyCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[8px] font-semibold text-white">
              {Math.min(historyCount, 9)}
            </span>
          )}
        </button>
        <button
          type="button"
          className="rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          disabled={!canStart}
          onClick={onNewSession}
          title={t('vscodeWorkbench.cli.newSession', { defaultValue: 'New CLI session' })}
          aria-label={t('vscodeWorkbench.cli.newSession', { defaultValue: 'New CLI session' })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded border border-gray-700 p-1.5 text-gray-200 hover:bg-gray-800"
          onClick={onCloseTerminal}
          title={t('vscodeWorkbench.cli.closeTerminal', { defaultValue: 'Close CLI terminal' })}
          aria-label={t('vscodeWorkbench.cli.closeTerminal', { defaultValue: 'Close CLI terminal' })}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function WorkbenchSessionHistory({
  sessions,
  activeSessionId,
  onSessionSelect,
  t,
}: {
  sessions: ProjectSession[];
  activeSessionId: string | null;
  onSessionSelect: (session: ProjectSession) => void;
  t: TFunction<'common'>;
}) {
  const sortedSessions = useMemo(() => (
    [...sessions].sort((first, second) => {
      const firstTime = getSessionTimestamp(first);
      const secondTime = getSessionTimestamp(second);
      return new Date(secondTime || 0).getTime() - new Date(firstTime || 0).getTime();
    })
  ), [sessions]);

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-2.5 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {t('vscodeWorkbench.cli.projectHistory', { defaultValue: 'Project history' })}
        </div>
        <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
          {sessions.length}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto p-1.5">
        {sortedSessions.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] leading-5 text-gray-500">
            {t('vscodeWorkbench.cli.noHistory', { defaultValue: 'No sessions for this project yet.' })}
          </div>
        ) : (
          sortedSessions.map((item) => {
            const active = activeSessionId === item.id;
            const provider = item.__provider ?? 'claude';
            return (
              <button
                key={`${provider}-${item.id}`}
                type="button"
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded px-2.5 py-2 text-left transition-colors hover:bg-gray-900',
                  active && 'bg-blue-500/15 text-blue-100',
                )}
                onClick={() => onSessionSelect(item)}
                title={getSessionTitle(item)}
              >
                <SessionProviderLogo provider={provider} className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-gray-200">{getSessionTitle(item)}</div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="truncate">{PROVIDER_DISPLAY_NAMES[provider] ?? provider}</span>
                    {formatSessionTime(item) && <span className="shrink-0">- {formatSessionTime(item)}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
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
      <div className="border-b border-border p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenProject}
            className="flex min-w-0 items-center justify-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('vscodeWorkbench.projects.openProject', { defaultValue: 'Open Project' })}</span>
          </button>
          <button
            type="button"
            onClick={onCloneProject}
            className="flex min-w-0 items-center justify-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Github className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('vscodeWorkbench.projects.cloneFromGithub', { defaultValue: 'Clone' })}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
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
          <div className="space-y-0.5">
            {projects.map((project) => {
              const isSelected = selectedProject?.name === project.name;
              return (
                <div
                  key={project.name}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group w-full cursor-pointer rounded border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
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
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isSelected ? 'bg-primary' : 'bg-muted-foreground/30 group-hover:bg-muted-foreground/60',
                    )}
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {project.displayName || project.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 pl-3.5 text-[10px] text-muted-foreground">
                    <span className="truncate font-mono">{formatProjectPath(project)}</span>
                    <span className="shrink-0">{formatFileCount(project.fileCount, t)}</span>
                  </div>
                  <div className="mt-1.5 flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        onProjectSelect(project);
                        onNewSession(project);
                      }}
                      title={t('vscodeWorkbench.projects.startChat', { defaultValue: 'Chat' })}
                      aria-label={t('vscodeWorkbench.projects.startChat', { defaultValue: 'Chat' })}
                    >
                      <MessageSquare className="h-3 w-3" />
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

function HermesActivityButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active && 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-300',
      )}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {active && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-emerald-500" />}
      <HermesLogo className="h-5 w-5" />
    </button>
  );
}

function HermesLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/hermes-agent.png"
      alt=""
      aria-hidden="true"
      className={cn('rounded object-contain', className)}
    />
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
