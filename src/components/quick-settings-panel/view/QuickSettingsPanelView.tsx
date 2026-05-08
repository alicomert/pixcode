import { useCallback, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useTheme } from '../../../contexts/ThemeContext';
import type { Project } from '../../../types/app';
import type { ChangedFileEntry } from '../../../utils/changedFiles';
import { useQuickSettingsDrag } from '../hooks/useQuickSettingsDrag';
import type { PreferenceToggleKey, QuickSettingsPreferences } from '../types';

import QuickSettingsContent from './QuickSettingsContent';
import QuickSettingsHandle from './QuickSettingsHandle';
import QuickSettingsPanelHeader from './QuickSettingsPanelHeader';

type QuickSettingsPanelViewProps = {
  selectedProject?: Project | null;
  changedFiles?: ChangedFileEntry[];
  changedFilesLoading?: boolean;
  changedFilesError?: string | null;
  latestChangedFilePath?: string | null;
  lastChangedFilesCheckedAt?: number | null;
  onRefreshChangedFiles?: () => void;
  onFocusChangedFile?: (filePath: string) => void;
};

export default function QuickSettingsPanelView({
  selectedProject = null,
  changedFiles = [],
  changedFilesLoading = false,
  changedFilesError = null,
  latestChangedFilePath = null,
  lastChangedFilesCheckedAt = null,
  onRefreshChangedFiles,
  onFocusChangedFile,
}: QuickSettingsPanelViewProps) {
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
    changeAwareness: preferences.changeAwareness,
  }), [
    preferences.autoExpandTools,
    preferences.autoScrollToBottom,
    preferences.changeAwareness,
    preferences.sendByCtrlEnter,
    preferences.showRawParameters,
    preferences.showThinking,
  ]);

  const handlePreferenceChange = useCallback(
    (key: PreferenceToggleKey, value: boolean) => {
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

  return (
    <>
      <QuickSettingsHandle
        isOpen={isOpen}
        isDragging={isDragging}
        style={handleStyle}
        onClick={handleToggleFromHandle}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      />

      <div
        className={`fixed right-0 top-0 z-40 h-full w-64 transform border-l border-border bg-background shadow-xl transition-transform duration-150 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${isMobile ? 'h-screen' : ''}`}
      >
        <div className="flex h-full flex-col">
          <QuickSettingsPanelHeader />
          <QuickSettingsContent
            isDarkMode={isDarkMode}
            preferences={quickSettingsPreferences}
            selectedProject={selectedProject}
            changedFiles={changedFiles}
            changedFilesLoading={changedFilesLoading}
            changedFilesError={changedFilesError}
            latestChangedFilePath={latestChangedFilePath}
            lastChangedFilesCheckedAt={lastChangedFilesCheckedAt}
            onPreferenceChange={handlePreferenceChange}
            onRefreshChangedFiles={onRefreshChangedFiles}
            onFocusChangedFile={onFocusChangedFile}
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
