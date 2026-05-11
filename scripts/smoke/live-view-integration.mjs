import { mkdtemp, writeFile } from 'node:fs/promises';
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
const workspace = await mkdtemp(path.join(tmpdir(), 'pixcode-live-view-smoke-'));
const staticProject = path.join(workspace, 'static');
const viteProject = path.join(workspace, 'vite');
const djangoProject = path.join(workspace, 'django');
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

const staticTarget = await detectLiveViewTarget(staticProject);
assert.equal(staticTarget.available, true, 'Static HTML projects should be available.');
assert.equal(staticTarget.kind, 'static', 'Static HTML projects should use direct static serving.');

const viteTarget = await detectLiveViewTarget(viteProject);
assert.equal(viteTarget.available, true, 'Vite projects should be detected.');
assert.equal(viteTarget.command?.id, 'npm-dev-vite', 'Vite projects should get a Vite-aware command.');

const djangoTarget = await detectLiveViewTarget(djangoProject);
assert.equal(djangoTarget.available, true, 'Django projects should be detected from manage.py.');
assert.equal(djangoTarget.command?.id, 'python-django', 'Django projects should get a runserver command.');

const staticSession = await startLiveView('static-smoke', staticProject);
assert.equal(staticSession.status, 'running', 'Static Live View should start without a child process.');
assert.match(staticSession.sharePath, /^\/live\/[a-f0-9]{24}\/$/, 'Live View should expose a random public share path.');
const staticState = await getLiveViewState('static-smoke', staticProject);
assert.equal(staticState.session?.shareId, staticSession.shareId, 'Live View state should retain the active share session.');
await stopLiveView('static-smoke');

console.log('live view integration smoke passed');
