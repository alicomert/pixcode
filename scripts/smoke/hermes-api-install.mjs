import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const hermesRoutes = read('server/modules/orchestration/hermes/hermes.routes.ts');
const hermesInstallJobs = fs.existsSync(path.join(repoRoot, 'server/services/hermes-install-jobs.js'))
  ? read('server/services/hermes-install-jobs.js')
  : '';
const workbench = read('src/components/vscode-workbench/view/VSCodeWorkbench.tsx');
const smoke = read('scripts/smoke/pixcode-workbench-1-48.mjs');

assert.match(hermesRoutes, /createHermesInstallJob/, 'Hermes API should start backend install jobs.');
assert.match(hermesRoutes, /router\.post\('\/install'/, 'Hermes should expose POST /api/orchestration/hermes/install.');
assert.match(hermesRoutes, /router\.get\('\/install\/:jobId\/stream'/, 'Hermes install jobs should expose an EventSource stream.');
assert.match(hermesRoutes, /router\.delete\('\/install\/:jobId'/, 'Hermes install jobs should be cancellable.');
assert.match(hermesInstallJobs, /downloadHermesInstaller/, 'Hermes installer should be downloaded by backend code, not pasted into the terminal.');
assert.match(hermesInstallJobs, /--skip-setup/, 'POSIX Hermes API install should skip the interactive setup wizard.');
assert.match(hermesInstallJobs, /--skip-browser/, 'Hermes API install should skip browser downloads by default for reliable headless installs.');
assert.doesNotMatch(hermesInstallJobs, /curl -fsSL .* \| bash/, 'Hermes API install must not pipe curl directly into bash.');
assert.match(workbench, /\/api\/orchestration\/hermes\/install/, 'Workbench Hermes install button should call the Hermes install API.');
assert.doesNotMatch(workbench, /HERMES_AGENT_INSTALL_COMMAND/, 'Workbench should not launch Hermes install through a terminal command.');
assert.match(smoke, /hermes-api-install\.mjs/, 'Main workbench smoke should mention the dedicated Hermes API install smoke.');

console.log('hermes API install smoke passed');
