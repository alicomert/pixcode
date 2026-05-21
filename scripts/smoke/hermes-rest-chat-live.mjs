import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureHermesGateway,
  runHermesGatewayPrompt,
  stopHermesGateway,
} from '../../server/services/hermes-gateway.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectPath = path.resolve(process.argv[2] || repoRoot);

try {
  const gateway = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    pixcodeBaseUrl: 'http://127.0.0.1:9',
    pixcodeApiKey: 'px_live_chat_smoke_key',
    port: Number(process.env.PIXCODE_HERMES_LIVE_CHAT_PORT || 18652),
  });
  if (!gateway.running || !gateway.probe?.ok) {
    throw new Error(`Hermes gateway did not start cleanly: ${JSON.stringify(gateway)}`);
  }

  const run = await runHermesGatewayPrompt(projectPath, {
    input: 'Reply with exactly: pixcode-hermes-chat-ok',
    timeoutMs: 90000,
  });
  if (!run.ok || !String(run.message || '').includes('pixcode-hermes-chat-ok')) {
    throw new Error(`Hermes chat did not return the expected response: ${JSON.stringify(run)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    transport: run.transport,
    status: run.status,
    message: run.message,
  }, null, 2));
} finally {
  stopHermesGateway(projectPath);
}
