#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildIpDnsPublicUrl,
  normalizePublicUrl,
  resolveConfiguredPublicUrl,
} from '../../server/utils/public-url.js';

assert.equal(
  buildIpDnsPublicUrl({ ip: '203.0.113.10' }),
  'https://pixcode.203.0.113.10.sslip.io',
);
assert.equal(
  buildIpDnsPublicUrl({ ip: '203.0.113.10', proxyDomain: 'nip.io', scheme: 'http', port: 3001 }),
  'http://pixcode.203.0.113.10.nip.io:3001',
);
assert.equal(buildIpDnsPublicUrl({ ip: 'not-an-ip' }), null);
assert.equal(buildIpDnsPublicUrl({ ip: '203.0.113.10', port: '3001oops' }), 'https://pixcode.203.0.113.10.sslip.io');
assert.equal(buildIpDnsPublicUrl({ ip: '203.0.113.10', scheme: 'ftp' }), null);
assert.equal(normalizePublicUrl('https://code.example.com/'), 'https://code.example.com');
assert.throws(() => normalizePublicUrl('javascript:alert(1)'));
assert.throws(() => normalizePublicUrl('https://user:pass@example.com'));
assert.deepEqual(
  resolveConfiguredPublicUrl({
    request: {
      headers: { host: 'spoofed.example' },
      app: { get: () => 0 },
      get: () => 'safe.example:3001',
      socket: { encrypted: false },
    },
  }),
  { url: 'http://safe.example:3001', source: 'request', tls: false },
);

console.log('public URL smoke checks passed');
