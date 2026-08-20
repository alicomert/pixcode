import { type MutableRefObject, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Terminal } from '@xterm/xterm';

import { sendTerminalInput } from '../../utils/input';

import {
  Clipboard,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from '@/lib/icons';

type Shortcut =
  | { type: 'key'; id: string; label: string; sequence: string }
  | { type: 'modifier'; id: string; label: string; modifier: 'ctrl' | 'alt' }
  | { type: 'arrow'; id: string; sequence: string; icon: 'up' | 'down' | 'left' | 'right' };

const MOBILE_KEYS: Shortcut[] = [
  { type: 'key', id: 'ctrl-c', label: 'Ctrl-C', sequence: '\x03' },
  { type: 'key', id: 'ctrl-d', label: 'Ctrl-D', sequence: '\x04' },
  { type: 'key', id: 'ctrl-l', label: 'Ctrl-L', sequence: '\x0c' },
  { type: 'key', id: 'ctrl-z', label: 'Ctrl-Z', sequence: '\x1a' },
  { type: 'key', id: 'esc', label: 'Esc', sequence: '\x1b' },
  { type: 'key', id: 'tab', label: 'Tab', sequence: '\t' },
  { type: 'key', id: 'enter', label: 'Enter', sequence: '\r' },
  { type: 'key', id: 'shift-tab', label: '\u21e7Tab', sequence: '\x1b[Z' },
  { type: 'modifier', id: 'ctrl', label: 'CTRL', modifier: 'ctrl' },
  { type: 'modifier', id: 'alt', label: 'ALT', modifier: 'alt' },
  { type: 'arrow', id: 'arrow-up', sequence: '\x1b[A', icon: 'up' },
  { type: 'arrow', id: 'arrow-down', sequence: '\x1b[B', icon: 'down' },
  { type: 'arrow', id: 'arrow-left', sequence: '\x1b[D', icon: 'left' },
  { type: 'arrow', id: 'arrow-right', sequence: '\x1b[C', icon: 'right' },
];

const ARROW_ICONS = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
} as const;

type TerminalShortcutsPanelProps = {
  wsRef: MutableRefObject<WebSocket | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  isConnected: boolean;
  bottomOffset?: string;
  placement?: 'fixed' | 'absolute';
};

const preventFocusSteal = (e: React.PointerEvent) => e.preventDefault();

const KEY_BTN =
  'flex min-h-11 shrink-0 items-center justify-center rounded-md border border-gray-600 bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-100 transition-colors select-none active:bg-blue-600 active:text-white active:border-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
const KEY_BTN_ACTIVE =
  'flex min-h-11 shrink-0 items-center justify-center rounded-md border border-blue-500 bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40';
const ICON_BTN =
  'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-gray-600 bg-gray-700 p-1.5 text-gray-100 transition-colors select-none active:bg-blue-600 active:text-white active:border-blue-600 disabled:cursor-not-allowed disabled:opacity-40';

