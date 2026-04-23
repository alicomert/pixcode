/**
 * Registry of user-editable config files per provider CLI.
 *
 * This is the single source of truth for the Settings → Agents →
 * Configuration tab. Adding a new provider? Append a row here and the
 * UI + API pick it up — no component changes required.
 *
 * Rules:
 *   - `relativePath` is relative to the user's home directory.
 *     We never accept absolute paths from the client; the server
 *     resolves these explicitly so path traversal is impossible.
 *   - `format` drives the CodeMirror language extension on the client.
 *   - `readonly: true` hides the Save button and the server rejects
 *     writes. Use it for files the CLI owns (e.g. OAuth tokens).
 *   - `description` is shown as a subtle caption under the editor.
 */

export type ProviderConfigFormat = 'json' | 'toml' | 'env' | 'text';

export type ProviderConfigFile = {
  id: string;
  label: string;
  relativePath: string;
  format: ProviderConfigFormat;
  readonly?: boolean;
  description?: string;
};

export const PROVIDER_CONFIG_FILES: Record<string, ProviderConfigFile[]> = {
  claude: [
    {
      id: 'settings',
      label: 'settings.json',
      relativePath: '.claude/settings.json',
      format: 'json',
      description: 'Main Claude Code settings — default model, system prompt, tool policy.',
    },
    {
      id: 'env',
      label: '.env',
      relativePath: '.claude/.env',
      format: 'env',
      description: 'Environment variables loaded when Claude runs (e.g. ANTHROPIC_API_KEY).',
    },
  ],
  codex: [
    {
      id: 'config',
      label: 'config.toml',
      relativePath: '.codex/config.toml',
      format: 'toml',
      description: 'Main Codex CLI config — models, MCP servers, approval policy, sandbox mode.',
    },
    {
      id: 'env',
      label: '.env',
      relativePath: '.codex/.env',
      format: 'env',
      description: 'Environment variables (OPENAI_API_KEY, OPENAI_BASE_URL, …).',
    },
    {
      id: 'auth',
      label: 'auth.json',
      relativePath: '.codex/auth.json',
      format: 'json',
      readonly: true,
      description: 'OAuth tokens managed by `codex login`. Read-only; editing here would corrupt the session.',
    },
  ],
  cursor: [
    {
      id: 'env',
      label: '.env',
      relativePath: '.cursor/.env',
      format: 'env',
      description: 'Cursor CLI environment variables.',
    },
  ],
  gemini: [
    {
      id: 'settings',
      label: 'settings.json',
      relativePath: '.gemini/settings.json',
      format: 'json',
      description: 'Main Gemini CLI settings — selected model, MCP servers, tool approval mode.',
    },
    {
      id: 'env',
      label: '.env',
      relativePath: '.gemini/.env',
      format: 'env',
      description: 'Environment variables (GOOGLE_API_KEY, GEMINI_API_KEY, …).',
    },
  ],
  qwen: [
    {
      id: 'settings',
      label: 'settings.json',
      relativePath: '.qwen/settings.json',
      format: 'json',
      description: 'Main Qwen Code settings — selected model, MCP servers, approval mode.',
    },
    {
      id: 'env',
      label: '.env',
      relativePath: '.qwen/.env',
      format: 'env',
      description: 'Environment variables (DASHSCOPE_API_KEY, OPENAI_API_KEY for OpenAI-compatible routes, …).',
    },
  ],
};

export const SUPPORTED_CONFIG_PROVIDERS = Object.keys(PROVIDER_CONFIG_FILES);

// Hard cap — no config file we care about is remotely this big, but we
// want to refuse reads and writes that would swell memory. Editing a 1 MB
// settings.json is already a smell.
export const MAX_CONFIG_FILE_SIZE_BYTES = 1_048_576; // 1 MB
