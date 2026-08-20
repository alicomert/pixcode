#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const compose = read('docker-compose.yml');
const httpsCompose = read('docker-compose.https.yml');
const caddy = read('deploy/Caddyfile');
const dockerfile = read('Dockerfile');
const desktop = read('desktop/electron/main.cjs');
const startupUpdate = read('server/services/startup-update.js');
const workflow = read('.github/workflows/desktop.yml');
const dockerWorkflow = read('.github/workflows/docker.yml');

assert.match(compose, /PUBLIC_IP:\s+"\$\{PUBLIC_IP:-\}"/);
assert.match(compose, /PUBLIC_PROXY_DOMAIN:\s+"\$\{PUBLIC_PROXY_DOMAIN:-sslip\.io\}"/);
assert.match(compose, /pixcode-data:\/root\/\.pixcode/);
assert.match(httpsCompose, /ports:\s*!override[\s\S]*127\.0\.0\.1:3001:3001/);
assert.match(httpsCompose, /condition:\s+service_healthy/);
assert.match(httpsCompose, /PUBLIC_IP or PIXCODE_DOMAIN is required/);
assert.match(httpsCompose, /PIXCODE_DOMAIN must contain only DNS hostname characters/);
assert.match(caddy, /reverse_proxy pixcode:3001/);
assert.match(caddy, /\{\$PIXCODE_DOMAIN\}/);
assert.match(dockerfile, /HEALTHCHECK/);
assert.match(dockerfile, /tini/);
assert.match(startupUpdate, /movePathWithFallback/);
assert.match(startupUpdate, /rollbackRuntimeSwap/);
assert.match(startupUpdate, /Runtime swap failed and rollback was incomplete/);
assert.match(startupUpdate, /record\.installAttempted = true/);
assert.match(startupUpdate, /removePathBestEffort\(stagingDir\)/);
assert.match(startupUpdate, /npmCliInvocation/);
assert.match(startupUpdate, /process\.execPath/);
// Keep this check resilient to minor formatting changes around the guarded
// argument validation.  The important contract is that npm.cmd fallback is
// only used when every argument matches the allow-list.
assert.match(startupUpdate, /args\.every/);
assert.match(startupUpdate, /A-Za-z0-9@/);
assert.match(startupUpdate, /return \{ command: 'npm\.cmd', args, shell: true \}/);
assert.match(desktop, /PIXCODE_REMOTE_URL/);
assert.match(desktop, /PIXCODE_DESKTOP_ALLOW_LAN/);
assert.match(desktop, /isPixcodeNavigation/);
assert.match(desktop, /npm_config_prefix/);
assert.match(desktop, /shell:\s*process\.platform === 'win32'/);
assert.match(workflow, /rm -f dist-installer\/builder-debug\.yml/);
assert.doesNotMatch(workflow, /rm -f desktop\/dist-installer\/builder-debug\.yml/);
assert.match(dockerWorkflow, /root-image:/);
assert.match(dockerWorkflow, /file: \.\/Dockerfile/);
assert.match(dockerWorkflow, /pixcode:latest/);

console.log('deployment hardening smoke passed');
