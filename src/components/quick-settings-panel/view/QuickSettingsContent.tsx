import { useTranslation } from 'react-i18next';

import { DarkModeToggle, Pill, PillBar } from '../../../shared/view/ui';
import LanguageSelector from '../../../shared/view/ui/LanguageSelector';
import {
  INPUT_SETTING_TOGGLES,
  SETTING_ROW_CLASS,
  TOOL_DISPLAY_TOGGLES,
  VIEW_OPTION_TOGGLES,
} from '../constants';
import type {
  AutoShowAgentDiffMode,
  PreferenceToggleItem,
  PreferenceToggleKey,
  QuickSettingsPreferences,
} from '../types';

import QuickSettingsSection from './QuickSettingsSection';
import QuickSettingsToggleRow from './QuickSettingsToggleRow';

import { Moon, Sun } from '@/lib/icons';

type QuickSettingsContentProps = {
  isDarkMode: boolean;
  preferences: QuickSettingsPreferences;
  onPreferenceChange: (key: PreferenceToggleKey, value: boolean) => void;
  onSelectChange: (key: 'autoShowAgentDiff', value: AutoShowAgentDiffMode) => void;
};

const AUTO_SHOW_AGENT_DIFF_OPTIONS: { value: AutoShowAgentDiffMode; labelKey: string }[] = [
  { value: 'off', labelKey: 'quickSettings.autoShowAgentDiffOff' },
  { value: 'openOnly', labelKey: 'quickSettings.autoShowAgentDiffOpenOnly' },
  { value: 'always', labelKey: 'quickSettings.autoShowAgentDiffAlways' },
];

export default function QuickSettingsContent({
  isDarkMode,
  preferences,
  onPreferenceChange,
  onSelectChange,
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

      <QuickSettingsSection title={t('quickSettings.sections.agentDiff', 'Agent diff')}>
        <div className={`${SETTING_ROW_CLASS} flex-wrap gap-3`}>
          <span className="text-sm text-gray-900 dark:text-white">
            {t('quickSettings.autoShowAgentDiff', 'Show agent edits as diff')}
          </span>
          <PillBar className="flex-wrap">
            {AUTO_SHOW_AGENT_DIFF_OPTIONS.map(({ value, labelKey }) => (
              <Pill
                key={value}
                isActive={preferences.autoShowAgentDiff === value}
                onClick={() => onSelectChange('autoShowAgentDiff', value)}
                className="whitespace-nowrap"
              >
                {t(labelKey)}
              </Pill>
            ))}
          </PillBar>
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
