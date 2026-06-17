import path from 'path';
import http from 'http';
import fs from 'fs';
import os from 'os';

import mime from 'mime-types';
import express from 'express';

import {
  scanPlugins,
  getPluginsConfig,
  getPluginsDir,
  savePluginsConfig,
  getPluginDir,
  resolvePluginAssetPath,
  installPluginFromGit,
  updatePluginFromGit,
  uninstallPlugin,
} from '../utils/plugin-loader.js';
import {
  startPluginServer,
  stopPluginServer,
  getPluginPort,
  isPluginRunning,
} from '../utils/plugin-process-manager.js';

const router = express.Router();
const MARKETPLACE_SOURCES_PATH = path.join(os.homedir(), '.pixcode', 'marketplace-sources.json');
const MARKETPLACE_SEARCH_TIMEOUT_MS = 8000;
const ALL_CLI_COMPATIBILITY = ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'];

const CURATED_MARKETPLACE_ENTRIES = [
  {
    id: 'github:hesreallyhim/awesome-claude-code',
    name: 'Awesome Claude Code',
    type: 'skill-library',
    category: 'popular',
    sourceUrl: 'https://github.com/hesreallyhim/awesome-claude-code',
    repo: 'hesreallyhim/awesome-claude-code',
    description: 'Curated skills, slash commands, hooks, orchestration patterns, and agent resources.',
    stars: 46000,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['skills', 'agents', 'commands'],
  },
  {
    id: 'github:sickn33/antigravity-awesome-skills',
    name: 'Antigravity Awesome Skills',
    type: 'skill-library',
    category: 'popular',
    sourceUrl: 'https://github.com/sickn33/antigravity-awesome-skills',
    repo: 'sickn33/antigravity-awesome-skills',
    description: 'Large installable library of cross-CLI agent skills for Claude, Codex, Cursor, Gemini, and more.',
    stars: 40000,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['skills', 'multi-cli'],
  },
  {
    id: 'github:wshobson/agents',
    name: 'Agents',
    type: 'agent-pack',
    category: 'popular',
    sourceUrl: 'https://github.com/wshobson/agents',
    repo: 'wshobson/agents',
    description: 'Multi-harness agent pack and marketplace patterns for Claude Code, Codex CLI, Cursor, OpenCode, Copilot, and Gemini.',
    stars: 36000,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['agents', 'multi-cli'],
  },
  {
    id: 'github:alirezarezvani/claude-skills',
    name: 'Claude Skills',
    type: 'skill-library',
    category: 'popular',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills',
    repo: 'alirezarezvani/claude-skills',
    description: 'Broad skill, agent, and plugin collection for Claude Code, Codex, Gemini CLI, Cursor, and related tools.',
    stars: 18000,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['skills', 'plugins'],
  },
  {
    id: 'github:voltagent/awesome-agent-skills',
    name: 'Awesome Agent Skills',
    type: 'skill-library',
    category: 'skills',
    sourceUrl: 'https://github.com/VoltAgent/awesome-agent-skills',
    repo: 'VoltAgent/awesome-agent-skills',
    description: 'Cross-agent skill catalogue covering Claude, Codex, Cursor, Gemini, and OpenCode ecosystems.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['skills', 'catalog'],
  },
  {
    id: 'github:awesome-opencode/awesome-opencode',
    name: 'Awesome OpenCode',
    type: 'native-plugin',
    category: 'plugin',
    sourceUrl: 'https://github.com/awesome-opencode/awesome-opencode',
    repo: 'awesome-opencode/awesome-opencode',
    description: 'Curated OpenCode plugins, themes, agents, projects, and resources.',
    stars: 8000,
    forks: 0,
    updatedAt: null,
    compatibleCli: ['opencode'],
    installKind: 'source',
    tags: ['opencode', 'plugins'],
  },
  {
    id: 'github:jenslys/opencode-gemini-auth',
    name: 'OpenCode Gemini Auth',
    type: 'native-plugin',
    category: 'plugin',
    sourceUrl: 'https://github.com/jenslys/opencode-gemini-auth',
    repo: 'jenslys/opencode-gemini-auth',
    description: 'OpenCode authentication plugin for Gemini accounts.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ['opencode', 'gemini'],
    installKind: 'source',
    tags: ['opencode', 'auth'],
  },
  {
    id: 'github:supermemoryai/opencode-supermemory',
    name: 'OpenCode Supermemory',
    type: 'native-plugin',
    category: 'plugin',
    sourceUrl: 'https://github.com/supermemoryai/opencode-supermemory',
    repo: 'supermemoryai/opencode-supermemory',
    description: 'Supermemory integration plugin for OpenCode.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ['opencode'],
    installKind: 'source',
    tags: ['opencode', 'memory'],
  },
  {
    id: 'github:griffinmartin/opencode-claude-auth',
    name: 'OpenCode Claude Auth',
    type: 'native-plugin',
    category: 'plugin',
    sourceUrl: 'https://github.com/griffinmartin/opencode-claude-auth',
    repo: 'griffinmartin/opencode-claude-auth',
    description: 'OpenCode plugin that reuses Claude Code credentials.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ['opencode', 'claude'],
    installKind: 'source',
    tags: ['opencode', 'auth'],
  },
  {
    id: 'github:othmanadi/planning-with-files',
    name: 'Planning With Files',
    type: 'skill-library',
    category: 'workflow',
    sourceUrl: 'https://github.com/OthmanAdi/planning-with-files',
    repo: 'OthmanAdi/planning-with-files',
    description: 'Persistent file-based planning skill for multiple AI coding CLIs.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['planning', 'workflow'],
  },
  {
    id: 'github:safishamsi/graphify',
    name: 'Graphify',
    type: 'skill-library',
    category: 'workflow',
    sourceUrl: 'https://github.com/safishamsi/graphify',
    repo: 'safishamsi/graphify',
    description: 'Knowledge graph skill for Claude Code, Codex, OpenCode, Cursor, Gemini, and other coding agents.',
    stars: 0,
    forks: 0,
    updatedAt: null,
    compatibleCli: ALL_CLI_COMPATIBILITY,
    installKind: 'source',
    tags: ['knowledge-graph', 'memory'],
  },
];

