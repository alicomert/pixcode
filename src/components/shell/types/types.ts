import type { MutableRefObject, RefObject } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import type { Project, ProjectSession } from '../../../types/app';

export type AuthCopyStatus = 'idle' | 'copied' | 'failed';

export type ShellInitMessage = {
  type: 'init';
  projectPath: string;
  sessionId: string | null;
  hasSession: boolean;
  provider: string;
  cols: number;
  rows: number;
  initialCommand: string | null | undefined;
  isPlainShell: boolean;
  forceNewSession: boolean;
  startupInput?: string | null;
  startupInputDelivery?: 'command' | 'terminal';
  hermesLaunchId?: number | null;
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

export type ShellOutgoingMessage = ShellInitMessage | ShellResizeMessage | ShellInputMessage;

export type ShellIncomingMessage =
  | { type: 'output'; data: string }
  | { type: 'auth_url'; url?: string }
  | { type: 'url_open'; url?: string }
  | { type: string; [key: string]: unknown };

export type UseShellRuntimeOptions = {
  selectedProject: Project | null | undefined;
  selectedSession: ProjectSession | null | undefined;
  initialCommand: string | null | undefined;
  isPlainShell: boolean;
  minimal: boolean;
  autoConnect: boolean;
  forceNewSession: boolean;
  startupInput: string | null | undefined;
  hermesLaunchId?: number | null;
  permissionOverride?: ShellPermissionOverride | null;
  isRestarting: boolean;
  onProcessComplete?: ((exitCode: number) => void) | null;
  onOutputRef?: MutableRefObject<(() => void) | null>;
};

export type ShellSharedRefs = {
  wsRef: MutableRefObject<WebSocket | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  authUrlRef: MutableRefObject<string>;
  selectedProjectRef: MutableRefObject<Project | null | undefined>;
  selectedSessionRef: MutableRefObject<ProjectSession | null | undefined>;
  initialCommandRef: MutableRefObject<string | null | undefined>;
  isPlainShellRef: MutableRefObject<boolean>;
  forceNewSessionRef: MutableRefObject<boolean>;
  startupInputRef: MutableRefObject<string | null | undefined>;
  hermesLaunchIdRef: MutableRefObject<number | null | undefined>;
  permissionOverrideRef: MutableRefObject<ShellPermissionOverride | null | undefined>;
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
