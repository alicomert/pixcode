#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const runtimeDir = path.resolve('.pixcode-dev', 'smoke-v138-completion');
mkdirSync(runtimeDir, { recursive: true });
process.env.DATABASE_PATH = path.join(runtimeDir, 'auth.db');

const requiredGroups = [
  'auth',
  'projects',
  'sessions',
  'providers',
  'orchestration',
  'taskmaster',
  'notifications',
  'files',
  'git',
  'settings',
  'updates',
  'diagnostics',
  'remote',
  'telegram',
  'plugins',
];

try {
  const {
    getPublicRemoteConnectionConfig,
    normalizeRemoteConnectionConfig,
    saveRemoteConnectionConfig,
  } = await import('../../server/services/remote-connection.js');
  const { buildPublicApiManifest } = await import('../../server/services/public-api-manifest.js');
  const { collectDiagnostics } = await import('../../server/services/diagnostics.js');

  const normalizedLocal = normalizeRemoteConnectionConfig({ mode: 'local' });
  assert.equal(normalizedLocal.mode, 'local');
  assert.equal(normalizedLocal.remoteUrl, null);

  const normalizedRemote = normalizeRemoteConnectionConfig({
    mode: 'remote',
    remoteUrl: 'https://pixcode.example.com/api/',
    apiKey: 'px_remote_secret_value',
  });
  assert.equal(normalizedRemote.mode, 'remote');
  assert.equal(normalizedRemote.remoteUrl, 'https://pixcode.example.com/api');
  assert.equal(normalizedRemote.apiKey, 'px_remote_secret_value');

  saveRemoteConnectionConfig(normalizedRemote);
  const publicRemote = getPublicRemoteConnectionConfig();
  assert.equal(publicRemote.mode, 'remote');
  assert.equal(publicRemote.remoteUrl, 'https://pixcode.example.com/api');
  assert.equal(publicRemote.apiKeyPresent, true);
  assert.equal(Object.hasOwn(publicRemote, 'apiKey'), false);

  const manifest = buildPublicApiManifest({ baseUrl: 'http://127.0.0.1:3001' });
  assert.deepEqual(
    requiredGroups.filter((group) => !manifest.groups.some((item) => item.id === group)),
    [],
    'public API manifest should expose every stable automation group',
  );
  assert.ok(manifest.apiKey.prefix === 'px_');
  assert.ok(manifest.apiKey.scopes.includes('taskmaster:write'));
  assert.ok(manifest.examples.some((example) => example.curl.includes('X-API-Key: px_')));

  const diagnostics = collectDiagnostics({
    now: new Date('2026-05-10T00:00:00.000Z'),
    env: {
      NODE_ENV: 'test',
      GITHUB_TOKEN: 'ghp_super_secret_value',
      NPM_TOKEN: 'npm_super_secret_value',
      TELEGRAM_BOT_TOKEN: 'telegram_super_secret_value',
    },
    activeRuns: [{ id: 'run-1', status: 'running', token: 'never-print-me' }],
    recentErrors: [{ source: 'provider', message: 'bad token ghp_super_secret_value' }],
    providerHealth: {
      claude: { status: 'available', auth: 'configured', checkedAt: '2026-05-10T00:00:00.000Z' },
      opencode: { status: 'missing', auth: 'unknown', checkedAt: '2026-05-10T00:00:00.000Z' },
    },
    cache: { providerHealthUpdatedAt: '2026-05-10T00:00:00.000Z' },
    wsClientCount: 2,
  });
  const diagnosticsRaw = JSON.stringify(diagnostics);
  assert.ok(!diagnosticsRaw.includes('ghp_super_secret_value'));
  assert.ok(!diagnosticsRaw.includes('never-print-me'));
  assert.ok(diagnostics.providerHealth.claude.status === 'available');
  assert.ok(diagnostics.activeRuns[0].token === '[redacted]');
  assert.ok(diagnostics.manualRefresh.available);
  assert.ok(diagnostics.bundle.copyable);

  const providerRoutes = readFileSync('server/modules/providers/provider.routes.ts', 'utf8');
  assert.ok(providerRoutes.includes("'/plugin-state'"), 'provider routes should expose aggregate plugin state');
  assert.ok(providerRoutes.includes("'/plugin-state/:provider'"), 'provider routes should expose per-provider plugin state');
  assert.ok(providerRoutes.includes("config-files/:fileId/backup'"), 'provider config route should support safe backups');
  assert.ok(providerRoutes.includes("config-files/:fileId/validate'"), 'provider config route should validate before writes');
  assert.ok(providerRoutes.includes('redactProviderConfigPreview'), 'provider config previews should redact secrets');

  const taskmasterRoutes = readFileSync('server/routes/taskmaster.js', 'utf8');
  assert.ok(taskmasterRoutes.includes("router.get('/queue/:projectName'"), 'Taskmaster should expose queue summary');
  assert.ok(taskmasterRoutes.includes("router.get('/task/:projectName/:taskId'"), 'Taskmaster should expose task detail');
  for (const field of ['fallbackProvider', 'permissionMode', 'workerSlot']) {
    assert.ok(taskmasterRoutes.includes(field), `Taskmaster dispatch should preserve ${field}`);
  }

  const telegramControl = readFileSync('server/services/telegram/control-center.js', 'utf8');
  assert.ok(telegramControl.includes("'/sessions'"), 'Telegram should expose active sessions command');
  assert.ok(telegramControl.includes("'/newchat'"), 'Telegram should expose new chat command');
  assert.ok(telegramControl.includes("progressMode: 'errors'") || telegramControl.includes("progressMode === 'errors'"), 'Telegram should support errors-only progress');

  const setupForm = readFileSync('src/components/auth/view/SetupForm.tsx', 'utf8');
  assert.ok(setupForm.includes('Use this computer directly'));
  assert.ok(setupForm.includes('Connect to a remote Pixcode server'));
  assert.ok(setupForm.includes('/api/auth/connection-mode'));

  const settingsSidebar = readFileSync('src/components/settings/view/SettingsSidebar.tsx', 'utf8');
  const settingsTypes = readFileSync('src/components/settings/types/types.ts', 'utf8');
  const settings = readFileSync('src/components/settings/view/Settings.tsx', 'utf8');
  assert.ok(settingsSidebar.includes('mainTabs.diagnostics'));
  assert.ok(settingsTypes.includes("'diagnostics'"));
  assert.ok(settings.includes('DiagnosticsSettingsTab'));

  const releaseTracking = readFileSync('RELEASE_TRACKING_v1.38.md', 'utf8');
  for (const issue of ['#15', '#16', '#17', '#18', '#19', '#21']) {
    assert.ok(releaseTracking.includes(`- [x] ${issue}`), `${issue} should be marked complete`);
  }
} finally {
  rmSync(runtimeDir, { recursive: true, force: true });
}

console.log('v1.38 completion smoke passed');
