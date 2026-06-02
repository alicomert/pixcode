const API_GROUPS = [
  { id: 'auth', title: 'Authentication', basePath: '/api/auth', scopes: ['auth:read', 'auth:write'] },
  { id: 'projects', title: 'Projects', basePath: '/api/projects', scopes: ['projects:read', 'projects:write'] },
  { id: 'sessions', title: 'Sessions and messages', basePath: '/api/sessions', scopes: ['sessions:read', 'sessions:write'] },
  { id: 'providers', title: 'CLI providers', basePath: '/api/providers', scopes: ['providers:read', 'providers:write'] },
  { id: 'terminal', title: 'Visible terminal sessions', basePath: '/api/shell/sessions', scopes: ['terminal:launch'] },
  { id: 'hermes', title: 'Hermes Agent control', basePath: '/api/orchestration/hermes', scopes: ['hermes:mcp', 'hermes:gateway', 'terminal:launch'] },
  { id: 'orchestration', title: 'Orchestration runs', basePath: '/api/orchestration', scopes: ['orchestration:read', 'orchestration:write'] },
  { id: 'notifications', title: 'Notifications', basePath: '/api/settings/notifications', scopes: ['notifications:read', 'notifications:write'] },
  { id: 'files', title: 'Files', basePath: '/api/projects/:projectName/files', scopes: ['files:read', 'files:write'] },
  { id: 'git', title: 'Source control', basePath: '/api/git', scopes: ['git:read', 'git:write'] },
  { id: 'settings', title: 'Settings and API keys', basePath: '/api/settings', scopes: ['settings:read', 'settings:write'] },
  { id: 'updates', title: 'Update status', basePath: '/api/update', scopes: ['updates:read', 'updates:write'] },
  { id: 'diagnostics', title: 'Diagnostics', basePath: '/api/diagnostics', scopes: ['diagnostics:read'] },
  { id: 'remote', title: 'Remote connection', basePath: '/api/remote', scopes: ['remote:read', 'remote:write'] },
  { id: 'telegram', title: 'Telegram control', basePath: '/api/telegram', scopes: ['telegram:read', 'telegram:write'] },
  { id: 'webhooks', title: 'Outbound webhooks', basePath: '/api/webhooks', scopes: ['webhooks:read', 'webhooks:write'] },
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
        title: 'Fetch diagnostics bundle',
        curl: `curl -H "X-API-Key: px_your_key" ${origin || 'http://127.0.0.1:3001'}/api/diagnostics/bundle`,
      },
      {
        title: 'Read Hermes control plane',
        curl: `curl -H "X-API-Key: px_your_key" ${origin || 'http://127.0.0.1:3001'}/api/orchestration/hermes/control-plane`,
      },
      {
        title: 'Read the mobile remote control room',
        curl: `curl -H "X-API-Key: px_your_key" ${origin || 'http://127.0.0.1:3001'}/api/remote/control-room`,
      },
      {
        title: 'Register an outbound webhook',
        curl: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: px_your_key" -d '{"name":"CI listener","url":"https://example.com/pixcode","events":["run.completed","approval.needed"]}' ${origin || 'http://127.0.0.1:3001'}/api/webhooks`,
      },
    ],
  };
}

export function buildTypeScriptSdkStarter({ baseUrl = '' } = {}) {
  const origin = String(baseUrl || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  return `export type PixcodeRun = {
  id: string;
  workflowId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
};

export class PixcodeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = '${origin}',
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error(\`Pixcode API \${response.status}: \${await response.text()}\`);
    return response.json() as Promise<T>;
  }

  projects() {
    return this.request<{ projects: unknown[] }>('/api/projects');
  }

  controlRoom() {
    return this.request<{ success: true; controlRoom: unknown }>('/api/remote/control-room');
  }

  approvals() {
    return this.request<{ pendingApprovals: unknown[] }>('/api/orchestration/workflows/approvals');
  }

  decideApproval(approvalId: string, allow: boolean) {
    return this.request(\`/api/orchestration/workflows/approvals/\${encodeURIComponent(approvalId)}\`, {
      method: 'POST',
      body: JSON.stringify({ allow, source: 'api' }),
    });
  }

  startWorkflow(workflowId: string, input: string, metadata: Record<string, unknown> = {}) {
    return this.request<PixcodeRun>(\`/api/orchestration/workflows/\${encodeURIComponent(workflowId)}/runs\`, {
      method: 'POST',
      body: JSON.stringify({ input, metadata }),
    });
  }
}
`;
}

export function buildCurlCookbook({ baseUrl = '' } = {}) {
  const origin = String(baseUrl || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  return {
    title: 'Pixcode Public API Cookbook',
    variables: {
      PIXCODE_URL: origin,
      PIXCODE_API_KEY: 'px_your_key',
    },
    examples: [
      {
        title: 'List projects',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/projects"`,
      },
      {
        title: 'Read the mobile control room',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/remote/control-room"`,
      },
      {
        title: 'List pending approvals',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/orchestration/workflows/approvals"`,
      },
      {
        title: 'Read Hermes control plane',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/orchestration/hermes/control-plane"`,
      },
      {
        title: 'Approve a pending action',
        command: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"allow":true,"source":"api"}' "$PIXCODE_URL/api/orchestration/workflows/approvals/approval_id"`,
      },
      {
        title: 'Create a webhook',
        command: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"name":"CI listener","url":"https://example.com/pixcode","events":["run.completed","run.failed","approval.needed"]}' "$PIXCODE_URL/api/webhooks"`,
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
