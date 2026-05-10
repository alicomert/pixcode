const SAFE_ENV_KEYS = [
  'NODE_ENV',
  'SERVER_PORT',
  'VITE_PORT',
  'HOST',
  'PORT',
  'DATABASE_PATH',
  'PIXCODE_NO_DAEMON',
  'PIXCODE_DISABLE_UPDATE_CHECK',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
];

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|credential|password|secret|token|api[_-]?key)/i;

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactEnv(env = process.env) {
  return SAFE_ENV_KEYS.reduce((acc, key) => {
    if (!(key in env)) {
      return acc;
    }
    acc[key] = isSensitiveKey(key) ? '[redacted]' : String(env[key]);
    return acc;
  }, {});
}

function providerCredentialState(env = process.env) {
  return {
    claude: Boolean(env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY),
    codex: Boolean(env.OPENAI_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
    github: Boolean(env.GITHUB_TOKEN),
    npm: Boolean(env.NPM_TOKEN),
  };
}

function normalizeMemory(memory) {
  return Object.fromEntries(
    Object.entries(memory).map(([key, value]) => [key, Number.isFinite(value) ? value : 0])
  );
}

function redactText(value) {
  return String(value || '').replace(
    /(ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|npm_[A-Za-z0-9_]+|px_[A-Za-z0-9_]+|ck_[A-Za-z0-9_]+|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/g,
    '[redacted]',
  );
}

function resolveWebSocketClientCount(options) {
  if (Number.isInteger(options.wsClientCount)) {
    return options.wsClientCount;
  }
  return options.wss?.clients?.size || 0;
}

function normalizeProviderHealth(input = {}, env = process.env, now = new Date()) {
  const defaults = {
    claude: { configured: Boolean(env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY) },
    codex: { configured: Boolean(env.OPENAI_API_KEY) },
    cursor: { configured: false },
    gemini: { configured: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY) },
    qwen: { configured: Boolean(env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY) },
    opencode: { configured: false },
  };

  return Object.fromEntries(
    Object.entries({ ...defaults, ...input }).map(([provider, value]) => {
      const raw = value && typeof value === 'object' ? value : {};
      return [
        provider,
        redactDiagnostics({
          status: raw.status || (raw.configured ? 'configured' : 'unknown'),
          auth: raw.auth || (raw.configured ? 'configured' : 'not_configured'),
          cli: raw.cli || raw.version || null,
          checkedAt: raw.checkedAt || now.toISOString(),
          details: raw.details || null,
        }),
      ];
    }),
  );
}

export function collectDiagnostics(options = {}) {
  const now = options.now || new Date();
  const env = options.env || process.env;
  const versions = options.versions || process.versions;
  const memoryUsage = options.memoryUsage || process.memoryUsage;
  const uptime = options.uptime ?? process.uptime();
  const activeRuns = Array.isArray(options.activeRuns) ? options.activeRuns : [];
  const recentErrors = Array.isArray(options.recentErrors) ? options.recentErrors : [];
  const providerHealth = normalizeProviderHealth(options.providerHealth, env, now);
  const cache = options.cache && typeof options.cache === 'object' ? options.cache : {};

  const diagnostics = {
    status: 'ok',
    timestamp: now.toISOString(),
    version: options.serverVersion || '0.0.0',
    installMode: options.installMode || 'unknown',
    runtime: {
      node: versions.node,
      v8: versions.v8,
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
      uptimeSeconds: Math.round(uptime),
    },
    memory: normalizeMemory(memoryUsage()),
    websocket: {
      clients: resolveWebSocketClientCount(options),
    },
    environment: redactEnv(env),
    credentials: providerCredentialState(env),
    notifications: {
      telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
      webPushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    },
    providerHealth,
    activeRuns: activeRuns.map((run) => redactDiagnostics(run)),
    recentErrors: recentErrors.map((error) => redactDiagnostics({
      ...error,
      message: redactText(error?.message),
      stack: error?.stack ? redactText(error.stack) : undefined,
    })),
    cache: redactDiagnostics({
      providerHealthUpdatedAt: cache.providerHealthUpdatedAt || null,
      diagnosticsUpdatedAt: now.toISOString(),
    }),
    manualRefresh: {
      available: true,
      endpoint: '/api/diagnostics/refresh',
    },
    bundle: {
      copyable: true,
      endpoint: '/api/diagnostics/bundle',
      includes: ['runtime', 'websocket', 'notifications', 'providerHealth', 'activeRuns', 'recentErrors'],
    },
  };

  return redactDiagnostics(diagnostics);
}

export function redactDiagnostics(input) {
  if (Array.isArray(input)) {
    return input.map(item => redactDiagnostics(item));
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : redactDiagnostics(value),
    ])
  );
}
