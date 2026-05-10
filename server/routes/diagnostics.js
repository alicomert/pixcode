import express from 'express';

import { collectDiagnostics } from '../services/diagnostics.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(collectDiagnostics({
    installMode: req.app.locals.installMode,
    serverVersion: req.app.locals.serverVersion,
    wss: req.app.locals.wss,
  }));
});

export default router;
