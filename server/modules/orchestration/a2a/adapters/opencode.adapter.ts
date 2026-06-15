// server/modules/orchestration/a2a/adapters/opencode.adapter.ts
// Wraps the existing server/opencode-cli.js runtime, which emits
// provider-neutral NormalizedMessage frames over a writer interface.

import crypto from 'node:crypto';

// eslint-disable-next-line boundaries/no-unknown -- opencode-cli.js is a top-level CLI runtime not yet classified by eslint.config.js; cleanup deferred.
import { abortOpencodeSession, spawnOpencode } from '@/opencode-cli.js';
import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Part, Task } from '@/modules/orchestration/a2a/types.js';
import type { NormalizedMessage } from '@/shared/types.js';

interface FakeWriter {
  send(data: unknown): void;
  getSessionId(): string | null;
  setSessionId(sessionId: string): void;
}

function joinPartsToPrompt(parts: Part[]): string {
  return parts
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'data') return JSON.stringify(part.data);
      return `[file:${part.name}${part.uri ? ` uri=${part.uri}` : ''}]`;
    })
    .join('\n');
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export class OpenCodeA2AAdapter extends AbstractA2AAdapter {
  readonly id = 'opencode';

  readonly agentCard: AgentCard = {
    name: 'pixcode-opencode',
    description: 'OpenCode CLI, accessed via Pixcode',
    url: '/api/orchestration/agents/opencode',
    version: '1.0.0',
    capabilities: ['streaming', 'fileEdit', 'commandExec', 'multiProvider'],
    skills: [
      {
        id: 'rapid-prototyping',
        description: 'Fast implementation with multi-provider CLI routing',
      },
      {
        id: 'plan-mode',
        description: 'Read-only planning mode for change proposals',
      },
      {
        id: 'tool-augmented-editing',
        description: 'Use CLI tools while editing code across a workspace',
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

    const fakeWriter: FakeWriter = {
      send: (data) => this.handleRuntimeFrame(task.id, data, session),
      getSessionId: () => session.sessionId,
      setSessionId: (sessionId) => {
        session.sessionId = sessionId;
      },
    };

    const finished = (async () => {
      try {
        await spawnOpencode(
          promptText,
          {
            cwd: ctx.cwd,
            model: ctx.model,
            permissionMode: ctx.permissionMode,
            toolsSettings: ctx.toolsSettings,
          },
          fakeWriter,
        );

        if (this.active.has(task.id)) {
          this.emitState(task.id, 'completed');
        }
      } catch (err) {
        if (this.active.has(task.id)) {
          this.emitState(task.id, 'failed', {
            code: 'ADAPTER_RUNTIME_ERROR',
            message: err instanceof Error ? err.message : String(err),
          });
        }
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
    if (!session) {
      this.emitState(taskId, 'canceled');
      return;
    }

    this.active.delete(taskId);
    if (session.sessionId) {
      abortOpencodeSession(session.sessionId);
    }
    this.emitState(taskId, 'canceled');
  }

  private handleRuntimeFrame(
    taskId: string,
    frame: unknown,
    session: { sessionId: string | null },
  ): void {
    if (!frame || typeof frame !== 'object') return;
    const message = frame as Partial<NormalizedMessage>;

    if (
      message.kind === 'session_created' &&
      typeof message.newSessionId === 'string' &&
      !session.sessionId
    ) {
      session.sessionId = message.newSessionId;
      return;
    }

    switch (message.kind) {
      case 'stream_delta':
      case 'text': {
        const text = typeof message.content === 'string' ? message.content : null;
        if (text && text.trim()) {
          this.emitMessage(taskId, {
            messageId: typeof message.id === 'string' ? message.id : newId('msg'),
            role: 'agent',
            parts: [{ kind: 'text', text }],
            taskId,
          });
        }
        return;
      }

      case 'tool_use': {
        this.emitArtifact(taskId, {
          artifactId: typeof message.id === 'string' ? message.id : newId('art'),
          type: 'command-output',
          parts: [
            {
              kind: 'data',
              data: {
                toolName: message.toolName,
                toolInput: message.toolInput,
                toolId: message.toolId,
                toolResult: message.toolResult,
              },
            },
          ],
          metadata: { source: 'opencode-tool-use' },
        });
        return;
      }

      case 'tool_result': {
        this.emitArtifact(taskId, {
          artifactId: typeof message.id === 'string' ? message.id : newId('art'),
          type: 'command-output',
          parts: [
            {
              kind: 'data',
              data: {
                toolId: message.toolId,
                content: message.content,
                isError: message.isError,
              },
            },
          ],
          metadata: { source: 'opencode-tool-result' },
        });
        return;
      }

      case 'status': {
        this.emitArtifact(taskId, {
          artifactId: typeof message.id === 'string' ? message.id : newId('art'),
          type: 'data',
          parts: [
            {
              kind: 'data',
              data: {
                kind: 'status',
                text: message.text,
                tokens: message.tokens,
              },
            },
          ],
          metadata: { source: 'opencode-status' },
        });
        return;
      }

      case 'stream_end':
      case 'complete':
      case 'session_created':
        return;

      case 'error': {
        const text =
          typeof message.content === 'string' && message.content.length > 0
            ? message.content
            : 'OpenCode reported an error';
        this.emitState(taskId, 'failed', {
          code: 'ADAPTER_RUNTIME_ERROR',
          message: text,
        });
        this.active.delete(taskId);
        return;
      }

      default: {
        this.emitArtifact(taskId, {
          artifactId: typeof message.id === 'string' ? message.id : newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: message as Record<string, unknown> }],
          metadata: { source: `opencode-${String(message.kind ?? 'event')}` },
        });
      }
    }
  }
}
