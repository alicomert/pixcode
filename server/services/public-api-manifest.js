import fs from 'node:fs';
import path from 'node:path';

import { findAppRoot, getModuleDir } from '../utils/runtime-paths.js';

const PACKAGE_VERSION_FALLBACK = '1.64.2';

function readPackageVersion() {
  try {
    const appRoot = findAppRoot(getModuleDir(import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    return typeof packageJson?.version === 'string' && packageJson.version.trim()
      ? packageJson.version.trim()
      : PACKAGE_VERSION_FALLBACK;
  } catch {
    return PACKAGE_VERSION_FALLBACK;
  }
}

const PACKAGE_VERSION = readPackageVersion();

const API_GROUPS = [
  { id: 'auth', title: 'Authentication', basePath: '/api/auth', scopes: ['auth:read', 'auth:write'] },
  { id: 'projects', title: 'Projects', basePath: '/api/projects', scopes: ['projects:read', 'projects:write'] },
  { id: 'sessions', title: 'Sessions and messages', basePath: '/api/sessions', scopes: ['sessions:read', 'sessions:write'] },
  { id: 'providers', title: 'CLI providers', basePath: '/api/providers', scopes: ['providers:read', 'providers:write'] },
  { id: 'terminal', title: 'Visible terminal sessions', basePath: '/api/shell/sessions', scopes: ['terminal:launch'] },
  { id: 'nanoclaw', title: 'NanoClaw (agents, schedules, messaging)', basePath: '/api/nanoclaw', scopes: ['tasks:read', 'tasks:write'] },
  { id: 'tasks', title: 'Tasks alias (same as NanoClaw)', basePath: '/api/tasks', scopes: ['tasks:read', 'tasks:write'] },
  { id: 'notifications', title: 'Notifications', basePath: '/api/settings/notification-preferences', scopes: ['notifications:read', 'notifications:write'] },
  { id: 'files', title: 'Files', basePath: '/api/projects/:projectName/files', scopes: ['files:read', 'files:write'] },
  { id: 'git', title: 'Source control', basePath: '/api/git', scopes: ['git:read', 'git:write'] },
  { id: 'settings', title: 'Settings and API keys', basePath: '/api/settings', scopes: ['settings:read', 'settings:write'] },
  { id: 'updates', title: 'System updates and restart', basePath: '/api/system', scopes: ['system:update', 'system:restart'] },
  { id: 'diagnostics', title: 'Diagnostics', basePath: '/api/diagnostics', scopes: ['diagnostics:read', 'diagnostics:write'] },
  { id: 'remote', title: 'Outbound health bridge and control room', basePath: '/api/remote', scopes: ['remote:read', 'remote:write'] },
  { id: 'telegram', title: 'Telegram control', basePath: '/api/telegram', scopes: ['telegram:read', 'telegram:write'] },
  { id: 'webhooks', title: 'Outbound webhooks', basePath: '/api/webhooks', scopes: ['webhooks:read', 'webhooks:write'] },
  { id: 'plugins', title: 'Plugins and MCP tools', basePath: '/api/plugins', scopes: ['plugins:read', 'plugins:write'] },
  { id: 'orchestration', title: 'Production agent loop (legacy orchestration retired)', basePath: '/api/production-agent-loop', scopes: ['orchestration:read', 'orchestration:write'], adminOnly: true },
  { id: 'agent', title: 'Legacy agent runner', basePath: '/api/agent', scopes: ['agent:run'] },
];

const API_SCOPES = Array.from(new Set(API_GROUPS.flatMap((group) => group.scopes))).sort();

export function buildPublicApiManifest({ baseUrl = '' } = {}) {
  const origin = String(baseUrl || '').replace(/\/+$/, '');
  const root = origin || 'http://127.0.0.1:3001';
  return {
    name: 'Pixcode Public API',
    version: PACKAGE_VERSION,
    baseUrl: origin || null,
    auth: {
      transports: ['Authorization: Bearer <px_api_key>', 'X-API-Key: <px_api_key>'],
      streamTicket: 'POST /api/auth/stream-ticket with Authorization, then use ?streamTicket=<ticket> once on the exact SSE/WS path.',
      websocket: 'Prefer a short-lived stream ticket for browser WebSocket/EventSource clients; API clients may still pass px_ keys in headers.',
      legacyQueryCredentials: {
        enabledByDefault: false,
        env: 'PIXCODE_ALLOW_QUERY_CREDENTIALS=1',
        transports: ['?token=<jwt>', '?apiKey=<px_api_key>'],
        warning: 'Raw query credentials can leak through browser history, proxy logs, and referrer headers. Use headers or streamTicket instead.',
      },
    },
    apiKey: {
      prefix: 'px_',
      scopes: API_SCOPES,
      revocable: true,
      manageableAt: '/api/settings/api-keys',
    },
    migration: {
      retiredRoutes: ['/api/orchestration/*', '/a2a/*'],
      replacement: 'Use /api/nanoclaw/* (or /api/tasks/*) for multi-CLI tasks and schedules; use /api/production-agent-loop/* for admin review and CI automation.',
      retiredSince: '1.55.0',
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
  return `export type NanoClawTask = {
  id: string;
  prompt: string;
  status: string;
  scheduleType?: string;
  nextRunAt?: string;
};

export type ProductionAgentLoopRun = {
  id?: string;
  issue?: string;
  branch?: string;
  status?: string;
  [key: string]: unknown;
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

  nanoclawChannels() {
    return this.request<Record<string, unknown>>('/api/nanoclaw/channels');
  }

  nanoclawAgents() {
    return this.request<Record<string, unknown>>('/api/nanoclaw/agents');
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

  resumeTask(taskId: string) {
    return this.request(\`/api/nanoclaw/tasks/\${encodeURIComponent(taskId)}/resume\`, { method: 'POST', body: '{}' });
  }

  cancelTask(taskId: string) {
    return this.request(\`/api/nanoclaw/tasks/\${encodeURIComponent(taskId)}/cancel\`, { method: 'POST', body: '{}' });
  }

  deleteTask(taskId: string) {
    return this.request<void>(\`/api/nanoclaw/tasks/\${encodeURIComponent(taskId)}\`, { method: 'DELETE' });
  }

  updateTask(taskId: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(\`/api/nanoclaw/tasks/\${encodeURIComponent(taskId)}\`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  streamTicket(path: string, transport: 'sse' | 'ws' = 'sse') {
    return this.request<{ success: true; ticket: string; expiresAt: string }>('/api/auth/stream-ticket', {
      method: 'POST',
      body: JSON.stringify({ path, transport }),
    });
  }

  listFiles(projectName: string) {
    return this.request<unknown[]>(\`/api/projects/\${encodeURIComponent(projectName)}/files\`);
  }

  readFile(projectName: string, filePath: string) {
    return this.request<{ content: string }>(
      \`/api/projects/\${encodeURIComponent(projectName)}/file?filePath=\${encodeURIComponent(filePath)}\`,
    );
  }

  productionIssueToPr(input: Record<string, unknown>) {
    return this.request<{ success: true; run: ProductionAgentLoopRun }>(
      '/api/production-agent-loop/github/issue-to-pr',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
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
      description: 'Self-hosted Pixcode control room API including NanoClaw multi-CLI agents and schedules. The pre-1.55 /api/orchestration workflow surface is retired; use /api/nanoclaw/* or /api/production-agent-loop/*.',
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
      // Group roots document route families that do not have an endpoint-specific contract below.
      // Keep this first so a concrete contract at the same path remains authoritative.
      ...Object.fromEntries(
        manifest.groups.map((group) => [
          group.basePath,
          {
            get: {
              summary: group.title,
              'x-pixcode-group': group.id,
              'x-pixcode-scopes': group.scopes,
              ...(group.adminOnly ? { 'x-pixcode-admin-only': true } : {}),
            },
          },
        ]),
      ),
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
      '/api/auth/stream-ticket': {
        post: {
          summary: 'Mint a short-lived single-use SSE/WebSocket ticket',
          'x-pixcode-group': 'auth',
          'x-pixcode-scopes': ['auth:read'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    transport: { type: 'string', enum: ['sse', 'ws'] },
                  },
                },
              },
            },
          },
        },
      },
      '/api/user/github/oauth/start': {
        get: {
          summary: 'Start the GitHub OAuth connection flow',
          description: 'Authenticated browser flow. The OAuth callback is intentionally public for GitHub redirects.',
          'x-pixcode-group': 'settings',
          'x-pixcode-scopes': ['settings:read'],
        },
      },
      '/api/user/github/oauth/callback': {
        get: {
          summary: 'Complete a GitHub OAuth callback',
          description: 'Public OAuth callback endpoint. Do not call this directly; follow the URL returned by the OAuth start endpoint.',
          security: [],
          'x-pixcode-group': 'settings',
        },
      },
      '/api/user/git-config': {
        get: { summary: 'Read the user Git identity and GitHub connection state', 'x-pixcode-group': 'settings', 'x-pixcode-scopes': ['settings:read'] },
        post: { summary: 'Save the user Git identity', 'x-pixcode-group': 'settings', 'x-pixcode-scopes': ['settings:write'] },
      },
      '/api/remote/control-room': {
        get: {
          summary: 'Read the admin mobile control-room snapshot',
          description: 'Installation-wide admin endpoint. Scoped API keys require remote:read and admin access.',
          'x-pixcode-group': 'remote',
          'x-pixcode-scopes': ['remote:read', 'admin'],
          'x-pixcode-admin-only': true,
        },
      },
      '/api/webhooks': {
        get: { summary: 'List outbound webhooks', 'x-pixcode-group': 'webhooks', 'x-pixcode-scopes': ['webhooks:read'] },
        post: { summary: 'Register an outbound webhook', 'x-pixcode-group': 'webhooks', 'x-pixcode-scopes': ['webhooks:write'] },
      },
      '/api/diagnostics/bundle': {
        get: { summary: 'Download a redacted diagnostics bundle', 'x-pixcode-group': 'diagnostics', 'x-pixcode-scopes': ['diagnostics:read'] },
      },
      '/api/shell/sessions/terminate': {
        post: {
          summary: 'Terminate a visible terminal session',
          description: 'Interactive terminal transport is the /shell WebSocket with a one-shot stream ticket. This REST endpoint only manages an existing session.',
          'x-pixcode-group': 'terminal',
          'x-pixcode-scopes': ['terminal:launch'],
        },
      },
      '/api/shell/sessions/provider-output': {
        get: {
          summary: 'Read provider output associated with a visible terminal session',
          'x-pixcode-group': 'terminal',
          'x-pixcode-scopes': ['terminal:launch'],
        },
      },
      '/api/shell/sessions/provider-input': {
        post: {
          summary: 'Send provider input to a visible terminal session',
          'x-pixcode-group': 'terminal',
          'x-pixcode-scopes': ['terminal:launch'],
        },
      },
      '/api/nanoclaw/channels': {
        get: { summary: 'List connected messaging channels', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
      },
      '/api/nanoclaw/agents': {
        get: { summary: 'List available multi-CLI agents', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
      },
      '/api/nanoclaw/tasks/{taskId}': {
        get: { summary: 'Read one scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:read'] },
        patch: { summary: 'Update a scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
        delete: { summary: 'Delete a scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      '/api/nanoclaw/tasks/{taskId}/pause': {
        post: { summary: 'Pause a scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      '/api/nanoclaw/tasks/{taskId}/resume': {
        post: { summary: 'Resume a scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      '/api/nanoclaw/tasks/{taskId}/cancel': {
        post: { summary: 'Cancel a scheduled task', 'x-pixcode-group': 'nanoclaw', 'x-pixcode-scopes': ['tasks:write'] },
      },
      '/api/production-agent-loop': {
        get: {
          summary: 'Production agent loop state',
          'x-pixcode-group': 'orchestration',
          'x-pixcode-scopes': ['orchestration:read'],
          'x-pixcode-admin-only': true,
        },
      },
      '/api/production-agent-loop/github/issue-to-pr': {
        post: { summary: 'Create an issue-to-PR run plan', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/ci/repair-plan': {
        post: { summary: 'Parse CI output into a repair plan', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/review-queue': {
        get: { summary: 'List review queue items', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:read'] },
        post: { summary: 'Add a review queue item', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/review-queue/{id}': {
        patch: { summary: 'Update a review queue item', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/scheduler/jobs': {
        get: { summary: 'List background agent jobs', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:read'] },
        post: { summary: 'Schedule a background agent job', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/snapshots': {
        get: { summary: 'List workspace checkpoints', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:read'] },
        post: { summary: 'Create a workspace checkpoint', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
      '/api/production-agent-loop/desktop-release/assets-policy': {
        get: { summary: 'Read desktop asset policy', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:read'] },
        post: { summary: 'Evaluate desktop release assets', 'x-pixcode-group': 'orchestration', 'x-pixcode-scopes': ['orchestration:write'] },
      },
    },
  };
}
