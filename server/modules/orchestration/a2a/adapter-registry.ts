// server/modules/orchestration/a2a/adapter-registry.ts
// In-process registry mapping adapter ids to AbstractA2AAdapter
// instances. Resolution supports three id forms:
//   - "claude-code"        explicit
//   - "skill:<skillId>"    first REGISTERED adapter advertising that skill
//                          (Map iteration is insertion-ordered per ES spec).
//   - "auto"               first registered adapter (deterministic fallback
//                          until smarter routing arrives in a later plan)

import type { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

interface ResolveAdapterOptions {
  preferredAdapterId?: string;
  preferredProvider?: string;
  preferredSkillId?: string;
}

class AdapterRegistry {
  // Map iteration order is insertion-ordered (ES spec); auto and skill: resolution depend on this.
  private readonly byId = new Map<string, AbstractA2AAdapter>();

  register(adapter: AbstractA2AAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`A2A adapter already registered: ${adapter.id}`);
    }
    this.byId.set(adapter.id, adapter);
  }

  get(id: string): AbstractA2AAdapter | undefined {
    return this.byId.get(id);
  }

  resolve(idOrSelector: string, options: ResolveAdapterOptions = {}): AbstractA2AAdapter | undefined {
    const normalizedSelector = idOrSelector.trim();
    if (!normalizedSelector) {
      return undefined;
    }

    if (normalizedSelector === 'auto') {
      return this.pickPreferred(this.list(), options);
    }

    if (normalizedSelector.startsWith('skill:')) {
      const skill = normalizedSelector.slice('skill:'.length);
      const matches = this.list().filter((adapter) =>
        adapter.agentCard.skills.some((s) => s.id === skill),
      );
      if (matches.length === 0) {
        return undefined;
      }
      return this.pickPreferred(matches, {
        ...options,
        preferredSkillId: options.preferredSkillId ?? skill,
      });
    }

    return this.byId.get(normalizedSelector);
  }

  list(): AbstractA2AAdapter[] {
    return [...this.byId.values()];
  }

  agentCards(): AgentCard[] {
    return this.list().map((a) => a.agentCard);
  }

  private pickPreferred(
    adapters: AbstractA2AAdapter[],
    options: ResolveAdapterOptions,
  ): AbstractA2AAdapter | undefined {
    const {
      preferredAdapterId,
      preferredProvider,
      preferredSkillId,
    } = options;

    if (preferredAdapterId) {
      const byAdapterId = adapters.find((adapter) => adapter.id === preferredAdapterId);
      if (byAdapterId) {
        return byAdapterId;
      }
    }

    if (preferredProvider) {
      const normalizedProvider = preferredProvider.trim().toLowerCase();
      const byProvider = adapters.find((adapter) => adapter.id === normalizedProvider);
      if (byProvider) {
        return byProvider;
      }
    }

    if (preferredSkillId) {
      const bySkill = adapters.find((adapter) =>
        adapter.agentCard.skills.some((skill) => skill.id === preferredSkillId),
      );
      if (bySkill) {
        return bySkill;
      }
    }

    return adapters[0];
  }
}

export const adapterRegistry = new AdapterRegistry();
export type { AdapterRegistry, ResolveAdapterOptions };
