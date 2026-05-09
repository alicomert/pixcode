import { useTranslation } from 'react-i18next';

import type { NotificationPreferencesState } from '../../types/types';

import { Bell, BellOff, BellRing, Loader2, MessageSquare, Monitor } from '@/lib/icons';

type NotificationsSettingsTabProps = {
  notificationPreferences: NotificationPreferencesState;
  onNotificationPreferencesChange: (value: NotificationPreferencesState) => void;
  pushPermission: NotificationPermission | 'unsupported';
  isPushSubscribed: boolean;
  isPushLoading: boolean;
  pushError?: string | null;
  onEnablePush: () => void;
  onDisablePush: () => void;
};

export default function NotificationsSettingsTab({
  notificationPreferences,
  onNotificationPreferencesChange,
  pushPermission,
  isPushSubscribed,
  isPushLoading,
  pushError,
  onEnablePush,
  onDisablePush,
}: NotificationsSettingsTabProps) {
  const { t } = useTranslation('settings');

  const pushSupported = pushPermission !== 'unsupported';
  const pushDenied = pushPermission === 'denied';
  const updateChannel = (channel: keyof NotificationPreferencesState['channels'], checked: boolean) => {
    onNotificationPreferencesChange({
      ...notificationPreferences,
      channels: {
        ...notificationPreferences.channels,
        [channel]: checked,
      },
    });
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-foreground">{t('notifications.title')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{t('notifications.description')}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={notificationPreferences.channels.inApp}
            onChange={(event) => updateChannel('inApp', event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="min-w-0 space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BellRing className="h-4 w-4 text-primary" />
              {t('notifications.channels.inApp', { defaultValue: 'In-app center' })}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {t('notifications.channels.inAppDescription', { defaultValue: 'Show live alerts inside Pixcode.' })}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={notificationPreferences.channels.desktop}
            onChange={(event) => updateChannel('desktop', event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="min-w-0 space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Monitor className="h-4 w-4 text-primary" />
              {t('notifications.channels.desktop', { defaultValue: 'Desktop fallback' })}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {t('notifications.channels.desktopDescription', { defaultValue: 'Use browser or app notifications when supported.' })}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={notificationPreferences.channels.telegram}
            onChange={(event) => updateChannel('telegram', event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="min-w-0 space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageSquare className="h-4 w-4 text-primary" />
              {t('notifications.channels.telegram', { defaultValue: 'Telegram' })}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {t('notifications.channels.telegramDescription', { defaultValue: 'Send task and action alerts to the paired bot.' })}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h4 className="font-medium text-foreground">{t('notifications.webPush.title')}</h4>
        {!pushSupported ? (
          <p className="text-sm text-muted-foreground">{t('notifications.webPush.unsupported')}</p>
        ) : pushDenied ? (
          <p className="text-sm text-muted-foreground">{t('notifications.webPush.denied')}</p>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPushLoading}
              onClick={() => {
                if (isPushSubscribed) {
                  onDisablePush();
                } else {
                  onEnablePush();
                }
              }}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isPushSubscribed
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                  : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              }`}
            >
              {isPushLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPushSubscribed ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              {isPushLoading
                ? t('notifications.webPush.loading')
                : isPushSubscribed
                  ? t('notifications.webPush.disable')
                  : t('notifications.webPush.enable')}
            </button>
            {isPushSubscribed && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {t('notifications.webPush.enabled')}
              </span>
            )}
            {pushError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {pushError}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h4 className="font-medium text-foreground">{t('notifications.events.title')}</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.actionRequired}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    actionRequired: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.actionRequired')}
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.stop}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    stop: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.stop')}
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.error}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    error: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.error')}
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.updates}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    updates: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.updates', { defaultValue: 'App and CLI updates' })}
          </label>
        </div>
      </div>
    </div>
  );
}
