import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const inflight = new Map();
const execFileAsync = promisify(execFile);

const providerConfigs = {
  claude: {
    command: () => process.env.CLAUDE_CLI_PATH || 'claude',
    args: ['--version'],
    packageName: '@anthropic-ai/claude-code',
  },
  cursor: {
    command: () => process.env.CURSOR_CLI_PATH || 'cursor-agent',
    args: ['--version'],
    packageName: null,
  },
  codex: {
    command: () => process.env.CODEX_CLI_PATH || 'codex',
    args: ['--version'],
    packageName: '@openai/codex',
  },
  gemini: {
    command: () => process.env.GEMINI_CLI_PATH || 'gemini',
    args: ['--version'],
    packageName: '@google/gemini-cli',
  },
  qwen: {
    command: () => process.env.QWEN_CLI_PATH || 'qwen',
    args: ['--version'],
    packageName: '@qwen-code/qwen-code',
  },
  opencode: {
    command: () => process.env.OPENCODE_CLI_PATH || 'opencode',
    args: ['--version'],
    packageName: 'opencode-ai',
  },
  grok: {
    command: () => process.env.PIXCODE_GROK_BIN || process.env.GROK_BIN || 'grok',
    args: ['--version'],
    packageName: null,
  },
};

function normalizeVersion(value) {
  const match = String(value || '').match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0] || null;
}

function compareVersions(left, right) {
  const a = String(left || '0.0.0').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(Number);
  const b = String(right || '0.0.0').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = Number.isFinite(a[index]) ? a[index] : 0;
    const bv = Number.isFinite(b[index]) ? b[index] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function readInstalledVersion(config) {
  try {
    const result = await execFileAsync(config.command(), config.args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    return normalizeVersion(`${result.stdout || ''}\n${result.stderr || ''}`);
  } catch {
    return null;
  }
}

async function readLatestVersion(packageName) {
  if (!packageName) return null;
  let result;
  try {
    result = await execFileAsync('npm', ['view', packageName, 'version', '--json'], {
      encoding: 'utf8',
      timeout: 7000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return normalizeVersion(parsed);
  } catch {
    return normalizeVersion(result.stdout);
  }
}

function getSkipReason(config, installedVersion, latestVersion) {
  if (!config.packageName) return 'external_installer';
  if (!installedVersion) return 'installed_version_unavailable';
  if (!latestVersion) return 'latest_version_unavailable';
  return null;
}

async function resolveProviderCliVersionStatus(provider, config, now) {
  const installedVersion = await readInstalledVersion(config);
  const latestVersion = await readLatestVersion(config.packageName);
  const updateAvailable = Boolean(
    installedVersion
    && latestVersion
    && compareVersions(latestVersion, installedVersion) > 0,
  );

  const payload = {
    checkedAt: new Date(now).toISOString(),
    installedVersion,
    latestVersion,
    updateAvailable,
    versionCheckSkipped: getSkipReason(config, installedVersion, latestVersion),
  };
  cache.set(provider, { checkedAtMs: now, payload });
  return payload;
}

export async function getProviderCliVersionStatus(provider, { installed = true, forceRefresh = false } = {}) {
  const config = providerConfigs[provider];
  if (!config || !installed) {
    return {
      checkedAt: new Date().toISOString(),
      installedVersion: null,
      latestVersion: null,
      updateAvailable: false,
      versionCheckSkipped: !config ? 'unsupported_provider' : 'not_installed',
    };
  }

  const now = Date.now();
  const cached = cache.get(provider);
  if (!forceRefresh && cached && now - cached.checkedAtMs < ONE_DAY_MS) {
    return { ...cached.payload, fromCache: true };
  }

  const inflightKey = provider;
  if (!forceRefresh && inflight.has(inflightKey)) {
    return inflight.get(inflightKey);
  }

  const promise = resolveProviderCliVersionStatus(provider, config, now).finally(() => {
    inflight.delete(inflightKey);
  });
  inflight.set(inflightKey, promise);
  return promise;
}
