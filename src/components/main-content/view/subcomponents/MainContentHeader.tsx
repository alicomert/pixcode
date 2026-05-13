import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { MainContentHeaderProps } from '../../types/types';

import MobileMenuButton from './MobileMenuButton';
import MainContentTabSwitcher from './MainContentTabSwitcher';
import MainContentTitle from './MainContentTitle';

import { Sparkles } from '@/lib/icons';

export default function MainContentHeader({
  activeTab,
  setActiveTab,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  liveViewAvailable,
  activeSidePanelTab,
  sidePanelMode,
  canUseSidePanelSplit,
  isMobile,
  onMenuClick,
  onCloseSidePanel,
}: MainContentHeaderProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const controlRoomLabel = t('mainContent.openControlRoom', { defaultValue: 'Open Control Room' });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState]);

  return (
    <div className="pwa-header-safe flex-shrink-0 border-b border-border/60 bg-background px-3 py-1.5 sm:px-4 sm:py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
          <MainContentTitle
            activeTab={activeTab}
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            shouldShowTasksTab={shouldShowTasksTab}
          />
        </div>

        <div className="flex min-w-0 flex-shrink items-center gap-2 overflow-hidden sm:flex-shrink-0">
          {activeTab !== 'controlRoom' && (
            <button
              type="button"
              onClick={() => setActiveTab('controlRoom')}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={controlRoomLabel}
              title={controlRoomLabel}
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="hidden min-[420px]:inline">{controlRoomLabel}</span>
              <span className="min-[420px]:hidden">Control</span>
            </button>
          )}

          <div className="relative min-w-0 overflow-hidden">
            {canScrollLeft && (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
            )}
            <div
              ref={scrollRef}
              onScroll={updateScrollState}
              className="scrollbar-hide overflow-x-auto"
            >
              <MainContentTabSwitcher
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                shouldShowTasksTab={shouldShowTasksTab}
                liveViewAvailable={liveViewAvailable}
                activeSidePanelTab={activeSidePanelTab}
                sidePanelMode={sidePanelMode}
                canUseSidePanelSplit={canUseSidePanelSplit}
                isMobile={isMobile}
                onCloseSidePanel={onCloseSidePanel}
              />
            </div>
            {canScrollRight && (
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
