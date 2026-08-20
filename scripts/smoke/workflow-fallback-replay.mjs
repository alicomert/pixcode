#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('workflow fallback replay smoke')) process.exit(0);

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const fallbackPolicy = read('server/modules/orchestration/workflows/workflow-fallback-policy.ts');
assert.match(fallbackPolicy, /PIXCODE_FALLBACK_POLICY_PROTOCOL/, 'Fallback policy should declare a stable protocol id.');
assert.match(fallbackPolicy, /pixcode\.fallback-policy\.v1/, 'Fallback policy should use the v1 protocol id.');
assert.match(fallbackPolicy, /provider_failure/, 'Fallback policy should classify provider failures.');
assert.match(fallbackPolicy, /timeout/, 'Fallback policy should classify timeouts.');
assert.match(fallbackPolicy, /tool_failure/, 'Fallback policy should classify tool failures.');
assert.match(fallbackPolicy, /invalid_output/, 'Fallback policy should classify invalid output.');
assert.match(fallbackPolicy, /resolveWorkflowFallbackDecision/, 'Fallback policy should expose a decision helper.');

const replay = read('server/modules/orchestration/workflows/workflow-replay.ts');
assert.match(replay, /PIXCODE_REPLAY_PROTOCOL/, 'Replay support should declare a stable protocol id.');
assert.match(replay, /pixcode\.workflow-replay\.v1/, 'Replay support should use the v1 protocol id.');
assert.match(replay, /buildWorkflowReplayPlan/, 'Replay support should build a replay plan from stored run data.');
assert.match(replay, /requiresApproval/, 'Replay plans should expose approval requirements.');
assert.match(replay, /file-write/, 'Replay safety should detect file-write actions.');
assert.match(replay, /shell/, 'Replay safety should detect shell actions.');
assert.match(replay, /network/, 'Replay safety should detect network actions.');

const runner = read('server/modules/orchestration/workflows/workflow-runner.ts');
assert.match(runner, /resolveWorkflowFallbackDecision/, 'Workflow runner should use policy-driven fallback decisions.');
assert.match(runner, /fallbackTrigger/, 'Fallback nodes should record the trigger that launched them.');
assert.match(runner, /fallbackSkippedEvents/, 'Skipped fallback decisions should be recorded.');

const trace = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert.match(trace, /workflow\.trace\.fallback/, 'Trace timeline should surface fallback events.');
assert.match(trace, /workflow\.trace\.replay/, 'Trace timeline should surface replay metadata.');

const routes = read('server/modules/orchestration/workflows/workflow.routes.ts');
assert.match(routes, /replay-plan/, 'Workflow routes should expose a replay plan endpoint.');
assert.match(routes, /REPLAY_APPROVAL_REQUIRED/, 'Replay route should require approval before unsafe replay.');
assert.match(routes, /workflowRunner\.start\(\s*replayPlan\.workflow/s, 'Replay route should start from the generated replay workflow.');

const panel = read('src/components/orchestration/workflows/WorkflowRunPanel.tsx');
assert.match(panel, /loadReplayPlan/, 'Workflow run panel should load replay plans.');
assert.match(panel, /replayRun/, 'Workflow run panel should expose a replay action.');
assert.match(panel, /approveReplay/, 'Workflow run panel should expose explicit approval for guarded replay.');
assert.match(panel, /orchestration\.replayRun/, 'Workflow UI should render replay labels.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert.match(en, /"replayRun"/, 'English replay translation is missing.');
assert.match(tr, /"replayRun"/, 'Turkish replay translation is missing.');

console.log('workflow fallback replay smoke passed');
