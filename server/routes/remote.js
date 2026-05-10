import express from 'express';

import {
  checkRemoteConnection,
  getPublicRemoteConnectionConfig,
  saveRemoteConnectionConfig,
} from '../services/remote-connection.js';

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

export default router;
