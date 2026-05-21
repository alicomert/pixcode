import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import type { LLMProvider, Project, ProjectSession } from '../../../types/app';
import { TERMINAL_INIT_DELAY_MS } from '../constants/constants';
import type { ShellPermissionOverride } from '../types/types';
import { getShellWebSocketUrl, parseShellMessage, sendSocketMessage } from '../utils/socket';

const ANSI_ESCAPE_REGEX =
  /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u009D[^\u0007\u009C]*(?:\u0007|\u009C)|\u001B[PX^_][^\u001B]*\u001B\\|[\u0090\u0098\u009E\u009F][^\u009C]*\u009C|\u001B[@-Z\\-_])/g;
const PROCESS_EXIT_REGEX = /Process exited with code (\d+)/;
const GLOBAL_PERMISSION_MODE_KEY = 'permissionMode-global';
const STARTUP_INPUT_BUFFER_LIMIT = 12000;
const STARTUP_INPUT_READY_DELAY_MS = 1400;
const STARTUP_INPUT_FALLBACK_DELAY_MS = 6500;

type ShellPermissionOptions = {
  permissionMode: string;
  skipPermissions: boolean;
};

type UseShellConnectionOptions = {
  wsRef: MutableRefObject<WebSocket | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  selectedProjectRef: MutableRefObject<Project | null | undefined>;
  selectedSessionRef: MutableRefObject<ProjectSession | null | undefined>;
  initialCommandRef: MutableRefObject<string | null | undefined>;
  isPlainShellRef: MutableRefObject<boolean>;
  forceNewSessionRef: MutableRefObject<boolean>;
  startupInputRef: MutableRefObject<string | null | undefined>;
  permissionOverrideRef: MutableRefObject<ShellPermissionOverride | null | undefined>;
  onProcessCompleteRef: MutableRefObject<((exitCode: number) => void) | null | undefined>;
  isInitialized: boolean;
  autoConnect: boolean;
  closeSocket: () => void;
  clearTerminalScreen: () => void;
  setAuthUrl: (nextAuthUrl: string) => void;
  onOutputRef?: MutableRefObject<(() => void) | null>;
};

type UseShellConnectionResult = {
  isConnected: boolean;
  isConnecting: boolean;
  closeSocket: () => void;
  connectToShell: () => void;
  disconnectFromShell: (manual?: boolean) => void;
};

