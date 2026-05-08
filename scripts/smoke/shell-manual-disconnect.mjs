#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const connectionSource = readFileSync('src/components/shell/hooks/useShellConnection.ts', 'utf8');
const runtimeSource = readFileSync('src/components/shell/hooks/useShellRuntime.ts', 'utf8');

assert.ok(
  connectionSource.includes('manualDisconnectRef'),
  'Shell connection should track manual disconnects separately from socket closes.',
);
assert.ok(
  connectionSource.includes('manualDisconnectRef.current = true'),
  'Manual disconnect should disable auto-reconnect.',
);
assert.ok(
  connectionSource.includes('manualDisconnectRef.current = false'),
  'Explicit connect should re-enable connection attempts.',
);
assert.ok(
  connectionSource.includes('manualDisconnectRef.current'),
  'Auto-connect effect should check the manual disconnect guard.',
);
assert.ok(
  runtimeSource.includes('disconnectFromShell(false)'),
  'Internal project/session/restart disconnects should not set the manual disconnect guard.',
);

console.log('shell manual disconnect smoke passed');
