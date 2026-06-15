// server/modules/orchestration/a2a/adapters/json-event.adapter.ts
// A specialty adapter that consumes JSON event streams from external providers
// and translates them into the A2A bus protocol.

import crypto from 'node:crypto';

import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Task } from '@/modules/orchestration/a2a/types.js';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export class JsonEventA2AAdapter extends AbstractA2AAdapter {
  readonly id = 'json-event';

  readonly agentCard: AgentCard = {
    name: 'pixcode-json-event',
    description: 'JSON Event Stream Adapter for Pixcode Orchestration',
    url: '/api/orchestration/agents/json-event',
    version: '1.0.0',
    capabilities: ['streaming', 'event-driven'],
    skills: [
      {
        id: 'event-processing',
        description: 'Process external JSON event streams and map them to task progress',
      },
    ],
    authentication: { type: 'bearer' },
  };

  private readonly active = new Set<string>();

  async submitTask(task: Task, _ctx: AdapterContext): Promise<TaskHandle> {
    this.active.add(task.id);
    this.emitState(task.id, 'working');

    // This is a specialty adapter; the actual event ingestion happens
    // externally (e.g. via an ingest endpoint) which publishes to the bus.
    
    const finished = (async () => {
        // Lifecycle managed by external events
    })();

    return {
      cancel: () => this.cancelTask(task.id),
      finished,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    if (this.active.has(taskId)) {
      this.active.delete(taskId);
      this.emitState(taskId, 'canceled');
    }
  }

  /**
   * External event handlers call this to bridge native JSON events to A2A.
   */
  handleExternalEvent(taskId: string, event: Record<string, unknown>): void {
    if (!this.active.has(taskId)) return;

    const kind = event.kind || event.type;

    switch (kind) {
      case 'message':
      case 'text':
        this.emitMessage(taskId, {
          messageId: newId('msg'),
          role: 'agent',
          parts: [{ kind: 'text', text: String(event.text || event.content || '') }],
          taskId,
        });
        break;
      case 'artifact':
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: (event.artifactType as any) || 'data',
          parts: [{ kind: 'data', data: event.data as Record<string, unknown> }],
          metadata: { source: 'external-json-event' },
        });
        break;
      case 'completed':
        this.emitState(taskId, 'completed');
        this.active.delete(taskId);
        break;
      case 'failed':
        this.emitState(taskId, 'failed', {
          code: String(event.errorCode || 'EXTERNAL_ERROR'),
          message: String(event.errorMessage || 'External event reported failure'),
        });
        this.active.delete(taskId);
        break;
    }
  }
}
