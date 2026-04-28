// server/modules/orchestration/a2a/adapters/claude-code.adapter.ts
// Wraps the existing server/claude-sdk.js queryClaudeSDK() function.
// claude-sdk.js was designed to stream SDK messages over a WebSocket
// connection, so we feed it a "fake WS" that captures send() calls and
// emits A2A bus events instead.

import crypto from 'node:crypto';

// @ts-ignore — plain-JS module
// eslint-disable-next-line boundaries/no-unknown
import { queryClaudeSDK, abortClaudeSDKSession } from '@/claude-sdk.js';
import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Message, Part, Task } from '@/modules/orchestration/a2a/types.js';

interface FakeWS {
  send(data: string): void;
  readyState: number;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

const WS_OPEN = 1;

function joinPartsToPrompt(parts: Part[]): string {
  return parts
    .map((p) => {
      if (p.kind === 'text') return p.text;
      if (p.kind === 'data') return JSON.stringify(p.data);
      // file parts: include name + uri/inline marker
      return `[file:${p.name}${p.uri ? ` uri=${p.uri}` : ''}]`;
    })
    .join('\n');
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export class ClaudeCodeA2AAdapter extends AbstractA2AAdapter {
  readonly id = 'claude-code';

  readonly agentCard: AgentCard = {
    name: 'pixcode-claude-code',
    description: 'Anthropic Claude Code, accessed via Pixcode',
    url: '/a2a/agents/claude-code',
    version: '1.0.0',
    capabilities: ['streaming', 'fileEdit', 'commandExec', 'mcp'],
    skills: [
      {
        id: 'architectural-review',
        description: 'Review code architecture and propose structural changes',
      },
      {
        id: 'typescript-edit',
        description: 'Edit TypeScript files with type-aware reasoning',
      },
      {
        id: 'multi-file-refactor',
        description: 'Coordinated edits across many files',
      },
      {
        id: 'test-run',
        description: 'Run test suites and react to results',
      },
    ],
    authentication: { type: 'bearer' },
  };

  private readonly active = new Map<string, { sessionId: string | null }>();

  async submitTask(task: Task, ctx: AdapterContext): Promise<TaskHandle> {
    const promptText = joinPartsToPrompt(
      task.history[task.history.length - 1]?.parts ?? [],
    );
    const session = { sessionId: null as string | null };
    this.active.set(task.id, session);

    this.emitState(task.id, 'working');

    const fakeWS: FakeWS = {
      readyState: WS_OPEN,
      send: (data: string) => this.handleSdkFrame(task.id, data, session),
      on: () => {},
      removeListener: () => {},
    };

    const finished = (async () => {
      try {
        await queryClaudeSDK(
          promptText,
          {
            cwd: ctx.cwd,
            permissionMode: ctx.permissionMode ?? 'default',
          },
          fakeWS,
        );
        if (this.active.has(task.id)) {
          this.emitState(task.id, 'completed');
        }
      } catch (err) {
        this.emitState(task.id, 'failed', {
          code: 'ADAPTER_RUNTIME_ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.active.delete(task.id);
      }
    })();

    return {
      cancel: () => this.cancelTask(task.id),
      finished,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    const session = this.active.get(taskId);
    if (!session?.sessionId) {
      this.emitState(taskId, 'canceled');
      this.active.delete(taskId);
      return;
    }
    try {
      await abortClaudeSDKSession(session.sessionId);
    } finally {
      this.emitState(taskId, 'canceled');
      this.active.delete(taskId);
    }
  }

  /**
   * claude-sdk.js sends JSON frames over the WS. We parse each frame
   * and translate it into A2A bus events.
   */
  private handleSdkFrame(taskId: string, raw: string, session: { sessionId: string | null }): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      // Non-JSON frame; treat as plain text agent message.
      const message: Message = {
        messageId: newId('msg'),
        role: 'agent',
        parts: [{ kind: 'text', text: raw }],
        taskId,
      };
      this.emitMessage(taskId, message);
      return;
    }

    const f = frame as { type?: string; data?: Record<string, unknown> };
    const data = f.data ?? {};

    // Capture sessionId on the first frame that exposes it so cancel works.
    const maybeSessionId = (data as { session_id?: unknown }).session_id;
    if (typeof maybeSessionId === 'string' && !session.sessionId) {
      session.sessionId = maybeSessionId;
    }

    switch (f.type) {
      case 'claude-text':
      case 'text':
      case 'message': {
        const text = (data as { text?: unknown }).text;
        if (typeof text === 'string') {
          this.emitMessage(taskId, {
            messageId: newId('msg'),
            role: 'agent',
            parts: [{ kind: 'text', text }],
            taskId,
          });
        }
        return;
      }
      case 'tool_use':
      case 'tool-use': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'command-output',
          parts: [{ kind: 'data', data }],
          metadata: { source: 'claude-tool-use' },
        });
        return;
      }
      case 'file_edit':
      case 'file-edit': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'file-diff',
          parts: [{ kind: 'data', data }],
          metadata: { source: 'claude-file-edit' },
        });
        return;
      }
      default: {
        // Unknown frame type — surface as data artifact for visibility.
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: { frameType: f.type, ...data } }],
        });
      }
    }
  }
}
