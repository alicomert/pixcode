import express from 'express';

import {
  checkRemoteConnection,
  getPublicRemoteConnectionConfig,
  saveRemoteConnectionConfig,
} from '../services/remote-connection.js';
import {
  buildControlRoomSnapshot,
  buildMobileConsoleLayout,
} from '../services/control-room.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/config', requireAdmin, (_req, res) => {
  res.json({ success: true, connection: getPublicRemoteConnectionConfig() });
});

// This stores an optional outbound health endpoint for this Pixcode server.
// It deliberately does not proxy browser, terminal, filesystem, or WebSocket
// traffic to another host; Electron remote-client mode is configured at launch.
router.put('/config', requireAdmin, (req, res) => {
  try {
    const connection = saveRemoteConnectionConfig(req.body || {});
    res.json({ success: true, connection });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/check', requireAdmin, async (req, res) => {
  try {
    const health = await checkRemoteConnection(req.body && Object.keys(req.body).length ? req.body : undefined);
    res.json({ success: true, health, connection: getPublicRemoteConnectionConfig() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/control-room', requireAdmin, async (_req, res) => {
  try {
    res.json({
      success: true,
      controlRoom: await buildControlRoomSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get('/console-layout', (_req, res) => {
  res.json({
    success: true,
    layout: buildMobileConsoleLayout(),
  });
});

export default router;
