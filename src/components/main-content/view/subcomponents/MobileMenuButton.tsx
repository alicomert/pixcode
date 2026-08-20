import { useTranslation } from 'react-i18next';

import { useMobileMenuHandlers } from '../../hooks/useMobileMenuHandlers';
import type { MobileMenuButtonProps } from '../../types/types';

export default function MobileMenuButton({ onMenuClick, compact = false }: MobileMenuButtonProps) {
  const { t } = useTranslation('common');
  const { handleMobileMenuClick, handleMobileMenuTouchEnd } = useMobileMenuHandlers(onMenuClick);

  const buttonClasses = compact
    ? 'p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/60 pwa-menu-button'
    : 'p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/60 touch-manipulation active:scale-95 pwa-menu-button flex-shrink-0';

  return (
    <button
      type="button"
      onClick={handleMobileMenuClick}
      onTouchEnd={handleMobileMenuTouchEnd}
      className={`${buttonClasses} mobile-touch-target flex items-center justify-center`}
      aria-label={t('sidebar.open', { defaultValue: 'Open menu' })}
      title={t('sidebar.open', { defaultValue: 'Open menu' })}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
