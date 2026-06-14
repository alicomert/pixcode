import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { Project } from '../../../types/app';
import {
  CODEX_DEVICE_AUTH_URL,
  TERMINAL_INIT_DELAY_MS,
  TERMINAL_OPTIONS,
  TERMINAL_RESIZE_DELAY_MS,
} from '../constants/constants';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { isCodexLoginCommand } from '../utils/auth';
import { sendSocketMessage } from '../utils/socket';
import { ensureXtermFocusStyles } from '../utils/terminalStyles';

type UseShellTerminalOptions = {
  terminalContainerRef: RefObject<HTMLDivElement>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  wsRef: MutableRefObject<WebSocket | null>;
  selectedProject: Project | null | undefined;
  minimal: boolean;
  isRestarting: boolean;
  initialCommandRef: MutableRefObject<string | null | undefined>;
  isPlainShellRef: MutableRefObject<boolean>;
  authUrlRef: MutableRefObject<string>;
  copyAuthUrlToClipboard: (url?: string) => Promise<boolean>;
  closeSocket: () => void;
};

type UseShellTerminalResult = {
  isInitialized: boolean;
  clearTerminalScreen: () => void;
  disposeTerminal: () => void;
};

const OSC_COLOR_REPORT_REGEX = /\x1b\](?:10|11|12);rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4}(?:\x07|\x1b\\)?/giu;

function sanitizeTerminalInputData(data: string) {
  return data.replace(OSC_COLOR_REPORT_REGEX, '');
}

export function useShellTerminal({
  terminalContainerRef,
  terminalRef,
  fitAddonRef,
  wsRef,
  selectedProject,
  minimal,
  isRestarting,
  initialCommandRef,
  isPlainShellRef,
  authUrlRef,
  copyAuthUrlToClipboard,
  closeSocket,
}: UseShellTerminalOptions): UseShellTerminalResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const resizeTimeoutRef = useRef<number | null>(null);
  const selectedProjectKey = selectedProject?.fullPath || selectedProject?.path || '';
  const hasSelectedProject = Boolean(selectedProject);

  useEffect(() => {
    ensureXtermFocusStyles();
  }, []);

  const clearTerminalScreen = useCallback(() => {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.clear();
    terminalRef.current.write('\x1b[2J\x1b[H');
  }, [terminalRef]);

  const disposeTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }

    fitAddonRef.current = null;
    setIsInitialized(false);
  }, [fitAddonRef, terminalRef]);

  useEffect(() => {
    if (!terminalContainerRef.current || !hasSelectedProject || isRestarting || terminalRef.current) {
      return;
    }

    const nextTerminal = new Terminal(TERMINAL_OPTIONS);
    terminalRef.current = nextTerminal;

    const nextFitAddon = new FitAddon();
    fitAddonRef.current = nextFitAddon;
    nextTerminal.loadAddon(nextFitAddon);

    // Avoid wrapped partial links in compact login flows.
    if (!minimal) {
      nextTerminal.loadAddon(new WebLinksAddon());
    }

    const terminalContainer = terminalContainerRef.current;
    nextTerminal.open(terminalContainer);

    const sendClipboardTextToTerminal = (text: string) => {
      if (!text) {
        return false;
      }

      sendSocketMessage(wsRef.current, {
        type: 'input',
        data: text,
      });
      return true;
    };

    const copyTerminalSelection = async () => {
      const selection = nextTerminal.getSelection();
      if (!selection) {
        return false;
      }

      return copyTextToClipboard(selection);
    };

    const handleTerminalCopy = (event: ClipboardEvent) => {
      if (!nextTerminal.hasSelection()) {
        return;
      }

      const selection = nextTerminal.getSelection();
      if (!selection) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', selection);
        return;
      }

      void copyTextToClipboard(selection);
    };

    const handleTerminalPaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      if (!pastedText) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      sendClipboardTextToTerminal(pastedText);
    };

    const handleCopyPasteShortcut = (event: KeyboardEvent) => {
      if (event.type !== 'keydown' || event.altKey || (!event.ctrlKey && !event.metaKey)) {
        return false;
      }

      const key = event.key?.toLowerCase();
      if (key === 'c') {
        if (!nextTerminal.hasSelection()) {
          if (event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        void copyTerminalSelection();
        return true;
      }

      return false;
    };

    terminalContainer.addEventListener('copy', handleTerminalCopy);
    terminalContainer.addEventListener('paste', handleTerminalPaste, true);
    terminalContainer.addEventListener('keydown', handleCopyPasteShortcut, true);

    nextTerminal.attachCustomKeyEventHandler((event) => {
      const activeAuthUrl = isCodexLoginCommand(initialCommandRef.current)
        ? CODEX_DEVICE_AUTH_URL
        : authUrlRef.current;

      if (
        event.type === 'keydown' &&
        minimal &&
        isPlainShellRef.current &&
        activeAuthUrl &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key?.toLowerCase() === 'c'
      ) {
        event.preventDefault();
        event.stopPropagation();
        void copyAuthUrlToClipboard(activeAuthUrl);
        return false;
      }

      if (handleCopyPasteShortcut(event)) {
        return false;
      }

      return true;
    });

    window.setTimeout(() => {
      const currentFitAddon = fitAddonRef.current;
      const currentTerminal = terminalRef.current;
      if (!currentFitAddon || !currentTerminal) {
        return;
      }

      currentFitAddon.fit();
      sendSocketMessage(wsRef.current, {
        type: 'resize',
        cols: currentTerminal.cols,
        rows: currentTerminal.rows,
      });
    }, TERMINAL_INIT_DELAY_MS);

    setIsInitialized(true);

    const dataSubscription = nextTerminal.onData((data) => {
      const sanitizedData = sanitizeTerminalInputData(data);
      if (!sanitizedData) {
        return;
      }

      sendSocketMessage(wsRef.current, {
        type: 'input',
        data: sanitizedData,
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = window.setTimeout(() => {
        const currentFitAddon = fitAddonRef.current;
        const currentTerminal = terminalRef.current;
        if (!currentFitAddon || !currentTerminal) {
          return;
        }

        currentFitAddon.fit();
        sendSocketMessage(wsRef.current, {
          type: 'resize',
          cols: currentTerminal.cols,
          rows: currentTerminal.rows,
        });
      }, TERMINAL_RESIZE_DELAY_MS);
    });

    resizeObserver.observe(terminalContainer);

    return () => {
      terminalContainer.removeEventListener('copy', handleTerminalCopy);
      terminalContainer.removeEventListener('paste', handleTerminalPaste, true);
      terminalContainer.removeEventListener('keydown', handleCopyPasteShortcut, true);
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      dataSubscription.dispose();
      closeSocket();
      disposeTerminal();
    };
  }, [
    authUrlRef,
    closeSocket,
    copyAuthUrlToClipboard,
    disposeTerminal,
    fitAddonRef,
    initialCommandRef,
    isPlainShellRef,
    isRestarting,
    minimal,
    hasSelectedProject,
    selectedProjectKey,
    terminalContainerRef,
    terminalRef,
    wsRef,
  ]);

  return {
    isInitialized,
    clearTerminalScreen,
    disposeTerminal,
  };
}
