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
 * Stream events follow the headless `opencode serve` API contract —
 * messages carry `{ role, parts: [{ type: text|tool-use|tool-result, ... }] }`.
 */
export class OpencodeSessionsProvider implements IProviderSessions {
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) return [];

    const ts = raw.timestamp || new Date().toISOString();
    const baseId = raw.uuid || raw.id || generateMessageId('opencode');

    if (raw.type === 'message' && raw.role === 'assistant') {
      const content = raw.content || '';
      const messages: NormalizedMessage[] = [];
      if (content) {
        messages.push(createNormalizedMessage({
          id: baseId,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'stream_delta',
          content,
        }));
      }
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
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: raw.tool_name || raw.name,
        toolInput: raw.parameters || raw.input || {},
        toolId: raw.tool_id || raw.id || baseId,
      })];
    }

    if (raw.type === 'tool_result' || raw.type === 'tool-result') {
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_result',
        toolId: raw.tool_id || raw.toolCallId || '',
        content: raw.output === undefined ? '' : String(raw.output),
        isError: raw.status === 'error' || Boolean(raw.isError),
      })];
    }

    if (raw.type === 'result') {
      return [createNormalizedMessage({
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'stream_end',
      })];
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
