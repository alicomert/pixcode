const NOTIFICATION_ONCE_PREFIX = 'pixcode.notification.once.';
const NOTIFICATION_PREFS_KEY = 'pixcode.notificationPreferences.v1';

type NotifyOnceOptions = {
  key: string;
  title: string;
  body: string;
  event?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

const EVENT_KEY_MAP: Record<string, string> = {
  action_required: 'actionRequired',
  stop: 'stop',
  error: 'error',
  update: 'updates',
  updates: 'updates',
};

function eventEnabledByPreference(event = 'updates'): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY) ?? 'null') as {
      channels?: { desktop?: boolean };
      events?: Record<string, boolean>;
    } | null;
    if (parsed?.channels?.desktop === false) {
      return false;
    }
    return parsed?.events?.[EVENT_KEY_MAP[event] || event] !== false;
  } catch {
    return true;
  }
}

export function persistLocalNotificationPreferences(preferences: unknown) {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Notifications still work with browser permission even if localStorage is unavailable.
  }
}

export async function notifyOnce({
  key,
  title,
  body,
  tag,
  data,
}: NotifyOnceOptions): Promise<boolean> {
  return notifyLocalEventOnce({
    key,
    title,
    body,
    event: 'updates',
    tag,
    data,
  });
}

export async function notifyLocalEventOnce({
  key,
  title,
  body,
  event = 'updates',
  tag,
  data,
}: NotifyOnceOptions): Promise<boolean> {
  if (
    typeof window === 'undefined'
    || !('Notification' in window)
    || Notification.permission !== 'granted'
    || !eventEnabledByPreference(event)
  ) {
    return false;
  }

  const storageKey = `${NOTIFICATION_ONCE_PREFIX}${key}`;
  try {
    if (localStorage.getItem(storageKey)) {
      return false;
    }
  } catch {
    // If localStorage is blocked, send at most from this call path.
  }

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/logo-256.png',
    badge: '/logo-128.png',
    tag,
    data,
    renotify: Boolean(tag),
  };

  try {
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.ready.catch(() => null)
      : null;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }

    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Best effort dedupe only.
    }
    return true;
  } catch (error) {
    console.warn('Local notification failed:', error);
    return false;
  }
}
