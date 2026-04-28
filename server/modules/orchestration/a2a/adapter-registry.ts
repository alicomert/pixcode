// server/modules/orchestration/a2a/adapter-registry.ts
// In-process registry mapping adapter ids to AbstractA2AAdapter
// instances. Resolution supports three id forms:
//   - "claude-code"        explicit
//   - "skill:<skillId>"    first adapter advertising that skill
//   - "auto"               first registered adapter (placeholder until
//                          AI-suggested routing arrives in a later plan)

import type { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

class AdapterRegistry {
  private readonly byId = new Map<string, AbstractA2AAdapter>();

  register(adapter: AbstractA2AAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`A2A adapter already registered: ${adapter.id}`);
    }
    this.byId.set(adapter.id, adapter);
  }

  get(idOrSelector: string): AbstractA2AAdapter | undefined {
    if (idOrSelector === 'auto') {
      const first = this.byId.values().next().value;
      return first ?? undefined;
    }
    if (idOrSelector.startsWith('skill:')) {
      const skill = idOrSelector.slice('skill:'.length);
      for (const adapter of this.byId.values()) {
        if (adapter.agentCard.skills.some((s) => s.id === skill)) {
          return adapter;
        }
      }
      return undefined;
    }
    return this.byId.get(idOrSelector);
  }

  list(): AbstractA2AAdapter[] {
    return [...this.byId.values()];
  }

  agentCards(): AgentCard[] {
    return this.list().map((a) => a.agentCard);
  }
}

export const adapterRegistry = new AdapterRegistry();
export type { AdapterRegistry };
