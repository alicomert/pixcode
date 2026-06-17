import { useState } from 'react';
import { Send as TelegramIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../../lib/utils';
import type { SettingsMainTab } from '../types/types';

import { Bell, Bot, Bug, ChevronDown, GitBranch, Globe, Info, Key, Palette, Puzzle, Smartphone, Sparkles } from '@/lib/icons';

type SettingsSidebarProps = {
  activeTab: SettingsMainTab;
  onChange: (tab: SettingsMainTab) => void;
};

type NavItem = {
  id: SettingsMainTab;
  labelKey: string;
  icon: typeof Bot;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'agents', labelKey: 'mainTabs.agents', icon: Bot },
  { id: 'access', labelKey: 'mainTabs.access', icon: Globe },
  { id: 'appearance', labelKey: 'mainTabs.appearance', icon: Palette },
  { id: 'git', labelKey: 'mainTabs.git', icon: GitBranch },
  { id: 'api', labelKey: 'mainTabs.apiTokens', icon: Key },
  { id: 'plugins', labelKey: 'mainTabs.plugins', icon: Puzzle },
  { id: 'market', labelKey: 'mainTabs.market', icon: Sparkles },
  { id: 'notifications', labelKey: 'mainTabs.notifications', icon: Bell },
  { id: 'mobile', labelKey: 'mainTabs.mobile', icon: Smartphone },
  { id: 'telegram', labelKey: 'mainTabs.telegram', icon: TelegramIcon },
  { id: 'diagnostics', labelKey: 'mainTabs.diagnostics', icon: Bug },
  { id: 'about', labelKey: 'mainTabs.about', icon: Info },
];

export default function SettingsSidebar({ activeTab, onChange }: SettingsSidebarProps) {
  const { t } = useTranslation('settings');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeItem = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-shrink-0 border-r border-border bg-muted/30 md:flex md:flex-col">
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground active:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile section switcher */}
      <div className="flex-shrink-0 border-b border-border p-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((value) => !value)}
          className="flex h-11 w-full items-center gap-2 rounded-xl bg-muted/45 px-3 text-left text-sm font-medium text-foreground transition-colors active:bg-muted"
          aria-expanded={mobileMenuOpen}
        >
          <ActiveIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{t(activeItem.labelKey)}</span>
          <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform', mobileMenuOpen && 'rotate-180')} />
        </button>

        {mobileMenuOpen && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted/30 text-muted-foreground active:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="line-clamp-2 leading-tight">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
