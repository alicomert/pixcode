#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/modules/orchestration/workflows/workflow-runner.ts', 'utf8');
const types = readFileSync('server/modules/orchestration/workflows/workflow.types.ts', 'utf8');
const panel = readFileSync('src/components/orchestration/workflows/WorkflowRunPanel.tsx', 'utf8');

assert.ok(
  types.includes('internal?: boolean'),
  'Workflow nodes/runs should carry an internal flag so init/compact packets stay out of user-facing output.',
);

assert.ok(
  source.includes('handoffInitPrompt('),
  'Strict handoff should create an internal init prompt before each agent work step.',
);

assert.ok(
  source.includes('handoffCompactPrompt('),
  'Strict handoff should create an internal compact prompt after each agent work step.',
);

assert.ok(
  source.includes("safeAgentNodeId(agent, index, 'init')"),
  'Sequential handoff should create a per-agent init node.',
);

assert.ok(
  source.includes("safeAgentNodeId(agent, index, 'work')"),
  'Sequential handoff should create a per-agent work node.',
);

assert.ok(
  source.includes("safeAgentNodeId(agent, index, 'compact')"),
  'Sequential handoff should create a per-agent compact node.',
);

assert.ok(
  /inputs:\s*index === 0\s*\?\s*\[\]\s*:\s*\[safeAgentNodeId\(agents\[index - 1\], index - 1, 'compact'\)\]/m.test(source),
  'Each init node after the first must depend on the previous agent compact node.',
);

assert.ok(
  /inputs:\s*\[initNodeId\]/m.test(source),
  'Each work node must depend on its init node.',
);

assert.ok(
  /inputs:\s*\[workNodeId\]/m.test(source),
  'Each compact node must depend on its work node.',
);

assert.ok(
  panel.includes('visibleNodeRuns'),
  'Workflow UI should filter internal init/compact node runs from visible output.',
);

console.log('strict handoff compact smoke passed');
