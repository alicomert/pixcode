import { Folder, Sparkles } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import type { MainContentStateViewProps } from '../../types/types';
import MobileMenuButton from './MobileMenuButton';

export default function MainContentStateView({ mode, isMobile, onMenuClick, onQuickStartSession }: MainContentStateViewProps) {
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
        <div className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md px-6 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <Folder className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">{t('mainContent.chooseProject')}</h2>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t('mainContent.selectProjectDescription')}</p>
            {onQuickStartSession ? (
              <button
                type="button"
                onClick={() => { void onQuickStartSession(); }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                {t('mainContent.startChatting', { defaultValue: 'Start a new chat' })}
              </button>
            ) : (
              <div className="rounded-xl border border-primary/10 bg-primary/5 p-3.5">
                <p className="text-sm text-primary">
                  <strong>{t('mainContent.tip')}:</strong> {isMobile ? t('mainContent.createProjectMobile') : t('mainContent.createProjectDesktop')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
