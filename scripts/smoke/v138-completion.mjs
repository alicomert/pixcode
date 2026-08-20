#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const runtimeDir = path.resolve('.pixcode-dev', 'smoke-v138-completion');
mkdirSync(runtimeDir, { recursive: true });
process.env.DATABASE_PATH = path.join(runtimeDir, 'auth.db');

const requiredGroups = [
  'auth',
  'projects',
  'sessions',
  'providers',
  'terminal',
  'nanoclaw',
  'tasks',
  'notifications',
  'files',
  'git',
  'settings',
  'updates',
  'diagnostics',
  'remote',
  'telegram',
  'webhooks',
  'plugins',
  'orchestration',
  'agent',
];

try {
  const {
    getPublicRemoteConnectionConfig,
    normalizeRemoteConnectionConfig,
    saveRemoteConnectionConfig,
  } = await import('../../server/services/remote-connection.js');
  const {
    buildOpenApiFragment,
    buildPublicApiManifest,
    buildTypeScriptSdkStarter,
  } = await import('../../server/services/public-api-manifest.js');
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

  // A changed per-install encryption key must not make a health/config write
  // erase the only recoverable ciphertext. This simulates restoring a config
  // file on a new host before the operator supplies the replacement key.
  const { appConfigDb } = await import('../../server/database/db.js');
  const previousCredentialKey = process.env.PIXCODE_CREDENTIAL_KEY;
  try {
    process.env.PIXCODE_CREDENTIAL_KEY = 'smoke-credential-key-a';
    saveRemoteConnectionConfig({
      mode: 'remote',
      remoteUrl: 'https://pixcode.example.com',
      apiKey: 'px_preserve_ciphertext',
    });
    const encryptedBefore = JSON.parse(appConfigDb.get('remote_connection')).apiKey;
    assert.match(encryptedBefore, /^enc:v1:/u);

    process.env.PIXCODE_CREDENTIAL_KEY = 'smoke-credential-key-b';
    const unreadable = (await import('../../server/services/remote-connection.js')).getRemoteConnectionConfig();
    assert.equal(unreadable.apiKey, null);
    saveRemoteConnectionConfig({
      mode: 'remote',
      remoteUrl: unreadable.remoteUrl,
      lastHealth: { reachable: false, status: 'key-rotation-smoke' },
    });
    const encryptedAfter = JSON.parse(appConfigDb.get('remote_connection')).apiKey;
    assert.equal(encryptedAfter, encryptedBefore, 'config writes must preserve unreadable credential ciphertext');
  } finally {
    if (previousCredentialKey === undefined) delete process.env.PIXCODE_CREDENTIAL_KEY;
    else process.env.PIXCODE_CREDENTIAL_KEY = previousCredentialKey;
  }

  const manifest = buildPublicApiManifest({ baseUrl: 'http://127.0.0.1:3001' });
  assert.deepEqual(
    requiredGroups.filter((group) => !manifest.groups.some((item) => item.id === group)),
    [],
    'public API manifest should expose every stable automation group',
  );
  assert.ok(manifest.apiKey.prefix === 'px_');
  assert.ok(manifest.apiKey.scopes.includes('tasks:write'));
  assert.ok(manifest.examples.some((example) => example.curl.includes('X-API-Key: px_')));
  assert.deepEqual(manifest.migration.retiredRoutes, ['/api/orchestration/*', '/a2a/*']);
  assert.match(manifest.migration.replacement, /\/api\/nanoclaw/u);

  const openapi = buildOpenApiFragment({ baseUrl: 'http://127.0.0.1:3001' });
  assert.ok(openapi.paths['/api/nanoclaw/run']?.post, 'generated OpenAPI must expose the NanoClaw run route');
  assert.ok(openapi.paths['/api/nanoclaw/tasks/{taskId}']?.patch, 'generated OpenAPI must expose NanoClaw task updates');
  assert.ok(openapi.paths['/api/production-agent-loop/github/issue-to-pr']?.post, 'generated OpenAPI must expose the production issue-to-PR route');
  assert.equal(Object.hasOwn(openapi.paths, '/api/orchestration/workflows'), false, 'retired orchestration routes must not be advertised');

  const sdk = buildTypeScriptSdkStarter({ baseUrl: 'http://127.0.0.1:3001' });
  assert.match(sdk, /productionIssueToPr/u);
  assert.match(sdk, /ProductionAgentLoopRun/u);
  assert.match(sdk, /streamTicket\(path: string, transport: 'sse' \| 'ws'/u);
  assert.match(sdk, /resumeTask\(taskId: string\)/u);
  assert.doesNotMatch(sdk, /startWorkflow|\/api\/orchestration/u);

  const staticOpenApi = readFileSync('public/openapi.yaml', 'utf8');
  assert.match(staticOpenApi, /\/api\/nanoclaw\/run/u);
  assert.match(staticOpenApi, /\/api\/production-agent-loop\/github\/issue-to-pr/u);
  assert.doesNotMatch(staticOpenApi, /^  \/api\/orchestration\//mu);

  const apiDocs = readFileSync('public/api-docs.html', 'utf8');
  assert.match(apiDocs, /\/api\/nanoclaw\/run/u);
  assert.match(apiDocs, /orchestration(?: workflow routes)?[^\n]*(?:retired|removed)/i);
  assert.doesNotMatch(apiDocs, /<code>(?:GET|POST|PUT|PATCH|DELETE) \/api\/orchestration/u);
  assert.match(apiDocs, /fetchOpenApiDocument/u, 'API docs must fetch the protected catalog with credentials');
  assert.match(apiDocs, /localStorage\.getItem\('auth-token'\)/u, 'API docs must reuse the app session when loading OpenAPI');
  assert.match(apiDocs, /content: documentContent/u, 'Scalar must receive the authenticated OpenAPI document');
  assert.doesNotMatch(apiDocs, /url:\s*['"]\/api\/public\/openapi['"]/u, 'Scalar must not fetch the protected catalog without auth');

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

  const nanoclawRoutes = readFileSync('server/modules/nanoclaw/bridge.js', 'utf8');
  assert.ok(nanoclawRoutes.includes("router.get('/tasks'"), 'NanoClaw should expose scheduled task listing');
  assert.ok(nanoclawRoutes.includes("router.get('/tasks/:taskId'"), 'NanoClaw should expose task detail');
  assert.ok(nanoclawRoutes.includes("router.post('/tasks'"), 'NanoClaw should expose task scheduling');
  assert.ok(nanoclawRoutes.includes("router.post('/tasks/:taskId/pause'"), 'NanoClaw should expose task pause control');

  const telegramControl = readFileSync('server/services/telegram/control-center.js', 'utf8');
  assert.ok(telegramControl.includes("'/sessions'"), 'Telegram should expose active sessions command');
  assert.ok(telegramControl.includes("'/newchat'"), 'Telegram should expose new chat command');
  assert.ok(telegramControl.includes("progressMode: 'errors'") || telegramControl.includes("progressMode === 'errors'"), 'Telegram should support errors-only progress');

  const setupForm = readFileSync('src/components/auth/view/SetupForm.tsx', 'utf8');
  assert.ok(setupForm.includes('Create the first administrator account for this Pixcode server'));
  assert.doesNotMatch(setupForm, /connectionMode|remoteUrl|remoteApiKey|\/api\/auth\/connection-mode/u);

  const authRoutes = readFileSync('server/routes/auth.js', 'utf8');
  assert.doesNotMatch(authRoutes, /connection-mode/u, 'First-run setup must not retain a remote-mode API alias.');

  const settingsSidebar = readFileSync('src/components/settings/view/SettingsSidebar.tsx', 'utf8');
  const settingsTypes = readFileSync('src/components/settings/types/types.ts', 'utf8');
  const settings = readFileSync('src/components/settings/view/Settings.tsx', 'utf8');
  assert.ok(settingsSidebar.includes('mainTabs.diagnostics'));
  assert.ok(settingsTypes.includes("'diagnostics'"));
  assert.ok(settings.includes('DiagnosticsSettingsTab'));

  if (existsSync('RELEASE_TRACKING_v1.38.md')) {
    const releaseTracking = readFileSync('RELEASE_TRACKING_v1.38.md', 'utf8');
    for (const issue of ['#15', '#16', '#17', '#18', '#19', '#21']) {
      assert.ok(releaseTracking.includes(`- [x] ${issue}`), `${issue} should be marked complete`);
    }
  } else {
    console.log('v1.38 completion smoke: retired release tracking document skipped');
  }
} finally {
  rmSync(runtimeDir, { recursive: true, force: true });
}

console.log('v1.38 completion smoke passed');
