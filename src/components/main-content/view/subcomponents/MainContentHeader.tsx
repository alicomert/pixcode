import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { MainContentHeaderProps } from '../../types/types';

import MobileMenuButton from './MobileMenuButton';
import MainContentTabSwitcher from './MainContentTabSwitcher';
import MainContentTitle from './MainContentTitle';

import { Settings2 } from '@/lib/icons';

export default function MainContentHeader({
  activeTab,
  setActiveTab,
  selectedProject,
  selectedSession,
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
    <div className="pwa-header-safe flex-shrink-0 border-b border-border/60 bg-background px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[42%]">
          {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
          <MainContentTitle
            activeTab={activeTab}
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            isMobile={isMobile}
          />
          {isMobile && (
            <button
              type="button"
              onClick={() => window.toggleQuickSettings?.()}
              className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted/55 text-muted-foreground transition-colors active:bg-muted"
              aria-label={t('quickSettings.open', { defaultValue: 'Open quick settings' })}
              title={t('quickSettings.open', { defaultValue: 'Open quick settings' })}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {activeTab !== 'controlRoom' && (
          <div className="relative min-w-0 overflow-hidden sm:flex-shrink-0">
            {canScrollLeft && (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
            )}
            <div className="relative min-w-0 overflow-hidden">
              <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="scrollbar-hide overflow-x-auto"
              >
                <MainContentTabSwitcher
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
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
        )}
      </div>
    </div>
  );
}
