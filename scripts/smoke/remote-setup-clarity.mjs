#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

const setupForm = read('src/components/auth/view/SetupForm.tsx');
assert.match(
  setupForm,
  /Create the first administrator account for this Pixcode server/u,
  'First-run setup must identify the server the browser is already using.',
);
assert.doesNotMatch(
  setupForm,
  /connectionMode|remoteUrl|remoteApiKey|Connect to a remote Pixcode server|\/api\/auth\/connection-mode/u,
  'First-run setup must not imply that it can switch the browser to another server.',
);

const authApi = read('src/utils/api.js');
assert.doesNotMatch(
  authApi,
  /connectionMode:\s*\(|updateConnectionMode:\s*\(|\/api\/auth\/connection-mode/u,
  'The browser auth client must not expose the retired first-run remote-mode flow.',
);
assert.match(authApi, /remoteConnection:\s*\(\)\s*=>\s*authenticatedFetch\('\/api\/remote\/config'\)/u);

const authRoutes = read('server/routes/auth.js');
assert.doesNotMatch(
  authRoutes,
  /connection-mode|requireRemoteBridgeAdmin|sendDeprecatedConnectionMode/u,
  'The retired first-run remote-mode endpoint must not remain reachable.',
);

const remoteService = read('server/services/remote-connection.js');
assert.match(
  remoteService,
  /never proxies a browser, terminal, filesystem, or WebSocket[\s\S]*another Pixcode server/u,
  'Remote configuration must remain an outbound health check rather than a browser proxy.',
);

const remoteRoutes = read('server/routes/remote.js');
assert.match(remoteRoutes, /optional outbound health endpoint/u);
assert.match(remoteRoutes, /does not proxy browser, terminal, filesystem, or WebSocket/u);

const openApi = read('public/openapi.yaml');
assert.match(openApi, /Optional outbound Pixcode health checks and mobile control-room views/u);
assert.match(openApi, /does not redirect browser sessions/u);
assert.match(openApi, /not a browser, terminal, filesystem, or WebSocket proxy/u);

console.log('remote setup clarity smoke passed');
