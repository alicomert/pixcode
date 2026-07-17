import type { IProviderSessions } from '@/shared/interfaces.js';
import type { FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';

/**
 * Grok Build sessions — interactive TUI is primary; headless runs go through
 * grok-build-cli.js. History restore from disk is not implemented yet.
 */
export class GrokSessionsProvider implements IProviderSessions {
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) return [];
    const text = typeof raw.content === 'string'
      ? raw.content
      : typeof raw.text === 'string'
        ? raw.text
        : '';
    if (!text) return [];
    return [createNormalizedMessage({
      id: typeof raw.id === 'string' ? raw.id : generateMessageId('grok'),
      sessionId,
      timestamp: (raw.timestamp as string) || new Date().toISOString(),
      provider: 'grok',
      kind: raw.kind === 'error' ? 'error' : 'text',
      role: 'assistant',
      content: text,
    })];
  }

  async fetchHistory(
    _sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const limit = typeof options.limit === 'number' ? options.limit : 50;
    const offset = typeof options.offset === 'number' ? options.offset : 0;
    return {
      messages: [],
      hasMore: false,
      total: 0,
      offset,
      limit,
    };
  }
}
