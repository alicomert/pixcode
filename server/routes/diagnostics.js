import express from 'express';

import { collectDiagnostics } from '../services/diagnostics.js';

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

router.get('/', (req, res) => {
  res.json(buildDiagnostics(req));
});

router.post('/refresh', (req, res) => {
  req.app.locals.diagnosticsCache = {
    ...(req.app.locals.diagnosticsCache || {}),
    diagnosticsUpdatedAt: new Date().toISOString(),
    manualRefresh: true,
  };
  res.json(buildDiagnostics(req));
});

router.get('/bundle', (req, res) => {
  const diagnostics = buildDiagnostics(req);
  res.json({
    generatedAt: diagnostics.timestamp,
    copyable: true,
    diagnostics,
  });
});

export default router;
