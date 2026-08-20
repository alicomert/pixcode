#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { skipIfOrchestrationRetired } from './_orchestration-retired.mjs';

if (skipIfOrchestrationRetired('context packet smoke')) process.exit(0);

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const contextSource = read('server/modules/orchestration/workflows/context-packet.ts');
assert.match(contextSource, /PIXCODE_CONTEXT_PROTOCOL/, 'Context packets should declare a stable protocol id.');
assert.match(contextSource, /pixcode\.context\.v1/, 'Context packets should use the v1 protocol id.');
assert.match(contextSource, /originalUserRequest/, 'Context packets should preserve the original user request.');
assert.match(contextSource, /project/, 'Context packets should include project metadata.');
assert.match(contextSource, /task/, 'Context packets should include task metadata.');
assert.match(contextSource, /constraints/, 'Context packets should include execution constraints.');
assert.match(contextSource, /upstreamArtifacts/, 'Context packets should include upstream artifact context.');
assert.match(contextSource, /runState/, 'Context packets should include current run state.');
assert.match(contextSource, /compaction/, 'Context packets should expose compaction metadata.');
assert.match(contextSource, /formatContextPacketForPrompt/, 'Context packets should be formatted for prompts.');

const types = read('server/modules/orchestration/workflows/workflow.types.ts');
assert.match(types, /WorkflowContextPacket/, 'Workflow types should expose context packets.');
assert.match(types, /contextPacket\?: WorkflowContextPacket/, 'Node runs should persist context packets.');

const runner = read('server/modules/orchestration/workflows/workflow-runner.ts');
assert.match(runner, /buildWorkflowContextPacket/, 'Workflow runner should build context packets.');
assert.match(runner, /formatContextPacketForPrompt/, 'Workflow runner should inject context packets into prompts.');
assert.ok(
  runner.indexOf('Original user request') < runner.indexOf('formatContextPacketForPrompt(contextPacket)')
    && runner.indexOf('formatContextPacketForPrompt(contextPacket)') < runner.indexOf('workspaceContextPrompt(workspaceTarget)'),
  'Original request must stay before structured context, and workspace context must remain derived context.',
);

const trace = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert.match(trace, /contextPacket/, 'Workflow trace should surface context packet metadata.');
assert.match(trace, /workflow\.trace\.contextPacket/, 'Workflow trace should label context packet events.');
assert.match(trace, /compaction/, 'Workflow trace should include context compaction metadata.');

console.log('context packet smoke passed');