function readJsonRecord(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readGlobalPermissionMode() {
  const mode = window.localStorage.getItem(GLOBAL_PERMISSION_MODE_KEY);
  return typeof mode === 'string' ? mode : 'default';
}

function toGeminiLikePermissionMode(mode: unknown, fallback: string) {
  if (mode === 'yolo' || mode === 'auto_edit' || mode === 'plan' || mode === 'default') {
    return mode;
  }

  if (fallback === 'bypassPermissions' || fallback === 'acceptEdits') {
    return 'yolo';
  }

  if (fallback === 'plan') {
    return 'plan';
  }

  return 'default';
}

function readProviderShellPermissionOptions(provider: LLMProvider | 'plain-shell'): ShellPermissionOptions {
  const globalMode = readGlobalPermissionMode();
  const globalBypass = globalMode === 'bypassPermissions' || globalMode === 'acceptEdits';

  if (provider === 'plain-shell') {
    return { permissionMode: 'default', skipPermissions: false };
  }

  if (provider === 'claude') {
    const settings = readJsonRecord('claude-settings');
    return {
      permissionMode: globalMode,
      skipPermissions: Boolean(settings.skipPermissions) || globalBypass,
    };
  }

  if (provider === 'cursor') {
    const settings = {
      ...readJsonRecord('cursor-settings'),
      ...readJsonRecord('cursor-tools-settings'),
    };
    return {
      permissionMode: globalMode,
      skipPermissions: Boolean(settings.skipPermissions) || globalBypass,
    };
  }

  if (provider === 'codex') {
    const settings = readJsonRecord('codex-settings');
    return {
      permissionMode: typeof settings.permissionMode === 'string' ? settings.permissionMode : globalMode,
      skipPermissions: false,
    };
  }

  if (provider === 'gemini' || provider === 'qwen') {
    const settings = readJsonRecord(`${provider}-settings`);
    return {
      permissionMode: toGeminiLikePermissionMode(settings.permissionMode, globalMode),
      skipPermissions: false,
    };
  }

  if (provider === 'opencode') {
    const settings = readJsonRecord('opencode-settings');
    return {
      permissionMode: Boolean(settings.skipPermissions) || globalBypass ? 'bypassPermissions' : globalMode,
      skipPermissions: Boolean(settings.skipPermissions) || globalBypass,
    };
  }

  return { permissionMode: globalMode, skipPermissions: globalBypass };
}

function resolveShellPermissionOptions(
  provider: LLMProvider | 'plain-shell',
  override: ShellPermissionOverride | null | undefined,
): ShellPermissionOptions {
  const configured = readProviderShellPermissionOptions(provider);
  if (!override) {
    return configured;
  }

  const requestedMode = typeof override.permissionMode === 'string' && override.permissionMode.trim()
    ? override.permissionMode.trim()
    : '';
  const permissionMode = requestedMode || (override.skipPermissions ? 'bypassPermissions' : configured.permissionMode);
  const permissionImpliesBypass = permissionMode === 'bypassPermissions' || permissionMode === 'acceptEdits' || permissionMode === 'yolo';

  return {
    permissionMode,
    skipPermissions: Boolean(override.skipPermissions) || configured.skipPermissions || permissionImpliesBypass,
  };
}

function normalizeStartupInput(input: string, provider: LLMProvider) {
  const trimmedInput = input.replace(/(?:\r\n|\r|\n)+$/u, '');
  const submitSequence = provider === 'codex' ? '\n' : '\r';
  return `${trimmedInput}${submitSequence}`;
}

function resolveRuntimeProvider(
  selectedSessionRef: MutableRefObject<ProjectSession | null | undefined>,
): LLMProvider {
  return (selectedSessionRef.current?.__provider || window.localStorage.getItem('selected-provider') || 'claude') as LLMProvider;
}

function isCliReadyForStartupInput(provider: LLMProvider, outputBuffer: string) {
  const clean = outputBuffer.replace(ANSI_ESCAPE_REGEX, '').toLowerCase();
  if (!clean.trim()) return false;

  if (provider === 'codex') {
    return /openai codex|directory:\s|tip:\s+use \/init|model:\s/.test(clean);
  }

  if (provider === 'claude') {
    return /claude code|welcome to claude|cwd:\s|try ['"]?\/init/.test(clean);
  }

  if (provider === 'gemini') {
    return /gemini|type a message|ctrl\+/.test(clean);
  }

  if (provider === 'qwen') {
    return /qwen code|qwen|type a message/.test(clean);
  }

  if (provider === 'opencode') {
    return /opencode|model:\s|session/.test(clean);
  }

  if (provider === 'cursor') {
    return /cursor|agent|model:\s/.test(clean);
  }

  return clean.length > 0;
}

export function useShellConnection({
  wsRef,
  terminalRef,
  fitAddonRef,
  selectedProjectRef,
  selectedSessionRef,
  initialCommandRef,
  isPlainShellRef,
  forceNewSessionRef,
  startupInputRef,
  permissionOverrideRef,
  onProcessCompleteRef,
  isInitialized,
  autoConnect,
  closeSocket,
  clearTerminalScreen,
  setAuthUrl,
  onOutputRef,
}: UseShellConnectionOptions): UseShellConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const startupInputSentRef = useRef(false);
  const startupInputBufferRef = useRef('');
  const startupInputTimerRef = useRef<number | null>(null);

  const clearStartupInputTimer = useCallback(() => {
    if (!startupInputTimerRef.current) return;
    window.clearTimeout(startupInputTimerRef.current);
    startupInputTimerRef.current = null;
  }, []);

  const scheduleStartupInput = useCallback((delayMs: number) => {
    if (startupInputSentRef.current || startupInputTimerRef.current || isPlainShellRef.current) {
      return;
    }

    startupInputTimerRef.current = window.setTimeout(() => {
      startupInputTimerRef.current = null;
      const startupInput = startupInputRef.current;
      const socket = wsRef.current;
      if (!startupInput || startupInputSentRef.current || isPlainShellRef.current || socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const provider = resolveRuntimeProvider(selectedSessionRef);
      sendSocketMessage(socket, {
        type: 'input',
        data: normalizeStartupInput(startupInput, provider),
      });
      startupInputSentRef.current = true;
      startupInputRef.current = null;
    }, delayMs);
  }, [isPlainShellRef, selectedSessionRef, startupInputRef, wsRef]);

  const maybeSendStartupInput = useCallback((output: string) => {
    if (!startupInputRef.current || startupInputSentRef.current || isPlainShellRef.current) {
      return;
    }

    startupInputBufferRef.current = `${startupInputBufferRef.current}${output}`.slice(-STARTUP_INPUT_BUFFER_LIMIT);
    const provider = resolveRuntimeProvider(selectedSessionRef);
    if (isCliReadyForStartupInput(provider, startupInputBufferRef.current)) {
      clearStartupInputTimer();
      scheduleStartupInput(STARTUP_INPUT_READY_DELAY_MS);
      return;
    }

    scheduleStartupInput(STARTUP_INPUT_FALLBACK_DELAY_MS);
  }, [clearStartupInputTimer, isPlainShellRef, scheduleStartupInput, selectedSessionRef, startupInputRef]);

  const handleProcessCompletion = useCallback(
    (output: string) => {
      if (!isPlainShellRef.current || !onProcessCompleteRef.current) {
        return;
      }

      const sanitizedOutput = output.replace(ANSI_ESCAPE_REGEX, '');
      const cleanOutput = sanitizedOutput;
      if (cleanOutput.includes('Process exited with code 0')) {
        onProcessCompleteRef.current(0);
        return;
      }

      const match = cleanOutput.match(PROCESS_EXIT_REGEX);
      if (!match) {
        return;
      }

      const exitCode = Number.parseInt(match[1], 10);
      if (!Number.isNaN(exitCode) && exitCode !== 0) {
        onProcessCompleteRef.current(exitCode);
      }
    },
    [isPlainShellRef, onProcessCompleteRef],
  );

  const handleSocketMessage = useCallback(
    (rawPayload: string) => {
      const message = parseShellMessage(rawPayload);
      if (!message) {
        console.error('[Shell] Error handling WebSocket message:', rawPayload);
        return;
      }

      if (message.type === 'output') {
        const output = typeof message.data === 'string' ? message.data : '';
        handleProcessCompletion(output);
        maybeSendStartupInput(output);
        const terminal = terminalRef.current;
        terminal?.write(output, () => {
          terminal.refresh(0, Math.max(0, terminal.rows - 1));
        });
        onOutputRef?.current?.();
        return;
      }

      if (message.type === 'auth_url' || message.type === 'url_open') {
        const nextAuthUrl = typeof message.url === 'string' ? message.url : '';
        if (nextAuthUrl) {
          setAuthUrl(nextAuthUrl);
        }
      }
    },
    [handleProcessCompletion, maybeSendStartupInput, onOutputRef, setAuthUrl, terminalRef],
  );

  const connectWebSocket = useCallback(
    (isConnectionLocked = false) => {
      if ((connectingRef.current && !isConnectionLocked) || isConnecting || isConnected) {
        return;
      }

      try {
        const wsUrl = getShellWebSocketUrl();
        if (!wsUrl) {
          connectingRef.current = false;
          setIsConnecting(false);
          return;
        }

        connectingRef.current = true;

        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          setIsConnected(true);
          setIsConnecting(false);
          connectingRef.current = false;
          setAuthUrl('');

          window.setTimeout(() => {
            const currentTerminal = terminalRef.current;
            const currentFitAddon = fitAddonRef.current;
            const currentProject = selectedProjectRef.current;
            if (!currentTerminal || !currentFitAddon || !currentProject) {
              return;
            }

            currentFitAddon.fit();

            const provider = isPlainShellRef.current
              ? 'plain-shell'
              : (selectedSessionRef.current?.__provider || localStorage.getItem('selected-provider') || 'claude') as LLMProvider;
            const permissionOptions = resolveShellPermissionOptions(provider, permissionOverrideRef.current);
            clearStartupInputTimer();
            startupInputSentRef.current = false;
            startupInputBufferRef.current = '';

            sendSocketMessage(socket, {
              type: 'init',
              projectPath: currentProject.fullPath || currentProject.path || '',
              sessionId: isPlainShellRef.current ? null : selectedSessionRef.current?.id || null,
              hasSession: isPlainShellRef.current ? false : Boolean(selectedSessionRef.current),
              provider,
              cols: currentTerminal.cols,
              rows: currentTerminal.rows,
              initialCommand: initialCommandRef.current,
              isPlainShell: isPlainShellRef.current,
              forceNewSession: forceNewSessionRef.current,
              permissionMode: permissionOptions.permissionMode,
              skipPermissions: permissionOptions.skipPermissions,
            });

            if (startupInputRef.current && !isPlainShellRef.current) {
              scheduleStartupInput(STARTUP_INPUT_FALLBACK_DELAY_MS);
            }
          }, TERMINAL_INIT_DELAY_MS);
        };

        socket.onmessage = (event) => {
          const rawPayload = typeof event.data === 'string' ? event.data : String(event.data ?? '');
          handleSocketMessage(rawPayload);
        };

        socket.onclose = () => {
          setIsConnected(false);
          setIsConnecting(false);
          connectingRef.current = false;
          clearTerminalScreen();
        };

        socket.onerror = () => {
          setIsConnected(false);
          setIsConnecting(false);
          connectingRef.current = false;
        };
      } catch {
        setIsConnected(false);
        setIsConnecting(false);
        connectingRef.current = false;
      }
    },
    [
      clearTerminalScreen,
      fitAddonRef,
      forceNewSessionRef,
      handleSocketMessage,
      initialCommandRef,
      isConnected,
      isConnecting,
      isPlainShellRef,
      permissionOverrideRef,
      clearStartupInputTimer,
      scheduleStartupInput,
      selectedProjectRef,
      selectedSessionRef,
      setAuthUrl,
      startupInputRef,
      terminalRef,
      wsRef,
    ],
  );

  const connectToShell = useCallback(() => {
    if (!isInitialized || isConnected || isConnecting || connectingRef.current) {
      return;
    }

    manualDisconnectRef.current = false;
    connectingRef.current = true;
    setIsConnecting(true);
    connectWebSocket(true);
  }, [connectWebSocket, isConnected, isConnecting, isInitialized]);

  const disconnectFromShell = useCallback((manual = true) => {
    if (manual) {
      manualDisconnectRef.current = true;
    }
    closeSocket();
    clearStartupInputTimer();
    clearTerminalScreen();
    setIsConnected(false);
    setIsConnecting(false);
    connectingRef.current = false;
    setAuthUrl('');
  }, [clearStartupInputTimer, clearTerminalScreen, closeSocket, setAuthUrl]);

  useEffect(() => {
    if (!autoConnect || manualDisconnectRef.current || !isInitialized || isConnecting || isConnected) {
      return;
    }

    connectToShell();
  }, [autoConnect, connectToShell, isConnected, isConnecting, isInitialized]);

  return {
    isConnected,
    isConnecting,
    closeSocket,
    connectToShell,
    disconnectFromShell,
  };
}
