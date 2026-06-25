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
import { fitShellTerminal } from '../utils/terminalFit';
import { sendTerminalInput } from '../utils/input';
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
  isActive: boolean;
  layoutSignal?: string | number | null;
};

type UseShellTerminalResult = {
  isInitialized: boolean;
  clearTerminalScreen: () => void;
  disposeTerminal: () => void;
};

const OSC_COLOR_REPORT_REGEX = /\x1b\](?:10|11|12);rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4}(?:\x07|\x1b\\)?/giu;

const OSC_PALETTE_REPORT_REGEX = /\x1b\]4;\d+;rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4}(?:\x07|\x1b\\)?/giu;

// DA1 response: \x1b[?...c  (Device Attributes primary)
const DA1_RESPONSE_REGEX = /\x1b\[\?\d+[;:\d]*c/gu;
// DA2 response: \x1b[>...c  (Device Attributes secondary — self-looping!)
const DA2_RESPONSE_REGEX = /\x1b\[>\d+[;:\d]*c/gu;
// DSR cursor: \x1b[row;colR
const DSR_CURSOR_REGEX = /\x1b\[\d+;\d+R/gu;
// DSR private cursor: \x1b[?row;colR
const DSR_PRIVATE_CURSOR_REGEX = /\x1b\[\?\d+;\d+R/gu;
// DSR status: \x1b[0n or \x1b[3n
const DSR_STATUS_REGEX = /\x1b\[\d+n/gu;
// Focus events: \x1b[I (focus in) and \x1b[O (focus out)
const FOCUS_EVENT_REGEX = /\x1b\[[IO]/gu;
// Mouse report (default): \x1b[M + 3 bytes — produces visible "aNM" when echoed!
const MOUSE_REPORT_REGEX = /\x1b\[M[\s\S]{3}/gu;
// Mouse report (SGR): \x1b[<button,col,row M/m
const MOUSE_SGR_REPORT_REGEX = /\x1b\[<\d+;\d+;\d+[Mm]/gu;
// Window size report: \x1b[8;rows;colst
const WINDOW_SIZE_REPORT_REGEX = /\x1b\[\d+;\d+;\d+t/gu;
// DECRQM response: \x1b[mode;value$y
const DECRQM_RESPONSE_REGEX = /\x1b\[\d+;\d+\$y/gu;
// DCS: \x1bP...\x1b\\
const DCS_RESPONSE_REGEX = /\x1bP[\s\S]*?\x1b\\/gu;

const TERMINAL_RESPONSE_REGEXES = [
  OSC_COLOR_REPORT_REGEX,
  OSC_PALETTE_REPORT_REGEX,
  DA1_RESPONSE_REGEX,
  DA2_RESPONSE_REGEX,
  DSR_CURSOR_REGEX,
  DSR_PRIVATE_CURSOR_REGEX,
  DSR_STATUS_REGEX,
  FOCUS_EVENT_REGEX,
  MOUSE_REPORT_REGEX,
  MOUSE_SGR_REPORT_REGEX,
  WINDOW_SIZE_REPORT_REGEX,
  DECRQM_RESPONSE_REGEX,
  DCS_RESPONSE_REGEX,
];

function sanitizeTerminalInputData(data: string) {
  let result = data;
  for (const regex of TERMINAL_RESPONSE_REGEXES) {
    if (regex.global) {
      result = result.replace(regex, '');
    } else {
      result = result.replace(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'), '');
    }
  }
  return result;
}

/**
 * Register xterm.js parser handlers that suppress terminal response generation.
 *
 * When a program in the PTY sends a query (DA1, DA2, DSR), xterm.js normally
 * generates a response via onData. That response gets sent back to the PTY,
 * echoed, and reinterpreted as a new query — creating an infinite feedback loop.
 *
 * By registering handlers that consume the queries without generating responses,
 * we break the loop at the source. Programs that need terminal capabilities
 * have fallbacks for missing DA/DSR responses.
 */
function suppressTerminalResponses(terminal: Terminal) {
  const disposables: { dispose(): void }[] = [];

  // DA1: CSI c or CSI 0 c — suppress primary device attributes response
  disposables.push(
    terminal.parser.registerCsiHandler({ final: 'c' }, () => true),
  );

  // DA2: CSI > c or CSI > 0 c — suppress secondary device attributes response
  // This is the self-looping one that causes infinite spam!
  disposables.push(
    terminal.parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => true),
  );

  // DSR status: CSI 5 n — suppress device status report response
  disposables.push(
    terminal.parser.registerCsiHandler({ final: 'n' }, () => true),
  );

  // DSR cursor: CSI 6 n — suppress cursor position report response
  // (registered above with final: 'n' since both 5n and 6n use final 'n')

  return () => disposables.forEach((d) => d.dispose());
}

function refreshTerminalRows(terminal: Terminal) {
  terminal.refresh(0, Math.max(0, terminal.rows - 1));
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
  isActive,
  layoutSignal = null,
}: UseShellTerminalOptions): UseShellTerminalResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const resizeTimeoutRef = useRef<number | null>(null);
  const layoutSignalRef = useRef<string | number | null>(layoutSignal);
  const hasSelectedProject = Boolean(selectedProject);

  useEffect(() => {
    ensureXtermFocusStyles();
  }, []);

  useEffect(() => {
    layoutSignalRef.current = layoutSignal;
  }, [layoutSignal]);

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

  const fitTerminalAndNotify = useCallback(() => {
    const currentFitAddon = fitAddonRef.current;
    const currentTerminal = terminalRef.current;
    const terminalContainer = terminalContainerRef.current;
    if (!currentFitAddon || !currentTerminal || !terminalContainer) {
      return;
    }

    const bounds = terminalContainer.getBoundingClientRect();
    if (bounds.width < 16 || bounds.height < 16) {
      return;
    }

    try {
      const didFit = fitShellTerminal({
        terminal: currentTerminal,
        fitAddon: currentFitAddon,
        container: terminalContainer,
        layoutSignal: layoutSignalRef.current,
      });
      if (!didFit) {
        return;
      }
      currentTerminal.scrollToBottom();
      refreshTerminalRows(currentTerminal);
    } catch {
      return;
    }

    sendSocketMessage(wsRef.current, {
      type: 'resize',
      cols: currentTerminal.cols,
      rows: currentTerminal.rows,
    });
  }, [fitAddonRef, terminalContainerRef, terminalRef, wsRef]);

  const scheduleTerminalFit = useCallback(() => {
    if (resizeTimeoutRef.current !== null) {
      window.clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      fitTerminalAndNotify();
    }, TERMINAL_RESIZE_DELAY_MS);
  }, [fitTerminalAndNotify]);

  useEffect(() => {
    if (!isActive || !isInitialized) {
      return;
    }

    const firstFrame = window.requestAnimationFrame(() => {
      fitTerminalAndNotify();
      window.requestAnimationFrame(() => {
        fitTerminalAndNotify();
        window.requestAnimationFrame(fitTerminalAndNotify);
      });
    });
    const timeoutId = window.setTimeout(fitTerminalAndNotify, TERMINAL_INIT_DELAY_MS);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(timeoutId);
    };
  }, [fitTerminalAndNotify, isActive, isInitialized, layoutSignal]);

  useEffect(() => {
    if (!terminalContainerRef.current || !hasSelectedProject || isRestarting || terminalRef.current) {
      return;
    }

    const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 768;
    const nextTerminal = new Terminal({
      ...TERMINAL_OPTIONS,
      fontSize: isCompactViewport ? 12 : TERMINAL_OPTIONS.fontSize,
      lineHeight: isCompactViewport ? 1.08 : TERMINAL_OPTIONS.lineHeight,
    });
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

    // Suppress terminal response generation (DA1/DA2/DSR) to prevent
    // the infinite feedback loop that causes "aNM" spam on Linux.
    // Parser handlers consume query sequences without generating responses.
    const disposeResponseSuppression = suppressTerminalResponses(nextTerminal);

    const sendClipboardTextToTerminal = (text: string) => {
      if (!text) {
        return false;
      }

      sendTerminalInput(wsRef.current, text);
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
      if (event.type !== 'keydown' || (!event.ctrlKey && !event.metaKey)) {
        return false;
      }

      const key = event.key?.toLowerCase();

      // Ctrl+Shift+C — always copy (even without selection, copy whole line in some terminals)
      // Ctrl+C with selection — copy selection
      // Ctrl+C without selection — send SIGINT (Ctrl+C) to terminal, unless Shift is held
      if (key === 'c') {
        if (nextTerminal.hasSelection()) {
          event.preventDefault();
          event.stopPropagation();
          void copyTerminalSelection();
          return true;
        }

        // Shift+Ctrl+C with no selection — copy current line
        if (event.shiftKey) {
          const buf = nextTerminal.buffer.active;
          const line = buf.getLine(buf.baseY + buf.cursorY);
          const text = line?.translateToString(true) || '';
          if (text) {
            event.preventDefault();
            event.stopPropagation();
            void copyTextToClipboard(text);
            return true;
          }
        }

        // No selection, no shift — let terminal handle Ctrl+C (SIGINT)
        return false;
      }

      // Ctrl+V / Ctrl+Shift+V / Cmd+V — paste from clipboard
      if (key === 'v') {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              sendClipboardTextToTerminal(text);
            }
          } catch {
            // Fallback: dispatch a synthetic paste event so the browser's
            // clipboard permission dialog can handle it
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
            });
            terminalContainer.dispatchEvent(pasteEvent);
          }
        })();
        return true;
      }

      // Ctrl+Shift+V — same as Ctrl+V (paste), some terminals use this
      // Already handled above since we don't differentiate shift for paste

      return false;
    };

    terminalContainer.addEventListener('copy', handleTerminalCopy);
    terminalContainer.addEventListener('paste', handleTerminalPaste, true);
    terminalContainer.addEventListener('keydown', handleCopyPasteShortcut, true);

    nextTerminal.attachCustomKeyEventHandler((event) => {
      const activeAuthUrl = isCodexLoginCommand(initialCommandRef.current)
        ? CODEX_DEVICE_AUTH_URL
        : authUrlRef.current;

      // Minimal mode: copy auth URL with bare 'c' key
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

      // Handle copy/paste shortcuts (Ctrl+C/V and Shift variants)
      if (event.type === 'keydown' && handleCopyPasteShortcut(event)) {
        return false;
      }

      return true;
    });

    const startupFitTimers = [
      window.setTimeout(fitTerminalAndNotify, 0),
      window.setTimeout(fitTerminalAndNotify, TERMINAL_INIT_DELAY_MS),
      window.setTimeout(fitTerminalAndNotify, TERMINAL_INIT_DELAY_MS * 3),
      window.setTimeout(fitTerminalAndNotify, TERMINAL_INIT_DELAY_MS * 6),
    ];
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(fitTerminalAndNotify);
    });

    setIsInitialized(true);

    const dataSubscription = nextTerminal.onData((data) => {
      const sanitizedData = sanitizeTerminalInputData(data);
      if (!sanitizedData) {
        return;
      }

      sendTerminalInput(wsRef.current, sanitizedData);
    });

    const resizeObserver = new ResizeObserver(scheduleTerminalFit);
    const observedElements = new Set<HTMLElement>();
    let observedElement: HTMLElement | null = terminalContainer;
    while (observedElement && observedElements.size < 4) {
      observedElements.add(observedElement);
      observedElement = observedElement.parentElement;
    }

    observedElements.forEach((element) => resizeObserver.observe(element));
    window.addEventListener('resize', scheduleTerminalFit);
    window.visualViewport?.addEventListener('resize', scheduleTerminalFit);
    window.addEventListener('orientationchange', scheduleTerminalFit);

    return () => {
      terminalContainer.removeEventListener('copy', handleTerminalCopy);
      terminalContainer.removeEventListener('paste', handleTerminalPaste, true);
      terminalContainer.removeEventListener('keydown', handleCopyPasteShortcut, true);
      resizeObserver.disconnect();
      startupFitTimers.forEach((timerId) => window.clearTimeout(timerId));
      window.visualViewport?.removeEventListener('resize', scheduleTerminalFit);
      window.removeEventListener('orientationchange', scheduleTerminalFit);
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      dataSubscription.dispose();
      disposeResponseSuppression();
      window.removeEventListener('resize', scheduleTerminalFit);
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
    fitTerminalAndNotify,
    scheduleTerminalFit,
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
