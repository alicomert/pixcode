import type { MutableRefObject, RefObject } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import type { LLMProvider, Project, ProjectSession } from '../../../types/app';

export type AuthCopyStatus = 'idle' | 'copied' | 'failed';

export type ShellInitMessage = {
  type: 'init';
  projectPath: string;
  sessionId: string | null;
  tabId: string;
  hasSession: boolean;
  provider: string;
  cols: number;
  rows: number;
  initialCommand: string | null | undefined;
  isPlainShell: boolean;
  forceNewSession: boolean;
  startupInput?: string | null;
  startupInputDelivery?: 'command' | 'terminal';
  permissionMode?: string;
  skipPermissions?: boolean;
};

export type ShellPermissionOverride = {
  permissionMode?: string | null;
  skipPermissions?: boolean;
};

export type ShellResizeMessage = {
  type: 'resize';
  cols: number;
  rows: number;
};

export type ShellInputMessage = {
  type: 'input';
  data: string;
};

export type ShellStopMessage = {
  type: 'stop';
};

export type ShellOutgoingMessage =
  | ShellInitMessage
  | ShellResizeMessage
  | ShellInputMessage
  | ShellStopMessage;

export type ShellIncomingMessage =
  | { type: 'output'; data: string }
  | { type: 'auth_url'; url?: string }
  | { type: 'url_open'; url?: string }
  | { type: string; [key: string]: unknown };

export type UseShellRuntimeOptions = {
  tabId: string;
  selectedProject: Project | null | undefined;
  selectedSession: ProjectSession | null | undefined;
  initialCommand: string | null | undefined;
  isPlainShell: boolean;
  minimal: boolean;
  autoConnect: boolean;
  forceNewSession: boolean;
  startupInput: string | null | undefined;
  permissionOverride?: ShellPermissionOverride | null;
  provider?: LLMProvider | null;
  isActive?: boolean;
  layoutSignal?: string | number | null;
  isRestarting: boolean;
  onProcessComplete?: ((exitCode: number) => void) | null;
  onOutputRef?: MutableRefObject<(() => void) | null>;
};

export type ShellSharedRefs = {
  wsRef: MutableRefObject<WebSocket | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  tabIdRef: MutableRefObject<string>;
  authUrlRef: MutableRefObject<string>;
  selectedProjectRef: MutableRefObject<Project | null | undefined>;
  selectedSessionRef: MutableRefObject<ProjectSession | null | undefined>;
  initialCommandRef: MutableRefObject<string | null | undefined>;
  isPlainShellRef: MutableRefObject<boolean>;
  forceNewSessionRef: MutableRefObject<boolean>;
  startupInputRef: MutableRefObject<string | null | undefined>;
  permissionOverrideRef: MutableRefObject<ShellPermissionOverride | null | undefined>;
  providerRef: MutableRefObject<LLMProvider | null | undefined>;
  onProcessCompleteRef: MutableRefObject<((exitCode: number) => void) | null | undefined>;
};

export type UseShellRuntimeResult = {
  terminalContainerRef: RefObject<HTMLDivElement>;
  terminalRef: MutableRefObject<Terminal | null>;
  wsRef: MutableRefObject<WebSocket | null>;
  isConnected: boolean;
  isInitialized: boolean;
  isConnecting: boolean;
  authUrl: string;
  authUrlVersion: number;
  connectToShell: () => void;
  disconnectFromShell: () => void;
  openAuthUrlInBrowser: (url?: string) => boolean;
  copyAuthUrlToClipboard: (url?: string) => Promise<boolean>;
};
