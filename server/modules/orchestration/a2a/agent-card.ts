// server/modules/orchestration/a2a/agent-card.ts
// Pixcode advertises itself as one A2A agent at /a2a/.well-known/agent-card.json.
// Per-CLI adapters publish their own cards under /a2a/agents/:id/agent-card.

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

const VERSION: string =
  // __PIXCODE_UI_VERSION__ is defined by Vite for the frontend bundle, but
  // the backend reads the package.json directly via load-env. We accept
  // either origin so this file works during dev and after build.
  ((globalThis as any).__PIXCODE_UI_VERSION__ as string | undefined) ?? '0.0.0-dev';

export function buildPixcodeAgentCard(baseUrl: string): AgentCard {
  const skills = adapterRegistry
    .agentCards()
    .flatMap((card) => card.skills)
    .filter((skill, idx, arr) => arr.findIndex((s) => s.id === skill.id) === idx);

  return {
    name: 'pixcode',
    description:
      'Pixcode multi-CLI orchestration platform. Routes A2A tasks to ' +
      'Claude Code, Codex, Cursor, Gemini, Qwen, or OpenCode adapters.',
    url: `${baseUrl.replace(/\/$/, '')}/a2a`,
    version: VERSION,
    capabilities: ['streaming', 'pushNotifications', 'taskRouting'],
    skills,
    authentication: { type: 'bearer' },
  };
}
