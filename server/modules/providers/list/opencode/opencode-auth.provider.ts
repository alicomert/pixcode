import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS module, typed via inference
import { getProviderCredentials } from '@/services/provider-credentials.js';

type OpencodeCredentialsStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

/**
 * OpenCode auth checker.
 *
 * OpenCode stores credentials at `~/.local/share/opencode/auth.json` (XDG
 * data dir — different layout from the other providers which use
 * `~/.<name>/`). The file is a JSON map of `providerName → { type, ... }`
 * where type is `api` (API key), `oauth` (OAuth tokens), or similar.
 *
 * Windows layout (as of the 2026 release): `%LOCALAPPDATA%\opencode\auth.json`.
 *
 * Since OpenCode is multi-provider (OpenAI, Anthropic, Google, Ollama,
 * OpenCode Zen), "authenticated" here means "at least ONE provider in
 * auth.json has credentials" — we don't care which.
 */
export class OpencodeProviderAuth implements IProviderAuth {
  private checkInstalled(): boolean {
    const cliPath = process.env.OPENCODE_CLI_PATH || 'opencode';
    try {
      const result = spawn.sync(cliPath, ['--version'], { stdio: 'ignore', timeout: 5000 });
      return !result.error && result.status === 0;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    if (!installed) {
      return {
        installed,
        provider: 'opencode',
        authenticated: false,
        email: null,
        method: null,
        error: 'OpenCode CLI is not installed',
      };
    }

    const credentials = await this.checkCredentials();

    return {
      installed,
      provider: 'opencode',
      authenticated: credentials.authenticated,
      email: credentials.email,
      method: credentials.method,
      error: credentials.authenticated ? undefined : credentials.error || 'Not authenticated',
    };
  }

  private async checkCredentials(): Promise<OpencodeCredentialsStatus> {
    // Pixcode-managed credentials come first — if the user stored an API
    // key via Settings > Agents > API Key, trust that regardless of
    // env vars or auth.json.
    try {
      const creds = await getProviderCredentials('opencode');
      if (creds?.apiKey) {
        return { authenticated: true, email: 'API Key Auth', method: 'pixcode_store' };
      }
    } catch { /* fall through */ }

    // Env-var shortcut — any of the multi-provider keys OpenCode recognises.
    const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY'];
    for (const k of envKeys) {
      if (process.env[k]?.trim()) {
        return { authenticated: true, email: `${k.replace('_API_KEY', '')} env`, method: 'api_key' };
      }
    }

    // auth.json — written by `opencode auth login`. On Windows the XDG
    // data dir typically resolves to `%LOCALAPPDATA%\opencode`, but since
    // Node's `os.homedir()` + `.local/share/opencode` covers the Linux
    // default and most WSL cases, we check both paths.
    const candidatePaths = [
      path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
      path.join(os.homedir(), 'AppData', 'Local', 'opencode', 'auth.json'),
    ];

    for (const credsPath of candidatePaths) {
      try {
        const content = await readFile(credsPath, 'utf8');
        const creds = readObjectRecord(JSON.parse(content)) ?? {};
        const providerNames = Object.keys(creds);
        if (providerNames.length > 0) {
          // Prefer a real provider label over a generic one when we can
          // identify it.
          const firstProvider = providerNames[0];
          const firstConfig = readObjectRecord(creds[firstProvider]) ?? {};
          const authType = readOptionalString(firstConfig.type) ?? 'stored';
          const label = providerNames.length === 1
            ? `${firstProvider} (${authType})`
            : `${providerNames.length} providers configured`;
          return {
            authenticated: true,
            email: label,
            method: authType === 'oauth' ? 'credentials_file' : 'api_key',
          };
        }
      } catch { /* try next path */ }
    }

    return {
      authenticated: false,
      email: null,
      method: null,
      error: 'OpenCode is not configured — run `opencode auth login`.',
    };
  }
}
