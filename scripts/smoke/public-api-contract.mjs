#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  buildOpenApiFragment,
  buildPublicApiManifest,
} from '../../server/services/public-api-manifest.js';

const manifest = buildPublicApiManifest({ baseUrl: 'https://pixcode.example.test' });
const spec = buildOpenApiFragment({ baseUrl: 'https://pixcode.example.test' });

assert.equal(manifest.version, '1.64.2');
assert.equal(spec.info.version, manifest.version);
assert.equal(spec.servers[0].url, 'https://pixcode.example.test');

const requiredPaths = [
  '/api/auth/stream-ticket',
  '/api/user/github/oauth/start',
  '/api/user/github/oauth/callback',
  '/api/user/git-config',
  '/api/remote/control-room',
  '/api/webhooks',
  '/api/diagnostics/bundle',
  '/api/shell/sessions/terminate',
  '/api/shell/sessions/provider-output',
  '/api/shell/sessions/provider-input',
];

for (const path of requiredPaths) {
  assert.ok(spec.paths[path], `Runtime API document is missing ${path}`);
}

assert.deepEqual(spec.paths['/api/remote/control-room'].get['x-pixcode-scopes'], ['remote:read', 'admin']);
assert.equal(spec.paths['/api/remote/control-room'].get['x-pixcode-admin-only'], true);
assert.deepEqual(spec.paths['/api/user/github/oauth/callback'].get.security, []);
assert.match(
  spec.paths['/api/shell/sessions/terminate'].post.description,
  /\/shell WebSocket/u,
);

const webhookPath = spec.paths['/api/webhooks'];
assert.equal(webhookPath.get.summary, 'List outbound webhooks');
assert.deepEqual(webhookPath.get['x-pixcode-scopes'], ['webhooks:read']);
assert.ok(webhookPath.post, 'Webhook POST contract must survive the generic group path');
assert.equal(webhookPath.post.summary, 'Register an outbound webhook');
assert.deepEqual(webhookPath.post['x-pixcode-scopes'], ['webhooks:write']);

const productionLoopPath = spec.paths['/api/production-agent-loop'];
assert.equal(productionLoopPath.get.summary, 'Production agent loop state');
assert.deepEqual(productionLoopPath.get['x-pixcode-scopes'], ['orchestration:read']);
assert.equal(productionLoopPath.get['x-pixcode-admin-only'], true);

assert.equal(spec.paths['/api/plugins'].get.summary, 'Plugins and MCP tools');
assert.deepEqual(spec.paths['/api/plugins'].get['x-pixcode-scopes'], ['plugins:read', 'plugins:write']);

console.log('public API contract smoke passed');