function ensurePixcodeConfigDir() {
  const dir = path.dirname(MARKETPLACE_SOURCES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function readMarketplaceSources() {
  try {
    if (!fs.existsSync(MARKETPLACE_SOURCES_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(MARKETPLACE_SOURCES_PATH, 'utf-8'));
    return Array.isArray(parsed?.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

function writeMarketplaceSources(sources) {
  ensurePixcodeConfigDir();
  fs.writeFileSync(
    MARKETPLACE_SOURCES_PATH,
    JSON.stringify({ version: 1, sources }, null, 2),
    { mode: 0o600 },
  );
}

function parseGithubRepoFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
    const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/');
    if (!owner || !repo) return null;
    return `${owner}/${repo.replace(/\.git$/, '')}`;
  } catch {
    return null;
  }
}

function marketplaceIdForSource(sourceUrl, fallbackName = '') {
  const repo = parseGithubRepoFromUrl(sourceUrl);
  if (repo) return `github:${repo.toLowerCase()}`;
  return `source:${String(fallbackName || sourceUrl).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}`;
}

function inferCliCompatibility(text) {
  const haystack = String(text || '').toLowerCase();
  const matches = ALL_CLI_COMPATIBILITY.filter((cli) => haystack.includes(cli));
  if (haystack.includes('claude code') && !matches.includes('claude')) matches.push('claude');
  if (haystack.includes('open code') && !matches.includes('opencode')) matches.push('opencode');
  return matches.length > 0 ? [...new Set(matches)] : ALL_CLI_COMPATIBILITY;
}

function inferMarketplaceType(text) {
  const haystack = String(text || '').toLowerCase();
  if (haystack.includes('agent')) return 'agent-pack';
  if (haystack.includes('plugin') || haystack.includes('opencode')) return 'native-plugin';
  return 'skill-library';
}

function normalizeMarketplaceSource(input) {
  const sourceUrl = typeof input?.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (!sourceUrl.startsWith('https://github.com/')) {
    throw new Error('Only public GitHub HTTPS sources are supported for global market sources.');
  }

  const repo = parseGithubRepoFromUrl(sourceUrl);
  const name = String(input?.name || repo || 'GitHub source').trim().slice(0, 120);
  const description = String(input?.description || '').trim().slice(0, 500);
  const compatibleCli = Array.isArray(input?.compatibleCli)
    ? input.compatibleCli.filter((cli) => ALL_CLI_COMPATIBILITY.includes(cli))
    : inferCliCompatibility(`${name} ${description} ${repo || ''}`);

  return {
    id: marketplaceIdForSource(sourceUrl, name),
    name,
    type: ['skill-library', 'agent-pack', 'native-plugin', 'pixcode-plugin'].includes(input?.type)
      ? input.type
      : inferMarketplaceType(`${name} ${description}`),
    category: typeof input?.category === 'string' ? input.category.slice(0, 40) : 'installed',
    sourceUrl,
    repo,
    description,
    stars: Number.isFinite(Number(input?.stars)) ? Number(input.stars) : 0,
    forks: Number.isFinite(Number(input?.forks)) ? Number(input.forks) : 0,
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : null,
    compatibleCli: compatibleCli.length > 0 ? compatibleCli : ALL_CLI_COMPATIBILITY,
    installKind: input?.installKind === 'pixcode-plugin' ? 'pixcode-plugin' : 'source',
    tags: Array.isArray(input?.tags) ? input.tags.filter((tag) => typeof tag === 'string').slice(0, 8) : [],
    addedAt: typeof input?.addedAt === 'string' ? input.addedAt : new Date().toISOString(),
  };
}

function githubRepoToMarketplaceEntry(repo, category = 'search') {
  const text = `${repo.full_name || ''} ${repo.description || ''} ${repo.topics?.join(' ') || ''}`;
  return {
    id: `github:${String(repo.full_name || repo.html_url || repo.id).toLowerCase()}`,
    name: repo.name || repo.full_name || 'GitHub repository',
    type: inferMarketplaceType(text),
    category,
    sourceUrl: repo.html_url,
    repo: repo.full_name || null,
    description: repo.description || '',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    updatedAt: repo.updated_at || null,
    compatibleCli: inferCliCompatibility(text),
    installKind: 'source',
    tags: Array.isArray(repo.topics) ? repo.topics.slice(0, 6) : [],
  };
}

// GET /marketplace — curated global skill/plugin market plus added sources.
router.get('/marketplace', (req, res) => {
  try {
    res.json({
      entries: CURATED_MARKETPLACE_ENTRIES,
      installedSources: readMarketplaceSources(),
      categories: ['popular', 'skills', 'plugin', 'workflow', 'new'],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read marketplace', details: err.message });
  }
});

// GET /marketplace/search?q=... — live GitHub repository discovery for skill/plugin sources.
router.get('/marketplace/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120);
  const sort = req.query.sort === 'new' ? 'updated' : 'stars';
  const baseQuery = q || 'agent skills plugin cli claude codex cursor gemini opencode';
  const searchQuery = `${baseQuery} in:name,description,readme`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKETPLACE_SEARCH_TIMEOUT_MS);

  try {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', '12');
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'pixcode-marketplace',
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: 'GitHub search failed',
        details: detail.slice(0, 500) || response.statusText,
      });
    }

    const body = await response.json();
    const entries = Array.isArray(body?.items)
      ? body.items.map((repo) => githubRepoToMarketplaceEntry(repo, sort === 'updated' ? 'new' : 'popular'))
      : [];
    res.json({ entries });
  } catch (err) {
    const status = err?.name === 'AbortError' ? 504 : 502;
    res.status(status).json({ error: 'GitHub search failed', details: err.message });
  } finally {
    clearTimeout(timeout);
  }
});

// POST /marketplace/sources — add a global cross-CLI skill/plugin source.
router.post('/marketplace/sources', (req, res) => {
  try {
    const source = normalizeMarketplaceSource(req.body?.entry || req.body || {});
    const sources = readMarketplaceSources();
    const existingIndex = sources.findIndex((item) => item.id === source.id || item.sourceUrl === source.sourceUrl);
    if (existingIndex >= 0) {
      sources[existingIndex] = { ...sources[existingIndex], ...source, addedAt: sources[existingIndex].addedAt || source.addedAt };
    } else {
      sources.unshift(source);
    }
    writeMarketplaceSources(sources.slice(0, 200));
    res.json({ success: true, source, installedSources: readMarketplaceSources() });
  } catch (err) {
    res.status(400).json({ error: 'Failed to add source', details: err.message });
  }
});

// DELETE /marketplace/sources/:id — remove a global source by id.
router.delete('/marketplace/sources/:id', (req, res) => {
  try {
    const id = String(req.params.id || '');
    const sources = readMarketplaceSources();
    const next = sources.filter((source) => source.id !== id);
    writeMarketplaceSources(next);
    res.json({ success: true, installedSources: next });
  } catch (err) {
    res.status(400).json({ error: 'Failed to remove source', details: err.message });
  }
});

// GET / — List all installed plugins (includes server running status)
router.get('/', (req, res) => {
  try {
    const plugins = scanPlugins().map(p => ({
      ...p,
      serverRunning: p.server ? isPluginRunning(p.name) : false,
    }));
    res.json({ plugins });
  } catch (err) {
    res.status(500).json({ error: 'Failed to scan plugins', details: err.message });
  }
});

// GET /:name/manifest — Get single plugin manifest
router.get('/:name/manifest', (req, res) => {
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(req.params.name)) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }
    const plugins = scanPlugins();
    const plugin = plugins.find(p => p.name === req.params.name);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    res.json(plugin);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read plugin manifest', details: err.message });
  }
});

