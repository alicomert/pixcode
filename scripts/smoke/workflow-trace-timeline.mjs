#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('workflow trace timeline smoke')) process.exit(0);

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const types = read('server/modules/orchestration/workflows/workflow.types.ts');
assert(types.includes('WorkflowTraceEvent'), 'Workflow trace event type is missing.');
assert(types.includes("type: 'run' | 'node' | 'provider' | 'message' | 'artifact' | 'file' | 'error'"), 'Trace event type taxonomy is missing.');
assert(types.includes("severity: 'info' | 'warning' | 'error'"), 'Trace event severity taxonomy is missing.');

const traceService = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert(traceService.includes('export function buildWorkflowTrace'), 'Workflow trace builder is missing.');
assert(traceService.includes('redactTraceText'), 'Trace text redaction helper is missing.');
assert(traceService.includes('file-diff'), 'Trace builder must surface file edit artifacts.');
assert(traceService.includes('durationMs'), 'Trace builder must include event durations.');
assert(traceService.includes('workflow.trace.runStarted'), 'Trace builder must emit stable trace title keys.');

const routes = read('server/modules/orchestration/workflows/workflow.routes.ts');
assert(routes.includes("'/workflows/runs/:runId/trace'"), 'Workflow trace API endpoint is missing.');
assert(routes.includes('buildWorkflowTrace(run)'), 'Workflow trace route must use the shared trace builder.');

const panel = read('src/components/orchestration/workflows/WorkflowRunPanel.tsx');
assert(panel.includes('WorkflowTraceEvent'), 'Workflow run panel must type trace events.');
assert(panel.includes('loadTrace'), 'Workflow run panel must load trace events from the API.');
assert(panel.includes('traceFilters'), 'Workflow run panel must expose trace filters.');
assert(panel.includes('traceTimelineId'), 'Workflow trace timeline tab is missing.');
assert(panel.includes('orchestration.traceTimeline'), 'Workflow run panel must render the trace timeline label.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert(en.includes('"traceTimeline"'), 'English trace timeline translation is missing.');
assert(tr.includes('"traceTimeline"'), 'Turkish trace timeline translation is missing.');

console.log(JSON.stringify({ ok: true, checked: 'workflow trace timeline' }, null, 2));
