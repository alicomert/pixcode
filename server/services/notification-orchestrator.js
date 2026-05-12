import webPush from 'web-push';

import { notificationPreferencesDb, pushSubscriptionsDb, sessionNamesDb } from '../database/db.js';

import { notifyUser as notifyTelegramUser } from './telegram/bot.js';
import {
  NOTIFICATION_EVENT_TYPES,
  createNotificationEventContract,
  getNotificationPreferenceKey,
  normalizeNotificationEvent
} from './notification-taxonomy.js';

const PROVIDER_LABELS = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  qwen: 'Qwen Code',
  opencode: 'OpenCode',
  system: 'System'
};

const recentEventKeys = new Map();
const DEDUPE_WINDOW_MS = 20000;
let notificationWebSocketServer = null;

function setNotificationWebSocketServer(wss) {
  notificationWebSocketServer = wss;
}

const cleanupOldEventKeys = () => {
  const now = Date.now();
  for (const [key, timestamp] of recentEventKeys.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentEventKeys.delete(key);
    }
  }
};

function shouldSendPush(preferences, event) {
  const webPushEnabled = Boolean(preferences?.channels?.webPush);
  const prefEventKey = getNotificationPreferenceKey(event);
  const eventEnabled = prefEventKey ? Boolean(preferences?.events?.[prefEventKey]) : true;

  return webPushEnabled && eventEnabled;
}

function shouldSendInApp(preferences, event) {
  const inAppEnabled = preferences?.channels?.inApp !== false;
  const prefEventKey = getNotificationPreferenceKey(event);
  const eventEnabled = prefEventKey ? preferences?.events?.[prefEventKey] !== false : true;

  return inAppEnabled && eventEnabled;
}

function shouldSendTelegram(preferences, event) {
  const telegramEnabled = preferences?.channels?.telegram !== false;
  const prefEventKey = getNotificationPreferenceKey(event);
  const eventEnabled = prefEventKey ? preferences?.events?.[prefEventKey] !== false : true;

  return telegramEnabled && eventEnabled;
}

function isDuplicate(event) {
  cleanupOldEventKeys();
  const key = event.dedupeKey || `${event.provider}:${event.kind || 'info'}:${event.code || 'generic'}:${event.sessionId || 'none'}`;
  if (recentEventKeys.has(key)) {
    return true;
  }
  recentEventKeys.set(key, Date.now());
  return false;
}

function createNotificationEvent({
  provider,
  sessionId = null,
  eventType = null,
  kind = 'info',
  code = 'generic.info',
  meta = {},
  severity = 'info',
  dedupeKey = null,
  requiresUserAction = false
}) {
  return normalizeNotificationEvent({
    provider,
    sessionId,
    eventType,
    kind,
    code,
    meta,
    severity,
    requiresUserAction,
    dedupeKey,
    createdAt: new Date().toISOString()
  });
}

function normalizeErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error.message === 'string') {
    return error.message;
  }

  if (error == null) {
    return 'Unknown error';
  }

  return String(error);
}

