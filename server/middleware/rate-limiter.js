import { securityLog, getClientIp } from '../utils/security-log.js';

function createRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000,
        max = 100,
        keyGenerator = (req) => getClientIp(req),
        message = 'Too many requests from this IP, please try again later.',
        statusCode = 429,
        skip = (_req) => false,
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

export const apiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many API requests. Please slow down.',
});

export { createRateLimiter };
