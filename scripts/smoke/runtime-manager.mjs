#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const managerSource = read('server/services/runtime-manager.js');
assert.match(managerSource, /RUNTIME_DEFINITIONS/, 'Runtime manager should define a central runtime registry.');
assert.match(managerSource, /node/, 'Runtime manager should include Node.js.');
assert.match(managerSource, /php/, 'Runtime manager should include PHP.');
assert.match(managerSource, /python/, 'Runtime manager should include Python.');
assert.match(managerSource, /go/, 'Runtime manager should include Go.');
assert.match(managerSource, /java/, 'Runtime manager should include Java.');
assert.match(managerSource, /rust/, 'Runtime manager should include Rust.');
assert.match(managerSource, /discoverRuntime/, 'Runtime manager should expose runtime discovery.');
assert.match(managerSource, /resolveLiveViewRuntime/, 'Runtime manager should expose Live View runtime resolution.');

const liveViewSource = read('server/services/live-view.js');
assert.match(liveViewSource, /resolveLiveViewRuntime/, 'Live View should route runtime checks through the runtime manager.');
assert.match(liveViewSource, /runtime:\s*session\.runtime/, 'Live View public session payload should expose runtime diagnostics.');
assert.ok(
  liveViewSource.includes('target.runtime'),
  'Live View start should keep the runtime manager result on the session.',
);

const {
  discoverRuntime,
  resolveLiveViewRuntime,
  runtimeManager,
} = await import('../../server/services/runtime-manager.js');

assert.equal(typeof runtimeManager.discover, 'function', 'Runtime manager should expose a discover method.');

const nodeRuntime = await discoverRuntime('node');
assert.equal(nodeRuntime.id, 'node');
assert.equal(nodeRuntime.status, 'available', 'The current Node runtime should be detected as available.');
assert.ok(nodeRuntime.path, 'Node runtime should include an executable path.');
assert.match(nodeRuntime.version || '', /\d+\.\d+\.\d+/, 'Node runtime should include a version.');

const missingPython = await discoverRuntime('python', {
  strictPath: true,
  env: {
    ...process.env,
    PATH: '',
    Path: '',
  },
});
assert.equal(missingPython.status, 'missing', 'Missing Python should produce a missing runtime status.');
assert.match(missingPython.diagnostic.message, /Python/i, 'Missing Python diagnostics should name the runtime.');
assert.match(missingPython.diagnostic.action, /python/i, 'Missing Python diagnostics should include an actionable install command.');

const nodeLiveRuntime = await resolveLiveViewRuntime({
  id: 'npm-dev-vite',
  label: 'Vite dev server',
  framework: 'Vite',
  command: 'npm',
  args: ['run', 'dev'],
  displayCommand: 'npm run dev',
  packageManager: 'npm',
}, {
  env: {
    ...process.env,
    PATH: '',
    Path: '',
  },
  preferManaged: true,
});
assert.equal(nodeLiveRuntime.runtime.id, 'node', 'JavaScript Live View commands should resolve to the Node runtime.');
assert.equal(nodeLiveRuntime.managedRuntime?.id, 'npm', 'JavaScript Live View commands should keep the managed npm hook.');
assert.equal(nodeLiveRuntime.available, true, 'Managed npm should keep JavaScript projects runnable when npm is missing.');
assert.match(nodeLiveRuntime.reason, /Node package runner/i, 'Managed npm diagnostics should explain the package runner.');

const phpLiveRuntime = await resolveLiveViewRuntime({
  id: 'php-built-in',
  label: 'PHP built-in server',
  framework: 'PHP',
  command: 'php',
  args: ['-S', '127.0.0.1:$PORT', '-t', '.'],
  displayCommand: 'php -S 127.0.0.1:$PORT -t .',
}, {
  env: {
    ...process.env,
    PATH: '',
    Path: '',
  },
  preferManaged: true,
});
assert.equal(phpLiveRuntime.runtime.id, 'php', 'PHP Live View commands should resolve to the PHP runtime.');
assert.equal(phpLiveRuntime.managedRuntime?.id, 'frankenphp', 'PHP Live View commands should keep the managed FrankenPHP hook.');
assert.equal(phpLiveRuntime.available, true, 'Managed PHP should keep PHP projects runnable when php is missing.');
assert.match(phpLiveRuntime.reason, /PHP runtime/i, 'Managed PHP diagnostics should explain the Pixcode runtime.');

console.log('runtime manager smoke passed');
