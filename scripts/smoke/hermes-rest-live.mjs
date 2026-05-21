import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureHermesGateway,
  probeHermesGateway,
  stopHermesGateway,
} from '../../server/services/hermes-gateway.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectPath = path.resolve(process.argv[2] || repoRoot);
const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'pixcode-hermes-rest-live-'));

try {
  const gateway = await ensureHermesGateway({
    appRoot: repoRoot,
    projectPath,
    hermesHome,
    pixcodeBaseUrl: 'http://127.0.0.1:9',
    pixcodeApiKey: 'px_live_smoke_key',
    port: Number(process.env.PIXCODE_HERMES_LIVE_PORT || 18642),
  });
  if (!gateway.running || !gateway.probe?.ok) {
    throw new Error(`Hermes gateway did not start cleanly: ${JSON.stringify(gateway)}`);
  }

  const probe = await probeHermesGateway(projectPath);
  if (!probe.ok) {
    throw new Error(`Hermes REST probe failed: ${JSON.stringify(probe)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl: probe.baseUrl,
    projectPath: probe.projectPath,
    checks: Object.fromEntries(Object.entries(probe.checks).map(([name, check]) => [name, check.status])),
  }, null, 2));
} finally {
  stopHermesGateway(projectPath);
}
