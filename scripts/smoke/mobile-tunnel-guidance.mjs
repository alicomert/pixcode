#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const externalAccess = readFileSync('server/services/external-access.js', 'utf8');
const mobileTab = readFileSync('src/components/settings/view/tabs/mobile-settings/MobileSettingsTab.tsx', 'utf8');

assert.ok(
  externalAccess.includes('createTunnelInstallHint'),
  'Tunnel service should attach structured install guidance when cloudflared/ngrok is missing.',
);

assert.ok(
  externalAccess.includes('err.installHint'),
  'Missing tunnel binary errors should expose installHint to the route/UI.',
);

assert.ok(
  mobileTab.includes('installHint'),
  'Mobile settings should render tunnel install guidance from the backend response.',
);

assert.ok(
  mobileTab.includes('external?.tunnel.installHint'),
  'Mobile settings should keep guidance visible from persisted tunnel state.',
);

console.log('mobile tunnel guidance smoke passed');