// GET /:name/assets/* — Serve plugin static files.
//
// The pattern is written as a literal RegExp rather than an Express route
// string because path-to-regexp v8 (pulled in as a transitive dep by any
// Express 5 beta / Router v2) rejects the `*` unnamed wildcard with
// "Missing parameter name at index 15" and the app refuses to boot. A
// regex sidesteps path-to-regexp entirely and works on every version of
// Express / path-to-regexp we've tested. Capture groups land in
// req.params[0] / [1] — same wire as the old `:name` + `*` would give us.
router.get(/^\/([a-zA-Z0-9_-]+)\/assets\/(.*)$/, (req, res) => {
  const pluginName = req.params[0];
  if (!/^[a-zA-Z0-9_-]+$/.test(pluginName)) {
    return res.status(400).json({ error: 'Invalid plugin name' });
  }
  const assetPath = req.params[1];

  if (!assetPath) {
    return res.status(400).json({ error: 'No asset path specified' });
  }

  const resolvedPath = resolvePluginAssetPath(pluginName, assetPath);
  if (!resolvedPath) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return res.status(404).json({ error: 'Asset not found' });
    }
  } catch {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const contentType = mime.lookup(resolvedPath) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  // Prevent CDN/proxy caching of plugin assets so updates take effect immediately
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const stream = fs.createReadStream(resolvedPath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read asset' });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
});

