import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bell, BellRing, X } from '@/lib/icons';
import { notifyLocalEventOnce } from '@/utils/localNotifications';

type NotificationMessage = {
  type?: string;
  notification?: NotificationItem;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  eventType?: string;
  category?: string;
  preferenceKey?: string;
  kind?: string;
  code?: string;
  severity?: 'info' | 'warning' | 'error' | string;
  provider?: string | null;
  sessionId?: string | null;
  createdAt?: string;
  data?: Record<string, unknown>;
};

type InAppNotificationCenterProps = {
  latestMessage: unknown;
  variant?: 'floating' | 'inline';
};

const STORAGE_KEY = 'pixcode.inAppNotifications.v1';
const NOTIFICATION_PREFS_KEY = 'pixcode.notificationPreferences.v1';
const MAX_NOTIFICATIONS = 25;

function readStoredNotifications(): NotificationItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as NotificationItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_NOTIFICATIONS) : [];
  } catch {
    return [];
  }
}

function persistNotifications(items: NotificationItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // The in-app center still works for the current session if localStorage is blocked.
  }
}

function inAppEnabledByPreference(): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY) ?? 'null') as {
      channels?: { inApp?: boolean };
    } | null;
    return parsed?.channels?.inApp !== false;
  } catch {
    return true;
  }
}

function toNotificationItem(value: unknown): NotificationItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Partial<NotificationItem>;
  if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') {
    return null;
  }

  return {
    id: item.id,
    title: item.title,
    body: item.body,
    eventType: item.eventType,
    category: item.category,
    preferenceKey: item.preferenceKey,
    kind: item.kind,
    code: item.code,
    severity: item.severity || 'info',
    provider: item.provider ?? null,
    sessionId: item.sessionId ?? null,
    createdAt: item.createdAt || new Date().toISOString(),
    data: item.data,
  };
}

function severityStyles(severity?: string) {
  if (severity === 'error') {
    return 'border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950/35 dark:text-red-50';
  }

  if (severity === 'warning') {
    return 'border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/35 dark:text-amber-50';
  }

  return 'border-border bg-card text-card-foreground';
}

function formatTime(createdAt?: string) {
  if (!createdAt) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(createdAt));
  } catch {
    return '';
  }
}

export default function InAppNotificationCenter({ latestMessage, variant = 'floating' }: InAppNotificationCenterProps) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<NotificationItem[]>(() => (
    typeof window === 'undefined' ? [] : readStoredNotifications()
  ));
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [inAppEnabled, setInAppEnabled] = useState(() => (
    typeof window === 'undefined' ? true : inAppEnabledByPreference()
  ));

  useEffect(() => {
    const refreshPreference = () => setInAppEnabled(inAppEnabledByPreference());
    window.addEventListener('storage', refreshPreference);
    window.addEventListener('pixcode:notification-preferences-changed', refreshPreference);
    return () => {
      window.removeEventListener('storage', refreshPreference);
      window.removeEventListener('pixcode:notification-preferences-changed', refreshPreference);
    };
  }, []);

  useEffect(() => {
    const message = latestMessage as NotificationMessage | null;
    if (!message || message.type !== 'notification:event') {
      return;
    }

    const nextItem = toNotificationItem(message.notification);
    if (!nextItem) {
      return;
    }

    void notifyLocalEventOnce({
      key: nextItem.id,
      title: nextItem.title,
      body: nextItem.body,
      event: nextItem.eventType || nextItem.kind || 'updates',
      tag: typeof nextItem.data?.tag === 'string' ? nextItem.data.tag : nextItem.id,
      data: nextItem.data,
    });

    if (!inAppEnabled) {
      return;
    }

    setItems((current) => {
      if (current.some((item) => item.id === nextItem.id)) {
        return current;
      }

      const nextItems = [nextItem, ...current].slice(0, MAX_NOTIFICATIONS);
      persistNotifications(nextItems);
      return nextItems;
    });

    setReadIds((current) => {
      const next = new Set(current);
      next.delete(nextItem.id);
      return next;
    });
    setIsOpen(true);
  }, [inAppEnabled, latestMessage]);

  const unreadCount = useMemo(
    () => items.filter((item) => !readIds.has(item.id)).length,
    [items, readIds],
  );

  const markAllRead = useCallback(() => {
    setReadIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => {
      const nextItems = current.filter((item) => item.id !== id);
      persistNotifications(nextItems);
      return nextItems;
    });
    setReadIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  if (!inAppEnabled || (variant === 'floating' && items.length === 0)) {
    return null;
  }

  const hasUnread = unreadCount > 0;
  const rootClassName = variant === 'inline'
    ? 'relative flex h-full items-center'
    : 'pointer-events-none fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2';
  const Icon = hasUnread ? BellRing : Bell;
  const buttonClassName = variant === 'inline'
    ? `relative inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
        hasUnread
          ? 'border-red-500/70 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300'
          : 'border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
      }`
    : `pointer-events-auto relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background/95 shadow-md shadow-black/10 backdrop-blur transition-colors hover:bg-muted ${
        hasUnread ? 'border-red-500/70 text-red-600 dark:text-red-300' : 'border-border text-foreground'
      }`;
  const panelClassName = variant === 'inline'
    ? 'absolute right-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl shadow-black/10'
    : 'pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-black/10';

  return (
    <div className={rootClassName}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((value) => !value);
          if (!isOpen) {
            markAllRead();
          }
        }}
        className={buttonClassName}
        aria-label={t('notifications.open', { defaultValue: 'Open notifications' })}
      >
        <Icon className="h-4 w-4" />
        {hasUnread && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={panelClassName}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <BellRing className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="truncate text-sm font-medium text-popover-foreground">
                {t('notifications.title', { defaultValue: 'Notifications' })}
              </span>
              {hasUnread && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAllRead}
                className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t('notifications.markRead', { defaultValue: 'Read' })}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('notifications.close', { defaultValue: 'Close notifications' })}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[22rem] space-y-2 overflow-y-auto p-2">
            {items.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                {t('notifications.empty', { defaultValue: 'No notifications yet' })}
              </div>
            )}
            {items.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className={`rounded-md border p-3 shadow-sm ${severityStyles(item.severity)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!readIds.has(item.id) && (
                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                      )}
                      <p className="truncate text-sm font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm leading-5 opacity-85">{item.body}</p>
                    <p className="mt-2 text-xs opacity-60">{formatTime(item.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className="rounded p-1 opacity-60 transition-opacity hover:opacity-100"
                    aria-label={t('notifications.dismiss', { defaultValue: 'Dismiss notification' })}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
