import { useTranslation } from 'react-i18next';

import { DarkModeToggle } from '../../../shared/view/ui';
import LanguageSelector from '../../../shared/view/ui/LanguageSelector';
import type { ChangedFilesTrackingMode } from '../../../hooks/useChangedFilesMonitor';
import type { Project } from '../../../types/app';
import type { ChangedFileEntry } from '../../../utils/changedFiles';
import {
  INPUT_SETTING_TOGGLES,
  SETTING_ROW_CLASS,
  TOOL_DISPLAY_TOGGLES,
  VIEW_OPTION_TOGGLES,
} from '../constants';
import type {
  PreferenceToggleItem,
  PreferenceToggleKey,
  QuickSettingsPreferences,
} from '../types';

import QuickSettingsSection from './QuickSettingsSection';
import QuickSettingsToggleRow from './QuickSettingsToggleRow';

import { GitBranch, Loader2, Moon, RefreshCw, Sun } from '@/lib/icons';

type QuickSettingsContentProps = {
  isDarkMode: boolean;
  preferences: QuickSettingsPreferences;
  selectedProject: Project | null;
  changedFiles: ChangedFileEntry[];
  changedFilesLoading: boolean;
  changedFilesError: string | null;
  latestChangedFilePath: string | null;
  lastChangedFilesCheckedAt: number | null;
  changedFilesTrackingMode: ChangedFilesTrackingMode;
  onChangedFilesTrackingModeChange?: (mode: ChangedFilesTrackingMode) => void;
  onPreferenceChange: (key: PreferenceToggleKey, value: boolean) => void;
  onRefreshChangedFiles?: () => void;
  onFocusChangedFile?: (filePath: string) => void;
};

const formatLastChecked = (value: number | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
};

export default function QuickSettingsContent({
  isDarkMode,
  preferences,
  selectedProject,
  changedFiles,
  changedFilesLoading,
  changedFilesError,
  latestChangedFilePath,
  lastChangedFilesCheckedAt,
  changedFilesTrackingMode,
  onChangedFilesTrackingModeChange,
  onPreferenceChange,
  onRefreshChangedFiles,
  onFocusChangedFile,
}: QuickSettingsContentProps) {
  const { t } = useTranslation('settings');

  const renderToggleRows = (items: PreferenceToggleItem[]) => (
    items.map(({ key, labelKey, icon }) => (
      <QuickSettingsToggleRow
        key={key}
        label={t(labelKey)}
        icon={icon}
        checked={preferences[key]}
        onCheckedChange={(value) => onPreferenceChange(key, value)}
      />
    ))
  );
  const lastCheckedLabel = formatLastChecked(lastChangedFilesCheckedAt);
  const changedFilesSummary = preferences.changeAwareness
    ? changedFiles.length > 0
      ? `${changedFiles.length} changed file${changedFiles.length === 1 ? '' : 's'}`
      : t('quickSettings.changedFiles.empty')
    : t('quickSettings.changedFiles.disabled');

  return (
    <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden bg-background p-4">
      <QuickSettingsSection title={t('quickSettings.sections.appearance')}>
        <div className={SETTING_ROW_CLASS}>
          <span className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
            {isDarkMode ? (
              <Moon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <Sun className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            )}
            {t('quickSettings.darkMode')}
          </span>
          <DarkModeToggle />
        </div>
        <LanguageSelector compact />
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.toolDisplay')}>
        {renderToggleRows(TOOL_DISPLAY_TOGGLES)}
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.viewOptions')}>
        {renderToggleRows(VIEW_OPTION_TOGGLES)}
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.changeAwareness')}>
        <QuickSettingsToggleRow
          label={t('quickSettings.changeAwareness')}
          icon={GitBranch}
          checked={preferences.changeAwareness}
          onCheckedChange={(value) => onPreferenceChange('changeAwareness', value)}
        />

        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <div className="mb-3 grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => onChangedFilesTrackingModeChange?.('local')}
              className={`rounded px-2 py-1 transition-colors ${
                changedFilesTrackingMode === 'local'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Local changes
            </button>
            <button
              type="button"
              onClick={() => onChangedFilesTrackingModeChange?.('git')}
              className={`rounded px-2 py-1 transition-colors ${
                changedFilesTrackingMode === 'git'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Git changes
            </button>
          </div>

          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {t('quickSettings.changedFiles.title')}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {selectedProject
                  ? t('quickSettings.changedFiles.description')
                  : t('quickSettings.changedFiles.noProject')}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshChangedFiles}
              disabled={!preferences.changeAwareness || !selectedProject || changedFilesLoading}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={t('quickSettings.changedFiles.refresh')}
              aria-label={t('quickSettings.changedFiles.refresh')}
            >
              {changedFilesLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {changedFilesError && (
            <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-200">
              {changedFilesError}
            </div>
          )}

          <div className="rounded-md border border-dashed border-border/70 px-2 py-2 text-[11px] text-muted-foreground">
            {changedFilesSummary}
          </div>

          {preferences.changeAwareness && selectedProject && latestChangedFilePath && (
            <button
              type="button"
              onClick={() => onFocusChangedFile?.(latestChangedFilePath)}
              className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-200"
            >
              Open latest changed file
            </button>
          )}

          {lastCheckedLabel && (
            <p className="mt-2 px-1 text-[10px] text-muted-foreground">
              {t('quickSettings.changedFiles.lastChecked', { value: lastCheckedLabel })}
            </p>
          )}

          <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-background/70">
            <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <span className="text-[11px] font-medium text-foreground">
                {t('quickSettings.changedFiles.guideTitle')}
              </span>
            </div>
            <div className="space-y-1.5 p-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                <span>{t('quickSettings.changedFiles.guideFiles')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                <span>{t('quickSettings.changedFiles.guidePanel')}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="changed-file-guide-bar h-full w-1/3 rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.inputSettings')}>
        {renderToggleRows(INPUT_SETTING_TOGGLES)}
        <p className="ml-3 text-xs text-gray-500 dark:text-gray-400">
          {t('quickSettings.sendByCtrlEnterDescription')}
        </p>
      </QuickSettingsSection>
    </div>
  );
}
