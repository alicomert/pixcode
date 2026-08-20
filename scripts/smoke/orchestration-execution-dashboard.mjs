#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('orchestration execution dashboard smoke')) process.exit(0);

const source = readFileSync('src/components/orchestration/OrchestrationPage.tsx', 'utf8');

assert.ok(
  source.includes('isExecutionMode'),
  'Orchestration page should derive an execution mode while a run is queued/running.',
);

assert.ok(
  source.includes('data-orchestration-execution-mode'),
  'Orchestration layout should expose execution mode for regression checks and styling.',
);

assert.ok(
  /isExecutionMode\s*\?\s*'lg:grid-cols-\[minmax\(0,1fr\)\]'/m.test(source),
  'Execution mode should collapse to a single full-width run panel column on desktop.',
);

assert.ok(
  /!\s*isExecutionMode\s*\?\s*\(\s*<aside/m.test(source),
  'The setup/start aside should not render while execution mode is active.',
);

assert.ok(
  /!\s*isExecutionMode\s*\?\s*\(\s*<button[\s\S]{0,800}?startPaneResize/m.test(source),
  'The pane resize handle should not render while execution mode is active.',
);

console.log('orchestration execution dashboard smoke passed');
