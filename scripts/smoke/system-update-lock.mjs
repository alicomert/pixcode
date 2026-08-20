#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acquireSystemUpdateLock,
  inspectSystemUpdateLock,
  releaseSystemUpdateLock,
  updateSystemUpdateLockWorker,
} from '../../server/services/system-update-lock.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixcode-update-lock-smoke-'));
const lockPath = path.join(tempRoot, 'system-update.lock');
const previousOverride = process.env.PIXCODE_UPDATE_LOCK_PATH;
process.env.PIXCODE_UPDATE_LOCK_PATH = lockPath;

try {
  const first = acquireSystemUpdateLock({
    appRoot: tempRoot,
    installMode: 'npm',
  });
  assert.equal(first.acquired, true, 'First update job should acquire the lock.');
  assert.ok(first.lock?.token, 'Acquired lock should include an owner token.');

  const second = acquireSystemUpdateLock({ appRoot: tempRoot, installMode: 'npm' });
  assert.equal(second.acquired, false, 'A second update job must not acquire an active lock.');
  assert.equal(second.reason, 'active', 'An active process-owned lock should report active.');

  assert.equal(
    releaseSystemUpdateLock({ ...first.lock, token: 'not-the-owner' }),
    false,
    'A mismatched token must never remove another update job\'s lock.',
  );
  assert.equal(fs.existsSync(lockPath), true, 'Token mismatch must leave the lock in place.');
  assert.equal(
    updateSystemUpdateLockWorker(first.lock, process.pid),
    true,
    'The owning job should register the actual update worker PID.',
  );
  const workerOwned = inspectSystemUpdateLock(tempRoot);
  assert.equal(workerOwned.metadata?.workerPid, process.pid, 'Inspection should retain the true worker PID.');
  assert.equal(releaseSystemUpdateLock(first.lock), true, 'The owning job should release its lock.');

  fs.writeFileSync(lockPath, JSON.stringify({
    token: 'stale-worker',
    ownerPid: Number.MAX_SAFE_INTEGER,
    workerPid: null,
    createdAt: new Date(0).toISOString(),
    appRoot: tempRoot,
    installMode: 'git',
    runtimeDir: null,
  }));
  const stale = acquireSystemUpdateLock({ appRoot: tempRoot, installMode: 'git' });
  assert.equal(stale.acquired, true, 'A lock owned only by dead processes should be reclaimed.');
  assert.equal(releaseSystemUpdateLock(stale.lock), true, 'Reclaimed lock should remain releasable by its new owner.');

  fs.writeFileSync(lockPath, JSON.stringify({
    token: 'live-worker',
    ownerPid: Number.MAX_SAFE_INTEGER,
    workerPid: process.pid,
    createdAt: new Date().toISOString(),
    appRoot: tempRoot,
    installMode: 'npm',
    runtimeDir: null,
  }));
  const retainedWorker = acquireSystemUpdateLock({ appRoot: tempRoot, installMode: 'npm' });
  assert.equal(retainedWorker.acquired, false, 'A live worker PID must retain the lock after its owner is gone.');
  assert.equal(retainedWorker.reason, 'active', 'Live worker ownership must report active.');
  fs.unlinkSync(lockPath);

  const active = acquireSystemUpdateLock({ appRoot: tempRoot, installMode: 'npm' });
  assert.equal(active.acquired, true, 'Active-lock inspection setup should succeed.');
  const inspection = inspectSystemUpdateLock(tempRoot);
  assert.equal(inspection.active, true, 'Current-process lock must not be reclaimed as stale.');
  assert.equal(inspection.metadata?.token, active.lock?.token, 'Inspection should preserve the active lock owner.');
  assert.equal(releaseSystemUpdateLock(active.lock), true, 'Active-lock inspection setup should clean up.');
} finally {
  if (previousOverride === undefined) {
    delete process.env.PIXCODE_UPDATE_LOCK_PATH;
  } else {
    process.env.PIXCODE_UPDATE_LOCK_PATH = previousOverride;
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('system update lock smoke passed');
