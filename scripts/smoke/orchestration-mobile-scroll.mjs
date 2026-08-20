#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('orchestration mobile scroll smoke')) process.exit(0);

const page = readFileSync('src/components/orchestration/OrchestrationPage.tsx', 'utf8');
const runPanel = readFileSync('src/components/orchestration/workflows/WorkflowRunPanel.tsx', 'utf8');

assert.ok(
  page.includes('overflow-y-auto lg:overflow-hidden'),
  'Orchestration mobile layout should allow page-level vertical scrolling before desktop split mode.',
);

assert.ok(
  /<aside[^>]+className="[^"]*overflow-visible[^"]*lg:overflow-auto/.test(page),
  'Orchestration setup pane should not trap scrolling on mobile.',
);

assert.ok(
  /<section[^>]+className="[^"]*overflow-visible[^"]*lg:overflow-hidden/.test(page),
  'Orchestration run section should stay reachable in mobile document flow.',
);

assert.ok(
  /className="[^"]*overflow-visible[^"]*xl:overflow-auto/.test(runPanel),
  'Workflow run panel should avoid nested scroll traps before its desktop two-column layout.',
);

console.log('orchestration mobile scroll smoke passed');
