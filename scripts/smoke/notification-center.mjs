#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orchestrator = readFileSync('server/services/notification-orchestrator.js', 'utf8');
const server = readFileSync('server/index.js', 'utf8');
const workflowRoutes = readFileSync('server/modules/orchestration/workflows/workflow.routes.ts', 'utf8');
const workflowRunner = readFileSync('server/modules/orchestration/workflows/workflow-runner.ts', 'utf8');
const appContent = readFileSync('src/components/app/AppContent.tsx', 'utf8');
const notificationCenter = readFileSync('src/components/notifications/InAppNotificationCenter.tsx', 'utf8');
const localNotifications = readFileSync('src/utils/localNotifications.ts', 'utf8');
const settingsTypes = readFileSync('src/components/settings/types/types.ts', 'utf8');

assert.ok(
  orchestrator.includes('setNotificationWebSocketServer'),
  'Notification orchestrator should accept the shared WebSocket server for in-app delivery.',
);

assert.ok(
  orchestrator.includes('broadcastInAppNotification'),
  'Notification orchestrator should broadcast in-app notification events.',
);

assert.ok(
  orchestrator.includes("type: 'notification:event'"),
  'In-app notifications should use a stable websocket event type.',
);

assert.ok(
  !orchestrator.includes('id: event.dedupeKey ||'),
  'Notification payload ids should not reuse the dedupe key forever; repeated completed runs for the same session need fresh local notifications.',
);

assert.ok(
  orchestrator.includes('event.createdAt') && orchestrator.includes('dedupeKey'),
  'Notification payloads should preserve dedupe metadata while still carrying a per-event timestamp.',
);

assert.ok(
  server.includes('setNotificationWebSocketServer(wss)'),
  'Server should attach the WebSocket server to notification orchestrator.',
);

assert.ok(
  server.includes('ws.userId = request?.user?.id ?? request?.user?.userId ?? null'),
  'Chat WebSocket connections should carry user id for targeted notification delivery.',
);

assert.ok(
  workflowRoutes.includes('readRequestUserId') && workflowRoutes.includes('userId: readRequestUserId(req)'),
  'Orchestration run creation should carry the authenticated user id into workflow metadata.',
);

assert.ok(
  workflowRunner.includes('notifyWorkflowRunFinished')
    && workflowRunner.includes('notifyRunStopped')
    && workflowRunner.includes('notifyRunFailed'),
  'Workflow runner should notify users when orchestration runs complete or fail.',
);

assert.ok(
  appContent.includes('<InAppNotificationCenter latestMessage={latestMessage} />'),
  'App shell should mount the in-app notification center.',
);

assert.ok(
  notificationCenter.includes("message.type !== 'notification:event'"),
  'Notification center should listen only to notification:event payloads.',
);

assert.ok(
  notificationCenter.includes('notifyLocalEventOnce'),
  'Notification center should attempt browser/local notification fallback when supported.',
);

assert.ok(
  localNotifications.includes('notifyLocalEventOnce'),
  'Local notification utilities should support event-specific browser notifications.',
);

assert.ok(
  settingsTypes.includes('telegram: boolean') && settingsTypes.includes('desktop: boolean'),
  'Notification preferences should model Telegram and desktop/native channels alongside in-app and web push.',
);

console.log('notification center smoke passed');
