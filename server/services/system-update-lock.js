import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The updater can replace files under APP_ROOT, so keep its coordination file
// in the per-user Pixcode data directory instead of inside the installation.
// An explicit path is useful for shared-volume/container deployments.
const LOCK_GRACE_MS = 10_000;

function canonicalizeAppRoot(appRoot) {
    const resolved = path.resolve(String(appRoot || process.cwd()));
    try {
        return fs.realpathSync.native(resolved);
    } catch {
        return resolved;
    }
}

function resolveLockPath(appRoot) {
    const configured = String(process.env.PIXCODE_UPDATE_LOCK_PATH || '').trim();
    if (configured) return path.resolve(configured);

    const canonicalRoot = canonicalizeAppRoot(appRoot);
    const digest = crypto.createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 32);
    return path.join(os.homedir(), '.pixcode', 'locks', `system-update-${digest}.lock`);
}

function normalizePid(value) {
    const pid = Number(value);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
    const normalized = normalizePid(pid);
    if (!normalized) return false;
    try {
        process.kill(normalized, 0);
        return true;
    } catch (error) {
        // EPERM means the process exists but belongs to another user.
        return error?.code === 'EPERM';
    }
}

function readLockFile(lockPath) {
    let stat;
    try {
        stat = fs.statSync(lockPath);
    } catch (error) {
        if (error?.code === 'ENOENT') return { state: 'missing', metadata: null };
        return { state: 'unreadable', metadata: null, error };
    }

    let raw;
    try {
        raw = fs.readFileSync(lockPath, 'utf8');
    } catch (error) {
        return { state: 'unreadable', metadata: null, stat, error };
    }

    try {
        const metadata = JSON.parse(raw);
        if (!metadata || typeof metadata !== 'object' || typeof metadata.token !== 'string' || !metadata.token) {
            throw new Error('lock metadata is missing its token');
        }
        return { state: 'valid', metadata, stat };
    } catch (error) {
        return { state: 'malformed', metadata: null, stat, error };
    }
}

function isWithinGracePeriod(stat) {
    if (!stat?.mtimeMs) return true;
    return Date.now() - stat.mtimeMs < LOCK_GRACE_MS;
}

function lockIsHeld(metadata) {
    return isProcessAlive(metadata?.ownerPid) || isProcessAlive(metadata?.workerPid);
}

function ensureLockDirectory(lockPath) {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    // mkdir's mode is affected by the process umask and is ignored when the
    // directory already exists. Tighten it where the platform supports chmod.
    try {
        fs.chmodSync(path.dirname(lockPath), 0o700);
    } catch {
        // Windows and restricted shared volumes may not support chmod.
    }
}

function writeInitialMetadata(descriptor, metadata, { truncate = false } = {}) {
    const encoded = JSON.stringify(metadata);
    if (truncate) fs.ftruncateSync(descriptor, 0);
    fs.writeSync(descriptor, encoded, 0, 'utf8');
    try {
        fs.fsyncSync(descriptor);
    } catch {
        // Some network filesystems do not implement fsync. The atomic create
        // still protects ownership; a malformed startup write fails closed.
    }
}

function replaceMetadataInPlace(lockPath, metadata) {
    let descriptor;
    try {
        descriptor = fs.openSync(lockPath, 'r+');
        writeInitialMetadata(descriptor, metadata, { truncate: true });
    } finally {
        if (descriptor !== undefined) {
            try { fs.closeSync(descriptor); } catch { /* best effort */ }
        }
    }
}

function unlinkIfTokenMatches(lockPath, token) {
    const observed = readLockFile(lockPath);
    if (observed.state !== 'valid' || observed.metadata.token !== token) return false;
    try {
        // Metadata updates are in-place and retain the token. Re-read
        // immediately before unlink so a different owner is never removed.
        const current = readLockFile(lockPath);
        if (current.state !== 'valid' || current.metadata.token !== token) return false;
        fs.unlinkSync(lockPath);
        return true;
    } catch (error) {
        // A concurrent owner can replace/remove the file between the second
        // token read and unlink. Treat that as not released, because this job
        // no longer has proof it removed its own current lock.
        return false;
    }
}

function tryReclaimStaleLock(lockPath, observed) {
    if (observed.state === 'missing') return true;
    if (observed.state === 'unreadable') return false;
    if (observed.state === 'malformed' && isWithinGracePeriod(observed.stat)) return false;
    if (observed.state === 'valid' && lockIsHeld(observed.metadata)) return false;

    // The lock is never renamed while active; worker PID changes happen
    // in-place. Compare the file identity before reclaiming it so a new
    // creator cannot be removed after our stale observation.
    try {
        const current = fs.statSync(lockPath);
        if (observed.stat && (current.dev !== observed.stat.dev || current.ino !== observed.stat.ino)) {
            return false;
        }
        fs.unlinkSync(lockPath);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return true;
        return false;
    }
}

