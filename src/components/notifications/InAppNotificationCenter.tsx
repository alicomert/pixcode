import { useCallback, useEffect, useMemo, useState } from 'react';

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
};

const STORAGE_KEY = 'pixcode.inAppNotifications.v1';
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

export default function InAppNotificationCenter({ latestMessage }: InAppNotificationCenterProps) {
  const [items, setItems] = useState<NotificationItem[]>(() => (
    typeof window === 'undefined' ? [] : readStoredNotifications()
  ));
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const message = latestMessage as NotificationMessage | null;
    if (!message || message.type !== 'notification:event') {
      return;
    }

    const nextItem = toNotificationItem(message.notification);
    if (!nextItem) {
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
    void notifyLocalEventOnce({
      key: nextItem.id,
      title: nextItem.title,
      body: nextItem.body,
      event: nextItem.kind || 'updates',
      tag: typeof nextItem.data?.tag === 'string' ? nextItem.data.tag : nextItem.id,
      data: nextItem.data,
    });
  }, [latestMessage]);

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

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {isOpen && (
        <div className="pointer-events-auto w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <BellRing className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="truncate text-sm font-medium text-popover-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
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
                Read
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[22rem] space-y-2 overflow-y-auto p-2">
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
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((value) => !value);
          if (!isOpen) {
            markAllRead();
          }
        }}
        className="pointer-events-auto relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-lg shadow-black/10 transition-transform hover:scale-105"
        aria-label="Open notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
