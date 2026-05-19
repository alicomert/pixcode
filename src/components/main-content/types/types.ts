import type { Dispatch, SetStateAction } from 'react';

import type { AppTab, Project, ProjectSession } from '../../../types/app';

export type SessionLifecycleHandler = (sessionId?: string | null) => void;

export type MainContentProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  latestMessage: unknown;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onInputFocusChange: (focused: boolean) => void;
  onSessionActive: SessionLifecycleHandler;
  onSessionInactive: SessionLifecycleHandler;
  onSessionProcessing: SessionLifecycleHandler;
  onSessionNotProcessing: SessionLifecycleHandler;
  processingSessions: Set<string>;
  onReplaceTemporarySession: SessionLifecycleHandler;
  onNavigateToSession: (targetSessionId: string) => void;
  onShowSettings: () => void;
  externalMessageUpdate: number;
  /** Forwarded to the empty-state view so landing cards can create a
   *  pixcode-project-N and open the selected workspace surface. */
  onQuickStartSession?: () => void | Promise<void>;
  onQuickStartOrchestration?: () => void | Promise<void>;
};

export type MainContentHeaderProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  liveViewAvailable?: boolean;
  activeSidePanelTab?: AppTab | null;
  sidePanelMode?: 'split' | 'full';
  canUseSidePanelSplit?: boolean;
  isMobile: boolean;
  onMenuClick: () => void;
  onCloseSidePanel?: () => void;
};

export type MainContentStateViewProps = {
  mode: 'loading' | 'empty';
  isMobile: boolean;
  onMenuClick: () => void;
  /** When set, the empty state can create a pixcode-project-N and open
   *  a focused workspace surface without the project creation wizard. */
  onQuickStartSession?: () => void | Promise<void>;
  onQuickStartOrchestration?: () => void | Promise<void>;
  onOpenControlRoom?: () => void;
};

export type MobileMenuButtonProps = {
  onMenuClick: () => void;
  compact?: boolean;
};
