import { access, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (relativePath) => {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
};
const fileExists = async (filePath) => access(filePath).then(() => true, () => false);
const canBindLoopback = () => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(0, '127.0.0.1', () => {
    server.close(() => resolve(true));
  });
});

// The standalone Live View panel/runtime remains supported, but the legacy
// top-level AppTab integration was removed when navigation moved to the
// workbench/task surfaces. Keep this smoke focused on the shipped panel and
// runtime contract instead of requiring the retired tab wiring.

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
const liveViewRoutes = await read('server/routes/live-view.js');
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
assert.ok(
  liveViewRoutes.includes("['GET', 'HEAD'].includes")
    && liveViewRoutes.includes("redirect: 'manual'")
    && liveViewRoutes.includes('redirect outside its loopback origin'),
  'Live View public proxy must be read-only and must not follow redirects outside loopback.',
);

const {
  detectLiveViewTarget,
  getLiveViewState,
  parseLocalUpstreamUrl,
  startLiveView,
  stopLiveView,
} = await import('../../server/services/live-view.js');
const { ensureManagedRuntime, getManagedRuntimeStatus } = await import('../../server/services/managed-runtimes.js');
const workspace = await mkdtemp(path.join(tmpdir(), 'pixcode-live-view-smoke-'));

assert.deepEqual(
  parseLocalUpstreamUrl('http://127.0.0.1:4173/'),
  { protocol: 'http:', host: '127.0.0.1', port: 4173, url: 'http://127.0.0.1:4173' },
  'Live View should accept a loopback upstream URL.',
);
assert.equal(
  parseLocalUpstreamUrl('http://127.0.0.1:4173@attacker.example/'),
  null,
  'Live View must reject user-info URLs that turn a loopback-looking prefix into an external host.',
);
assert.equal(
  parseLocalUpstreamUrl('http://attacker.example:4173/'),
  null,
  'Live View must reject external upstream hosts parsed from process output.',
);

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

