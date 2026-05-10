const API_GROUPS = [
  { id: 'auth', title: 'Authentication', basePath: '/api/auth', scopes: ['auth:read', 'auth:write'] },
  { id: 'projects', title: 'Projects', basePath: '/api/projects', scopes: ['projects:read', 'projects:write'] },
  { id: 'sessions', title: 'Sessions and messages', basePath: '/api/sessions', scopes: ['sessions:read', 'sessions:write'] },
  { id: 'providers', title: 'CLI providers', basePath: '/api/providers', scopes: ['providers:read', 'providers:write'] },
  { id: 'orchestration', title: 'Orchestration runs', basePath: '/api/orchestration', scopes: ['orchestration:read', 'orchestration:write'] },
  { id: 'taskmaster', title: 'Taskmaster queue', basePath: '/api/taskmaster', scopes: ['taskmaster:read', 'taskmaster:write'] },
  { id: 'notifications', title: 'Notifications', basePath: '/api/settings/notifications', scopes: ['notifications:read', 'notifications:write'] },
  { id: 'files', title: 'Files', basePath: '/api/projects/:projectName/files', scopes: ['files:read', 'files:write'] },
  { id: 'git', title: 'Source control', basePath: '/api/git', scopes: ['git:read', 'git:write'] },
  { id: 'settings', title: 'Settings and API keys', basePath: '/api/settings', scopes: ['settings:read', 'settings:write'] },
  { id: 'updates', title: 'Update status', basePath: '/api/update', scopes: ['updates:read', 'updates:write'] },
  { id: 'diagnostics', title: 'Diagnostics', basePath: '/api/diagnostics', scopes: ['diagnostics:read'] },
  { id: 'remote', title: 'Remote connection', basePath: '/api/remote', scopes: ['remote:read', 'remote:write'] },
  { id: 'telegram', title: 'Telegram control', basePath: '/api/telegram', scopes: ['telegram:read', 'telegram:write'] },
  { id: 'plugins', title: 'Plugins and MCP tools', basePath: '/api/plugins', scopes: ['plugins:read', 'plugins:write'] },
];

const API_SCOPES = Array.from(new Set(API_GROUPS.flatMap((group) => group.scopes))).sort();

export function buildPublicApiManifest({ baseUrl = '' } = {}) {
  const origin = String(baseUrl || '').replace(/\/+$/, '');
  return {
    name: 'Pixcode Public API',
    version: '1.38',
    baseUrl: origin || null,
    auth: {
      transports: ['Authorization: Bearer <px_api_key>', 'X-API-Key: <px_api_key>', '?apiKey=<px_api_key>'],
      websocket: 'Pass the same px_ API key as the token query parameter.',
    },
    apiKey: {
      prefix: 'px_',
      scopes: API_SCOPES,
      revocable: true,
      manageableAt: '/api/settings/api-keys',
    },
    groups: API_GROUPS,
    examples: [
      {
        title: 'List projects',
        curl: `curl -H "X-API-Key: px_your_key" ${origin || 'http://127.0.0.1:3001'}/api/projects`,
      },
      {
        title: 'Start a Taskmaster task with a model',
        curl: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: px_your_key" -d '{"provider":"opencode","model":"minimax/minimax-m2"}' ${origin || 'http://127.0.0.1:3001'}/api/taskmaster/execute/my-project/1`,
      },
      {
        title: 'Fetch diagnostics bundle',
        curl: `curl -H "X-API-Key: px_your_key" ${origin || 'http://127.0.0.1:3001'}/api/diagnostics/bundle`,
      },
    ],
  };
}

export function buildOpenApiFragment(options = {}) {
  const manifest = buildPublicApiManifest(options);
  return {
    openapi: '3.1.0',
    info: {
      title: manifest.name,
      version: manifest.version,
    },
    security: [{ PixcodeApiKey: [] }],
    components: {
      securitySchemes: {
        PixcodeApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Pixcode px_ API key. Keys are revocable and can carry scopes.',
        },
      },
    },
    paths: Object.fromEntries(
      manifest.groups.map((group) => [
        group.basePath,
        {
          get: {
            summary: group.title,
            'x-pixcode-group': group.id,
            'x-pixcode-scopes': group.scopes,
          },
        },
      ]),
    ),
  };
}
