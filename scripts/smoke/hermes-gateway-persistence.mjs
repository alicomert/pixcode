import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureHermesGateway,
  stopHermesGateway,
} from '../../server/services/hermes-gateway.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixcode-hermes-persist-'));
const fakeHermes = path.join(tempRoot, 'hermes');
const projectPath = path.join(tempRoot, 'project');
const hermesHome = path.join(tempRoot, 'home');
const startCountFile = path.join(tempRoot, 'starts.txt');
const failProbeFile = path.join(tempRoot, 'fail-probe');

await fs.mkdir(projectPath, { recursive: true });
await fs.writeFile(fakeHermes, `#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';

if (process.argv.includes('--version')) {
  console.log('Hermes Agent v0.0.0 smoke');
  process.exit(0);
}

fs.appendFileSync(${JSON.stringify(startCountFile)}, '1\\n');

const host = process.env.API_SERVER_HOST || '127.0.0.1';
const port = Number(process.env.API_SERVER_PORT || 8642);
const key = process.env.API_SERVER_KEY || '';
const failProbeFile = ${JSON.stringify(failProbeFile)};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  res.setHeader('content-type', 'application/json');
  if (url.pathname !== '/health' && req.headers.authorization !== \`Bearer \${key}\`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'bad auth' }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/capabilities') {
    if (fs.existsSync(failProbeFile)) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'temporary probe failure' }));
      return;
    }
    res.end(JSON.stringify({ capabilities: ['chat'] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'hermes-agent' }] }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: url.pathname }));
});

server.listen(port, host);
`, { mode: 0o755 });

process.env.HERMES_CLI_PATH = fakeHermes;

try {
  const first = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    hermesHome,
    pixcodeBaseUrl: 'http://127.0.0.1:9',
    pixcodeApiKey: 'px_persist_smoke_key',
    port: 18772,
    allowSmokeHermes: true,
    repairLaunchers: false,
  });
  assert.equal(first.running, true, 'first gateway should start');

  await fs.writeFile(failProbeFile, '1');
  const second = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    hermesHome,
    pixcodeBaseUrl: 'http://127.0.0.1:9',
    pixcodeApiKey: 'px_persist_smoke_key',
    port: 18772,
    allowSmokeHermes: true,
    repairLaunchers: false,
  });

  const starts = (await fs.readFile(startCountFile, 'utf8')).trim().split('\\n').filter(Boolean).length;
  assert.equal(starts, 1, 'existing Hermes gateway must not be killed and relaunched for a transient probe failure');
  assert.equal(second.baseUrl, first.baseUrl, 'existing Hermes gateway base URL should be reused');
  assert.equal(second.running, true, 'existing Hermes gateway should still be reported as running');
  console.log('hermes gateway persistence smoke passed');
} finally {
  stopHermesGateway(projectPath);
  delete process.env.HERMES_CLI_PATH;
}
