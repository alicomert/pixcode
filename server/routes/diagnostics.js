import express from 'express';

import { collectDiagnostics } from '../services/diagnostics.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

function buildDiagnostics(req) {
  return collectDiagnostics({
    installMode: req.app.locals.installMode,
    serverVersion: req.app.locals.serverVersion,
    wss: req.app.locals.wss,
    activeRuns: req.app.locals.activeRuns || [],
    recentErrors: req.app.locals.recentErrors || [],
    providerHealth: req.app.locals.providerHealth || {},
    cache: req.app.locals.diagnosticsCache || {},
  });
}

// Diagnostics expose internal system state (active sessions, errors,
// provider health) — restrict to admins to prevent information leakage.
router.get('/', requireAdmin, (req, res) => {
  res.json(buildDiagnostics(req));
});

router.post('/refresh', requireAdmin, (req, res) => {
  req.app.locals.diagnosticsCache = {
    ...(req.app.locals.diagnosticsCache || {}),
    diagnosticsUpdatedAt: new Date().toISOString(),
    manualRefresh: true,
  };
  res.json(buildDiagnostics(req));
});

router.get('/bundle', requireAdmin, (req, res) => {
  const diagnostics = buildDiagnostics(req);
  res.json({
    generatedAt: diagnostics.timestamp,
    copyable: true,
    diagnostics,
  });
});

export default router;
