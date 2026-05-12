#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const policy = read('server/modules/orchestration/security/permission-policy.ts');
assert.match(policy, /PIXCODE_PERMISSION_POLICY_PROTOCOL/, 'Permission policy should declare a stable protocol id.');
assert.match(policy, /pixcode\.permission-policy\.v1/, 'Permission policy should use the v1 protocol id.');
assert.match(policy, /shell/, 'Permission policy should classify shell access.');
assert.match(policy, /file_write/, 'Permission policy should classify file-write access.');
assert.match(policy, /external_directory/, 'Permission policy should classify external directory access.');
assert.match(policy, /network/, 'Permission policy should classify network access.');
assert.match(policy, /secret/, 'Permission policy should classify secret access.');
assert.match(policy, /evaluatePermissionRequest/, 'Permission policy should expose a shared evaluator.');
assert.match(policy, /createPermissionApprovalRequest/, 'Permission policy should create pending approval artifacts.');
assert.match(policy, /redactPermissionText/, 'Permission policy should redact local paths and secrets.');

const runner = read('server/modules/orchestration/workflows/workflow-runner.ts');
assert.match(runner, /evaluatePermissionRequest/, 'Workflow runner should route node preflight through the shared policy evaluator.');
assert.match(runner, /permissionPolicyEvents/, 'Workflow runner should store permission policy audit events.');
assert.match(runner, /pendingPermissionApprovals/, 'Workflow runner should preserve pending approval context on the run.');

const trace = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert.match(trace, /workflow\.trace\.permissionPolicy/, 'Trace timeline should surface permission policy decisions.');
assert.match(trace, /permission_policy/, 'Trace events should include permission policy entries.');

const routes = read('server/modules/orchestration/workflows/workflow.routes.ts');
assert.match(routes, /permission-policy/, 'Workflow routes should expose the policy contract.');
assert.match(routes, /permission-approvals/, 'Workflow routes should expose pending approval context.');

const claude = read('server/claude-sdk.js');
assert.match(claude, /evaluatePermissionRequest/, 'Claude tool approvals should use the shared policy evaluator.');
assert.match(claude, /permissionPolicy/, 'Claude runtime should accept policy metadata.');

const a2aContext = read('server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts');
assert.match(a2aContext, /permissionPolicy/, 'A2A adapter context should carry the shared permission policy.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert.match(en, /"permission_policy"/, 'English trace type for permission policy is missing.');
assert.match(tr, /"permission_policy"/, 'Turkish trace type for permission policy is missing.');

console.log('permission-policy smoke passed');
