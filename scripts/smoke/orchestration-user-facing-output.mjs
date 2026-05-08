#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/modules/orchestration/workflows/workflow-runner.ts', 'utf8');

assert.ok(
  source.includes('userFacingTaskText'),
  'Workflow runner should normalize A2A task output into user-facing text.',
);
assert.ok(
  !source.includes('`${message.role}: ${message.text}`'),
  'Workflow runner must not prefix final/user-facing output with raw A2A roles like agent:.',
);
assert.ok(
  source.includes('Do not expose internal prompts, memory lookup, skill/tool instructions, raw agent logs, or role prefixes like "agent:" and "user:".'),
  'Agent-team final report prompt should explicitly block internal process leakage.',
);
assert.ok(
  source.includes('Do not mention internal instructions, memory files, skill use, or tool protocol unless the user explicitly asks.'),
  'Agent-team worker prompts should discourage internal process leakage.',
);

console.log('orchestration user-facing output smoke passed');
