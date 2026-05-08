import { useTranslation } from 'react-i18next';

import { DarkModeToggle } from '../../../../shared/view/ui';
import { useTheme } from '../../../../contexts/ThemeContext';
import { THEME_ACCENT_OPTIONS, type ThemeAccentId } from '../../../../theme/appTheme';
import type { CodeEditorSettingsState, ProjectSortOrder } from '../../types/types';
import LanguageSelector from '../../../../shared/view/ui/LanguageSelector';
import SettingsCard from '../SettingsCard';
import SettingsRow from '../SettingsRow';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

type AppearanceSettingsTabProps = {
  projectSortOrder: ProjectSortOrder;
  onProjectSortOrderChange: (value: ProjectSortOrder) => void;
  codeEditorSettings: CodeEditorSettingsState;
  onCodeEditorThemeChange: (value: 'dark' | 'light') => void;
  onCodeEditorWordWrapChange: (value: boolean) => void;
  onCodeEditorShowMinimapChange: (value: boolean) => void;
  onCodeEditorLineNumbersChange: (value: boolean) => void;
  onCodeEditorFontSizeChange: (value: string) => void;
};

export default function AppearanceSettingsTab({
  projectSortOrder,
  onProjectSortOrderChange,
  codeEditorSettings,
  onCodeEditorThemeChange,
  onCodeEditorWordWrapChange,
  onCodeEditorShowMinimapChange,
  onCodeEditorLineNumbersChange,
  onCodeEditorFontSizeChange,
}: AppearanceSettingsTabProps) {
  const { t } = useTranslation('settings');
  const {
    accentTheme,
    setAccentTheme,
    customLightAccent,
    setCustomLightAccent,
    customDarkAccent,
    setCustomDarkAccent,
  } = useTheme() as {
    accentTheme: ThemeAccentId;
    setAccentTheme: (value: ThemeAccentId) => void;
    customLightAccent: string;
    setCustomLightAccent: (value: string) => void;
    customDarkAccent: string;
    setCustomDarkAccent: (value: string) => void;
  };

  return (
    <div className="space-y-8">
      <SettingsSection title={t('appearanceSettings.darkMode.label')}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.darkMode.label')}
            description={t('appearanceSettings.darkMode.description')}
          >
            <DarkModeToggle ariaLabel={t('appearanceSettings.darkMode.label')} />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.colorTheme.title', 'Color theme')}>
        <SettingsCard divided>
          <SettingsRow
            label={t('appearanceSettings.colorTheme.palette.label', 'Accent palette')}
            description={t('appearanceSettings.colorTheme.palette.description', 'Choose the product accent used by buttons, focus rings, navigation, and active states.')}
            className="items-start"
          >
            <div className="w-56 space-y-2">
              <select
                value={accentTheme}
                onChange={(event) => setAccentTheme(event.target.value as ThemeAccentId)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {THEME_ACCENT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1.5">
                {THEME_ACCENT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`h-6 w-6 rounded-full border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      accentTheme === option.id ? 'border-foreground shadow-sm' : 'border-border'
                    }`}
                    style={{ background: option.id === 'custom' ? customDarkAccent : option.dark }}
                    onClick={() => setAccentTheme(option.id)}
                    aria-label={option.label}
                    title={option.label}
                  />
                ))}
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.colorTheme.custom.label', 'Custom light/dark colors')}
            description={t('appearanceSettings.colorTheme.custom.description', 'Pick separate accent colors for light and dark mode. Select Custom above to use them.')}
            className="items-start"
          >
            <div className="grid w-56 grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>{t('appearanceSettings.colorTheme.custom.light', 'Light')}</span>
                <input
                  type="color"
                  value={customLightAccent}
                  onChange={(event) => setCustomLightAccent(event.target.value)}
                  className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1"
                  aria-label={t('appearanceSettings.colorTheme.custom.light', 'Light')}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>{t('appearanceSettings.colorTheme.custom.dark', 'Dark')}</span>
                <input
                  type="color"
                  value={customDarkAccent}
                  onChange={(event) => setCustomDarkAccent(event.target.value)}
                  className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1"
                  aria-label={t('appearanceSettings.colorTheme.custom.dark', 'Dark')}
                />
              </label>
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('mainTabs.appearance')}>
        <SettingsCard>
          <LanguageSelector />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.projectSorting.label')}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.projectSorting.label')}
            description={t('appearanceSettings.projectSorting.description')}
          >
            <select
              value={projectSortOrder}
              onChange={(event) => onProjectSortOrderChange(event.target.value as ProjectSortOrder)}
              className="w-full touch-manipulation rounded-lg border border-input bg-card p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:w-36"
            >
              <option value="name">{t('appearanceSettings.projectSorting.alphabetical')}</option>
              <option value="date">{t('appearanceSettings.projectSorting.recentActivity')}</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.codeEditor.title')}>
        <SettingsCard divided>
          <SettingsRow
            label={t('appearanceSettings.codeEditor.theme.label')}
            description={t('appearanceSettings.codeEditor.theme.description')}
          >
            <DarkModeToggle
              checked={codeEditorSettings.theme === 'dark'}
              onToggle={(enabled) => onCodeEditorThemeChange(enabled ? 'dark' : 'light')}
              ariaLabel={t('appearanceSettings.codeEditor.theme.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.wordWrap.label')}
            description={t('appearanceSettings.codeEditor.wordWrap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.wordWrap}
              onChange={onCodeEditorWordWrapChange}
              ariaLabel={t('appearanceSettings.codeEditor.wordWrap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.showMinimap.label')}
            description={t('appearanceSettings.codeEditor.showMinimap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.showMinimap}
              onChange={onCodeEditorShowMinimapChange}
              ariaLabel={t('appearanceSettings.codeEditor.showMinimap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.lineNumbers.label')}
            description={t('appearanceSettings.codeEditor.lineNumbers.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.lineNumbers}
              onChange={onCodeEditorLineNumbersChange}
              ariaLabel={t('appearanceSettings.codeEditor.lineNumbers.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.fontSize.label')}
            description={t('appearanceSettings.codeEditor.fontSize.description')}
          >
            <select
              value={codeEditorSettings.fontSize}
              onChange={(event) => onCodeEditorFontSizeChange(event.target.value)}
              className="w-full touch-manipulation rounded-lg border border-input bg-card p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:w-28"
            >
              <option value="10">10px</option>
              <option value="11">11px</option>
              <option value="12">12px</option>
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="15">15px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
