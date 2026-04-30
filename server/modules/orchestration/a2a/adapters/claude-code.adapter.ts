// server/modules/orchestration/a2a/adapters/claude-code.adapter.ts
// Wraps the existing server/claude-sdk.js queryClaudeSDK() function.
// claude-sdk.js was designed to stream SDK messages over a WebSocket
// connection, so we feed it a "fake WS" that captures send() calls and
// emits A2A bus events instead.
//
// IMPORTANT: claude-sdk.js calls ws.send(<NormalizedMessage object>) — it
// does NOT JSON.stringify before send. Our shim therefore receives objects
// (not strings) and dispatches on `frame.kind` (not `frame.type`). See
// server/shared/types.ts for the MessageKind enum.

import crypto from 'node:crypto';

// eslint-disable-next-line boundaries/no-unknown -- claude-sdk.js is a top-level CLI runtime not yet classified by eslint.config.js; cleanup deferred (cascades into a server/services classification gap).
import { abortClaudeSDKSession, queryClaudeSDK } from '@/claude-sdk.js';
import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Part, Task } from '@/modules/orchestration/a2a/types.js';

interface FakeWS {
  send(data: unknown): void;
  readyState: number;
}

// WebSocket.OPEN per the ws library — claude-sdk.js gates send() on readyState === 1.
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
    // Foundation: only the last user message is fed in. Multi-turn resumption
    // (input-required tasks, workflow chaining) needs to pass options.sessionId
    // and append history; deferred to a follow-on plan.
    const promptText = joinPartsToPrompt(
      task.history[task.history.length - 1]?.parts ?? [],
    );
    const session = { sessionId: null as string | null };
    this.active.set(task.id, session);

    this.emitState(task.id, 'working');

    const fakeWS: FakeWS = {
      readyState: WS_OPEN,
      send: (data) => this.handleSdkFrame(task.id, data, session),
    };

    const finished = (async () => {
      try {
        await queryClaudeSDK(
          promptText,
          {
            cwd: ctx.cwd,
            permissionMode: ctx.permissionMode ?? 'default',
            toolsSettings: ctx.toolsSettings,
          },
          fakeWS,
        );
        // If cancelTask removed us from `active` first, suppress the spurious
        // 'completed' that would otherwise race the 'canceled' state.
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
    // Delete BEFORE awaiting so submitTask's IIFE guard (this.active.has)
    // suppresses the spurious 'completed' state when queryClaudeSDK's
    // for-await loop unwinds from the abort.
    this.active.delete(taskId);
    if (session.sessionId) {
      try {
        await abortClaudeSDKSession(session.sessionId);
      } catch {
        // swallow — adapter has already cleaned its own state
      }
    }
    this.emitState(taskId, 'canceled');
  }

  /**
   * claude-sdk.js calls `ws.send(<NormalizedMessage>)` with a JS OBJECT
   * (not a JSON string). We translate each frame into A2A bus events.
   * See server/shared/types.ts for the MessageKind union.
   */
  private handleSdkFrame(
    taskId: string,
    frame: unknown,
    session: { sessionId: string | null },
  ): void {
    if (!frame || typeof frame !== 'object') return;
    const f = frame as {
      kind?: string;
      sessionId?: unknown;
      newSessionId?: unknown;
      text?: unknown;
      content?: unknown;
      toolName?: unknown;
      toolInput?: unknown;
      toolResult?: unknown;
    };

    // session_created carries the new session id in `newSessionId`. Capture
    // it here so cancelTask can call abortClaudeSDKSession with the right id.
    if (
      f.kind === 'session_created' &&
      typeof f.newSessionId === 'string' &&
      !session.sessionId
    ) {
      session.sessionId = f.newSessionId;
    }

    switch (f.kind) {
      case 'session_created':
      case 'status':
      case 'stream_delta':
      case 'stream_end':
        // session_created and status are not user-facing.
        // stream_delta and stream_end CARRY user-visible delta text but are
        // not currently emitted by claude-sdk.js (it doesn't pass
        // includePartialMessages: true to query()). If that flag flips on
        // upstream, these cases must be re-routed to emit text Messages.
        return;

      case 'text':
      case 'thinking': {
        const text =
          typeof f.text === 'string'
            ? f.text
            : typeof f.content === 'string'
              ? f.content
              : null;
        if (text) {
          this.emitMessage(taskId, {
            messageId: newId('msg'),
            role: 'agent',
            parts: [{ kind: 'text', text }],
            taskId,
          });
        }
        return;
      }

      case 'tool_use': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'command-output',
          parts: [
            {
              kind: 'data',
              data: { toolName: f.toolName, toolInput: f.toolInput },
            },
          ],
          metadata: { source: 'claude-tool-use' },
        });
        return;
      }

      case 'tool_result': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'command-output',
          parts: [{ kind: 'data', data: { toolResult: f.toolResult } }],
          metadata: { source: 'claude-tool-result' },
        });
        return;
      }

      case 'permission_request':
      case 'permission_cancelled':
      case 'interactive_prompt':
      case 'task_notification':
        // Informational — surface as data artifact for visibility.
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: f as Record<string, unknown> }],
          metadata: { source: `claude-${f.kind}` },
        });
        return;

      case 'error': {
        // claude-sdk.js catches internally and emits an error frame without
        // rethrowing, so the IIFE await would resolve cleanly. Force the
        // failed state here and remove from active so the IIFE's
        // 'completed' emit is suppressed by its active.has() guard.
        const message =
          typeof f.content === 'string'
            ? f.content
            : typeof f.text === 'string'
              ? f.text
              : 'Claude Code reported an error';
        this.emitState(taskId, 'failed', {
          code: 'CLAUDE_RUNTIME_ERROR',
          message,
          details: f as Record<string, unknown>,
        });
        this.active.delete(taskId);
        return;
      }

      case 'complete':
        // Lifecycle redundant with the IIFE's 'completed' emit; suppress to
        // avoid double-signaling. The IIFE owns terminal state transitions.
        return;

      default:
        // Unknown kind — surface for visibility
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: f as Record<string, unknown> }],
        });
    }
  }
}
