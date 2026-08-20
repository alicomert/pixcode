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
  /**
   * The file can contain API keys/OAuth tokens. Sensitive files are never
   * returned through the config-file API; manage credentials through the
   * encrypted Pixcode credential store instead.
   */
  sensitive?: boolean;
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
      readonly: true,
      sensitive: true,
      description: 'Credential environment variables are managed in Settings → API credentials and are never shown here.',
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
      readonly: true,
      sensitive: true,
      description: 'Credential environment variables are managed in Settings → API credentials and are never shown here.',
    },
    {
      id: 'auth',
      label: 'auth.json',
      relativePath: '.codex/auth.json',
      format: 'json',
      readonly: true,
      sensitive: true,
      description: 'OAuth tokens managed by `codex login`. Read-only; editing here would corrupt the session.',
    },
  ],
  cursor: [
    {
      id: 'env',
      label: '.env',
      relativePath: '.cursor/.env',
      format: 'env',
      readonly: true,
      sensitive: true,
      description: 'Credential environment variables are managed by the Cursor CLI and are never shown here.',
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
      readonly: true,
      sensitive: true,
      description: 'Credential environment variables are managed in Settings → API credentials and are never shown here.',
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
      readonly: true,
      sensitive: true,
      description: 'Credential environment variables are managed in Settings → API credentials and are never shown here.',
    },
  ],
  opencode: [
    {
      id: 'config',
      label: 'opencode.json',
      relativePath: '.config/opencode/opencode.json',
      format: 'json',
      description: 'Main OpenCode config — provider, model, MCP servers, permission rules, agents.',
    },
    {
      id: 'tui',
      label: 'tui.json',
      relativePath: '.config/opencode/tui.json',
      format: 'json',
      description: 'Terminal UI preferences (theme, keybinds). Separate from the main config since 2026-02.',
    },
    {
      id: 'auth',
      label: 'auth.json',
      relativePath: '.local/share/opencode/auth.json',
      format: 'json',
      readonly: true,
      sensitive: true,
      description: 'Provider credentials managed by `opencode auth login`. Read-only here; editing would corrupt stored OAuth tokens.',
    },
  ],
};

export const SUPPORTED_CONFIG_PROVIDERS = Object.keys(PROVIDER_CONFIG_FILES);

// Hard cap — no config file we care about is remotely this big, but we
// want to refuse reads and writes that would swell memory. Editing a 1 MB
// settings.json is already a smell.
export const MAX_CONFIG_FILE_SIZE_BYTES = 1_048_576; // 1 MB
