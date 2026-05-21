import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureHermesGateway,
  stopHermesGateway,
} from '../../server/services/hermes-gateway.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceHermesHome = path.join(os.homedir(), '.hermes');
const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'pixcode-hermes-rest-codex-'));
const projectPath = path.resolve(process.argv[2] || repoRoot);
const apiKey = 'px_codex_launch_smoke_key';
const gatewayKey = 'pixcode-hermes-run-smoke';
const terminalLaunches = [];

async function copyIfExists(relativePath) {
  const source = path.join(sourceHermesHome, relativePath);
  if (!fsSync.existsSync(source)) return;
  const target = path.join(hermesHome, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
  }
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  res.setHeader('content-type', 'application/json');
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'bad auth' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    res.end(JSON.stringify([{ name: 'pixcode', displayName: 'Pixcode', fullPath: projectPath, fileCount: 1 }]));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/providers/codex/auth/status') {
    res.end(JSON.stringify({ data: { provider: 'codex', installed: true, authenticated: true } }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/orchestration/hermes/gateway/status') {
    res.end(JSON.stringify({ running: true, projectPath, baseUrl: 'http://127.0.0.1:18643' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/gateway/probe') {
    res.end(JSON.stringify({ ok: true, projectPath, checks: { health: { ok: true } } }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/terminal-launches') {
    const body = await readJson(req);
    const event = {
      id: terminalLaunches.length + 1,
      provider: body.provider,
      projectPath: body.projectPath,
      prompt: body.prompt,
      source: 'hermes-mcp',
      createdAt: new Date().toISOString(),
    };
    terminalLaunches.push(event);
    res.statusCode = 201;
    res.end(JSON.stringify({ event }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: url.pathname }));
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function gatewayFetch(baseUrl, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${gatewayKey}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function pollRun(baseUrl, runId) {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    // eslint-disable-next-line no-await-in-loop
    const { response, body } = await gatewayFetch(baseUrl, `/v1/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) {
      throw new Error(`GET run status failed: HTTP ${response.status} ${JSON.stringify(body)}`);
    }
    if (['completed', 'failed', 'cancelled'].includes(body.status)) {
      return body;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Hermes run did not finish within 120s: ${runId}`);
}

await Promise.all([
  copyIfExists('config.yaml'),
  copyIfExists('auth.json'),
  copyIfExists('.env'),
]);

const pixcodeBaseUrl = await listen();
try {
  const gateway = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    hermesHome,
    pixcodeBaseUrl,
    pixcodeApiKey: apiKey,
    apiServerKey: gatewayKey,
    port: Number(process.env.PIXCODE_HERMES_CODEX_PORT || 18643),
  });
  assert.equal(gateway.running, true, 'Hermes REST gateway should be running before /v1/runs');

  const codexPrompt = 'Pixcode Hermes REST smoke: create HERMES_CODEX_REST_SMOKE.txt with the text "Hermes launched Codex through Pixcode MCP".';
  const { response, body } = await gatewayFetch(gateway.baseUrl, '/v1/runs', {
    method: 'POST',
    body: JSON.stringify({
      session_id: `pixcode-codex-launch-${Date.now()}`,
      instructions: [
        'You are testing Pixcode integration.',
        'Use the MCP tool named mcp_pixcode_pixcode_open_cli_terminal exactly once.',
        'Call it with provider="codex", the supplied projectPath, and the supplied prompt.',
        'After the tool call, answer with "codex launch requested".',
      ].join(' '),
      input: `Call mcp_pixcode_pixcode_open_cli_terminal with provider codex, projectPath ${JSON.stringify(projectPath)}, and prompt ${JSON.stringify(codexPrompt)}.`,
    }),
  });
  if (!response.ok || !body?.run_id) {
    throw new Error(`POST /v1/runs failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  const status = await pollRun(gateway.baseUrl, body.run_id);
  if (status.status === 'failed') {
    throw new Error(`Hermes /v1/runs failed: ${status.error || JSON.stringify(status)}`);
  }

  const launch = terminalLaunches.find((event) => event.provider === 'codex' && event.prompt === codexPrompt);
  assert(launch, `Hermes run completed but did not request Codex launch. Launches: ${JSON.stringify(terminalLaunches)}`);
  console.log(JSON.stringify({
    ok: true,
    runId: body.run_id,
    status: status.status,
    codexLaunch: launch,
  }, null, 2));
} finally {
  stopHermesGateway(projectPath);
  await new Promise((resolve) => server.close(resolve));
}
