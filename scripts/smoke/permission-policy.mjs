#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

// Permission policy was consolidated into the backend security module. Keep
// this smoke aligned with the shipped tree so a removed orchestration layout
// cannot make an otherwise healthy build fail.
const policy = read('server/modules/security/permission-policy.ts');
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

const claude = read('server/claude-sdk.js');
assert.match(claude, /evaluatePermissionRequest/, 'Claude tool approvals should use the shared policy evaluator.');
assert.match(claude, /permissionPolicy/, 'Claude runtime should accept policy metadata.');

console.log('permission-policy smoke passed');
