#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notificationCenter = readFileSync('src/components/notifications/InAppNotificationCenter.tsx', 'utf8');

assert.ok(
  notificationCenter.includes('inAppEnabledByPreference'),
  'In-app notification center should explicitly read notificationPreferences.channels.inApp.',
);

assert.ok(
  notificationCenter.includes('if (!inAppEnabled)'),
  'In-app notification center should skip storing/opening alerts when the in-app channel is disabled.',
);

assert.ok(
  notificationCenter.indexOf('notifyLocalEventOnce') < notificationCenter.indexOf('if (!inAppEnabled)'),
  'Desktop/browser notification dispatch should remain independent from the in-app channel guard.',
);

console.log('notification in-app preference smoke passed');
