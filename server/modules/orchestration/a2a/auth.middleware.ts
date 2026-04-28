// server/modules/orchestration/a2a/auth.middleware.ts
// Localhost callers bypass auth; everyone else needs a Bearer JWT
// validated by pixcode's existing auth stack.

import type { NextFunction, Request, Response } from 'express';

// @ts-ignore — plain-JS module without type declarations
// eslint-disable-next-line boundaries/no-unknown -- server/middleware/auth.js is a top-level auth runtime not yet classified by eslint.config.js; cleanup deferred.
import { authenticateToken } from '@/middleware/auth.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

function isLocalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? '';
  if (LOCAL_HOSTS.has(remote)) return true;
  // Trust the X-Forwarded-For header only when the inbound socket is local
  // (i.e. the reverse proxy itself is on the same host).
  return false;
}

export function a2aAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLocalRequest(req)) {
    next();
    return;
  }
  // Delegate to existing pixcode JWT middleware. authenticateToken
  // populates req.user on success and 401s on failure.
  authenticateToken(req, res, next);
}
