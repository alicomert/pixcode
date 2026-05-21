import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiKey = 'px_smoke_key';
const seen = [];
const providerMcpUpserts = [];
const terminalLaunches = [];
const providerOutputReads = [];

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  seen.push({
    method: req.method,
    path: url.pathname,
    auth: req.headers.authorization,
  });
  res.setHeader('content-type', 'application/json');

  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'bad auth' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    res.end(JSON.stringify([
      { name: 'pixcode', displayName: 'Pixcode', fullPath: '/root/pixcode', fileCount: 224 },
    ]));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/providers/codex/auth/status') {
    res.end(JSON.stringify({ data: { provider: 'codex', installed: true, authenticated: true } }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/providers/qwen/auth/status') {
    res.end(JSON.stringify({ data: { provider: 'qwen', installed: false, authenticated: false, error: 'Qwen Code CLI is not installed' } }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/providers/codex/mcp/servers') {
    const body = await readJson(req);
    providerMcpUpserts.push(body);
    res.statusCode = 201;
    res.end(JSON.stringify({ data: { server: { provider: 'codex', name: body.name, scope: body.scope, transport: body.transport } } }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/orchestration/hermes/gateway/status') {
    res.end(JSON.stringify({ running: true, baseUrl: 'http://127.0.0.1:8642', projectPath: '/root/pixcode' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/gateway/probe') {
    const body = await readJson(req);
    res.end(JSON.stringify({
      ok: true,
      projectPath: body.projectPath || '/root/pixcode',
      checks: {
        health: { ok: true, status: 200 },
        capabilities: { ok: true, status: 200 },
        models: { ok: true, status: 200 },
      },
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/terminal-launches') {
    const body = await readJson(req);
    terminalLaunches.push(body);
    res.statusCode = 201;
    res.end(JSON.stringify({
      event: {
        id: terminalLaunches.length,
        provider: body.provider,
        projectPath: body.projectPath,
        prompt: body.prompt,
        source: 'hermes-mcp',
      },
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/shell/sessions/provider-output') {
    providerOutputReads.push({
      provider: url.searchParams.get('provider'),
      projectPath: url.searchParams.get('projectPath'),
      launchId: url.searchParams.get('launchId'),
    });
    const outputs = [
      {
        active: true,
        provider: 'codex',
        projectPath: '/root/pixcode',
        terminalState: 'busy',
        output: 'OpenAI Codex\n› /init\n\n• Working (10s • esc to interrupt)\n',
      },
      {
        active: true,
        provider: 'codex',
        projectPath: '/root/pixcode',
        terminalState: 'busy',
        output: 'OpenAI Codex\n› /init\n\n• Ran npm test\n• Working (30s • esc to interrupt)\n',
      },
      {
        active: true,
        provider: 'codex',
        projectPath: '/root/pixcode',
        terminalState: 'idle',
        output: 'Baseline check passed: npm test reports 195 passing, 0 failing.\n\n› Use /skills to list available skills\n',
      },
    ];
    res.end(JSON.stringify(outputs[Math.min(providerOutputReads.length - 1, outputs.length - 1)]));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: url.pathname }));
});

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function callMcp(child, method, params = undefined) {
  const id = callMcp.nextId;
  callMcp.nextId += 1;
  const payload = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`MCP call timed out: ${method}`));
    }, 5000);
    const onLine = (line) => {
      if (!line.trim()) return;
      const message = JSON.parse(line);
      if (message.id !== id) return;
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve(message.result);
    };
    const onData = (chunk) => {
      callMcp.buffer += chunk.toString();
      let index;
      while ((index = callMcp.buffer.indexOf('\n')) !== -1) {
        const line = callMcp.buffer.slice(0, index);
        callMcp.buffer = callMcp.buffer.slice(index + 1);
        onLine(line);
      }
    };
    child.stdout.on('data', onData);
  });
}
callMcp.nextId = 1;
callMcp.buffer = '';

const baseUrl = await listen();
const child = spawn(process.execPath, [path.join(repoRoot, 'scripts/hermes/pixcode-mcp-server.mjs')], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PIXCODE_BASE_URL: baseUrl,
    PIXCODE_API_KEY: apiKey,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

try {
  await callMcp(child, 'initialize', { protocolVersion: '2024-11-05' });
  const tools = await callMcp(child, 'tools/list');
  const toolNames = tools.tools.map((tool) => tool.name);
  assert(toolNames.includes('pixcode_list_projects'), 'list projects tool missing');
  assert(toolNames.includes('pixcode_get_provider_status'), 'provider status tool missing');
  assert(toolNames.includes('pixcode_get_hermes_gateway_status'), 'Hermes gateway status tool missing');
  assert(toolNames.includes('pixcode_probe_hermes_gateway'), 'Hermes gateway probe tool missing');

  const projects = await callMcp(child, 'tools/call', { name: 'pixcode_list_projects', arguments: {} });
  assert.match(projects.content[0].text, /224/, 'projects response should include file count');

  const status = await callMcp(child, 'tools/call', { name: 'pixcode_get_hermes_gateway_status', arguments: {} });
  assert.match(status.content[0].text, /127\.0\.0\.1:8642/, 'gateway status should return REST base URL');

  const probe = await callMcp(child, 'tools/call', {
    name: 'pixcode_probe_hermes_gateway',
    arguments: { projectPath: '/root/pixcode' },
  });
  assert.match(probe.content[0].text, /"ok": true/, 'gateway probe should return ok');

  const launch = await callMcp(child, 'tools/call', {
    name: 'pixcode_open_cli_terminal',
    arguments: { provider: 'codex', projectPath: '/root/pixcode', prompt: 'smoke' },
  });
  assert.match(launch.content[0].text, /hermes-mcp/, 'terminal launch should roundtrip through Pixcode API');
  assert.match(launch.content[0].text, /"pixcodeMcpConfigured": true/, 'terminal launch should configure Pixcode MCP for the selected provider first');
  assert.equal(providerMcpUpserts.length, 1, 'Codex launch should upsert a project-scoped Pixcode MCP server');
  assert.equal(providerMcpUpserts[0].name, 'pixcode', 'Provider MCP server should be named pixcode');

  providerOutputReads.length = 0;
  const launchWithReadback = await callMcp(child, 'tools/call', {
    name: 'pixcode_open_cli_terminal',
    arguments: {
      provider: 'codex',
      projectPath: '/root/pixcode',
      prompt: 'read final output',
      startupInput: '/init',
      waitForOutputMs: 3000,
    },
  });
  assert(
    providerOutputReads.length >= 3,
    `readback should keep polling until the provider terminal is idle, reads=${providerOutputReads.length}`,
  );
  assert.match(
    launchWithReadback.content[0].text,
    /195 passing, 0 failing/,
    'readback should return the final Codex output instead of the first working frame',
  );
  assert(
    providerOutputReads.every((read) => read.launchId === '2'),
    `readback should be tied to the Hermes terminal launch id, reads=${JSON.stringify(providerOutputReads)}`,
  );

  const blockedLaunch = await callMcp(child, 'tools/call', {
    name: 'pixcode_open_cli_terminal',
    arguments: { provider: 'qwen', projectPath: '/root/pixcode', prompt: 'smoke' },
  });
  assert.match(blockedLaunch.content[0].text, /"launched": false/, 'uninstalled providers should not create terminal launches');
  assert.match(blockedLaunch.content[0].text, /"reason": "not_installed"/, 'uninstalled provider response should explain the block');
  assert.equal(terminalLaunches.length, 2, 'Only installed Codex provider launches should be created');

  assert(seen.every((entry) => entry.auth === `Bearer ${apiKey}`), 'all MCP calls should use the Pixcode bearer key');
  console.log('hermes MCP Pixcode roundtrip smoke passed');
} finally {
  child.kill();
  await new Promise((resolve) => server.close(resolve));
}
