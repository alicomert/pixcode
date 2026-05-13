import { useTranslation } from 'react-i18next';

import type { MainContentStateViewProps } from '../../types/types';

import MobileMenuButton from './MobileMenuButton';

import { ClipboardCheck, Folder, FolderPlus, Sparkles, Workflow } from '@/lib/icons';

export default function MainContentStateView({
  mode,
  isMobile,
  onMenuClick,
  onQuickStartSession,
  onQuickStartOrchestration,
  onQuickStartTasks,
  onOpenControlRoom,
}: MainContentStateViewProps) {
  const { t } = useTranslation();

  const isLoading = mode === 'loading';

  return (
    <div className="flex h-full flex-col">
      {isMobile && (
        <div className="pwa-header-safe flex-shrink-0 border-b border-border/50 bg-background/80 p-2 backdrop-blur-sm sm:p-3">
          <MobileMenuButton onMenuClick={onMenuClick} compact />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="mx-auto mb-4 h-10 w-10">
              <div
                className="h-full w-full rounded-full border-[3px] border-muted border-t-primary"
                style={{
                  animation: 'spin 1s linear infinite',
                  WebkitAnimation: 'spin 1s linear infinite',
                  MozAnimation: 'spin 1s linear infinite',
                }}
              />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-foreground">{t('mainContent.loading')}</h2>
            <p className="text-sm">{t('mainContent.settingUpWorkspace')}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-auto p-5">
          <div className="w-full max-w-4xl">
            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted/60">
                <Folder className="h-6 w-6 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">{t('mainContent.landing.title')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('mainContent.landing.description')}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <button
                type="button"
                onClick={onOpenControlRoom}
                className="rounded-md border border-primary/40 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Sparkles className="mb-3 h-5 w-5 text-primary" />
                <div className="text-sm font-semibold">
                  {t('mainContent.openControlRoom', { defaultValue: 'Open Control Room' })}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t('mainContent.openControlRoomDescription', {
                    defaultValue: 'See admin users, team access, production runs, secrets, audits, usage, and remote access in one place.',
                  })}
                </p>
              </button>

              <button
                type="button"
                onClick={() => { void onQuickStartOrchestration?.(); }}
                className="rounded-md border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
              >
                <Workflow className="mb-3 h-5 w-5 text-primary" />
                <div className="text-sm font-semibold">{t('mainContent.landing.startOrchestration')}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t('mainContent.landing.startOrchestrationDescription')}
                </p>
              </button>

              <button
                type="button"
                onClick={() => { void onQuickStartSession?.(); }}
                className="rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <Sparkles className="mb-3 h-5 w-5 text-foreground" />
                <div className="text-sm font-semibold">{t('mainContent.landing.startChat')}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t('mainContent.landing.startChatDescription')}
                </p>
              </button>

              <button
                type="button"
                onClick={() => { void onQuickStartTasks?.(); }}
                className="rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <FolderPlus className="mb-3 h-5 w-5 text-foreground" />
                <div className="text-sm font-semibold">
                  {t('mainContent.landing.createProject', { defaultValue: 'Create New Project' })}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t('mainContent.landing.createProjectDescription', {
                    defaultValue: 'Add an existing workspace or create a folder, then open the provider picker for coding.',
                  })}
                </p>
              </button>

              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('pixcode:create-project'))}
                className="rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <ClipboardCheck className="mb-3 h-5 w-5 text-foreground" />
                <div className="text-sm font-semibold">{t('mainContent.landing.taskSystem')}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t('mainContent.landing.taskSystemDescription')}
                </p>
              </button>
            </div>

            <div className="mt-5 rounded-md border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              {t('mainContent.landing.sidebarHint')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
