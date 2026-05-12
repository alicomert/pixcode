import assert from 'node:assert/strict';

import {
  NOTIFICATION_EVENT_TYPES,
  createNotificationEventContract,
  getNotificationPreferenceKey,
  normalizeNotificationEvent,
} from '../../server/services/notification-taxonomy.js';

const requiredEvents = [
  'CHAT_DONE',
  'ORCHESTRATION_DONE',
  'APPROVAL_NEEDED',
  'ERROR',
  'TEST_FAILED',
  'LIVE_VIEW_FAILED',
];

for (const name of requiredEvents) {
  assert.equal(typeof NOTIFICATION_EVENT_TYPES[name], 'string', `${name} must be a public event type`);
}

const approval = normalizeNotificationEvent({
  provider: 'claude',
  sessionId: 'session-1',
  kind: 'action_required',
  code: 'permission.required',
  severity: 'warning',
});
assert.equal(approval.eventType, NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED);
assert.equal(getNotificationPreferenceKey(approval), 'actionRequired');

const chatDone = normalizeNotificationEvent({
  provider: 'codex',
  sessionId: 'session-2',
  eventType: NOTIFICATION_EVENT_TYPES.CHAT_DONE,
  code: 'run.stopped',
});
assert.equal(chatDone.kind, 'stop');
assert.equal(chatDone.severity, 'info');
assert.equal(getNotificationPreferenceKey(chatDone), 'stop');

const liveViewFailed = normalizeNotificationEvent({
  provider: 'system',
  sessionId: 'preview-1',
  eventType: NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED,
  code: 'live_view.failed',
});
assert.equal(liveViewFailed.kind, 'error');
assert.equal(liveViewFailed.severity, 'error');
assert.equal(getNotificationPreferenceKey(liveViewFailed), 'error');

const publicContract = createNotificationEventContract(liveViewFailed);
assert.equal(publicContract.eventType, NOTIFICATION_EVENT_TYPES.LIVE_VIEW_FAILED);
assert.equal(publicContract.preferenceKey, 'error');
assert.equal(publicContract.category, 'live_view');

console.log('notification taxonomy smoke passed');
