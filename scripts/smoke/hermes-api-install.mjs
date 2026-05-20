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
const serverIndex = read('server/index.js');
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
assert.match(hermesInstallJobs, /formatHermesVersionOutput/, 'Hermes install status should collapse multi-line --version output before showing it in UI badges.');
assert.match(hermesInstallJobs, /repairHermesCommandLaunchers/, 'Hermes installer should repair stale or text launcher shims after install/status checks.');
assert.match(hermesInstallJobs, /hermes\.cmd/, 'Windows Hermes repair should create or prefer a hermes.cmd shim so typing hermes does not open the Python launcher as text.');
assert.match(hermesInstallJobs, /isUsableHermesCommand/, 'Hermes status should verify candidates before treating them as installed.');
assert.match(hermesInstallJobs, /export function buildHermesPathEnv/, 'Hermes should expose a PATH-only shell env helper so normal project terminals can run hermes after repair.');
assert.match(serverIndex, /Test-HermesCommand/, 'Hermes terminal start should verify a resolved command before running it.');
assert.match(serverIndex, /buildHermesPathEnv\(process\.env/, 'Shell PTYs should inherit Hermes bin directories so typing hermes in Pixcode terminal works on Windows.');
assert.match(serverIndex, /env: shellEnv/, 'Shell PTYs should use the augmented shell environment instead of raw process.env.');
assert.match(serverIndex, /const isHermesShellSession = Boolean\(hermesCommand\)/, 'Hermes terminal sessions should be tracked separately from disposable plain-shell command sessions.');
assert.match(serverIndex, /keepAliveUntilExit: isHermesShellSession/, 'Hermes PTYs should stay alive until the backend process exits, even if the UI closes or switches workspaces.');
assert.match(serverIndex, /session\.keepAliveUntilExit/, 'Shell disconnect should skip the 30-minute timeout for Hermes sessions.');
assert.match(serverIndex, /Invoke-PixcodeHermesConfigure/, 'Hermes start should configure Pixcode MCP as a best-effort step before launch.');
assert.doesNotMatch(serverIndex, /\$script:HermesCmd chat --toolsets/, 'Hermes H button should launch the same interactive Hermes entrypoint that works when the user types hermes.');
assert.doesNotMatch(serverIndex, /node \$\{quote\(configureScript\)\}; & \$script:HermesCmd/, 'A failed Pixcode MCP configure step must not prevent Hermes from opening.');
assert.doesNotMatch(serverIndex, /Hermes already installed:/, 'Hermes H launch should not leave a version/status banner stuck before the interactive prompt.');
assert.doesNotMatch(serverIndex, /if command -v hermes >\/dev\/null 2>&1; then command -v hermes; return 0; fi;/, 'POSIX Hermes start must not accept a stale PATH shim without testing it.');
assert.match(workbench, /HermesActivityButton/, 'Workbench activity rail should expose a dedicated Hermes H button under Terminal.');
assert.match(workbench, /forceNewSession=\{false\}/, 'Opening the Hermes H terminal should reconnect the existing backend PTY instead of killing it.');
assert.match(workbench, /installLogRef/, 'Hermes install log panel should keep a scroll ref.');
assert.match(workbench, /scrollTop = installLogRef\.current\.scrollHeight/, 'Hermes install logs should auto-scroll to the latest line.');
assert.match(workbench, /suspendAutoConnect/, 'Right CLI auto-connect should be suspendable while Hermes opens in the bottom terminal.');
assert.match(smoke, /hermes-api-install\.mjs/, 'Main workbench smoke should mention the dedicated Hermes API install smoke.');

console.log('hermes API install smoke passed');
