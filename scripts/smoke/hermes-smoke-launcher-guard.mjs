import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  readHermesInstallStatus,
} from '../../server/services/hermes-install-jobs.js';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixcode-hermes-smoke-guard-'));
const fakeHermes = path.join(tempRoot, 'hermes');

await fs.writeFile(fakeHermes, `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then
  echo "Hermes Agent v0.0.0 smoke"
  exit 0
fi
echo "fake smoke hermes should not run"
exit 2
`, { mode: 0o755 });

const status = readHermesInstallStatus({
  ...process.env,
  HERMES_CLI_PATH: fakeHermes,
  PATH: tempRoot,
}, {
  repairLaunchers: false,
});

assert.notEqual(status.command, fakeHermes, 'Smoke-test HERMES_CLI_PATH must not be selected as the Hermes command.');
assert.doesNotMatch(String(status.version || ''), /smoke/i, 'Smoke-test Hermes version output must not be reported as installed.');
assert.doesNotMatch(String(status.error || ''), /fake smoke hermes should not run/i, 'Smoke launcher should be rejected before any non-version use.');

console.log('hermes smoke launcher guard passed');
