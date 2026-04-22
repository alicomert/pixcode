import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { QwenProviderAuth } from '@/modules/providers/list/qwen/qwen-auth.provider.js';
import { QwenMcpProvider } from '@/modules/providers/list/qwen/qwen-mcp.provider.js';
import { QwenSessionsProvider } from '@/modules/providers/list/qwen/qwen-sessions.provider.js';
import type { IProviderAuth, IProviderSessions } from '@/shared/interfaces.js';

/**
 * Qwen Code provider (Alibaba's Gemini CLI fork). The three sub-providers
 * mirror the Gemini layout — Qwen shares the on-disk layout, config format,
 * and stream-json protocol, so the auth/mcp/sessions modules are intentional
 * structural twins.
 */
export class QwenProvider extends AbstractProvider {
  readonly mcp = new QwenMcpProvider();
  readonly auth: IProviderAuth = new QwenProviderAuth();
  readonly sessions: IProviderSessions = new QwenSessionsProvider();

  constructor() {
    super('qwen');
  }
}
