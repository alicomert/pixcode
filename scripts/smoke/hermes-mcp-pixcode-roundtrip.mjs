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
const providerInputWrites = [];
const gatewayRequests = [];

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

  if (req.method === 'GET' && url.pathname === '/api/public/manifest') {
    res.end(JSON.stringify({
      name: 'Pixcode Public API',
      groups: [
        { id: 'projects', basePath: '/api/projects', scopes: ['projects:read', 'projects:write'] },
        { id: 'providers', basePath: '/api/providers', scopes: ['providers:read', 'providers:write'] },
      ],
    }));
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

  if (req.method === 'GET' && url.pathname === '/api/orchestration/hermes/diagnostics') {
    res.end(JSON.stringify({
      ok: true,
      model: { provider: 'openai-codex', default: 'gpt-5.5' },
      config: {
        active: {
          toolsets: ['hermes-cli', 'mcp-pixcode'],
          pixcodeMcp: { toolCount: 12, missingTools: [] },
        },
      },
      cron: { toolsetAvailable: true, gatewayJobsApi: { ok: true, status: 200 } },
      issues: [],
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/orchestration/hermes/control-plane') {
    res.end(JSON.stringify({
      ok: true,
      homes: {
        source: '/root/.hermes',
        managed: '/root/.hermes/profiles/pixcode',
      },
      activeProfile: 'default',
      profiles: [
        {
          name: 'default',
          isActive: true,
          sessions: { total: 3, exists: true },
          cron: { total: 1, active: 1, exists: true },
          tools: { pixcodeMcpReady: true, pixcodeMcpToolCount: 14, missingPixcodeMcpTools: [] },
        },
      ],
      capabilities: [
        { id: 'rest-gateway', label: 'Hermes REST gateway', ready: true },
        { id: 'pixcode-mcp', label: 'Pixcode MCP tools', ready: true },
      ],
      recommendations: [],
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/control-plane/repair') {
    const body = await readJson(req);
    res.end(JSON.stringify({
      ok: true,
      gateway: { running: true, projectPath: body.projectPath || '/root/pixcode' },
      controlPlane: {
        ok: true,
        profiles: [
          {
            name: 'pixcode',
            tools: { pixcodeMcpReady: true, pixcodeMcpToolCount: 14, missingPixcodeMcpTools: [] },
          },
        ],
      },
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/orchestration/hermes/gateway/request') {
    const body = await readJson(req);
    gatewayRequests.push(body);
    res.end(JSON.stringify({
      ok: true,
      endpoint: body.endpoint,
      body: {
        jobs: [
          { job_id: 'job_1', name: 'Morning repo check', schedule: '0 9 * * *' },
        ],
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
        output: 'OpenAI Codex\n› /init\n\n• Ran npm test\n\n› Implement {feature}\n',
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

  if (req.method === 'POST' && url.pathname === '/api/shell/sessions/provider-input') {
    const body = await readJson(req);
    providerInputWrites.push(body);
    res.end(JSON.stringify({ ok: true, wrote: true, provider: body.provider, launchId: body.launchId }));
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
    }, 10000);
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
    PIXCODE_MCP_READBACK_IDLE_STABLE_MS: '500',
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
  assert(toolNames.includes('pixcode_get_hermes_diagnostics'), 'Hermes diagnostics tool missing');
  assert(toolNames.includes('pixcode_get_hermes_control_plane'), 'Hermes control-plane snapshot tool missing');
  assert(toolNames.includes('pixcode_repair_hermes_control_plane'), 'Hermes control-plane repair tool missing');
  assert(toolNames.includes('pixcode_get_api_manifest'), 'Pixcode API manifest tool missing');
  assert(toolNames.includes('pixcode_api_request'), 'Pixcode generic API request tool missing');
  assert(toolNames.includes('pixcode_hermes_gateway_request'), 'Hermes gateway request proxy tool missing');
  assert(toolNames.includes('pixcode_manage_hermes_cron'), 'Hermes cron management tool missing');
  assert(toolNames.includes('pixcode_send_cli_input'), 'Provider terminal input tool missing');

  const projects = await callMcp(child, 'tools/call', { name: 'pixcode_list_projects', arguments: {} });
  assert.match(projects.content[0].text, /224/, 'projects response should include file count');

  const status = await callMcp(child, 'tools/call', { name: 'pixcode_get_hermes_gateway_status', arguments: {} });
  assert.match(status.content[0].text, /127\.0\.0\.1:8642/, 'gateway status should return REST base URL');

  const probe = await callMcp(child, 'tools/call', {
    name: 'pixcode_probe_hermes_gateway',
    arguments: { projectPath: '/root/pixcode' },
  });
  assert.match(probe.content[0].text, /"ok": true/, 'gateway probe should return ok');

  const diagnostics = await callMcp(child, 'tools/call', {
    name: 'pixcode_get_hermes_diagnostics',
    arguments: { projectPath: '/root/pixcode' },
  });
  assert.match(diagnostics.content[0].text, /mcp-pixcode/, 'Hermes diagnostics should expose active toolsets.');
  assert.match(diagnostics.content[0].text, /"toolsetAvailable": true/, 'Hermes diagnostics should expose cron toolset availability.');

  const controlPlane = await callMcp(child, 'tools/call', {
    name: 'pixcode_get_hermes_control_plane',
    arguments: { projectPath: '/root/pixcode' },
  });
  assert.match(controlPlane.content[0].text, /Hermes REST gateway/, 'Hermes control-plane tool should expose capability state.');
  assert.match(controlPlane.content[0].text, /"pixcodeMcpReady": true/, 'Hermes control-plane tool should expose MCP readiness.');

  const repairedControlPlane = await callMcp(child, 'tools/call', {
    name: 'pixcode_repair_hermes_control_plane',
    arguments: { projectPath: '/root/pixcode', forceRestart: true },
  });
  assert.match(repairedControlPlane.content[0].text, /"ok": true/, 'Hermes control-plane repair tool should return repaired state.');

  const manifest = await callMcp(child, 'tools/call', { name: 'pixcode_get_api_manifest', arguments: {} });
  assert.match(manifest.content[0].text, /Pixcode Public API/, 'API manifest tool should expose Pixcode API docs to Hermes.');

  const apiRequest = await callMcp(child, 'tools/call', {
    name: 'pixcode_api_request',
    arguments: { method: 'GET', path: '/api/projects' },
  });
  assert.match(apiRequest.content[0].text, /"name": "pixcode"/, 'generic Pixcode API tool should call allowlisted local API paths.');

  const cronJobs = await callMcp(child, 'tools/call', {
    name: 'pixcode_hermes_gateway_request',
    arguments: { method: 'GET', endpoint: '/api/jobs', projectPath: '/root/pixcode' },
  });
  assert.match(cronJobs.content[0].text, /Morning repo check/, 'Hermes gateway request tool should expose API-server jobs/cron endpoints.');
  assert.equal(gatewayRequests[0].endpoint, '/api/jobs', 'Gateway request should keep the requested Hermes endpoint.');

  const cronList = await callMcp(child, 'tools/call', {
    name: 'pixcode_manage_hermes_cron',
    arguments: { action: 'list', projectPath: '/root/pixcode' },
  });
  assert.match(cronList.content[0].text, /Morning repo check/, 'Hermes cron helper should list managed Hermes jobs.');

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
      waitForOutputMs: 7000,
    },
  });
  assert(
    providerOutputReads.length >= 5,
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

  const inputWrite = await callMcp(child, 'tools/call', {
    name: 'pixcode_send_cli_input',
    arguments: { provider: 'codex', projectPath: '/root/pixcode', input: 'selam', submit: true, launchId: 2 },
  });
  assert.match(inputWrite.content[0].text, /"wrote": true/, 'MCP should be able to submit input to an existing visible provider terminal.');
  assert.equal(providerInputWrites[0].input, 'selam', 'Provider input body should preserve exact user input.');
  assert.equal(providerInputWrites[0].submit, true, 'Provider input should submit by default when requested.');

  assert(seen.every((entry) => entry.auth === `Bearer ${apiKey}`), 'all MCP calls should use the Pixcode bearer key');
  console.log('hermes MCP Pixcode roundtrip smoke passed');
} finally {
  child.kill();
  await new Promise((resolve) => server.close(resolve));
}
