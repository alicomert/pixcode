#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const externalAccess = readFileSync('server/services/external-access.js', 'utf8');
const networkRoutes = readFileSync('server/routes/network.js', 'utf8');
const serverIndex = readFileSync('server/index.js', 'utf8');

assert.match(
  externalAccess,
  /TUNNEL_PERSISTENCE_PATH/,
  'Tunnel service should persist the user-requested tunnel state outside process memory.',
);
assert.match(
  externalAccess,
  /persistTunnelPreference/,
  'Tunnel service should write tunnel start/stop intent to disk.',
);
assert.match(
  externalAccess,
  /desired:\s*true/,
  'Starting a tunnel should mark tunnel intent as desired until the user stops it.',
);
assert.match(
  externalAccess,
  /desired:\s*false/,
  'Stopping a tunnel should clear persisted tunnel intent.',
);
assert.match(
  externalAccess,
  /restoreRequestedTunnel/,
  'Tunnel service should expose a startup restore hook.',
);
assert.match(
  externalAccess,
  /restoring/,
  'Tunnel restore should distinguish automatic restart attempts from direct user starts.',
);
assert.match(
  networkRoutes,
  /persistPreference:\s*true/,
  'Manual tunnel starts should persist the user preference through the network route.',
);
assert.match(
  serverIndex,
  /restoreRequestedTunnel/,
  'Server startup should restore a requested tunnel after updates/restarts.',
);
assert.match(
  serverIndex,
  /restoreRequestedTunnel\(\{ port: Number\(SERVER_PORT\) \}\)/,
  'Server startup should restore the tunnel against the current backend port.',
);

console.log('tunnel persistence smoke passed');