/**
 * Return the persistent updater lock state without creating a new lock.
 * Dead, old lock files are reclaimed so a crashed server does not leave the
 * installation permanently unavailable. A newly-created malformed file is
 * treated as held during the write grace period.
 */
export function inspectSystemUpdateLock(appRoot) {
    const lockPath = resolveLockPath(appRoot);
    const observed = readLockFile(lockPath);
    if (observed.state === 'missing') {
        return { active: false, path: lockPath, metadata: null };
    }
    if (observed.state === 'valid') {
        if (lockIsHeld(observed.metadata)) {
            return { active: true, path: lockPath, metadata: observed.metadata };
        }
        if (tryReclaimStaleLock(lockPath, observed)) {
            return { active: false, path: lockPath, metadata: null, reclaimed: true };
        }
        return { active: true, path: lockPath, metadata: observed.metadata, stale: true };
    }
    if (observed.state === 'malformed' && !isWithinGracePeriod(observed.stat) && tryReclaimStaleLock(lockPath, observed)) {
        return { active: false, path: lockPath, metadata: null, reclaimed: true };
    }
    return { active: true, path: lockPath, metadata: null, unknown: true };
}

/**
 * Atomically claim the updater lock for one process/job.
 *
 * @returns {{ acquired: boolean, lockPath: string, lock?: object, metadata?: object, reason?: string }}
 */
export function acquireSystemUpdateLock({ appRoot, installMode, runtimeDir } = {}) {
    const lockPath = resolveLockPath(appRoot);
    ensureLockDirectory(lockPath);
    const canonicalRoot = canonicalizeAppRoot(appRoot);
    const token = crypto.randomUUID();
    const metadata = {
        token,
        ownerPid: process.pid,
        workerPid: null,
        createdAt: new Date().toISOString(),
        appRoot: canonicalRoot,
        installMode: installMode || null,
        runtimeDir: runtimeDir || null,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
        let descriptor;
        let created = false;
        try {
            descriptor = fs.openSync(lockPath, 'wx', 0o600);
            created = true;
            try {
                writeInitialMetadata(descriptor, metadata);
            } finally {
                fs.closeSync(descriptor);
                descriptor = undefined;
            }
            try {
                fs.chmodSync(lockPath, 0o600);
            } catch {
                // Windows may not expose POSIX mode bits.
            }
            return {
                acquired: true,
                lockPath,
                lock: { lockPath, token, metadata },
            };
        } catch (error) {
            if (descriptor !== undefined) {
                try { fs.closeSync(descriptor); } catch { /* best effort */ }
            }
            if (created) {
                // A failed first write has no worker yet. Remove only this
                // newly-created path when it still bears this token so it
                // cannot become a misleading lock or delete a new owner.
                unlinkIfTokenMatches(lockPath, token);
            }
            if (error?.code !== 'EEXIST') {
                return { acquired: false, lockPath, reason: error?.message || 'Unable to create update lock.' };
            }

            const observed = readLockFile(lockPath);
            if (observed.state === 'valid' && lockIsHeld(observed.metadata)) {
                return { acquired: false, lockPath, metadata: observed.metadata, reason: 'active' };
            }
            if (!tryReclaimStaleLock(lockPath, observed)) {
                return { acquired: false, lockPath, metadata: observed.metadata, reason: 'unknown' };
            }
        }
    }

    return { acquired: false, lockPath, reason: 'active' };
}

/** Update the detached worker PID while retaining token ownership. */
export function updateSystemUpdateLockWorker(lock, workerPid) {
    if (!lock?.lockPath || !lock?.token) return false;
    const observed = readLockFile(lock.lockPath);
    if (observed.state !== 'valid' || observed.metadata.token !== lock.token) return false;
    const metadata = { ...observed.metadata, workerPid: normalizePid(workerPid) };
    try {
        replaceMetadataInPlace(lock.lockPath, metadata);
        lock.metadata = metadata;
        return true;
    } catch {
        return false;
    }
}

/** Release only the lock created by this job; never remove a newer owner. */
export function releaseSystemUpdateLock(lock) {
    if (!lock?.lockPath || !lock?.token) return false;
    return unlinkIfTokenMatches(lock.lockPath, lock.token);
}

export const SYSTEM_UPDATE_LOCK_GRACE_MS = LOCK_GRACE_MS;
