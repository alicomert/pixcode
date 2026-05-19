// server/modules/orchestration/a2a/adapters/codex.adapter.ts
// Wraps the existing server/openai-codex.js queryCodex() runtime.
// That runtime already emits provider-neutral NormalizedMessage frames,
// so this adapter mainly translates those frames into A2A bus events.

import crypto from 'node:crypto';

// eslint-disable-next-line boundaries/no-unknown -- openai-codex.js is a top-level CLI runtime not yet classified by eslint.config.js; cleanup deferred.
import { abortCodexSession, queryCodex } from '@/openai-codex.js';
import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Part, Task } from '@/modules/orchestration/a2a/types.js';
import type { NormalizedMessage } from '@/shared/types.js';

interface FakeWriter {
  send(data: unknown): void;
  isSSEStreamWriter: true;
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

export class CodexA2AAdapter extends AbstractA2AAdapter {
  readonly id = 'codex';

  readonly agentCard: AgentCard = {
    name: 'pixcode-codex',
    description: 'OpenAI Codex, accessed via Pixcode',
    url: '/hermes/agents/codex',
    version: '1.0.0',
    capabilities: ['streaming', 'fileEdit', 'commandExec', 'webSearch', 'mcp'],
    skills: [
      {
        id: 'typescript-edit',
        description: 'Edit TypeScript and JavaScript files with CLI-driven reasoning',
      },
      {
        id: 'command-execution',
        description: 'Run shell commands and react to their output',
      },
      {
        id: 'web-research',
        description: 'Use web search as part of the development workflow',
      },
      {
        id: 'task-planning',
        description: 'Create and update TODO-style execution plans',
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
      isSSEStreamWriter: true,
      send: (data) => this.handleRuntimeFrame(task.id, data, session),
    };

    const finished = (async () => {
      try {
        await queryCodex(
          promptText,
          {
            cwd: ctx.cwd,
            permissionMode: ctx.permissionMode ?? 'default',
            model: ctx.model,
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
      abortCodexSession(session.sessionId);
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
      case 'text': {
        const text = typeof message.content === 'string' ? message.content : null;
        if (text && text.trim()) {
          this.emitMessage(taskId, {
            messageId: typeof message.id === 'string' ? message.id : newId('msg'),
            role: message.role === 'user' ? 'user' : 'agent',
            parts: [{ kind: 'text', text }],
            taskId,
          });
        }
        return;
      }

      case 'thinking': {
        const text = typeof message.content === 'string' ? message.content : '';
        this.emitArtifact(taskId, {
          artifactId: typeof message.id === 'string' ? message.id : newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: { kind: 'thinking', text } }],
          metadata: { source: 'codex-thinking' },
        });
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
                toolResult: message.toolResult,
                output: message.output,
                exitCode: message.exitCode,
                status: message.status,
              },
            },
          ],
          metadata: { source: 'codex-tool-use' },
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
                toolUseResult: message.toolUseResult,
              },
            },
          ],
          metadata: { source: 'codex-tool-result' },
        });
        return;
      }

      case 'status':
      case 'stream_delta':
      case 'stream_end':
      case 'complete':
      case 'session_created':
        return;

      case 'error': {
        const text =
          typeof message.content === 'string' && message.content.length > 0
            ? message.content
            : 'Codex reported an error';
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
          metadata: { source: `codex-${String(message.kind ?? 'event')}` },
        });
      }
    }
  }
}
