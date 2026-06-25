import { securityLog } from '../utils/security-log.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

function cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of failedAttempts.entries()) {
        if (entry.lockedUntil && entry.lockedUntil <= now) {
            failedAttempts.delete(key);
        } else if (!entry.lockedUntil && entry.lastAttempt && now - entry.lastAttempt > LOCKOUT_DURATION_MS) {
            failedAttempts.delete(key);
        }
    }
}

const cleanupInterval = setInterval(cleanupExpired, 5 * 60 * 1000);
cleanupInterval.unref();

export function checkAccountLockout(username, ip) {
    const key = `${username}:${ip}`;
    const entry = failedAttempts.get(key);
    if (!entry) return { locked: false };

    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
        const remainingMs = entry.lockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return {
            locked: true,
            remainingMs,
            message: `Account locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`,
        };
    }

    if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
        failedAttempts.delete(key);
        return { locked: false };
    }

    return { locked: false };
}

export function recordFailedLogin(username, ip) {
    const key = `${username}:${ip}`;
    let entry = failedAttempts.get(key);
    if (!entry) {
        entry = { count: 0, lockedUntil: null, lastAttempt: Date.now() };
        failedAttempts.set(key, entry);
    }

    entry.count += 1;
    entry.lastAttempt = Date.now();

    if (entry.count >= MAX_FAILED_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
        securityLog('account_locked', {
            username,
            ip,
            reason: `Exceeded ${MAX_FAILED_ATTEMPTS} failed login attempts`,
        });
        return {
            locked: true,
            message: `Account locked due to too many failed attempts. Try again in 15 minutes.`,
        };
    }

    return {
        locked: false,
        remaining: MAX_FAILED_ATTEMPTS - entry.count,
    };
}

export function recordSuccessfulLogin(username, ip) {
    const key = `${username}:${ip}`;
    failedAttempts.delete(key);
}

export function validatePasswordPolicy(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }
    if (password.length > 128) {
        return { valid: false, error: 'Password must not exceed 128 characters' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character' };
    }
    return { valid: true };
}

export function validateUsername(username) {
    if (typeof username !== 'string' || username.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    if (username.length > 64) {
        return { valid: false, error: 'Username must not exceed 64 characters' };
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return { valid: false, error: 'Username may only contain letters, numbers, dots, hyphens, and underscores' };
    }
    return { valid: true };
}
