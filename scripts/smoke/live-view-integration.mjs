import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (relativePath) => {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
};

const appTypes = await read('src/types/app.ts');
assert.ok(
  appTypes.includes("'liveView'"),
  'AppTab should include the Live View tab.',
);

const projectsState = await read('src/hooks/useProjectsState.ts');
assert.ok(
  projectsState.includes("'liveView'"),
  'Persisted tab validation should allow Live View.',
);

const tabSwitcher = await read('src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx');
assert.ok(
  /id:\s*'liveView'/.test(tabSwitcher),
  'Main tab switcher should render Live View after Changes.',
);
assert.ok(
  tabSwitcher.indexOf("id: 'changes'") < tabSwitcher.indexOf("id: 'liveView'"),
  'Live View should be placed after Changes.',
);
assert.ok(
  /sidePanelTabs\s*=\s*new Set<AppTab>\(\[[^\]]*'liveView'/.test(tabSwitcher),
  'Live View should use the same split/full side-panel behavior as Files, Source Control, and Changes.',
);

const mainContent = await read('src/components/main-content/view/MainContent.tsx');
assert.ok(
  mainContent.includes('LiveViewPanel'),
  'MainContent should render the Live View panel.',
);
assert.ok(
  /sidePanelTabs\s*=\s*new Set<AppTab>\(\[[^\]]*'liveView'/.test(mainContent),
  'MainContent should classify Live View as a side panel instead of a full main tab.',
);
assert.ok(
  /renderSidePanel\s*=\s*\(tab:[^)]*'liveView'/.test(mainContent),
  'MainContent should render Live View from renderSidePanel.',
);
assert.ok(
  !mainContent.includes("activeTab === 'liveView' && ("),
  'Live View must not render as a full-width primary tab.',
);

const liveViewPanel = await read('src/components/live-view/LiveViewPanel.tsx');
assert.ok(
  liveViewPanel.includes("action === 'stop'"),
  'Live View stop should clear the active iframe session instead of keeping the stopped /live share path.',
);
assert.ok(
  liveViewPanel.includes("setStatus({"),
  'Live View stop should write a fresh stopped state.',
);
assert.ok(
  liveViewPanel.includes('VIEWPORT_PRESETS'),
  'Live View should expose desktop, tablet, mobile, and custom viewport presets.',
);
assert.ok(
  liveViewPanel.includes("type=\"number\""),
  'Live View should let users edit the preview resolution width and height.',
);
assert.ok(
  liveViewPanel.includes('viewportSize.width') && liveViewPanel.includes('viewportSize.height'),
  'Live View iframe should use the selected preview resolution.',
);
assert.ok(
  liveViewPanel.includes('sessionError') && liveViewPanel.includes('status.session.error'),
  'Live View panel should show the actual runner error instead of only an error badge.',
);
assert.ok(
  liveViewPanel.includes('targetUnavailableReason') && liveViewPanel.includes('liveView.runnerUnavailable'),
  'Live View panel should show a clear unavailable-runner message before launching a missing runtime.',
);
assert.ok(
  liveViewPanel.includes('managedRuntime') && liveViewPanel.includes('liveView.managedRuntimePreparing'),
  'Live View panel should explain that Pixcode can prepare managed runtimes automatically.',
);
assert.ok(
  liveViewPanel.includes('isPreparingManagedRuntime') && liveViewPanel.includes('liveView.preparingRuntime'),
  'Live View panel should show a visible in-progress state while Pixcode downloads and installs a managed runtime.',
);
assert.ok(
  liveViewPanel.includes("runAction('restart')"),
  'Live View panel should expose a restart action for failed process runners.',
);

const managedRuntimes = await read('server/services/managed-runtimes.js');
assert.ok(
  managedRuntimes.includes("process.platform === 'win32'") && managedRuntimes.includes("process.platform === 'darwin'") && managedRuntimes.includes("process.platform === 'linux'"),
  'Managed runtime selection should explicitly handle Windows, macOS, and Linux assets.',
);
assert.ok(
  managedRuntimes.includes('extractZip') && managedRuntimes.includes('extractTarGz'),
  'Managed runtime installation should handle common Windows zip and macOS/Linux tarball assets.',
);
assert.ok(
  managedRuntimes.includes('preferManaged'),
  'Managed PHP Live View should be able to skip external runtimes and prefer Pixcode-owned binaries.',
);
assert.ok(
  managedRuntimes.includes("id === 'npm'") && managedRuntimes.includes('installNpmRuntime'),
  'Managed runtimes should include a Pixcode-owned npm runner for JavaScript projects when npm is not on PATH.',
);
assert.ok(
  managedRuntimes.includes('buildPowerShellExpandArchiveArgs')
    && managedRuntimes.includes('param([string]$archive, [string]$destination)')
    && !managedRuntimes.includes('LiteralPath $args[0]'),
  'Windows zip extraction should pass archive paths through a PowerShell param block instead of unreliable $args indexing.',
);

const serverIndex = await read('server/index.js');
assert.ok(
  serverIndex.includes("app.use('/api/live-view', authenticateToken, liveViewRoutes)"),
  'Live View protected API should be mounted.',
);
assert.ok(
  serverIndex.includes("app.use('/live', createLiveViewPublicRouter())"),
  'Live View public share proxy should be mounted.',
);
assert.ok(
  serverIndex.indexOf("app.use('/live', createLiveViewPublicRouter())") < serverIndex.indexOf("express.static(path.join(APP_ROOT, 'dist')"),
  'Live View public proxy must be mounted before static app fallback.',
);

const {
  detectLiveViewTarget,
  getLiveViewState,
  startLiveView,
  stopLiveView,
} = await import('../../server/services/live-view.js');
const { ensureManagedRuntime } = await import('../../server/services/managed-runtimes.js');
const workspace = await mkdtemp(path.join(tmpdir(), 'pixcode-live-view-smoke-'));
const staticProject = path.join(workspace, 'static');
const viteProject = path.join(workspace, 'vite');
const djangoProject = path.join(workspace, 'django');
const phpProject = path.join(workspace, 'php');
await writeFile(path.join(staticProject, 'index.html'), '<main>hello</main>', { recursive: true }).catch(async (error) => {
  if (error.code !== 'ENOENT') throw error;
  const { mkdir } = await import('node:fs/promises');
  await mkdir(staticProject, { recursive: true });
  await writeFile(path.join(staticProject, 'index.html'), '<main>hello</main>');
});
const { mkdir } = await import('node:fs/promises');
await mkdir(viteProject, { recursive: true });
await writeFile(path.join(viteProject, 'package.json'), JSON.stringify({
  scripts: { dev: 'vite --host 0.0.0.0' },
  dependencies: { vite: '^7.0.0' },
}, null, 2));
await mkdir(djangoProject, { recursive: true });
await writeFile(path.join(djangoProject, 'manage.py'), '#!/usr/bin/env python\n');
await mkdir(phpProject, { recursive: true });
await writeFile(path.join(phpProject, 'index.php'), '<?php echo "hello";');

const staticTarget = await detectLiveViewTarget(staticProject);
assert.equal(staticTarget.available, true, 'Static HTML projects should be available.');
assert.equal(staticTarget.kind, 'static', 'Static HTML projects should use direct static serving.');

const viteTarget = await detectLiveViewTarget(viteProject);
assert.equal(viteTarget.available, true, 'Vite projects should be detected.');
assert.equal(viteTarget.command?.id, 'npm-dev-vite', 'Vite projects should get a Vite-aware command.');

const viteMissingNpmTarget = await detectLiveViewTarget(viteProject, {
  env: {
    ...process.env,
    PATH: '',
    Path: '',
  },
});
assert.equal(viteMissingNpmTarget.available, true, 'Vite projects should remain runnable through a Pixcode-managed package runner when npm is missing from PATH.');
assert.equal(viteMissingNpmTarget.command?.id, 'npm-dev-vite', 'Vite projects should keep the original Vite command identity.');
assert.equal(viteMissingNpmTarget.managedRuntime?.id, 'npm', 'Missing npm should select the Pixcode-managed npm runner.');
assert.equal(viteMissingNpmTarget.managedRuntime?.status, 'missing', 'Missing npm should report that the managed package runner still needs preparation.');

const djangoTarget = await detectLiveViewTarget(djangoProject);
assert.equal(djangoTarget.available, true, 'Django projects should be detected from manage.py.');
assert.equal(djangoTarget.command?.id, 'python-django', 'Django projects should get a runserver command.');

const phpMissingRuntimeTarget = await detectLiveViewTarget(phpProject, {
  env: {
    ...process.env,
    PATH: '',
  },
});
assert.equal(phpMissingRuntimeTarget.available, true, 'PHP projects should remain runnable through a Pixcode-managed runtime when php is missing from PATH.');
assert.equal(phpMissingRuntimeTarget.framework, 'PHP', 'Missing PHP runtime diagnostics should keep the detected framework.');
assert.equal(phpMissingRuntimeTarget.managedRuntime?.id, 'frankenphp', 'Missing PHP should select the Pixcode-managed FrankenPHP runtime.');
assert.equal(phpMissingRuntimeTarget.managedRuntime?.status, 'missing', 'Missing PHP should report that the managed runtime still needs preparation.');
assert.equal(phpMissingRuntimeTarget.command?.id, 'frankenphp-php-server', 'Missing PHP should use a managed FrankenPHP server command.');
assert.ok(
  !/PATH/i.test(phpMissingRuntimeTarget.reason || ''),
  'Missing PHP should use product language instead of exposing PATH setup as the primary message.',
);

const fakeBin = path.join(workspace, 'fake-bin');
await mkdir(fakeBin, { recursive: true });
const fakePhp = path.join(fakeBin, process.platform === 'win32' ? 'php.cmd' : 'php');
await writeFile(fakePhp, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
if (process.platform !== 'win32') {
  await chmod(fakePhp, 0o755);
}
const fakePath = process.platform === 'win32'
  ? `${fakeBin};${process.env.PATH || ''}`
  : `${fakeBin}:${process.env.PATH || ''}`;
const phpSystemRuntimeTarget = await detectLiveViewTarget(phpProject, {
  env: {
    ...process.env,
    PATH: fakePath,
    Path: fakePath,
  },
});
assert.equal(phpSystemRuntimeTarget.available, true, 'PHP projects should stay runnable when php exists on PATH.');
assert.equal(phpSystemRuntimeTarget.command?.id, 'frankenphp-php-server', 'PHP projects should still use the Pixcode-managed runtime even when external php exists.');
assert.equal(phpSystemRuntimeTarget.managedRuntime?.id, 'frankenphp', 'PHP projects should prefer the Pixcode-owned FrankenPHP runtime instead of external php.');

const tar = await import('tar');
const npmPackageRoot = path.join(workspace, 'npm-package-root');
const npmPackageDir = path.join(npmPackageRoot, 'package');
await mkdir(path.join(npmPackageDir, 'bin'), { recursive: true });
await writeFile(path.join(npmPackageDir, 'package.json'), JSON.stringify({ name: 'npm', version: '10.0.0' }));
await writeFile(path.join(npmPackageDir, 'bin', 'npm-cli.js'), '#!/usr/bin/env node\nconsole.log("npm smoke");\n');
const npmTarball = path.join(workspace, 'npm-runtime.tgz');
await tar.c({ cwd: npmPackageRoot, file: npmTarball, gzip: true }, ['package']);
const npmTarballBuffer = await readFile(npmTarball);
const originalFetch = globalThis.fetch;
const metadataAcceptHeaders = [];
globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const headers = options.headers || {};
  const accept = typeof headers.get === 'function' ? headers.get('Accept') : headers.Accept;
  if (requestUrl === 'https://registry.test/npm/latest') {
    metadataAcceptHeaders.push(String(accept || ''));
    if (!String(accept || '').includes('application/json')) {
      return new Response(JSON.stringify({ error: 'not acceptable' }), { status: 406 });
    }
    return new Response(JSON.stringify({
      version: '10.0.0',
      dist: { tarball: 'https://registry.test/npm/-/npm-10.0.0.tgz' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (requestUrl === 'https://registry.test/npm/-/npm-10.0.0.tgz') {
    return new Response(npmTarballBuffer, { status: 200 });
  }
  return originalFetch(url, options);
};
try {
  const npmRuntime = await ensureManagedRuntime('npm', {
    preferManaged: true,
    env: {
      ...process.env,
      PATH: '',
      Path: '',
      PIXCODE_MANAGED_RUNTIMES_HOME: path.join(workspace, 'managed-runtimes'),
      PIXCODE_NPM_RUNTIME_REGISTRY: 'https://registry.test/npm/latest',
    },
  });
  assert.equal(npmRuntime.status, 'installed', 'Managed npm runtime should install from npm registry metadata.');
  assert.ok(
    metadataAcceptHeaders.every((accept) => accept.includes('application/json')),
    'Managed npm runtime metadata requests should use an npm-compatible JSON Accept header.',
  );
} finally {
  globalThis.fetch = originalFetch;
}

const staticSession = await startLiveView('static-smoke', staticProject);
assert.equal(staticSession.status, 'running', 'Static Live View should start without a child process.');
assert.match(staticSession.sharePath, /^\/live\/[a-f0-9]{24}\/$/, 'Live View should expose a random public share path.');
const staticState = await getLiveViewState('static-smoke', staticProject);
assert.equal(staticState.session?.shareId, staticSession.shareId, 'Live View state should retain the active share session.');
await stopLiveView('static-smoke');

console.log('live view integration smoke passed');
