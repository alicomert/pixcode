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

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({ success: true, connection: getPublicRemoteConnectionConfig() });
});

router.put('/config', (req, res) => {
  try {
    const connection = saveRemoteConnectionConfig(req.body || {});
    res.json({ success: true, connection });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/check', async (req, res) => {
  try {
    const health = await checkRemoteConnection(req.body && Object.keys(req.body).length ? req.body : undefined);
    res.json({ success: true, health, connection: getPublicRemoteConnectionConfig() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/control-room', async (_req, res) => {
  try {
    res.json({
      success: true,
      controlRoom: await buildControlRoomSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/console-layout', (_req, res) => {
  res.json({
    success: true,
    layout: buildMobileConsoleLayout(),
  });
});

export default router;