export default function TerminalShortcutsPanel({
  wsRef,
  terminalRef,
  isConnected,
  bottomOffset = 'bottom-0',
  placement = 'fixed',
}: TerminalShortcutsPanelProps) {
  const { t } = useTranslation('settings');
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [pasteError, setPasteError] = useState(false);

  const sendInput = useCallback(
    (data: string) => {
      sendTerminalInput(wsRef.current, data);
    },
    [wsRef],
  );

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, [terminalRef]);

  const pasteFromClipboard = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setPasteError(true);
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setPasteError(false);
      if (text.length > 0) {
        sendInput(text);
      }
    } catch {
      setPasteError(true);
    }
  }, [sendInput]);

  useEffect(() => {
    if (!pasteError) return;
    const timeoutId = window.setTimeout(() => setPasteError(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [pasteError]);

  // A pending modifier must never leak across a reconnect or terminal switch.
  // Otherwise the first key pressed after reconnect is unexpectedly sent as
  // Ctrl/Alt input to the new PTY.
  useEffect(() => {
    if (!isConnected) {
      setCtrlActive(false);
      setAltActive(false);
    }
  }, [isConnected]);

  const handleKeyPress = useCallback(
    (seq: string) => {
      let finalSeq = seq;
      if (ctrlActive && seq.length === 1) {
        const code = seq.toLowerCase().charCodeAt(0);
        if (code >= 97 && code <= 122) {
          finalSeq = String.fromCharCode(code - 96);
        }
        setCtrlActive(false);
      }
      if (altActive && seq.length === 1) {
        finalSeq = '\x1b' + finalSeq;
        setAltActive(false);
      }
      sendInput(finalSeq);
    },
    [ctrlActive, altActive, sendInput],
  );

  return (
    <div className={`pointer-events-none ${placement} inset-x-0 ${bottomOffset} z-40 px-2 pb-[max(env(safe-area-inset-bottom),0px)] md:hidden`}>
      <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto rounded-lg border border-gray-700/80 bg-gray-900/95 px-1.5 py-1.5 shadow-lg backdrop-blur-sm [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pasteError && (
          <span
            className="shrink-0 rounded-md border border-yellow-500/50 bg-yellow-500/15 px-2 py-1 text-[11px] text-yellow-100"
            role="status"
            aria-live="polite"
          >
            {t('terminalShortcuts.clipboardBlocked', { defaultValue: 'Clipboard blocked' })}
          </span>
        )}
        <button
          type="button"
          onPointerDown={preventFocusSteal}
          onClick={() => {
            void pasteFromClipboard();
          }}
          disabled={!isConnected}
          className={ICON_BTN}
          title={t('terminalShortcuts.paste', { defaultValue: 'Paste' })}
          aria-label={t('terminalShortcuts.paste', { defaultValue: 'Paste' })}
        >
          <Clipboard className="h-4 w-4" />
        </button>

        {MOBILE_KEYS.map((key) => {
          if (key.type === 'modifier') {
            const isActive = key.modifier === 'ctrl' ? ctrlActive : altActive;
            const toggle =
              key.modifier === 'ctrl'
                ? () => setCtrlActive((v) => !v)
                : () => setAltActive((v) => !v);
            return (
              <button
                type="button"
                key={key.id}
                onPointerDown={preventFocusSteal}
                onClick={toggle}
                disabled={!isConnected}
                className={isActive ? KEY_BTN_ACTIVE : KEY_BTN}
                aria-pressed={isActive}
                aria-label={key.label}
              >
                {key.label}
              </button>
            );
          }

          if (key.type === 'arrow') {
            const Icon = ARROW_ICONS[key.icon];
            return (
              <button
                type="button"
                key={key.id}
                onPointerDown={preventFocusSteal}
                onClick={() => sendInput(key.sequence)}
                disabled={!isConnected}
                className={ICON_BTN}
                title={t(`terminalShortcuts.arrow${key.icon[0].toUpperCase()}${key.icon.slice(1)}`, {
                  defaultValue: `${key.icon[0].toUpperCase()}${key.icon.slice(1)} arrow`,
                })}
                aria-label={t(`terminalShortcuts.arrow${key.icon[0].toUpperCase()}${key.icon.slice(1)}`, {
                  defaultValue: `${key.icon[0].toUpperCase()}${key.icon.slice(1)} arrow`,
                })}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          }

          return (
            <button
              type="button"
              key={key.id}
              onPointerDown={preventFocusSteal}
              onClick={() => handleKeyPress(key.sequence)}
              disabled={!isConnected}
              className={KEY_BTN}
            >
              {key.label}
            </button>
          );
        })}

        <button
          type="button"
          onPointerDown={preventFocusSteal}
          onClick={scrollToBottom}
          disabled={!isConnected}
          className={ICON_BTN}
          title={t('terminalShortcuts.scrollDown')}
          aria-label={t('terminalShortcuts.scrollDown')}
        >
          <ArrowDownToLine className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
