import { Folder, FolderPlus, List, MessageSquare, Plus, RefreshCw, Rows3, Search, X, PanelLeftClose } from '@/lib/icons';
import type { TFunction } from 'i18next';
import { Button, Input } from '../../../../shared/view/ui';
import { IS_PLATFORM } from '../../../../constants/config';
import type { HistoryViewMode } from '../../../../hooks/useUiPreferences';
import { cn } from '../../../../lib/utils';
import GitHubStarBadge from './GitHubStarBadge';

type SearchMode = 'projects' | 'conversations';

type SidebarHeaderProps = {
  isPWA: boolean;
  isMobile: boolean;
  isLoading: boolean;
  projectsCount: number;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  onClearSearchFilter: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCreateProject: () => void;
  onCollapseSidebar: () => void;
  historyView: HistoryViewMode;
  onHistoryViewChange: (mode: HistoryViewMode) => void;
  t: TFunction;
};

type HistoryViewToggleProps = {
  value: HistoryViewMode;
  onChange: (mode: HistoryViewMode) => void;
  t: TFunction;
};

// Small compact toggle between "Recent" (flat/ChatGPT-style) and "By project" (grouped).
// Kept as a segmented control so the active state is obvious at a glance.
function HistoryViewToggle({ value, onChange, t }: HistoryViewToggleProps) {
  const base =
    'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all';
  return (
    <div
      role="tablist"
      aria-label={t('tooltips.historyView', { defaultValue: 'History view' })}
      className="flex rounded-lg bg-muted/40 p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'flat'}
        onClick={() => onChange('flat')}
        className={cn(
          base,
          value === 'flat'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        title={t('tooltips.historyViewFlat', { defaultValue: 'Recent conversations' })}
      >
        <List className="h-3 w-3" />
        {t('historyView.flat', { defaultValue: 'Recent' })}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'grouped'}
        onClick={() => onChange('grouped')}
        className={cn(
          base,
          value === 'grouped'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        title={t('tooltips.historyViewGrouped', { defaultValue: 'Grouped by project' })}
      >
        <Rows3 className="h-3 w-3" />
        {t('historyView.grouped', { defaultValue: 'By project' })}
      </button>
    </div>
  );
}

export default function SidebarHeader({
  isPWA,
  isMobile,
  isLoading,
  projectsCount,
  searchFilter,
  onSearchFilterChange,
  onClearSearchFilter,
  searchMode,
  onSearchModeChange,
  onRefresh,
  isRefreshing,
  onCreateProject,
  onCollapseSidebar,
  historyView,
  onHistoryViewChange,
  t,
}: SidebarHeaderProps) {
  const LogoBlock = () => (
    <div className="flex min-w-0 items-center gap-2.5">
      {/*
        Pixcode "P" mark — same path data as public/logo.svg so the brand
        reads consistently from tab favicon down to the sidebar header.
        Rendered directly on the sidebar background (no tile) to match the
        raster reference; brand purple #5C3FFC fills the glyph on both
        light and dark themes.
      */}
      <svg
        className="h-6 w-6 flex-shrink-0"
        viewBox="0 0 500 500"
        aria-hidden="true"
      >
        {/* 1.25x zoom around canvas center — same as public/logo.svg, kills
            the dead space the raw path leaves. */}
        <g transform="translate(250 250) scale(1.25) translate(-250 -250)">
          <g transform="translate(0 500) scale(0.1 -0.1)" fill="#5C3FFC">
            <path d="M2037 3800 c-104 -40 -191 -134 -231 -250 -23 -67 -20 -82 22 -109 31 -20 287 -177 1009 -618 40 -24 82 -56 93 -70 27 -34 27 -102 0 -136 -11 -13 -106 -78 -212 -143 -106 -64 -201 -124 -210 -132 -16 -14 -18 -41 -18 -302 0 -291 2 -310 38 -310 16 0 267 148 610 359 180 111 270 173 310 213 216 217 215 574 -3 793 -37 38 -107 89 -185 136 -69 42 -253 154 -410 249 -434 264 -509 307 -563 326 -57 20 -191 17 -250 -6z" />
            <path d="M1803 2994 c-10 -5 -13 -156 -13 -709 0 -671 1 -706 20 -767 27 -89 93 -184 167 -240 89 -67 157 -90 281 -96 92 -4 105 -2 117 14 12 16 14 134 15 735 0 669 -1 718 -17 737 -20 23 -514 322 -541 327 -9 2 -23 2 -29 -1z" />
          </g>
        </g>
      </svg>
      <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{t('app.title')}</h1>
    </div>
  );

  return (
    <div className="flex-shrink-0">
      {/* Desktop header */}
      <div
        className="hidden px-4 pb-3 pt-4 md:block"
        style={{}}
      >
        <div className="flex items-center justify-between gap-2">
          {IS_PLATFORM ? (
            <a
              href="https://github.com/alicomert/pixcode"
              className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
              title={t('tooltips.viewEnvironments')}
            >
              <LogoBlock />
            </a>
          ) : (
            <LogoBlock />
          )}

          <div className="flex flex-shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              onClick={onRefresh}
              disabled={isRefreshing}
              title={t('tooltips.refresh')}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              onClick={onCreateProject}
              title={t('tooltips.createProject')}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              onClick={onCollapseSidebar}
              title={t('tooltips.hideSidebar')}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <GitHubStarBadge />

        {/* Search bar */}
        {projectsCount > 0 && !isLoading && (
          <div className="mt-2.5 space-y-2">
            {/* History view switch (only meaningful when browsing projects, not when searching conversations). */}
            {searchMode === 'projects' && (
              <HistoryViewToggle value={historyView} onChange={onHistoryViewChange} t={t} />
            )}
            {/* Search mode toggle */}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => onSearchModeChange('projects')}
                aria-pressed={searchMode === 'projects'}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                  searchMode === 'projects'
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Folder className="h-3 w-3" />
                {t('search.modeProjects')}
              </button>
              <button
                onClick={() => onSearchModeChange('conversations')}
                aria-pressed={searchMode === 'conversations'}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                  searchMode === 'conversations'
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3 w-3" />
                {t('search.modeConversations')}
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                type="text"
                placeholder={searchMode === 'conversations' ? t('search.conversationsPlaceholder') : t('projects.searchPlaceholder')}
                value={searchFilter}
                onChange={(event) => onSearchFilterChange(event.target.value)}
                className="nav-search-input h-9 rounded-xl border-0 pl-9 pr-8 text-sm transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {searchFilter && (
                <button
                  onClick={onClearSearchFilter}
                  aria-label={t('tooltips.clearSearch')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 hover:bg-accent"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop divider */}
      <div className="nav-divider hidden md:block" />

      {/* Mobile header */}
      <div
        className="p-3 pb-2 md:hidden"
        style={isPWA && isMobile ? { paddingTop: '16px' } : {}}
      >
        <div className="flex items-center justify-between">
          {IS_PLATFORM ? (
            <a
              href="https://github.com/alicomert/pixcode"
              className="flex min-w-0 items-center gap-2.5 transition-opacity active:opacity-70"
              title={t('tooltips.viewEnvironments')}
            >
              <LogoBlock />
            </a>
          ) : (
            <LogoBlock />
          )}

          <div className="flex flex-shrink-0 gap-1.5">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 transition-all active:scale-95"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/90 text-primary-foreground transition-all active:scale-95"
              onClick={onCreateProject}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {projectsCount > 0 && !isLoading && (
          <div className="mt-2.5 space-y-2">
            {searchMode === 'projects' && (
              <HistoryViewToggle value={historyView} onChange={onHistoryViewChange} t={t} />
            )}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => onSearchModeChange('projects')}
                aria-pressed={searchMode === 'projects'}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                  searchMode === 'projects'
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Folder className="h-3 w-3" />
                {t('search.modeProjects')}
              </button>
              <button
                onClick={() => onSearchModeChange('conversations')}
                aria-pressed={searchMode === 'conversations'}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                  searchMode === 'conversations'
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3 w-3" />
                {t('search.modeConversations')}
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                type="text"
                placeholder={searchMode === 'conversations' ? t('search.conversationsPlaceholder') : t('projects.searchPlaceholder')}
                value={searchFilter}
                onChange={(event) => onSearchFilterChange(event.target.value)}
                className="nav-search-input h-10 rounded-xl border-0 pl-10 pr-9 text-sm transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {searchFilter && (
                <button
                  onClick={onClearSearchFilter}
                  aria-label={t('tooltips.clearSearch')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile divider */}
      <div className="nav-divider md:hidden" />
    </div>
  );
}
