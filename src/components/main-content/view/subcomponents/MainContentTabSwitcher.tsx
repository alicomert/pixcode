import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, PillBar, Pill } from '../../../../shared/view/ui';
import type { AppTab } from '../../../../types/app';
import { usePlugins } from '../../../../contexts/PluginsContext';
import PluginIcon from '../../../plugins/view/PluginIcon';

import {
  Columns,
  Maximize2,
  MessageSquare,
  Terminal,
  Folder,
  GitBranch,
  ClipboardCheck,
  Workflow,
  type LucideIcon,
} from '@/lib/icons';

type MainContentTabSwitcherProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  shouldShowTasksTab: boolean;
  activeSidePanelTab?: AppTab | null;
  sidePanelMode?: 'split' | 'full';
  canUseSidePanelSplit?: boolean;
  isMobile?: boolean;
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
  { kind: 'builtin', id: 'orchestration', labelKey: 'tabs.orchestration', icon: Workflow },
  { kind: 'builtin', id: 'shell', labelKey: 'tabs.shell', icon: Terminal },
  { kind: 'builtin', id: 'files', labelKey: 'tabs.files', icon: Folder },
  { kind: 'builtin', id: 'git',   labelKey: 'tabs.git',   icon: GitBranch },
];

const TASKS_TAB: BuiltInTab = {
  kind: 'builtin',
  id: 'tasks',
  labelKey: 'tabs.tasks',
  icon: ClipboardCheck,
};

const sidePanelTabs = new Set<AppTab>(['files', 'shell', 'git']);

export default function MainContentTabSwitcher({
  activeTab,
  setActiveTab,
  shouldShowTasksTab,
  activeSidePanelTab,
  sidePanelMode = 'split',
  canUseSidePanelSplit = true,
  isMobile = false,
}: MainContentTabSwitcherProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();

  const builtInTabs: BuiltInTab[] = shouldShowTasksTab ? [...BASE_TABS, TASKS_TAB] : BASE_TABS;

  const pluginTabs: PluginTab[] = plugins
    .filter((p) => p.enabled)
    .map((p) => ({
      kind: 'plugin',
      id: `plugin:${p.name}` as AppTab,
      label: p.displayName,
      pluginName: p.name,
      iconFile: p.icon,
    }));

  const tabs: TabDefinition[] = [...builtInTabs, ...pluginTabs];

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
        const tooltipLabel = showLayoutIndicator
          ? `${displayLabel} · ${isSplitMode ? 'Split view' : 'Full view'}`
          : displayLabel;

        return (
          <Tooltip key={tab.id} content={tooltipLabel} position="bottom">
            <Pill
              isActive={isActive}
              onClick={() => setActiveTab(tab.id)}
              className="px-2.5 py-[5px]"
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
              <span className="hidden lg:inline">{displayLabel}</span>
              {showLayoutIndicator && (
                <span
                  className={`ml-0.5 inline-flex h-4 items-center gap-1 rounded border px-1 text-[10px] font-semibold leading-none ${
                    isSplitMode
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {isSplitMode ? (
                    <Columns className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                  <span className="hidden xl:inline">
                    {isSplitMode ? 'Split' : 'Full'}
                  </span>
                </span>
              )}
            </Pill>
          </Tooltip>
        );
      })}
    </PillBar>
  );
}
