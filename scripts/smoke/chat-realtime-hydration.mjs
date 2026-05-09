#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync('src/components/chat/hooks/useChatSessionState.ts', 'utf8');
const store = readFileSync('src/stores/useSessionStore.ts', 'utf8');

assert.ok(
  hook.includes('refreshActiveSessionMessages'),
  'Chat session hook should centralize active-session refresh so focus, polling, and reconnect share the same path.',
);

assert.ok(
  hook.includes("document.addEventListener('visibilitychange'"),
  'Chat session hook should refresh active messages when the page becomes visible again.',
);

assert.ok(
  hook.includes("window.addEventListener('focus'"),
  'Chat session hook should refresh active messages when the window regains focus.',
);

assert.ok(
  hook.includes('CHAT_PROCESSING_SYNC_INTERVAL_MS'),
  'Chat session hook should poll while an agent is processing so missed WebSocket events are recovered.',
);

assert.ok(
  hook.includes('isFetchingSessionMessagesRef'),
  'Chat session hook should guard against overlapping message fetches.',
);

assert.ok(
  store.includes('lastHydratedAt'),
  'Session store should track server hydration time separately from initial fetch freshness.',
);

assert.ok(
  store.includes('dropCaughtUpRealtimeMessages'),
  'Session store refresh should drop only realtime messages caught by server, not blindly clear all realtime output.',
);

console.log('chat realtime hydration smoke passed');
