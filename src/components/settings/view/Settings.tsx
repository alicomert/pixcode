import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../auth/context/AuthContext';
import ProviderLoginModal from '../../provider-auth/view/ProviderLoginModal';
import { Button } from '../../../shared/view/ui';
import SettingsSidebar from '../view/SettingsSidebar';
import AccessSettingsTab from '../view/tabs/access-settings/AccessSettingsTab';
import AgentsSettingsTab from '../view/tabs/agents-settings/AgentsSettingsTab';
import AppearanceSettingsTab from '../view/tabs/AppearanceSettingsTab';
import CredentialsSettingsTab from '../view/tabs/api-settings/CredentialsSettingsTab';
import GitSettingsTab from '../view/tabs/git-settings/GitSettingsTab';
import NotificationsSettingsTab from '../view/tabs/NotificationsSettingsTab';
import GlobalMarketSettingsTab from '../../plugins/view/GlobalMarketSettingsTab';
import PluginSettingsTab from '../../plugins/view/PluginSettingsTab';
import MobileSettingsTab from '../view/tabs/mobile-settings/MobileSettingsTab';
import TelegramSettingsTab from '../view/tabs/telegram-settings/TelegramSettingsTab';
import DiagnosticsSettingsTab from '../view/tabs/DiagnosticsSettingsTab';
import AboutTab from '../view/tabs/AboutTab';
import { useSettingsController } from '../hooks/useSettingsController';
import { useWebPush } from '../../../hooks/useWebPush';
import { useDeviceSettings } from '../../../hooks/useDeviceSettings';
import type { SettingsProps } from '../types/types';

import { canUseAdminSettingsSurface } from './SettingsSidebar';

import { X } from '@/lib/icons';