// PUT /:name/enable — Toggle plugin enabled/disabled (starts/stops server if applicable)
router.put('/:name/enable', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }

    const plugins = scanPlugins();
    const plugin = plugins.find(p => p.name === req.params.name);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const config = getPluginsConfig();
    config[req.params.name] = { ...config[req.params.name], enabled };
    savePluginsConfig(config);

    // Start or stop the plugin server as needed
    if (plugin.server) {
      if (enabled && !isPluginRunning(plugin.name)) {
        const pluginDir = getPluginDir(plugin.name);
        if (pluginDir) {
          try {
            await startPluginServer(plugin.name, pluginDir, plugin.server);
          } catch (err) {
            console.error(`[Plugins] Failed to start server for "${plugin.name}":`, err.message);
          }
        }
      } else if (!enabled && isPluginRunning(plugin.name)) {
        await stopPluginServer(plugin.name);
      }
    }

    res.json({ success: true, name: req.params.name, enabled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update plugin', details: err.message });
  }
});

// POST /install — Install plugin from git URL
router.post('/install', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: '"url" is required and must be a string' });
    }

    // Basic URL validation
    if (!url.startsWith('https://') && !url.startsWith('git@')) {
      return res.status(400).json({ error: 'URL must start with https:// or git@' });
    }

    const manifest = await installPluginFromGit(url);

    // Auto-start the server if the plugin has one (enabled by default)
    if (manifest.server) {
      const pluginDir = getPluginDir(manifest.name);
      if (pluginDir) {
        try {
          await startPluginServer(manifest.name, pluginDir, manifest.server);
        } catch (err) {
          console.error(`[Plugins] Failed to start server for "${manifest.name}":`, err.message);
        }
      }
    }

    res.json({ success: true, plugin: manifest });
  } catch (err) {
    res.status(400).json({ error: 'Failed to install plugin', details: err.message });
  }
});