const depsProject = path.join(workspace, 'vite-needs-install');
await mkdir(depsProject, { recursive: true });
await writeFile(path.join(depsProject, 'package.json'), JSON.stringify({
  scripts: { dev: 'vite --host 127.0.0.1' },
  dependencies: { vite: '^7.0.0' },
}, null, 2));
const fakeNpmCli = path.join(workspace, 'fake-npm-cli.js');
await writeFile(fakeNpmCli, [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const path = require("node:path");',
  'if (process.argv[2] === "install") {',
  '  if (!process.argv.includes("--include=dev") || process.env.NODE_ENV !== "development" || process.env.NPM_CONFIG_PRODUCTION !== "false") {',
  '    process.exit(0);',
  '  }',
  '  fs.mkdirSync(path.join(process.cwd(), "node_modules", ".bin"), { recursive: true });',
  '  fs.writeFileSync(path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite"), "ok");',
  '  process.exit(0);',
  '}',
  'process.exit(0);',
  '',
].join('\n'));
if (process.platform !== 'win32') {
  await chmod(fakeNpmCli, 0o755);
}
const { preparePackageDependencies } = await import('../../server/services/live-view.js');
const prepLogs = [];
await preparePackageDependencies(
  depsProject,
  {
    id: 'npm-dev-vite',
    label: 'Vite dev server',
    framework: 'Vite',
    packageManager: 'npm',
    scriptName: 'dev',
    command: process.execPath,
    args: [fakeNpmCli, 'run', 'dev'],
    displayCommand: 'npm run dev',
    managedRuntime: { id: 'npm', status: 'installed' },
  },
  process.env,
  (line) => prepLogs.push(line),
);
assert.ok(
  await fileExists(path.join(depsProject, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')),
  'Live View should install missing Vite project dependencies before running npm dev.',
);
assert.ok(
  prepLogs.some((line) => line.includes('Installing project dependencies')),
  'Live View should log dependency preparation before launching package scripts.',
);

const frankenPackageRoot = path.join(workspace, 'frankenphp-package-root');
const frankenPackageDir = path.join(frankenPackageRoot, 'package');
await mkdir(frankenPackageDir, { recursive: true });
await writeFile(path.join(frankenPackageDir, process.platform === 'win32' ? 'frankenphp.exe' : 'frankenphp'), '#!/bin/sh\nexit 0\n');
await writeFile(path.join(frankenPackageDir, 'sidecar-runtime.dll'), 'sidecar');
if (process.platform !== 'win32') {
  await chmod(path.join(frankenPackageDir, 'frankenphp'), 0o755);
}
const frankenTarball = path.join(workspace, 'frankenphp-runtime.tgz');
await tar.c({ cwd: frankenPackageRoot, file: frankenTarball, gzip: true }, ['package']);
const frankenTarballBuffer = await readFile(frankenTarball);
globalThis.fetch = async (url) => {
  if (String(url) === 'https://runtime.test/frankenphp-runtime.tgz') {
    return new Response(frankenTarballBuffer, { status: 200 });
  }
  return originalFetch(url);
};
try {
  const frankenHome = path.join(workspace, 'managed-frankenphp');
  const frankenRuntime = await ensureManagedRuntime('frankenphp', {
    preferManaged: true,
    env: {
      ...process.env,
      PIXCODE_MANAGED_RUNTIMES_HOME: frankenHome,
      PIXCODE_FRANKENPHP_URL: 'https://runtime.test/frankenphp-runtime.tgz',
    },
  });
  assert.equal(frankenRuntime.status, 'installed', 'Managed FrankenPHP runtime should install from the downloaded archive.');
  assert.ok(
    await fileExists(path.join(frankenHome, 'frankenphp', 'current', 'sidecar-runtime.dll')),
    'Managed FrankenPHP install should preserve sidecar DLLs/files next to the executable.',
  );
} finally {
  globalThis.fetch = originalFetch;
}

const brokenRuntimeHome = path.join(workspace, 'broken-frankenphp');
const brokenCurrent = path.join(brokenRuntimeHome, 'frankenphp', 'current');
await mkdir(brokenCurrent, { recursive: true });
const brokenExecutable = path.join(brokenCurrent, process.platform === 'win32' ? 'frankenphp.cmd' : 'frankenphp');
await writeFile(brokenExecutable, process.platform === 'win32' ? '@echo off\r\nexit /b 1\r\n' : '#!/bin/sh\nexit 1\n');
if (process.platform !== 'win32') {
  await chmod(brokenExecutable, 0o755);
}
await writeFile(path.join(brokenRuntimeHome, 'frankenphp', 'pixcode-runtime.json'), JSON.stringify({
  id: 'frankenphp',
  label: 'Pixcode PHP runtime',
  executablePath: brokenExecutable,
  version: 'broken',
}, null, 2));
const brokenStatus = await getManagedRuntimeStatus('frankenphp', {
  preferManaged: true,
  env: {
    ...process.env,
    PIXCODE_MANAGED_RUNTIMES_HOME: brokenRuntimeHome,
  },
});
assert.equal(brokenStatus.status, 'missing', 'Broken managed FrankenPHP manifests should be treated as missing so Pixcode can reinstall them.');

if (process.platform === 'win32') {
  // The downloaded FrankenPHP binary depends on the host VC++ runtime. Keep
  // static/runtime detection assertions above, but do not make this smoke
  // require a native Windows toolchain on CI hosts without that redistributable.
  console.warn('Skipping Live View process-launch smoke on Windows (native PHP runtime dependency).');
} else if (await canBindLoopback()) {
  const phpRuntimeEnvHome = path.join(workspace, 'php-runtime-env');
  const phpRuntimeCurrent = path.join(phpRuntimeEnvHome, 'frankenphp', 'current');
  await mkdir(phpRuntimeCurrent, { recursive: true });
  const phpRuntimeExecutable = path.join(phpRuntimeCurrent, 'frankenphp');
  const phpRuntimeScript = [
    '#!/usr/bin/env node',
    'const http = require("node:http");',
    'const path = require("node:path");',
    'const runtimeDir = __dirname;',
    'if (process.argv.includes("version")) process.exit(0);',
    'const pathValue = process.env.Path || process.env.PATH || "";',
    'if (!pathValue.split(path.delimiter).includes(runtimeDir)) {',
    '  console.error("runtime path missing from PATH");',
    '  process.exit(1);',
    '}',
    'const port = Number(process.env.PORT || 0);',
    'http.createServer((req, res) => res.end("php runtime ok")).listen(port, "127.0.0.1");',
    '',
  ].join('\n');
  await writeFile(phpRuntimeExecutable, phpRuntimeScript);
  if (process.platform !== 'win32') {
    await chmod(phpRuntimeExecutable, 0o755);
  }
  await writeFile(path.join(phpRuntimeEnvHome, 'frankenphp', 'pixcode-runtime.json'), JSON.stringify({
    id: 'frankenphp',
    label: 'Pixcode PHP runtime',
    executablePath: phpRuntimeExecutable,
    version: 'path-env-smoke',
  }, null, 2));
  const previousRuntimeHome = process.env.PIXCODE_MANAGED_RUNTIMES_HOME;
  process.env.PIXCODE_MANAGED_RUNTIMES_HOME = phpRuntimeEnvHome;
  try {
    const phpRuntimeSession = await startLiveView('php-runtime-env-smoke', phpProject);
    assert.equal(phpRuntimeSession.status, 'running', 'Managed PHP Live View should start with the runtime directory on PATH.');
    await stopLiveView('php-runtime-env-smoke');
  } finally {
    if (previousRuntimeHome === undefined) {
      delete process.env.PIXCODE_MANAGED_RUNTIMES_HOME;
    } else {
      process.env.PIXCODE_MANAGED_RUNTIMES_HOME = previousRuntimeHome;
    }
  }

  const staticSession = await startLiveView('static-smoke', staticProject);
  assert.equal(staticSession.status, 'running', 'Static Live View should start without a child process.');
  assert.match(staticSession.sharePath, /^\/live\/[a-f0-9]{24}\/$/, 'Live View should expose a random public share path.');
  const staticState = await getLiveViewState('static-smoke', staticProject);
  assert.equal(staticState.session?.shareId, staticSession.shareId, 'Live View state should retain the active share session.');
  await stopLiveView('static-smoke');
} else {
  console.warn('Skipping Live View launch smoke because this sandbox cannot bind 127.0.0.1.');
}

console.log('live view integration smoke passed');
