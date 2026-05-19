// server/modules/orchestration/a2a/agent-card.ts
// Pixcode advertises Hermes as one local control agent at /hermes/.well-known/agent-card.json.
// Per-CLI adapters publish their own cards under /hermes/agents/:id/agent-card.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

// Resolve <repo-root>/package.json from this file's location.
// Source layout:    server/modules/orchestration/a2a/agent-card.ts        (4 levels deep from repo root)
// Built layout:     dist-server/server/modules/orchestration/a2a/agent-card.js  (5 levels deep)
// Walk up until a package.json containing "name":"@pixelbyte-software/pixcode" is found.
function readPixcodeVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const candidate = resolve(dir, 'package.json');
      const raw = readFileSync(candidate, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === '@pixelbyte-software/pixcode' && typeof pkg.version === 'string') {
        return pkg.version;
      }
    } catch {
      // not here, walk up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0-dev';
}

const VERSION: string = readPixcodeVersion();

export function buildPixcodeAgentCard(baseUrl: string): AgentCard {
  const skills = adapterRegistry
    .agentCards()
    .flatMap((card) => card.skills)
    .filter((skill, idx, arr) => arr.findIndex((s) => s.id === skill.id) === idx);

  return {
    name: 'pixcode',
    description:
      'Pixcode Hermes multi-CLI orchestration platform. Routes Hermes tasks to ' +
      'Claude Code, Codex, Cursor, Gemini, Qwen, or OpenCode adapters.',
    url: `${baseUrl.replace(/\/$/, '')}/hermes`,
    version: VERSION,
    capabilities: ['streaming', 'taskRouting'],
    skills,
    authentication: { type: 'bearer' },
  };
}
