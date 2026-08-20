#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/index.js', 'utf8');
const endpointStart = source.indexOf("app.post('/api/system/update', authenticateToken, requireAdmin, requireApiScope('system:update'), (req, res) => {");
const restartStart = source.indexOf("app.post('/api/system/restart'");

assert.ok(endpointStart >= 0, 'Legacy SSE endpoint must remain available for older clients.');
assert.ok(restartStart > endpointStart, 'Expected the update endpoint before the restart endpoint.');

const endpoint = source.slice(endpointStart, restartStart);
assert.match(endpoint, /createSystemUpdateJob\(req\.user/, 'SSE must delegate ownership to the queued update job.');
assert.match(source, /acquireSystemUpdateLock\(/, 'Queued updates must atomically own a persistent cross-process lock.');
assert.match(source, /updateSystemUpdateLockWorker\(job\.updateLock, child\.pid\)/, 'Actual updater PID must be retained by the persistent lock.');
assert.match(source, /shell:\s*false,[\s\S]{0,160}detached:\s*false/, 'Queued updates must not track a detached shell wrapper.');
assert.match(source, /buildSystemUpdateInvocation[\s\S]*resolveNpmUpdateInvocation/, 'Npm updates must use a validated argv invocation.');
assert.match(source, /releaseSystemUpdateLock\(job\.updateLock\)/, 'Completed non-restarting jobs must release their own persistent lock.');
assert.match(endpoint, /job\.logListeners\.add\(onLog\)/, 'SSE must subscribe to the queued job log stream.');
assert.match(endpoint, /res\.on\('close',[\s\S]*?cleanup\(\)/, 'Disconnect must clean up only the subscriber.');
assert.doesNotMatch(endpoint, /child\.kill\(/, 'Disconnect must not attempt to kill a detached updater shell.');
assert.doesNotMatch(endpoint, /legacyUpdateActive\s*=\s*false/, 'SSE transport must not release a separate update lock.');

assert.doesNotMatch(source, /legacyUpdateActive/, 'The queued job must be the only update lock.');
assert.match(source, /installMode === 'npm' && latest\.latestVersion && latest\.latestVersion === SERVER_VERSION/, 'Only npm installs may short-circuit on npm latest.');
assert.doesNotMatch(
  source,
  /if \(!IS_PLATFORM && latest\.latestVersion && latest\.latestVersion === SERVER_VERSION\)/,
  'Git installs must not skip source updates merely because npm latest matches.',
);
assert.match(
  source.slice(restartStart),
  /const activeUpdate = getActiveUpdateJob\(\);[\s\S]*?const externalUpdateLock = getExternalUpdateLock\(\);[\s\S]*?Wait for it to finish before restarting\./,
  'Restart must reject while a queued or previous-process updater owns a live install.',
);

console.log('update job SSE lifecycle smoke passed');
