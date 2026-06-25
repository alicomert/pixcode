import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG_DIR = path.join(os.homedir(), '.pixcode', 'logs');
const SECURITY_LOG_PATH = path.join(LOG_DIR, 'security.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;

function ensureLogDir() {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
        }
    } catch {
        // Non-fatal: if we can't create the log dir, we fall back to console
    }
}

function sanitizeForLog(value) {
    if (typeof value !== 'string') {
        try {
            value = String(value ?? '');
        } catch {
            return '[unserializable]';
        }
    }
    return value
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\x1b\[[0-9;]*m/g, '')
        .slice(0, 500);
}

function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(SECURITY_LOG_PATH)) return;
        const stats = fs.statSync(SECURITY_LOG_PATH);
        if (stats.size < MAX_LOG_SIZE) return;
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
            const oldPath = `${SECURITY_LOG_PATH}.${i}`;
            const newPath = `${SECURITY_LOG_PATH}.${i + 1}`;
            if (fs.existsSync(oldPath)) {
                try { fs.renameSync(oldPath, newPath); } catch { /* noop */ }
            }
        }
        try { fs.renameSync(SECURITY_LOG_PATH, `${SECURITY_LOG_PATH}.1`); } catch { /* noop */ }
    } catch {
        // Non-fatal
    }
}

export function securityLog(event, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        event,
        ip: sanitizeForLog(details.ip),
        userId: details.userId != null ? String(details.userId) : null,
        username: details.username ? sanitizeForLog(details.username) : null,
        endpoint: details.endpoint ? sanitizeForLog(details.endpoint) : null,
        method: details.method ? sanitizeForLog(details.method) : null,
        statusCode: details.statusCode || null,
        reason: details.reason ? sanitizeForLog(details.reason) : null,
        userAgent: details.userAgent ? sanitizeForLog(details.userAgent) : null,
    };

    const line = JSON.stringify(entry);

    try {
        ensureLogDir();
        rotateLogIfNeeded();
        fs.appendFileSync(SECURITY_LOG_PATH, line + '\n', { mode: 0o600 });
    } catch {
        // Fall back to console if file logging fails
        console.warn('[SECURITY]', line);
    }
}

export function getClientIp(req) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req?.socket?.remoteAddress || req?.ip || 'unknown';
}
