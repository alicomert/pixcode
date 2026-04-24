import type { LLMProvider } from '../../types/app';

export type ProviderAuthStatus = {
  authenticated: boolean;
  /** Whether the provider's CLI binary is on PATH. Drives the "CLI not
   *  installed" onboarding card. `null` means the frontend hasn't received
   *  a value yet (backwards-compat with older backend payloads). */
  installed: boolean | null;
  email: string | null;
  method: string | null;
  error: string | null;
  loading: boolean;
};

/**
 * Shell command that installs each CLI provider. Surfaced in the UI when
 * `installed === false` so users can get unstuck without hunting through docs.
 */
export const PROVIDER_INSTALL_COMMANDS: Record<LLMProvider, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  cursor: 'curl https://cursor.com/install -fsSL | bash',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  qwen: 'npm install -g @qwen-code/qwen-code',
  opencode: 'npm install -g opencode-ai',
};

/**
 * Human-readable provider names for UI copy ("Qwen Code is not installed" etc).
 */
export const PROVIDER_DISPLAY_NAMES: Record<LLMProvider, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor CLI',
  codex: 'OpenAI Codex',
  gemini: 'Gemini CLI',
  qwen: 'Qwen Code',
  opencode: 'OpenCode',
};

export type ProviderAuthStatusMap = Record<LLMProvider, ProviderAuthStatus>;

export const CLI_PROVIDERS: LLMProvider[] = ['claude', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'];

export const PROVIDER_AUTH_STATUS_ENDPOINTS: Record<LLMProvider, string> = {
  claude: '/api/providers/claude/auth/status',
  cursor: '/api/providers/cursor/auth/status',
  codex: '/api/providers/codex/auth/status',
  gemini: '/api/providers/gemini/auth/status',
  qwen: '/api/providers/qwen/auth/status',
  opencode: '/api/providers/opencode/auth/status',
};

export const createInitialProviderAuthStatusMap = (loading = true): ProviderAuthStatusMap => ({
  claude: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
  cursor: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
  codex: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
  gemini: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
  qwen: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
  opencode: { authenticated: false, installed: null, email: null, method: null, error: null, loading },
});
