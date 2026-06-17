import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useTheme } from '../../../contexts/ThemeContext';
import { cn } from '../../../lib/utils';
import type { AutoShowAgentDiffMode, PreferenceToggleKey, QuickSettingsPreferences } from '../types';

import QuickSettingsContent from './QuickSettingsContent';
import QuickSettingsPanelHeader from './QuickSettingsPanelHeader';

export default function QuickSettingsPanelView() {
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <>
      <div
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
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex h-full flex-col">
          <QuickSettingsPanelHeader />
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
