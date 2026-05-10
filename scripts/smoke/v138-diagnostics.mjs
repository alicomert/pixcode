#!/usr/bin/env node
import { collectDiagnostics } from '../../server/services/diagnostics.js';

const diagnostics = collectDiagnostics({
  now: new Date('2026-05-10T00:00:00.000Z'),
  env: {
    NODE_ENV: 'test',
    SERVER_PORT: '3001',
    GITHUB_TOKEN: 'ghp_super_secret_value',
    NPM_TOKEN: 'npm_super_secret_value',
    TELEGRAM_BOT_TOKEN: 'telegram_super_secret_value',
  },
  uptime: 42,
  memoryUsage: () => ({
    rss: 10,
    heapTotal: 20,
    heapUsed: 5,
    external: 1,
    arrayBuffers: 0,
  }),
  versions: {
    node: '22.0.0',
    v8: '12.0.0',
  },
  platform: 'linux',
  arch: 'x64',
  installMode: 'git',
  serverVersion: '1.38.0',
  wsClientCount: 3,
});

const raw = JSON.stringify(diagnostics);
for (const secret of ['ghp_super_secret_value', 'npm_super_secret_value', 'telegram_super_secret_value']) {
  if (raw.includes(secret)) {
    throw new Error(`diagnostics leaked secret value: ${secret}`);
  }
}

if (diagnostics.status !== 'ok') {
  throw new Error(`expected ok diagnostics status, got ${diagnostics.status}`);
}

if (diagnostics.timestamp !== '2026-05-10T00:00:00.000Z') {
  throw new Error(`unexpected diagnostics timestamp ${diagnostics.timestamp}`);
}

if (diagnostics.version !== '1.38.0' || diagnostics.installMode !== 'git') {
  throw new Error('diagnostics did not include injected version/install mode');
}

if (diagnostics.websocket.clients !== 3) {
  throw new Error(`expected 3 websocket clients, got ${diagnostics.websocket.clients}`);
}

if (diagnostics.environment.GITHUB_TOKEN !== '[redacted]') {
  throw new Error('GITHUB_TOKEN was not redacted');
}

if (diagnostics.environment.NODE_ENV !== 'test') {
  throw new Error('safe environment value was not preserved');
}

console.log('v1.38 diagnostics smoke passed');
