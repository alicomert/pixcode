import { securityLog, getClientIp } from '../utils/security-log.js';

function createRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000,
        max = 100,
        keyGenerator = (req) => getClientIp(req),
        message = 'Too many requests from this IP, please try again later.',
        statusCode = 429,
        skip = (_req) => false,
        maxKeys = 10_000,
    } = options;

    const hits = new Map();

    function cleanupExpired() {
        const now = Date.now();
        for (const [key, entry] of hits.entries()) {
            if (entry.resetTime <= now) {
                hits.delete(key);
            }
        }
    }

    const cleanupInterval = setInterval(cleanupExpired, windowMs);
    cleanupInterval.unref();

    return (req, res, next) => {
        if (skip(req)) {
            return next();
        }

        const key = keyGenerator(req);
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || entry.resetTime <= now) {
            // Keep the in-process limiter bounded when an exposed server sees
            // many distinct client addresses in one window.  Expired entries
            // are removed first; if the cap is still reached, evict the
            // oldest key so rate limiting cannot become an OOM vector.
            if (!entry && hits.size >= maxKeys) {
                cleanupExpired();
                while (hits.size >= maxKeys) {
                    const oldestKey = hits.keys().next().value;
                    if (oldestKey === undefined) break;
                    hits.delete(oldestKey);
                }
            }
            entry = {
                count: 0,
                resetTime: now + windowMs,
            };
            hits.set(key, entry);
        }

        entry.count += 1;

        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

        if (entry.count > max) {
            securityLog('rate_limit_exceeded', {
                ip: getClientIp(req),
                endpoint: req.path,
                method: req.method,
                userAgent: req.headers['user-agent'],
            });
            return res.status(statusCode).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message,
                },
            });
        }

        next();
    };
}

export const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

// API rate limiter: only limits state-changing operations (POST/PUT/DELETE/PATCH).
// GET requests (polling, fetching sessions, file trees, update-state, etc.) are
// exempt — the frontend polls several endpoints frequently and 120/min was
// too low, causing false "rate limit" errors on active sessions.
export const apiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    message: 'Too many API requests. Please slow down.',
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
});

export { createRateLimiter };
