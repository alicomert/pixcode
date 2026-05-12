#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (relativePath) => {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
};

const {
  buildLiveViewEnvironment,
  detectLiveViewTarget,
  getLiveViewState,
} = await import('../../server/services/live-view.js');

assert.equal(typeof buildLiveViewEnvironment, 'function', 'Live View should expose a preview environment contract builder.');

const workspace = await mkdtemp(path.join(tmpdir(), 'pixcode-live-view-env-'));
const viteProject = path.join(workspace, 'vite');
const staticProject = path.join(workspace, 'static');

await mkdir(viteProject, { recursive: true });
await writeFile(path.join(viteProject, 'package.json'), JSON.stringify({
  scripts: { dev: 'vite --host 0.0.0.0' },
  dependencies: { vite: '^7.0.0' },
}, null, 2));

await mkdir(staticProject, { recursive: true });
await writeFile(path.join(staticProject, 'index.html'), '<main>static preview</main>');

const viteTarget = await detectLiveViewTarget(viteProject);
const readyEnvironment = buildLiveViewEnvironment({ target: viteTarget, session: null });
assert.equal(readyEnvironment.mode, 'local-process', 'Process targets should use a local-process preview environment.');
assert.equal(readyEnvironment.status, 'ready', 'Detected process targets should be ready before launch.');
assert.equal(readyEnvironment.framework, 'Vite', 'The environment should expose detected framework information.');
assert.equal(readyEnvironment.command.id, 'npm-dev-vite', 'The environment should expose the selected runner command.');
assert.equal(readyEnvironment.command.custom, false, 'Detected commands should not be marked as custom.');
assert.equal(readyEnvironment.diagnostics.runnerKind, 'process', 'Diagnostics should identify process runners.');
assert.equal(readyEnvironment.diagnostics.targetAvailable, true, 'Diagnostics should expose target availability.');
assert.ok(Array.isArray(readyEnvironment.logs), 'The environment should always expose logs.');

const customEnvironment = buildLiveViewEnvironment({
  target: viteTarget,
  session: {
    status: 'starting',
    kind: 'process',
    framework: 'Custom',
    label: 'Custom command',
    command: {
      id: 'custom',
      label: 'Custom command',
      displayCommand: 'npm run preview -- --host 127.0.0.1',
      custom: true,
    },
    runtime: null,
    managedRuntime: null,
    port: 4173,
    upstreamUrl: 'http://127.0.0.1:4173',
    sharePath: '/live/custom-smoke/',
    error: null,
    log: ['$ npm run preview -- --host 127.0.0.1', 'Local: http://127.0.0.1:4173/'],
  },
});
assert.equal(customEnvironment.status, 'starting', 'The environment should track the active session status.');
assert.equal(customEnvironment.command.custom, true, 'Custom commands should be visible in the environment model.');
assert.equal(customEnvironment.port, 4173, 'The environment should expose the active preview port.');
assert.equal(customEnvironment.upstreamUrl, 'http://127.0.0.1:4173', 'The environment should expose the active upstream URL.');
assert.deepEqual(customEnvironment.logs, customEnvironment.logs.slice(-40), 'The environment should expose bounded logs.');

const staticTarget = await detectLiveViewTarget(staticProject);
const staticEnvironment = buildLiveViewEnvironment({ target: staticTarget, session: null });
assert.equal(staticEnvironment.mode, 'static', 'Static projects should use a static preview environment.');
assert.equal(staticEnvironment.framework, 'Static HTML', 'Static framework detection should be visible.');
assert.equal(staticEnvironment.diagnostics.runnerKind, 'static', 'Static diagnostics should identify direct serving.');

const state = await getLiveViewState('vite-env-smoke', viteProject);
assert.equal(state.environment.mode, 'local-process', 'Live View state should return the unified environment.');
assert.equal(state.environment.command.id, 'npm-dev-vite', 'The state environment should use the detected command.');

const liveViewPanel = await read('src/components/live-view/LiveViewPanel.tsx');
assert.ok(liveViewPanel.includes('environment'), 'Live View panel should render the unified environment model.');
assert.ok(liveViewPanel.includes('liveView.environment'), 'Live View panel should label the environment surface.');
assert.ok(liveViewPanel.includes('command.custom'), 'Live View panel should make custom command state visible.');
assert.ok(liveViewPanel.includes('environment.logs'), 'Live View panel should render logs from the environment model.');
assert.ok(liveViewPanel.includes('environment.diagnostics'), 'Live View panel should render diagnostics from the environment model.');

console.log('live view environment smoke passed');
