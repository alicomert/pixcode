import express from 'express';
import os from 'os';

import {
  getTunnelState,
  getUpnpState,
  startTunnel,
  stopTunnel,
} from '../services/external-access.js';

const router = express.Router();

// Accept any env key the rest of the server honors. Keep this aligned with server/cli.js.
const resolveServerPort = () => {
  const raw = process.env.SERVER_PORT || process.env.PORT || '3001';
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 3001;
};

// Filter to usable LAN addresses. We skip:
//  - internal (loopback) addresses, since QR-ing "127.0.0.1" is useless for a phone
//  - link-local IPv6, since pasting "fe80::…%iface" into a phone browser won't resolve
//  - IPv6 addresses in general for the first pass (most users want the v4 QR)
const listLanEndpoints = () => {
  const interfaces = os.networkInterfaces();
  const endpoints = [];

  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      endpoints.push({
        host: addr.address,
        label: ifaceName,
        family: 'IPv4',
      });
    }
  }

  return endpoints;
};

router.get('/endpoints', (req, res) => {
  try {
    const port = resolveServerPort();
    const endpoints = listLanEndpoints().map((entry) => ({
      ...entry,
      url: `http://${entry.host}:${port}`,
    }));

    res.json({
      port,
      hostname: os.hostname(),
      endpoints,
    });
  } catch (error) {
    console.error('Error listing network endpoints:', error);
    res.status(500).json({ error: 'Failed to list network endpoints' });
  }
});

// ============================================================================
// External access (UPnP + tunnel)
// ============================================================================

router.get('/external', (req, res) => {
  try {
    res.json({
      upnp: getUpnpState(),
      tunnel: getTunnelState(),
    });
  } catch (error) {
    console.error('Error reading external-access state:', error);
    res.status(500).json({ error: 'Failed to read external access state' });
  }
});

// UPnP endpoints removed in v1.32 (see external-access.js for rationale).
// Clients hitting /upnp get a 410 so the UI can show a clear "moved to
// tunnel" hint without mistaking the absence for a transient 404.
router.post('/upnp', (_req, res) => {
  res.status(410).json({
    error: 'UPnP removed in v1.32 — use cloudflared or ngrok tunnels instead',
    upnp: getUpnpState(),
  });
});
router.delete('/upnp', (_req, res) => {
  res.status(410).json({
    error: 'UPnP removed in v1.32 — use cloudflared or ngrok tunnels instead',
    upnp: getUpnpState(),
  });
});

router.post('/tunnel', async (req, res) => {
  const port = resolveServerPort();
  try {
    const state = await startTunnel({ port });
    res.json({ success: true, tunnel: state });
  } catch (error) {
    console.error('Tunnel start failed:', error);
    // 424 Failed Dependency is the best match for "we can't start because a
    // required external binary is missing" — it tells the UI to show the
    // "install cloudflared/ngrok" hint rather than a generic server error.
    const status = error?.code === 'ENOENT_TUNNEL' ? 424 : 502;
    res.status(status).json({ error: error?.message || 'Tunnel start failed', tunnel: getTunnelState() });
  }
});

router.delete('/tunnel', async (req, res) => {
  try {
    const state = await stopTunnel();
    res.json({ success: true, tunnel: state });
  } catch (error) {
    console.error('Tunnel stop failed:', error);
    res.status(502).json({ error: error?.message || 'Tunnel stop failed', tunnel: getTunnelState() });
  }
});

export default router;