function Settings({ isOpen, onClose, projects = [], initialTab = 'agents' }: SettingsProps) {
  const { t } = useTranslation('settings');
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const showLoginModalRef = useRef(false);
  const {
    activeTab,
    setActiveTab,
    saveStatus,
    projectSortOrder,
    setProjectSortOrder,
    codeEditorSettings,
    updateCodeEditorSetting,
    claudePermissions,
    setClaudePermissions,
    notificationPreferences,
    setNotificationPreferences,
    cursorPermissions,
    setCursorPermissions,
    codexPermissionMode,
    setCodexPermissionMode,
    providerAuthStatus,
    checkProviderAuthStatus,
    refreshProviderAuthStatuses,
    geminiPermissionMode,
    setGeminiPermissionMode,
    qwenPermissionMode,
    setQwenPermissionMode,
    opencodePermissions,
    setOpencodePermissions,
    openLoginForProvider,
    showLoginModal,
    setShowLoginModal,
    loginProvider,
    handleLoginComplete,
  } = useSettingsController({
    isOpen,
    initialTab
  });

  const canUseAdminSurface = canUseAdminSettingsSurface(user);
  const visibleActiveTab = !canUseAdminSurface && (activeTab === 'access' || activeTab === 'diagnostics')
    ? 'agents'
    : activeTab;

  useEffect(() => {
    if (visibleActiveTab !== activeTab) setActiveTab(visibleActiveTab);
  }, [activeTab, setActiveTab, visibleActiveTab]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    showLoginModalRef.current = showLoginModal;
  }, [showLoginModal]);

  // Settings is a full-screen surface on phones. Lock the document behind it,
  // make Escape predictable, and return focus to the control that opened it.
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showLoginModalRef.current) return;

      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }

      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[data-settings-close]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const {
    permission: pushPermission,
    isSubscribed: isPushSubscribed,
    isLoading: isPushLoading,
    error: pushError,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
  } = useWebPush();

  const handleEnablePush = async () => {
    const subscribed = await pushSubscribe();
    if (!subscribed) return;

    // Keep the preference in sync only after both the browser subscription and
    // the server registration succeeded. Failed permission/VAPID requests must
    // not make the UI claim that push is enabled.
    setNotificationPreferences((previous) => ({
      ...previous,
      channels: { ...previous.channels, webPush: true },
    }));
  };

  const handleDisablePush = async () => {
    const unsubscribed = await pushUnsubscribe();
    if (!unsubscribed) return;

    setNotificationPreferences((previous) => ({
      ...previous,
      channels: { ...previous.channels, webPush: false },
    }));
  };

  if (!isOpen) {
    return null;
  }

  const isAuthenticated = Boolean(loginProvider && providerAuthStatus[loginProvider]?.authenticated);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixcode-settings-title"
        className="flex h-full w-full flex-col overflow-hidden border border-border bg-background shadow-2xl md:h-[90vh] md:max-w-4xl md:rounded-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-5">
          <h2 id="pixcode-settings-title" className="text-base font-semibold text-foreground">{t('title')}</h2>
          <div className="flex items-center gap-2">
            {saveStatus === 'success' && (
              <span className="animate-in fade-in text-xs text-muted-foreground">{t('saveStatus.success')}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-settings-close
              className="h-10 w-10 touch-manipulation p-0 text-muted-foreground hover:text-foreground active:bg-accent/50"
              aria-label={t('close', { defaultValue: 'Close settings' })}
              title={t('close', { defaultValue: 'Close settings' })}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <SettingsSidebar activeTab={visibleActiveTab} onChange={setActiveTab} />

          {/* Content */}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              key={visibleActiveTab}
              className={`settings-content-enter ${isMobile ? 'space-y-4 p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]' : 'space-y-8 p-6 pb-safe-area-inset-bottom'}`}
            >
              {visibleActiveTab === 'appearance' && (
                <AppearanceSettingsTab
                  projectSortOrder={projectSortOrder}
                  onProjectSortOrderChange={setProjectSortOrder}
                  codeEditorSettings={codeEditorSettings}
                  onCodeEditorThemeChange={(value) => updateCodeEditorSetting('theme', value)}
                  onCodeEditorWordWrapChange={(value) => updateCodeEditorSetting('wordWrap', value)}
                  onCodeEditorShowMinimapChange={(value) => updateCodeEditorSetting('showMinimap', value)}
                  onCodeEditorLineNumbersChange={(value) => updateCodeEditorSetting('lineNumbers', value)}
                  onCodeEditorFontSizeChange={(value) => updateCodeEditorSetting('fontSize', value)}
                />
              )}

              {visibleActiveTab === 'git' && <GitSettingsTab />}

              {visibleActiveTab === 'access' && canUseAdminSurface && <AccessSettingsTab />}

              {visibleActiveTab === 'agents' && (
                <AgentsSettingsTab
                  providerAuthStatus={providerAuthStatus}
                  onProviderLogin={openLoginForProvider}
                  onRefreshProviderAuth={(provider) => checkProviderAuthStatus(provider, { force: true })}
                  onRefreshAllProviderAuth={() => refreshProviderAuthStatuses(undefined, { force: true })}
                  claudePermissions={claudePermissions}
                  onClaudePermissionsChange={setClaudePermissions}
                  cursorPermissions={cursorPermissions}
                  onCursorPermissionsChange={setCursorPermissions}
                  codexPermissionMode={codexPermissionMode}
                  onCodexPermissionModeChange={setCodexPermissionMode}
                  geminiPermissionMode={geminiPermissionMode}
                  onGeminiPermissionModeChange={setGeminiPermissionMode}
                  qwenPermissionMode={qwenPermissionMode}
                  onQwenPermissionModeChange={setQwenPermissionMode}
                  opencodePermissions={opencodePermissions}
                  onOpencodePermissionsChange={setOpencodePermissions}
                  projects={projects}
                />
              )}

            {visibleActiveTab === 'notifications' && (
              <NotificationsSettingsTab
                notificationPreferences={notificationPreferences}
                onNotificationPreferencesChange={setNotificationPreferences}
                pushPermission={pushPermission}
                isPushSubscribed={isPushSubscribed}
                isPushLoading={isPushLoading}
                pushError={pushError}
                onEnablePush={handleEnablePush}
                onDisablePush={handleDisablePush}
              />
            )}

              {visibleActiveTab === 'api' && <CredentialsSettingsTab />}

              {visibleActiveTab === 'plugins' && <PluginSettingsTab />}

              {visibleActiveTab === 'market' && <GlobalMarketSettingsTab />}

              {visibleActiveTab === 'mobile' && <MobileSettingsTab />}

              {visibleActiveTab === 'telegram' && <TelegramSettingsTab />}

              {visibleActiveTab === 'diagnostics' && canUseAdminSurface && <DiagnosticsSettingsTab />}

              {visibleActiveTab === 'about' && <AboutTab />}
            </div>
          </main>
        </div>
      </div>

      <ProviderLoginModal
        key={loginProvider || 'claude'}
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        provider={loginProvider || 'claude'}
        onComplete={handleLoginComplete}
        isAuthenticated={isAuthenticated}
      />

    </div>
  );
}

export default Settings;
