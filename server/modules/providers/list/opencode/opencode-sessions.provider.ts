import sessionManager from '@/sessionManager.js';
import type { IProviderSessions } from '@/shared/interfaces.js';
import type { AnyRecord, FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';

const PROVIDER = 'opencode';

/**
 * OpenCode sessions provider.
 *
 * OpenCode persists session transcripts under
 * `~/.local/share/opencode/project/<project-slug>/sessions/` (XDG data dir).
 * The on-disk format is JSON per session — different from Gemini/Qwen's
 * single-file-per-conversation layout. For the initial integration we
 * read transcripts only from the in-memory sessionManager (freshly
 * captured streams); restoring historical sessions from disk will land
 * in a follow-up once the exact schema is pinned.
 *
 * Stream shape from `opencode run --format json` (verified against
 * opencode-ai 0.x at the wire):
 *   { type:"step_start",  timestamp, sessionID, part:{ type:"step-start",  ... } }
 *   { type:"text",        timestamp, sessionID, part:{ type:"text", text:"…", time:{…}, metadata:{…} } }
 *   { type:"tool_use",    timestamp, sessionID, part:{ type:"tool-use",  callID, tool, state:{ input } } }
 *   { type:"tool_result", timestamp, sessionID, part:{ type:"tool-result", callID, state:{ output, status } } }
 *   { type:"step_finish", timestamp, sessionID, part:{ type:"step-finish", reason, tokens, cost } }
 *   { type:"error",       timestamp, sessionID, error:{ name, data:{ message, statusCode? } } }
 * Field names are camelCase (`sessionID`, `callID`) — NOT snake_case.
 */
export class OpencodeSessionsProvider implements IProviderSessions {
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) return [];

    const ts = raw.timestamp || new Date().toISOString();
    const baseId = raw.uuid || raw.id || generateMessageId('opencode');
    const part = readObjectRecord(raw.part) || {};

    // Modern shape: { type:"text", part:{ type:"text", text:"…" } }.
    // The full text arrives in a single event (not token-by-token), but it
    // can also legitimately be empty during a step_start preamble — we only
    // emit when there's actual text. `stream_end` is emitted on step_finish
    // (which is guaranteed at the end of every assistant turn), so we don't
    // close the stream here.
    if (raw.type === 'text') {
      const text = typeof part.text === 'string' ? part.text : '';
      if (!text) return [];
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'stream_delta',
        content: text,
      })];
    }

    // Legacy fallback for older builds that still emit `{ type:"message", role:"assistant", content }`.
    if (raw.type === 'message' && raw.role === 'assistant') {
      const content = typeof raw.content === 'string' ? raw.content : '';
      if (!content) return [];
      const messages: NormalizedMessage[] = [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'stream_delta',
        content,
      })];
      if (raw.delta !== true) {
        messages.push(createNormalizedMessage({
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'stream_end',
        }));
      }
      return messages;
    }

    if (raw.type === 'tool_use' || raw.type === 'tool-use') {
      const state = readObjectRecord(part.state) || {};
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: String(part.tool || raw.tool_name || raw.name || ''),
        toolInput: state.input || part.input || raw.parameters || raw.input || {},
        toolId: String(part.callID || part.id || raw.tool_id || raw.id || baseId),
      })];
    }

    if (raw.type === 'tool_result' || raw.type === 'tool-result') {
      const state = readObjectRecord(part.state) || {};
      const status = (state.status || raw.status) as string | undefined;
      const output = state.output ?? part.output ?? raw.output;
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_result',
        toolId: String(part.callID || part.id || raw.tool_id || raw.toolCallId || ''),
        content: output === undefined || output === null ? '' : String(output),
        isError: status === 'error' || Boolean(raw.isError),
      })];
    }

    // OpenCode signals end-of-turn with `step_finish` (run mode never emits
    // a top-level `result`). Emit stream_end so the UI clears its
    // "Processing…" state.
    if (raw.type === 'step_finish' || raw.type === 'result') {
      return [createNormalizedMessage({
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'stream_end',
      })];
    }

    // step_start carries the session ID but no user-visible content — we
    // capture the session ID elsewhere (response handler) and drop the event.
    if (raw.type === 'step_start') {
      return [];
    }

    if (raw.type === 'error') {
      // OpenCode `--format json` emits errors as
      //   { type:"error", error:{ name, data:{ message, statusCode?, isRetryable? } } }
      // — `error` is always an object wrapper, never a plain string. Older
      // builds put the message at `error.message`; current builds nest it
      // under `error.data.message`. Map known error class names to friendly
      // copy so the user gets actionable text instead of a class identifier.
      const rawErr = raw.error ?? raw.message;
      const errObj = rawErr && typeof rawErr === 'object' ? rawErr as Record<string, unknown> : null;
      const data = errObj && typeof errObj.data === 'object' && errObj.data
        ? errObj.data as Record<string, unknown>
        : null;
      const dataMessage = data && typeof data.message === 'string' ? data.message : null;
      const errMessage = errObj && typeof errObj.message === 'string' ? errObj.message : null;
      const errName = errObj && typeof errObj.name === 'string' ? errObj.name : null;
      const statusCode = data && typeof data.statusCode === 'number' ? data.statusCode : null;

      let content: string;
      if (typeof rawErr === 'string') {
        content = rawErr;
      } else if (dataMessage) {
        content = dataMessage;
      } else if (errMessage) {
        content = errMessage;
      } else if (errName) {
        const friendly: Record<string, string> = {
          ProviderModelNotFoundError: 'Model not found. Open Settings → Agents → OpenCode and pick a model from the live catalog (or run `opencode models --refresh`).',
          ProviderInitError: 'OpenCode provider config is invalid. Try `opencode auth login` or remove `~/.local/share/opencode/auth.json` and re-authenticate.',
          MessageOutputLengthError: 'OpenCode response was truncated by the model output cap. Try shortening the prompt or pick a model with a larger output limit.',
          AI_APICallError: 'OpenCode upstream API call failed. Clearing `~/.cache/opencode` and retrying usually fixes this.',
          APIError: statusCode === 429
            ? 'OpenCode hit a rate limit (429). Wait a few seconds and try again, or switch to a different model.'
            : 'OpenCode upstream API error.',
        };
        content = friendly[errName] ?? errName;
      } else {
        try { content = JSON.stringify(rawErr); }
        catch { content = 'Unknown OpenCode streaming error'; }
      }
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'error',
        content,
      })];
    }

    return [];
  }

  async fetchHistory(
    sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const { limit = null, offset = 0 } = options;

    let rawMessages: AnyRecord[] = [];
    try {
      rawMessages = sessionManager.getSessionMessages(sessionId) as AnyRecord[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[OpencodeProvider] Failed to load session ${sessionId}:`, message);
      return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
    }

    const normalized: NormalizedMessage[] = [];
    for (const raw of rawMessages) {
      const ts = raw.timestamp || new Date().toISOString();
      const baseId = raw.uuid || raw.id || generateMessageId('opencode');
      const role = raw.message?.role || raw.role;
      const content = raw.message?.content || raw.content;

      if (!role || !content) continue;
      const normalizedRole = role === 'user' ? 'user' : 'assistant';

      if (typeof content === 'string' && content.trim()) {
        normalized.push(createNormalizedMessage({
          id: baseId,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'text',
          role: normalizedRole,
          content,
        }));
      }
    }

    const start = Math.max(0, offset);
    const pageLimit = limit === null ? null : Math.max(0, limit);
    const messages = pageLimit === null
      ? normalized.slice(start)
      : normalized.slice(start, start + pageLimit);

    return {
      messages,
      total: normalized.length,
      hasMore: pageLimit === null ? false : start + pageLimit < normalized.length,
      offset: start,
      limit: pageLimit,
    };
  }
}
