// server/modules/orchestration/a2a/adapter-registry.ts
// In-process registry mapping adapter ids to AbstractA2AAdapter
// instances. Resolution supports three id forms:
//   - "claude-code"        explicit
//   - "skill:<skillId>"    first REGISTERED adapter advertising that skill
//                          (Map iteration is insertion-ordered per ES spec).
//   - "auto"               first registered adapter (placeholder until
//                          AI-suggested routing arrives in a later plan)

import type { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

class AdapterRegistry {
  // Map iteration order is insertion-ordered (ES spec); auto and skill: resolution depend on this.
  private readonly byId = new Map<string, AbstractA2AAdapter>();

  register(adapter: AbstractA2AAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`A2A adapter already registered: ${adapter.id}`);
    }
    this.byId.set(adapter.id, adapter);
  }

  get(idOrSelector: string): AbstractA2AAdapter | undefined {
    if (idOrSelector === 'auto') {
      if (this.byId.size > 1) {
        throw new Error(
          'A2A adapter selector "auto" is not yet implemented for multi-adapter registries. ' +
          'Pass an explicit adapter id ("claude-code") or a "skill:<id>" selector. ' +
          'AI-suggested routing will replace this stub in a later plan.',
        );
      }
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
