#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const service = read('server/services/production-agent-loop.js');
assert.match(service, /createIssueToPrRun/, 'Production loop should create GitHub issue-to-PR runs.');
assert.match(service, /parseCiRepairSignals/, 'Production loop should parse CI repair signals.');
assert.match(service, /createReviewQueueItem/, 'Production loop should create code review queue items.');
assert.match(service, /scheduleBackgroundAgentJob/, 'Production loop should schedule background agent jobs.');
assert.match(service, /createWorkspaceCheckpoint/, 'Production loop should create workspace checkpoints.');
assert.match(service, /DESKTOP_RELEASE_ASSET_TYPES/, 'Production loop should define required desktop release assets.');

const routes = read('server/routes/production-agent-loop.js');
assert.match(routes, /\/github\/issue-to-pr/, 'Production loop routes should expose issue-to-PR kickoff.');
assert.match(routes, /\/ci\/repair-plan/, 'Production loop routes should expose CI repair planning.');
assert.match(routes, /\/review-queue/, 'Production loop routes should expose review queue APIs.');
assert.match(routes, /\/scheduler\/jobs/, 'Production loop routes should expose background scheduler jobs.');
assert.match(routes, /\/snapshots/, 'Production loop routes should expose workspace snapshots.');
assert.match(routes, /\/desktop-release\/assets-policy/, 'Production loop routes should expose desktop asset policy.');

const server = read('server/index.js');
assert.match(server, /productionAgentLoopRoutes/, 'Server should import production loop routes.');
assert.match(server, /\/api\/production-agent-loop/, 'Server should mount production loop routes.');

const diffAnchors = read('src/utils/diffAnchors.ts');
assert.match(diffAnchors, /firstChangedLine/, 'Frontend should compute first changed diff line.');
assert.match(diffAnchors, /buildDiffLineHref/, 'Frontend should build editor line anchors for changed files.');

const changesRail = read('src/components/main-content/view/subcomponents/ChangedFilesActivityRail.tsx');
assert.match(changesRail, /firstChangedLine/, 'Changed files rail should compute changed-line anchors.');
assert.match(changesRail, /lineHint/, 'Changed files rail should show changed-line hints.');

const docs = read('docs/production-agent-loop.md');
assert.match(docs, /Issue-to-PR/, 'Docs should explain issue-to-PR flow.');
assert.match(docs, /CI-aware repair/, 'Docs should explain CI-aware repair.');
assert.match(docs, /checkpoint/i, 'Docs should explain workspace checkpoints.');
assert.match(docs, /desktop asset/i, 'Docs should explain desktop asset requirements.');

console.log('v1.44 production loop smoke passed');