function normalizeSessionName(sessionName) {
  if (typeof sessionName !== 'string') {
    return null;
  }

  const normalized = sessionName.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function resolveSessionName(event) {
  const explicitSessionName = normalizeSessionName(event.meta?.sessionName);
  if (explicitSessionName) {
    return explicitSessionName;
  }

  if (!event.sessionId || !event.provider) {
    return null;
  }

  return normalizeSessionName(sessionNamesDb.getName(event.sessionId, event.provider));
}

function buildPushBody(event) {
  const EVENT_TYPE_MAP = {
    [NOTIFICATION_EVENT_TYPES.CHAT_DONE]: event.meta?.stopReason || 'Chat run completed',
    [NOTIFICATION_EVENT_TYPES.ORCHESTRATION_DONE]: event.meta?.stopReason || 'Orchestration completed',
    [NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED]: event.meta?.toolName
      ? `Action Required: Tool "${event.meta.toolName}" needs approval`
      : 'Action Required: A run needs your approval',
    [NOTIFICATION_EVENT_TYPES.ERROR]: event.meta?.error ? `Error: ${event.meta.error}` : 'Pixcode encountered an error',
    [NOTIFICATION_EVENT_TYPES.TEST_FAILED]: event.meta?.error ? `Test Failed: ${event.meta.error}` : 'A verification command failed',
    [NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED]: event.meta?.error ? `Live View Failed: ${event.meta.error}` : 'Live View failed'
  };
  const CODE_MAP = {
    'permission.required': event.meta?.toolName
      ? `Action Required: Tool "${event.meta.toolName}" needs approval`
      : 'Action Required: A tool needs your approval',
    'run.stopped': event.meta?.stopReason || 'Run Stopped: The run has stopped',
    'run.failed': event.meta?.error ? `Run Failed: ${event.meta.error}` : 'Run Failed: The run encountered an error',
    'agent.notification': event.meta?.message ? String(event.meta.message) : 'You have a new notification',
    'push.enabled': 'Push notifications are now enabled!',
    'app.update.available': event.meta?.latestVersion
      ? `Pixcode ${event.meta.latestVersion} is available`
      : 'A Pixcode update is available',
    'cli.update.available': event.meta?.latestVersion
      ? `CLI update available: ${event.meta.latestVersion}`
      : 'A CLI update is available'
  };
  const providerLabel = PROVIDER_LABELS[event.provider] || 'Assistant';
  const sessionName = resolveSessionName(event);
  const message = EVENT_TYPE_MAP[event.eventType] || CODE_MAP[event.code] || 'You have a new notification';

  return {
    title: sessionName || 'Pixcode',
    body: `${providerLabel}: ${message}`,
    data: {
      sessionId: event.sessionId || null,
      eventType: event.eventType || null,
      code: event.code,
      provider: event.provider || null,
      sessionName,
      category: event.category || null,
      preferenceKey: event.preferenceKey || getNotificationPreferenceKey(event),
      tag: `${event.provider || 'assistant'}:${event.sessionId || 'none'}:${event.code}`
    }
  };
}

function buildNotificationPayload(event) {
  const pushBody = buildPushBody(event);
  const contract = createNotificationEventContract(event);
  const baseId = event.dedupeKey || `${event.provider || 'system'}:${event.kind || 'info'}:${event.code || 'generic'}:${event.sessionId || 'none'}`;
  return {
    id: `${baseId}:${event.createdAt}`,
    title: pushBody.title,
    body: pushBody.body,
    eventType: contract.eventType,
    category: contract.category,
    preferenceKey: contract.preferenceKey,
    kind: event.kind || 'info',
    code: event.code || 'generic.info',
    severity: event.severity || 'info',
    provider: event.provider || null,
    sessionId: event.sessionId || null,
    createdAt: event.createdAt,
    requiresUserAction: Boolean(event.requiresUserAction),
    data: pushBody.data
  };
}

function inferRunStoppedEventType({ provider, stopReason }) {
  const reason = typeof stopReason === 'string' ? stopReason.toLowerCase() : '';
  if (provider === 'system' && reason.includes('orchestration')) {
    return NOTIFICATION_EVENT_TYPES.ORCHESTRATION_DONE;
  }

  return NOTIFICATION_EVENT_TYPES.CHAT_DONE;
}

function inferRunFailedEventType({ provider, error }) {
  const message = normalizeErrorMessage(error).toLowerCase();
  if (message.includes('live view')) {
    return NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED;
  }

  if (message.includes('test') || message.includes('typecheck') || message.includes('lint') || message.includes('build')) {
    return NOTIFICATION_EVENT_TYPES.TEST_FAILED;
  }

  return provider === 'system' ? NOTIFICATION_EVENT_TYPES.ERROR : NOTIFICATION_EVENT_TYPES.RUN_FAILED;
}

function broadcastInAppNotification(userId, event) {
  if (!notificationWebSocketServer || !userId || !event) {
    return;
  }

  const message = JSON.stringify({
    type: 'notification:event',
    notification: buildNotificationPayload(event)
  });
  const normalizedUserId = String(userId);

  notificationWebSocketServer.clients.forEach((client) => {
    if (client.readyState === 1 && String(client.userId || '') === normalizedUserId) {
      client.send(message);
    }
  });
}

async function sendWebPush(userId, event) {
  const subscriptions = pushSubscriptionsDb.getSubscriptions(userId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify(buildPushBody(event));

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth
          }
        },
        payload
      )
    )
  );

  // Clean up gone subscriptions (410 Gone or 404)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const statusCode = result.reason?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        pushSubscriptionsDb.removeSubscription(subscriptions[index].endpoint);
      }
    }
  });
}

function notifyUserIfEnabled({ userId, event }) {
  if (!userId || !event) {
    return;
  }

  const preferences = notificationPreferencesDb.getPreferences(userId);
  if (isDuplicate(event)) {
    return;
  }

  if (shouldSendInApp(preferences, event)) {
    try {
      broadcastInAppNotification(userId, event);
    } catch (err) {
      console.error('In-app notification send error:', err);
    }
  }

  if (shouldSendPush(preferences, event)) {
    sendWebPush(userId, event).catch((err) => {
      console.error('Web push send error:', err);
    });
  }

  // Telegram is gated independently of web-push: a user might want Telegram
  // pings without enabling browser push, or vice-versa. The telegram service
  // reads its own per-user notifications_enabled flag.
  const providerLabel = PROVIDER_LABELS[event.provider] || event.provider || 'Session';
  const sessionTitle = event.meta?.sessionName || providerLabel;
  const errorText = event.meta?.error || '';
  if (shouldSendTelegram(preferences, event)) {
    notifyTelegramUser({
      userId,
      kind: event.kind,
      title: sessionTitle,
      error: errorText,
    }).catch((err) => {
      console.warn('[telegram] notify failed:', err?.message || err);
    });
  }
}

function notifyRunStopped({ userId, provider, sessionId = null, stopReason = 'completed', sessionName = null, eventType = null }) {
  notifyUserIfEnabled({
    userId,
    event: createNotificationEvent({
      provider,
      sessionId,
      eventType: eventType || inferRunStoppedEventType({ provider, stopReason }),
      kind: 'stop',
      code: 'run.stopped',
      meta: { stopReason, sessionName },
      severity: 'info',
      dedupeKey: `${provider}:run:stop:${sessionId || 'none'}:${stopReason}`
    })
  });
}

function notifyRunFailed({ userId, provider, sessionId = null, error, sessionName = null, eventType = null }) {
  const errorMessage = normalizeErrorMessage(error);

  notifyUserIfEnabled({
    userId,
    event: createNotificationEvent({
      provider,
      sessionId,
      eventType: eventType || inferRunFailedEventType({ provider, error }),
      kind: 'error',
      code: 'run.failed',
      meta: { error: errorMessage, sessionName },
      severity: 'error',
      dedupeKey: `${provider}:run:error:${sessionId || 'none'}:${errorMessage}`
    })
  });
}

export {
  createNotificationEvent,
  createNotificationEventContract,
  setNotificationWebSocketServer,
  broadcastInAppNotification,
  notifyUserIfEnabled,
  notifyRunStopped,
  notifyRunFailed
};
