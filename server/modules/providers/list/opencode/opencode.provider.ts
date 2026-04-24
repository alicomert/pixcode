import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { OpencodeProviderAuth } from '@/modules/providers/list/opencode/opencode-auth.provider.js';
import { OpencodeMcpProvider } from '@/modules/providers/list/opencode/opencode-mcp.provider.js';
import { OpencodeSessionsProvider } from '@/modules/providers/list/opencode/opencode-sessions.provider.js';
import type { IProviderAuth, IProviderSessions } from '@/shared/interfaces.js';

/**
 * OpenCode provider.
 *
 * OpenCode (npm package: `opencode-ai`, binary: `opencode`) is a
 * multi-provider terminal coding agent. Unlike Claude/Codex/Gemini/Qwen
 * it uses XDG paths:
 *   - config: `~/.config/opencode/opencode.json`
 *   - data:   `~/.local/share/opencode/` (auth.json, sessions, logs)
 *
 * Its permission system is granular (per-tool + per-pattern) rather than
 * the 2/3-mode toggle other CLIs expose. We surface that through the
 * Configuration tab and the opencode.json editor — the Permissions tab
 * exposes high-level presets only.
 */
export class OpencodeProvider extends AbstractProvider {
  readonly mcp = new OpencodeMcpProvider();
  readonly auth: IProviderAuth = new OpencodeProviderAuth();
  readonly sessions: IProviderSessions = new OpencodeSessionsProvider();

  constructor() {
    super('opencode');
  }
}
