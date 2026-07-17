import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { GrokProviderAuth } from '@/modules/providers/list/grok/grok-auth.provider.js';
import { GrokMcpProvider } from '@/modules/providers/list/grok/grok-mcp.provider.js';
import { GrokSessionsProvider } from '@/modules/providers/list/grok/grok-sessions.provider.js';
import type { IProviderAuth, IProviderSessions } from '@/shared/interfaces.js';

/**
 * Grok Build (xAI) — interactive coding agent CLI (`grok`).
 * Install: https://x.ai/cli · Docs: https://docs.x.ai/build/overview
 */
export class GrokProvider extends AbstractProvider {
  readonly mcp = new GrokMcpProvider();
  readonly auth: IProviderAuth = new GrokProviderAuth();
  readonly sessions: IProviderSessions = new GrokSessionsProvider();

  constructor() {
    super('grok');
  }
}
