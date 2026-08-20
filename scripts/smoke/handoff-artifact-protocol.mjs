#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('handoff artifact smoke')) process.exit(0);

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const handoffSource = read('server/modules/orchestration/workflows/handoff-artifact.ts');
assert.match(handoffSource, /PIXCODE_HANDOFF_PROTOCOL/, 'Handoff artifacts should declare a stable protocol id.');
assert.match(handoffSource, /pixcode\.handoff\.v1/, 'Handoff artifacts should use the v1 protocol id.');
assert.match(handoffSource, /taskStatus/, 'Handoff schema should require task status.');
assert.match(handoffSource, /contextSummary/, 'Handoff schema should require compacted context summary.');
assert.match(handoffSource, /changedFiles/, 'Handoff schema should require changed files.');
assert.match(handoffSource, /blockers/, 'Handoff schema should require blockers.');
assert.match(handoffSource, /nextAction/, 'Handoff schema should require the requested next action.');
assert.match(handoffSource, /parseHandoffArtifact/, 'Handoff artifacts should have parser/validation logic.');
assert.match(handoffSource, /formatHandoffArtifactForContext/, 'Handoff artifacts should be formatted for downstream agent context.');
assert.match(handoffSource, /handoffArtifactToWorkflowArtifact/, 'Handoff artifacts should persist as workflow artifacts.');

const runnerSource = read('server/modules/orchestration/workflows/workflow-runner.ts');
assert.match(runnerSource, /requiresHandoffArtifact/, 'Workflow runner should detect handoff nodes that require artifacts.');
assert.match(runnerSource, /parseHandoffArtifact/, 'Workflow runner should validate handoff node output.');
assert.match(runnerSource, /handoffArtifactToWorkflowArtifact/, 'Workflow runner should persist structured handoff artifacts.');
assert.match(runnerSource, /formatHandoffArtifactForContext/, 'Workflow runner should pass structured handoff context downstream.');
assert.match(runnerSource, /Invalid handoff artifact/, 'Invalid handoff artifacts should fail visibly.');
assert.match(runnerSource, /"protocol": "pixcode\.handoff\.v1"/, 'Handoff prompts should request the protocol JSON shape.');

const workflowTypes = read('server/modules/orchestration/workflows/workflow.types.ts');
assert.match(workflowTypes, /WorkflowHandoffArtifact/, 'Workflow run types should expose handoff artifacts.');
assert.match(workflowTypes, /handoffArtifact\?: WorkflowHandoffArtifact/, 'Node runs should persist the validated handoff artifact.');

const traceSource = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert.match(traceSource, /handoff-artifact/, 'Trace timeline should identify handoff artifacts.');
assert.match(traceSource, /workflow\.trace\.handoffArtifact/, 'Trace timeline should label handoff artifacts.');

const nodeStream = read('src/components/orchestration/workflows/WorkflowNodeStream.tsx');
assert.match(nodeStream, /handoff-artifact/, 'Workflow UI should render handoff artifacts.');
assert.match(nodeStream, /orchestration\.artifact\.handoff/, 'Workflow UI should label handoff artifacts.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert.match(en, /"handoff": "Handoff artifact"/, 'English UI should label handoff artifacts.');
assert.match(tr, /"handoff": "Handoff artifact"/, 'Turkish UI should label handoff artifacts.');

console.log('handoff artifact protocol smoke passed');
