#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const refreshUtilPath = 'src/utils/runStateRefresh.ts';
assert.ok(existsSync(refreshUtilPath), 'Run state refresh utility should exist.');

const refreshUtil = readFileSync(refreshUtilPath, 'utf8');
const chatRealtime = readFileSync('src/components/chat/hooks/useChatRealtimeHandlers.ts', 'utf8');
const chatSession = readFileSync('src/components/chat/hooks/useChatSessionState.ts', 'utf8');
const chatInterface = readFileSync('src/components/chat/view/ChatInterface.tsx', 'utf8');
const changedFilesHook = readFileSync('src/hooks/useChangedFilesMonitor.ts', 'utf8');
const orchestrationPage = readFileSync('src/components/orchestration/OrchestrationPage.tsx', 'utf8');
const runPanel = readFileSync('src/components/orchestration/workflows/WorkflowRunPanel.tsx', 'utf8');

assert.ok(
  refreshUtil.includes('PIXCODE_RUN_STATE_REFRESH_EVENT') && refreshUtil.includes('dispatchRunStateRefresh'),
  'Run state refresh utility should expose a stable browser event and dispatcher.',
);

assert.ok(
  chatRealtime.includes('onSessionSettled') && chatRealtime.includes('dispatchRunStateRefresh'),
  'Chat realtime handlers should dispatch and callback on completion/failure so persisted messages are rehydrated.',
);

assert.ok(
  chatSession.includes('refreshActiveSessionMessages') && chatSession.includes('refreshActiveSessionMessages,'),
  'Chat session state should expose its canonical server refresh path to realtime handlers.',
);

assert.ok(
  chatInterface.includes('handleSessionSettled') && chatInterface.includes('refreshActiveSessionMessages'),
  'Chat interface should refresh the active session when a run settles.',
);

assert.ok(
  changedFilesHook.includes('PIXCODE_RUN_STATE_REFRESH_EVENT') && changedFilesHook.includes("run-state"),
  'Changed-files monitor should refresh on canonical run-state events.',
);

assert.ok(
  orchestrationPage.includes('mergeRunSnapshot') && orchestrationPage.includes('dispatchRunStateRefresh'),
  'Orchestration page should merge run snapshots and dispatch terminal refresh events.',
);

assert.ok(
  runPanel.includes('onRunSnapshot') && runPanel.includes('onRunSnapshot?.(nextRun)'),
  'Workflow run panel should push run snapshots back to the parent list.',
);

console.log('run state refresh smoke passed');