// POST /:name/update — Pull latest from git (restarts server if running)
router.post('/:name/update', async (req, res) => {
  try {
    const pluginName = req.params.name;

    if (!/^[a-zA-Z0-9_-]+$/.test(pluginName)) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }

    const wasRunning = isPluginRunning(pluginName);
    if (wasRunning) {
      await stopPluginServer(pluginName);
    }

    const manifest = await updatePluginFromGit(pluginName);

    // Restart server if it was running before the update
    if (wasRunning && manifest.server) {
      const pluginDir = getPluginDir(pluginName);
      if (pluginDir) {
        try {
          await startPluginServer(pluginName, pluginDir, manifest.server);
        } catch (err) {
          console.error(`[Plugins] Failed to restart server for "${pluginName}":`, err.message);
        }
      }
    }

    res.json({ success: true, plugin: manifest });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update plugin', details: err.message });
  }
});

// ALL /:name/rpc/* — Proxy requests to plugin's server subprocess.
// Same path-to-regexp v8 avoidance trick as /:name/assets/* above — we
// use a RegExp directly so the router can't invoke path-to-regexp on
// the unnamed wildcard.
router.all(/^\/([a-zA-Z0-9_-]+)\/rpc\/(.*)$/, async (req, res) => {
  const pluginName = req.params[0];
  const rpcPath = req.params[1] || '';

  if (!/^[a-zA-Z0-9_-]+$/.test(pluginName)) {
    return res.status(400).json({ error: 'Invalid plugin name' });
  }

  let port = getPluginPort(pluginName);
  if (!port) {
    // Lazily start the plugin server if it exists and is enabled
    const plugins = scanPlugins();
    const plugin = plugins.find(p => p.name === pluginName);
    if (!plugin || !plugin.server) {
      return res.status(503).json({ error: 'Plugin server is not running' });
    }
    if (!plugin.enabled) {
      return res.status(503).json({ error: 'Plugin is disabled' });
    }
    const pluginDir = path.join(getPluginsDir(), plugin.dirName);
    try {
      port = await startPluginServer(pluginName, pluginDir, plugin.server);
    } catch (err) {
      return res.status(503).json({ error: 'Plugin server failed to start', details: err.message });
    }
  }

  // Inject configured secrets as headers
  const config = getPluginsConfig();
  const pluginConfig = config[pluginName] || {};
  const secrets = pluginConfig.secrets || {};

  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
  };

  // Add per-plugin user-configured secrets as X-Plugin-Secret-* headers
  for (const [key, value] of Object.entries(secrets)) {
    headers[`x-plugin-secret-${key.toLowerCase()}`] = String(value);
  }

  // Reconstruct query string
  const qs = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';

  const options = {
    hostname: '127.0.0.1',
    port,
    path: `/${rpcPath}${qs}`,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Plugin server error', details: err.message });
    } else {
      res.end();
    }
  });

  // Forward body (already parsed by express JSON middleware, so re-stringify).
  // Check content-length to detect whether a body was actually sent, since
  // req.body can be falsy for valid payloads like 0, false, null, or {}.
  const hasBody = req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0;
  if (hasBody && req.body !== undefined) {
    const bodyStr = JSON.stringify(req.body);
    proxyReq.setHeader('content-length', Buffer.byteLength(bodyStr));
    proxyReq.write(bodyStr);
  }

  proxyReq.end();
});

// DELETE /:name — Uninstall plugin (stops server first)
router.delete('/:name', async (req, res) => {
  try {
    const pluginName = req.params.name;

    // Validate name format to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginName)) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }

    // Stop server and wait for the process to fully exit before deleting files
    if (isPluginRunning(pluginName)) {
      await stopPluginServer(pluginName);
    }

    await uninstallPlugin(pluginName);
    res.json({ success: true, name: pluginName });
  } catch (err) {
    res.status(400).json({ error: 'Failed to uninstall plugin', details: err.message });
  }
});

export default router;
