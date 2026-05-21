import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureHermesGateway,
  runHermesGatewayPrompt,
  stopHermesGateway,
} from '../../server/services/hermes-gateway.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixcode-hermes-chat-api-'));
const fakeHermes = path.join(tempRoot, 'hermes');
const projectPath = path.join(tempRoot, 'project');
const hermesHome = path.join(tempRoot, 'home');

await fs.mkdir(projectPath, { recursive: true });
await fs.writeFile(fakeHermes, `#!/usr/bin/env node
import http from 'node:http';

if (process.argv.includes('--version')) {
  console.log('Hermes Agent v0.0.0 smoke');
  process.exit(0);
}

if (!process.argv.includes('gateway')) {
  console.error('expected gateway');
  process.exit(2);
}

const host = process.env.API_SERVER_HOST || '127.0.0.1';
const port = Number(process.env.API_SERVER_PORT || 8642);
const key = process.env.API_SERVER_KEY || '';
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
    res.end(JSON.stringify({ capabilities: ['chat'] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'hermes-agent' }] }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    const parsed = body ? JSON.parse(body) : {};
    res.end(JSON.stringify({
      id: 'chatcmpl-smoke',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: \`pixcode-hermes-chat-ok via \${parsed.model}\`,
        },
        finish_reason: 'stop',
      }],
    }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: url.pathname }));
});
server.listen(port, host);
`, { mode: 0o755 });

process.env.HERMES_CLI_PATH = fakeHermes;

try {
  const gateway = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    hermesHome,
    pixcodeBaseUrl: 'http://127.0.0.1:9',
    pixcodeApiKey: 'px_chat_api_smoke_key',
    port: 18752,
  });
  if (!gateway.running || !gateway.probe?.ok) {
    throw new Error(`Fake Hermes gateway did not start cleanly: ${JSON.stringify(gateway)}`);
  }

  const run = await runHermesGatewayPrompt(projectPath, {
    input: 'selam',
    timeoutMs: 10000,
  });
  if (!run.ok || run.transport !== 'chat.completions' || !String(run.message || '').includes('pixcode-hermes-chat-ok')) {
    throw new Error(`Hermes REST chat did not use chat completions: ${JSON.stringify(run)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    transport: run.transport,
    message: run.message,
  }, null, 2));
} finally {
  stopHermesGateway(projectPath);
  delete process.env.HERMES_CLI_PATH;
}
