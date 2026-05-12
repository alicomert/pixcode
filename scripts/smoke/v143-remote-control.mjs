#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const telegram = read('server/services/telegram/control-center.js');
assert.match(telegram, /\/approvals/, 'Telegram control should expose an approvals command.');
assert.match(telegram, /showApprovalQueue/, 'Telegram menu should render pending approval decisions.');
assert.match(telegram, /approval_decide/, 'Telegram callbacks should allow approval decisions.');
assert.match(telegram, /showControlRoom/, 'Telegram menu should expose the multi-project control room.');
assert.match(telegram, /showWebhookMenu/, 'Telegram menu should expose webhook status.');

const workflowRoutes = read('server/modules/orchestration/workflows/workflow.routes.ts');
assert.match(workflowRoutes, /\/workflows\/approvals/, 'Orchestration should expose a global approval queue.');
assert.match(workflowRoutes, /resolvePermissionApproval/, 'Global approval route should resolve permission approvals.');
assert.match(workflowRoutes, /dispatchWebhookEvent/, 'Workflow routes should dispatch webhook events for remote automation.');

const approvalQueue = read('server/modules/orchestration/workflows/approval-queue.ts');
assert.match(approvalQueue, /listPendingApprovals/, 'Approval queue should list pending approvals across runs.');
assert.match(approvalQueue, /resolvePermissionApproval/, 'Approval queue should resolve approval requests centrally.');
assert.match(approvalQueue, /source: 'ui' \| 'telegram' \| 'api'/, 'Approval queue should preserve the decision source.');

const webhooks = read('server/services/webhooks.js');
assert.match(webhooks, /PIXCODE_WEBHOOK_EVENT_TYPES/, 'Webhook service should declare supported event taxonomy.');
assert.match(webhooks, /run\.completed/, 'Webhook taxonomy should include run.completed.');
assert.match(webhooks, /approval\.needed/, 'Webhook taxonomy should include approval.needed.');
assert.match(webhooks, /deliverWebhookEvent/, 'Webhook service should deliver signed outbound events.');

const webhookRoutes = read('server/routes/webhooks.js');
assert.match(webhookRoutes, /router\.get\('\/'/, 'Webhook routes should list configured webhooks.');
assert.match(webhookRoutes, /router\.post\('\/test'/, 'Webhook routes should support test delivery.');

const remote = read('server/routes/remote.js');
assert.match(remote, /\/control-room/, 'Remote API should expose the control room snapshot.');
assert.match(remote, /\/console-layout/, 'Remote API should expose mobile console layout metadata.');

const controlRoom = read('server/services/control-room.js');
assert.match(controlRoom, /buildControlRoomSnapshot/, 'Control room should build a multi-project snapshot.');
assert.match(controlRoom, /maxProjects = 4/, 'Control room should cap the live overview at four projects.');
assert.match(controlRoom, /mobileFirst/, 'Control room should include mobile-first console metadata.');

const publicApi = read('server/routes/public-api.js');
assert.match(publicApi, /\/sdk\/typescript/, 'Public API should expose a TypeScript SDK starter.');
assert.match(publicApi, /\/cookbook/, 'Public API should expose a curl cookbook.');

const manifest = read('server/services/public-api-manifest.js');
assert.match(manifest, /buildTypeScriptSdkStarter/, 'Public API manifest should generate typed TypeScript SDK examples.');
assert.match(manifest, /webhooks/, 'Public API manifest should document webhook endpoints.');

const appTypes = read('src/types/app.ts');
assert.match(appTypes, /'remote'/, 'Frontend tabs should include the remote console.');

const mainContent = read('src/components/main-content/view/MainContent.tsx');
assert.match(mainContent, /RemoteConsole/, 'Main content should render the remote console tab.');

const tabSwitcher = read('src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx');
assert.match(tabSwitcher, /tabs\.remote/, 'Tab switcher should expose the remote console tab.');

const remoteConsole = read('src/components/remote-console/RemoteConsole.tsx');
assert.match(remoteConsole, /control-room/, 'Remote console should load control-room snapshots.');
assert.match(remoteConsole, /approval queue/i, 'Remote console should show the approval queue.');
assert.match(remoteConsole, /webhook/i, 'Remote console should show webhook health.');

const docs = read('docs/self-hosted-agent-control-room.md');
assert.match(docs, /Remote Control/, 'Docs should explain remote control workflows.');
assert.match(docs, /Webhook/, 'Docs should explain webhook automation.');
assert.match(docs, /Telegram/, 'Docs should explain Telegram control.');

console.log('v1.43 remote control smoke passed');
