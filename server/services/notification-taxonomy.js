const NOTIFICATION_PREFERENCE_KEYS = Object.freeze({
  ACTION_REQUIRED: 'actionRequired',
  STOP: 'stop',
  ERROR: 'error',
  UPDATES: 'updates',
});

const NOTIFICATION_EVENT_TYPES = Object.freeze({
  CHAT_DONE: 'chat.done',
  ORCHESTRATION_DONE: 'orchestration.done',
  APPROVAL_NEEDED: 'approval.needed',
  ERROR: 'error',
  TEST_FAILED: 'test.failed',
  LIVE_VIEW_FAILED: 'live_view.failed',
  RUN_STOPPED: 'run.stopped',
  RUN_FAILED: 'run.failed',
  AGENT_NOTIFICATION: 'agent.notification',
  PUSH_ENABLED: 'push.enabled',
  APP_UPDATE_AVAILABLE: 'app.update.available',
  CLI_UPDATE_AVAILABLE: 'cli.update.available',
});

const NOTIFICATION_TAXONOMY = Object.freeze({
  [NOTIFICATION_EVENT_TYPES.CHAT_DONE]: {
    category: 'chat',
    kind: 'stop',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.STOP,
    description: 'A chat/provider run completed.',
  },
  [NOTIFICATION_EVENT_TYPES.ORCHESTRATION_DONE]: {
    category: 'orchestration',
    kind: 'stop',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.STOP,
    description: 'An orchestration workflow completed.',
  },
  [NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED]: {
    category: 'approval',
    kind: 'action_required',
    severity: 'warning',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ACTION_REQUIRED,
    requiresUserAction: true,
    description: 'A run is waiting for human approval.',
  },
  [NOTIFICATION_EVENT_TYPES.ERROR]: {
    category: 'system',
    kind: 'error',
    severity: 'error',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ERROR,
    description: 'A generic Pixcode error occurred.',
  },
  [NOTIFICATION_EVENT_TYPES.TEST_FAILED]: {
    category: 'verification',
    kind: 'error',
    severity: 'error',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ERROR,
    description: 'A build, lint, typecheck, or test command failed.',
  },
  [NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED]: {
    category: 'live_view',
    kind: 'error',
    severity: 'error',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ERROR,
    description: 'A Live View preview failed to start or stay healthy.',
  },
  [NOTIFICATION_EVENT_TYPES.RUN_STOPPED]: {
    category: 'run',
    kind: 'stop',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.STOP,
    description: 'A run stopped without reporting a failure.',
  },
  [NOTIFICATION_EVENT_TYPES.RUN_FAILED]: {
    category: 'run',
    kind: 'error',
    severity: 'error',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ERROR,
    description: 'A run failed.',
  },
  [NOTIFICATION_EVENT_TYPES.AGENT_NOTIFICATION]: {
    category: 'agent',
    kind: 'action_required',
    severity: 'warning',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.ACTION_REQUIRED,
    requiresUserAction: true,
    description: 'An agent emitted a notification for the user.',
  },
  [NOTIFICATION_EVENT_TYPES.PUSH_ENABLED]: {
    category: 'settings',
    kind: 'info',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.UPDATES,
    description: 'Push notifications were enabled.',
  },
  [NOTIFICATION_EVENT_TYPES.APP_UPDATE_AVAILABLE]: {
    category: 'update',
    kind: 'update',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.UPDATES,
    description: 'A Pixcode app update is available.',
  },
  [NOTIFICATION_EVENT_TYPES.CLI_UPDATE_AVAILABLE]: {
    category: 'update',
    kind: 'update',
    severity: 'info',
    preferenceKey: NOTIFICATION_PREFERENCE_KEYS.UPDATES,
    description: 'A CLI update is available.',
  },
});

const LEGACY_CODE_TO_EVENT_TYPE = Object.freeze({
  'permission.required': NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED,
  'run.stopped': NOTIFICATION_EVENT_TYPES.RUN_STOPPED,
  'run.failed': NOTIFICATION_EVENT_TYPES.RUN_FAILED,
  'agent.notification': NOTIFICATION_EVENT_TYPES.AGENT_NOTIFICATION,
  'push.enabled': NOTIFICATION_EVENT_TYPES.PUSH_ENABLED,
  'app.update.available': NOTIFICATION_EVENT_TYPES.APP_UPDATE_AVAILABLE,
  'cli.update.available': NOTIFICATION_EVENT_TYPES.CLI_UPDATE_AVAILABLE,
  'chat.done': NOTIFICATION_EVENT_TYPES.CHAT_DONE,
  'orchestration.done': NOTIFICATION_EVENT_TYPES.ORCHESTRATION_DONE,
  'test.failed': NOTIFICATION_EVENT_TYPES.TEST_FAILED,
  'live_view.failed': NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED,
});

const KIND_TO_EVENT_TYPE = Object.freeze({
  action_required: NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED,
  stop: NOTIFICATION_EVENT_TYPES.RUN_STOPPED,
  error: NOTIFICATION_EVENT_TYPES.ERROR,
  update: NOTIFICATION_EVENT_TYPES.APP_UPDATE_AVAILABLE,
  info: NOTIFICATION_EVENT_TYPES.AGENT_NOTIFICATION,
});

function resolveNotificationEventType(event = {}) {
  if (typeof event.eventType === 'string' && NOTIFICATION_TAXONOMY[event.eventType]) {
    return event.eventType;
  }

  if (typeof event.code === 'string' && LEGACY_CODE_TO_EVENT_TYPE[event.code]) {
    return LEGACY_CODE_TO_EVENT_TYPE[event.code];
  }

  if (typeof event.kind === 'string' && KIND_TO_EVENT_TYPE[event.kind]) {
    return KIND_TO_EVENT_TYPE[event.kind];
  }

  return NOTIFICATION_EVENT_TYPES.AGENT_NOTIFICATION;
}

function getNotificationTaxonomy(event = {}) {
  return NOTIFICATION_TAXONOMY[resolveNotificationEventType(event)];
}

function getNotificationPreferenceKey(event = {}) {
  return getNotificationTaxonomy(event)?.preferenceKey || NOTIFICATION_PREFERENCE_KEYS.UPDATES;
}

function normalizeNotificationEvent(event = {}) {
  const eventType = resolveNotificationEventType(event);
  const taxonomy = NOTIFICATION_TAXONOMY[eventType];

  return {
    ...event,
    eventType,
    category: taxonomy.category,
    kind: event.kind || taxonomy.kind,
    severity: event.severity || taxonomy.severity,
    preferenceKey: taxonomy.preferenceKey,
    requiresUserAction: Boolean(event.requiresUserAction ?? taxonomy.requiresUserAction),
  };
}

function createNotificationEventContract(event = {}) {
  const normalized = normalizeNotificationEvent(event);
  const taxonomy = NOTIFICATION_TAXONOMY[normalized.eventType];

  return {
    eventType: normalized.eventType,
    category: normalized.category,
    kind: normalized.kind,
    severity: normalized.severity,
    preferenceKey: normalized.preferenceKey,
    requiresUserAction: normalized.requiresUserAction,
    description: taxonomy.description,
  };
}

function listNotificationTaxonomy() {
  return Object.keys(NOTIFICATION_TAXONOMY).map((eventType) =>
    createNotificationEventContract({ eventType })
  );
}

export {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_TAXONOMY,
  createNotificationEventContract,
  getNotificationPreferenceKey,
  getNotificationTaxonomy,
  listNotificationTaxonomy,
  normalizeNotificationEvent,
  resolveNotificationEventType,
};
