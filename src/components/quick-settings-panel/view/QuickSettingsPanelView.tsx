import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useTheme } from '../../../contexts/ThemeContext';
import { useQuickSettingsDrag } from '../hooks/useQuickSettingsDrag';
import type { AutoShowAgentDiffMode, PreferenceToggleKey, QuickSettingsPreferences } from '../types';

import QuickSettingsContent from './QuickSettingsContent';
import QuickSettingsHandle from './QuickSettingsHandle';
import QuickSettingsPanelHeader from './QuickSettingsPanelHeader';

export default function QuickSettingsPanelView() {
  const [isOpen, setIsOpen] = useState(false);
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { isDarkMode } = useTheme();
  const { preferences, setPreference } = useUiPreferences();
  const {
    isDragging,
    handleStyle,
    startDrag,
    consumeSuppressedClick,
  } = useQuickSettingsDrag({ isMobile });

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

  const handleToggleFromHandle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      // A drag releases a click event as well; this guard prevents accidental toggles.
      if (consumeSuppressedClick()) {
        event.preventDefault();
        return;
      }

      setIsOpen((previous) => !previous);
    },
    [consumeSuppressedClick],
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
      {isMobile && (
        <QuickSettingsHandle
          isOpen={isOpen}
          isDragging={isDragging}
          style={handleStyle}
          onClick={handleToggleFromHandle}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
        />
      )}

      <div
        className={`fixed right-0 top-0 z-40 h-full w-80 transform border-l border-border bg-background shadow-xl transition-transform duration-150 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${isMobile ? 'h-screen' : ''}`}
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
