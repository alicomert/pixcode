import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, PillBar, Pill } from '../../../../shared/view/ui';
import type { AppTab } from '../../../../types/app';
import { usePlugins } from '../../../../contexts/PluginsContext';
import PluginIcon from '../../../plugins/view/PluginIcon';
import { cn } from '../../../../lib/utils';

import {
  Columns,
  Maximize2,
  MessageSquare,
  Terminal,
  Folder,
  GitBranch,
  FileCode,
  ClipboardCheck,
  Smartphone,
  X,
  type LucideIcon,
} from '@/lib/icons';

type MainContentTabSwitcherProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  activeSidePanelTab?: AppTab | null;
  sidePanelMode?: 'split' | 'full';
  canUseSidePanelSplit?: boolean;
  isMobile?: boolean;
  onCloseSidePanel?: () => void;
};

type BuiltInTab = {
  kind: 'builtin';
  id: AppTab;
  labelKey: string;
  icon: LucideIcon;
};

type PluginTab = {
  kind: 'plugin';
  id: AppTab;
  label: string;
  pluginName: string;
  iconFile: string;
};

type TabDefinition = BuiltInTab | PluginTab;

const BASE_TABS: BuiltInTab[] = [
  { kind: 'builtin', id: 'chat',  labelKey: 'tabs.chat',  icon: MessageSquare },
  { kind: 'builtin', id: 'tasks', labelKey: 'tabs.tasks', icon: ClipboardCheck },
  { kind: 'builtin', id: 'remote', labelKey: 'tabs.remote', icon: Smartphone },
  { kind: 'builtin', id: 'shell', labelKey: 'tabs.shell', icon: Terminal },
  { kind: 'builtin', id: 'files', labelKey: 'tabs.files', icon: Folder },
  { kind: 'builtin', id: 'git',   labelKey: 'tabs.git',   icon: GitBranch },
  { kind: 'builtin', id: 'changes', labelKey: 'tabs.changes', icon: FileCode },
];

const sidePanelTabs = new Set<AppTab>(['files', 'shell', 'git', 'changes']);

export default function MainContentTabSwitcher({
  activeTab,
  setActiveTab,
  activeSidePanelTab,
  sidePanelMode = 'split',
  canUseSidePanelSplit = true,
  isMobile = false,
  onCloseSidePanel,
}: MainContentTabSwitcherProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();

  const pluginTabs: PluginTab[] = plugins
    .filter((p) => p.enabled)
    .map((p) => ({
      kind: 'plugin',
      id: `plugin:${p.name}` as AppTab,
      label: p.displayName,
      pluginName: p.name,
      iconFile: p.icon,
    }));

  const tabs: TabDefinition[] = [...BASE_TABS, ...pluginTabs];

  if (isMobile) {
    const selectedValue = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'chat';

    return (
      <label className="block min-w-0">
        <span className="sr-only">{t('tabs.selectTab', 'Select section')}</span>
        <select
          value={selectedValue}
          onChange={(event) => setActiveTab(event.target.value as AppTab)}
          className="h-11 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          aria-label={t('tabs.selectTab', 'Select section')}
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.kind === 'builtin' ? t(tab.labelKey) : tab.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <PillBar>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const displayLabel = tab.kind === 'builtin' ? t(tab.labelKey) : tab.label;
        const showLayoutIndicator = Boolean(
          !isMobile
          && canUseSidePanelSplit
          && isActive
          && activeSidePanelTab === tab.id
          && sidePanelTabs.has(tab.id),
        );
        const isSplitMode = sidePanelMode === 'split';
        const layoutLabel = isSplitMode ? 'Split' : 'Full';
        const tooltipLabel = showLayoutIndicator
          ? `${displayLabel} · ${layoutLabel} view`
          : displayLabel;

        return (
          <div key={tab.id} className="relative inline-flex items-center">
            <Tooltip content={tooltipLabel} position="bottom">
              <Pill
                isActive={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'h-8',
                  showLayoutIndicator
                    ? 'px-2 py-[5px] pr-7'
                    : 'px-2.5 py-[5px]',
                )}
              >
                {tab.kind === 'builtin' ? (
                  <tab.icon className="h-3.5 w-3.5" />
                ) : (
                  <PluginIcon
                    pluginName={tab.pluginName}
                    iconFile={tab.iconFile}
                    className="flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                  />
                )}
                <span
                  className={cn(
                    'hidden lg:inline',
                  )}
                >
                  {displayLabel}
                </span>
                {showLayoutIndicator && (
                  <span
                    className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded border ${
                      isSplitMode
                        ? 'border-foreground/20 bg-foreground/5 text-foreground/70'
                        : 'border-border bg-muted/60 text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  >
                    {isSplitMode ? (
                      <Columns className="h-3 w-3" />
                    ) : (
                      <Maximize2 className="h-3 w-3" />
                    )}
                  </span>
                )}
              </Pill>
            </Tooltip>
            {showLayoutIndicator && onCloseSidePanel && (
              <Tooltip content={t('tabs.closeSidePanel', 'Close side panel')} position="bottom">
                <button
                  type="button"
                  className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseSidePanel();
                  }}
                  aria-label={t('tabs.closeSidePanel', 'Close side panel')}
                  title={t('tabs.closeSidePanel', 'Close side panel')}
                >
                  <X className="h-3 w-3" />
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}
    </PillBar>
  );
}
