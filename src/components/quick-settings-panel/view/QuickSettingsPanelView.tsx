import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useTheme } from '../../../contexts/ThemeContext';
import { cn } from '../../../lib/utils';
import type { AutoShowAgentDiffMode, PreferenceToggleKey, QuickSettingsPreferences } from '../types';

import QuickSettingsContent from './QuickSettingsContent';
import QuickSettingsPanelHeader from './QuickSettingsPanelHeader';

export default function QuickSettingsPanelView() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { isDarkMode } = useTheme();
  const { preferences, setPreference } = useUiPreferences();

  const quickSettingsPreferences = useMemo<QuickSettingsPreferences>(() => ({
    autoExpandTools: preferences.autoExpandTools,
    showRawParameters: preferences.showRawParameters,
    showThinking: preferences.showThinking,
    autoScrollToBottom: preferences.autoScrollToBottom,
    sendByCtrlEnter: preferences.sendByCtrlEnter,
    autoShowAgentDiff: preferences.autoShowAgentDiff,
  }), [
    preferences.autoExpandTools,
    preferences.autoScrollToBottom,
    preferences.sendByCtrlEnter,
    preferences.showRawParameters,
    preferences.showThinking,
    preferences.autoShowAgentDiff,
  ]);

  const handlePreferenceChange = useCallback(
    (key: PreferenceToggleKey, value: boolean) => {
      setPreference(key, value);
    },
    [setPreference],
  );

  const handleSelectChange = useCallback(
    (key: 'autoShowAgentDiff', value: AutoShowAgentDiffMode) => {
      setPreference(key, value);
    },
    [setPreference],
  );

  useEffect(() => {
    const openPanel = () => setIsOpen(true);
    const togglePanel = () => setIsOpen((previous) => !previous);
    window.openQuickSettings = openPanel;
    window.toggleQuickSettings = togglePanel;
    return () => {
      if (window.openQuickSettings === openPanel) {
        delete window.openQuickSettings;
      }
      if (window.toggleQuickSettings === togglePanel) {
        delete window.toggleQuickSettings;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeElement = document.activeElement;
          if (event.shiftKey && (activeElement === first || !panelRef.current?.contains(activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && (activeElement === last || !panelRef.current?.contains(activeElement))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }

      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[data-quick-settings-close]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  // The sheet stays mounted for its slide-out transition. Keep its controls
  // out of the keyboard/accessibility tree while it is closed so a hidden
  // settings button cannot be reached behind the mobile backdrop.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (isOpen) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
  }, [isOpen]);

  return (
    <>
      <div
        ref={panelRef}
        className={cn(
          'fixed z-40 transform border-border bg-background shadow-xl transition-transform duration-150 ease-out',
          isMobile
            ? [
              'inset-x-2 bottom-2 h-[min(78vh,34rem)] overflow-hidden rounded-2xl border',
              isOpen ? 'translate-y-0' : 'translate-y-[calc(100%+1rem)]',
            ]
            : [
              'right-0 top-0 h-full w-80 border-l',
              isOpen ? 'translate-x-0' : 'translate-x-full',
            ],
          !isOpen && 'pointer-events-none',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixcode-quick-settings-title"
        aria-hidden={!isOpen}
      >
        <div className="flex h-full flex-col">
          <QuickSettingsPanelHeader onClose={() => setIsOpen(false)} />
          <QuickSettingsContent
            isDarkMode={isDarkMode}
            preferences={quickSettingsPreferences}
            onPreferenceChange={handlePreferenceChange}
            onSelectChange={handleSelectChange}
          />
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm transition-opacity duration-150 ease-out"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
