const API_GROUPS = [
  { id: 'auth', title: 'Authentication', basePath: '/api/auth', scopes: ['auth:read', 'auth:write'] },
  { id: 'projects', title: 'Projects', basePath: '/api/projects', scopes: ['projects:read', 'projects:write'] },
  { id: 'sessions', title: 'Sessions and messages', basePath: '/api/sessions', scopes: ['sessions:read', 'sessions:write'] },
  { id: 'providers', title: 'CLI providers', basePath: '/api/providers', scopes: ['providers:read', 'providers:write'] },
  { id: 'terminal', title: 'Visible terminal sessions', basePath: '/api/shell/sessions', scopes: ['terminal:launch'] },
  { id: 'nanoclaw', title: 'NanoClaw (agents, schedules, messaging)', basePath: '/api/nanoclaw', scopes: ['tasks:read', 'tasks:write'] },
  { id: 'tasks', title: 'Tasks alias (same as NanoClaw)', basePath: '/api/tasks', scopes: ['tasks:read', 'tasks:write'] },
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
  { id: 'orchestration', title: 'Orchestration workflows', basePath: '/api/orchestration', scopes: ['orchestration:read', 'orchestration:write'] },
];

const API_SCOPES = Array.from(new Set(API_GROUPS.flatMap((group) => group.scopes))).sort();

export function buildPublicApiManifest({ baseUrl = '' } = {}) {
  const origin = String(baseUrl || '').replace(/\/+$/, '');
  const root = origin || 'http://127.0.0.1:3001';
  return {
    name: 'Pixcode Public API',
    version: '1.60',
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
    nanoclaw: {
      help: `${root}/api/nanoclaw/help`,
      docs: 'docs/NANOCLAW_API.md',
      alias: '/api/tasks',
    },
    examples: [
      {
        title: 'List projects',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/projects`,
      },
      {
        title: 'NanoClaw status',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/nanoclaw/status`,
      },
      {
        title: 'List NanoClaw scheduled tasks',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/nanoclaw/tasks`,
      },
      {
        title: 'Run a multi-CLI agent now',
        curl: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: px_your_key" -d '{"prompt":"summarize git status","agentType":"claude-code","projectId":"my-app"}' ${root}/api/nanoclaw/run`,
      },
      {
        title: 'Schedule a cron task',
        curl: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: px_your_key" -d '{"prompt":"[agent:codex] daily audit","schedule_type":"cron","schedule_value":"0 9 * * *","projectId":"my-app"}' ${root}/api/nanoclaw/tasks`,
      },
      {
        title: 'List project files',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/projects/my-app/files`,
      },
      {
        title: 'Read a file',
        curl: `curl -H "X-API-Key: px_your_key" "${root}/api/projects/my-app/file?filePath=README.md"`,
      },
      {
        title: 'Fetch diagnostics bundle',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/diagnostics/bundle`,
      },
      {
        title: 'Read the mobile remote control room',
        curl: `curl -H "X-API-Key: px_your_key" ${root}/api/remote/control-room`,
      },
      {
        title: 'Register an outbound webhook',
        curl: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: px_your_key" -d '{"name":"CI listener","url":"https://example.com/pixcode","events":["run.completed","approval.needed"]}' ${root}/api/webhooks`,
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

export type NanoClawTask = {
  id: string;
  prompt: string;
  status: string;
  scheduleType?: string;
  nextRunAt?: string;
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
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  projects() {
    return this.request<{ projects: unknown[] }>('/api/projects');
  }

  controlRoom() {
    return this.request<{ success: true; controlRoom: unknown }>('/api/remote/control-room');
  }

  nanoclawStatus() {
    return this.request<{ ok: boolean; started: boolean; engine: string }>('/api/nanoclaw/status');
  }

  nanoclawHelp() {
    return this.request<Record<string, unknown>>('/api/nanoclaw/help');
  }

  listTasks(projectId?: string) {
    const q = projectId ? \`?projectId=\${encodeURIComponent(projectId)}\` : '';
    return this.request<{ tasks: NanoClawTask[] }>(\`/api/nanoclaw/tasks\${q}\`);
  }

  scheduleTask(body: {
    prompt: string;
    schedule_type?: 'once' | 'interval' | 'cron';
    schedule_value?: string;
    projectId?: string;
  }) {
    return this.request<{ ok: boolean; task: NanoClawTask | null }>('/api/nanoclaw/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  runAgent(body: {
    prompt: string;
    agentType?: string;
    model?: string;
    projectId?: string;
    projectPath?: string;
    sessionId?: string;
  }) {
    return this.request<Record<string, unknown>>('/api/nanoclaw/run', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  pauseTask(taskId: string) {
    return this.request(\`/api/nanoclaw/tasks/\${encodeURIComponent(taskId)}/pause\`, { method: 'POST', body: '{}' });
  }

  listFiles(projectName: string) {
    return this.request<unknown[]>(\`/api/projects/\${encodeURIComponent(projectName)}/files\`);
  }

  readFile(projectName: string, filePath: string) {
    return this.request<{ content: string }>(
      \`/api/projects/\${encodeURIComponent(projectName)}/file?filePath=\${encodeURIComponent(filePath)}\`,
    );
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
        title: 'NanoClaw help (all agent/schedule endpoints)',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/help"`,
      },
      {
        title: 'NanoClaw status + channels',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/status"`,
      },
      {
        title: 'List multi-CLI agents',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/agents"`,
      },
      {
        title: 'List scheduled tasks',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks"`,
      },
      {
        title: 'Schedule a one-shot task',
        command: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"[agent:codex] add tests","schedule_type":"once","projectId":"my-app"}' "$PIXCODE_URL/api/nanoclaw/tasks"`,
      },
      {
        title: 'Schedule a cron task',
        command: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"daily dependency audit","schedule_type":"cron","schedule_value":"0 9 * * *","projectId":"my-app"}' "$PIXCODE_URL/api/nanoclaw/tasks"`,
      },
      {
        title: 'Run agent immediately',
        command: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"summarize open issues","agentType":"grok","projectId":"my-app"}' "$PIXCODE_URL/api/nanoclaw/run"`,
      },
      {
        title: 'Pause a task',
        command: `curl -X POST -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks/TASK_ID/pause"`,
      },
      {
        title: 'List project files',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/projects/my-app/files"`,
      },
      {
        title: 'Read a file',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/projects/my-app/file?filePath=README.md"`,
      },
      {
        title: 'Read the mobile control room',
        command: `curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/remote/control-room"`,
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
  const root = String(options.baseUrl || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: manifest.name,
      version: manifest.version,
      description: 'Self-hosted Pixcode control room API including NanoClaw multi-CLI agents and schedules.',
    },
    servers: [{ url: root }],
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
    paths: {
      '/api/nanoclaw/help': {
        get: { summary: 'NanoClaw API help + curl examples', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
      },
      '/api/nanoclaw/status': {
        get: { summary: 'NanoClaw engine status', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
      },
      '/api/nanoclaw/tasks': {
        get: { summary: 'List scheduled tasks', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
        post: { summary: 'Create/schedule a task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      '/api/nanoclaw/run': {
        post: { summary: 'Run multi-CLI agent immediately', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      ...Object.fromEntries(
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
    },
  };
}
