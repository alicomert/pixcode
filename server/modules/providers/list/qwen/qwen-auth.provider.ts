import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

type QwenCredentialsStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

/**
 * Qwen Code auth checker.
 *
 * Qwen supports three credential surfaces — in priority order:
 *   1. `QWEN_API_KEY` env var (classic API key)
 *   2. `OPENAI_API_KEY` + `OPENAI_BASE_URL` env vars (OpenAI-compatible BYOK
 *      — what the docs recommend for ModelScope, OpenRouter, and self-hosted)
 *   3. Local OAuth tokens at `~/.qwen/oauth_creds.json` (Qwen OAuth /
 *      Alibaba Cloud Coding Plan cached credentials)
 *   4. `~/.qwen/settings.json` with an embedded `auth.method` + API key
 */
export class QwenProviderAuth implements IProviderAuth {
  private checkInstalled(): boolean {
    const cliPath = process.env.QWEN_PATH || 'qwen';
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
        provider: 'qwen',
        authenticated: false,
        email: null,
        method: null,
        error: 'Qwen Code CLI is not installed',
      };
    }

    const credentials = await this.checkCredentials();

    return {
      installed,
      provider: 'qwen',
      authenticated: credentials.authenticated,
      email: credentials.email,
      method: credentials.method,
      error: credentials.authenticated ? undefined : credentials.error || 'Not authenticated',
    };
  }

  private async checkCredentials(): Promise<QwenCredentialsStatus> {
    if (process.env.QWEN_API_KEY?.trim()) {
      return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
    }
    if (process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_BASE_URL?.trim()) {
      return { authenticated: true, email: 'OpenAI-Compatible Auth', method: 'api_key' };
    }

    // OAuth credentials file — written by `/auth` interactive flow.
    try {
      const credsPath = path.join(os.homedir(), '.qwen', 'oauth_creds.json');
      const content = await readFile(credsPath, 'utf8');
      const creds = readObjectRecord(JSON.parse(content)) ?? {};
      const accessToken = readOptionalString(creds.access_token);
      if (accessToken) {
        const email = readOptionalString(creds.email)
          ?? readOptionalString(creds.user_email)
          ?? 'OAuth Session';
        return { authenticated: true, email, method: 'credentials_file' };
      }
    } catch { /* fall through to settings.json */ }

    // settings.json — the API-key / OpenAI-compat authoring path.
    try {
      const settingsPath = path.join(os.homedir(), '.qwen', 'settings.json');
      const content = await readFile(settingsPath, 'utf8');
      const settings = readObjectRecord(JSON.parse(content)) ?? {};
      const auth = readObjectRecord(settings.auth) ?? {};
      const method = readOptionalString(auth.method) ?? readOptionalString(settings.authMethod);
      const apiKey = readOptionalString(auth.apiKey) ?? readOptionalString(settings.apiKey);

      if (apiKey) {
        return {
          authenticated: true,
          email: method ? `${method} (settings.json)` : 'API Key Auth',
          method: 'settings_file',
        };
      }

      if (method && method.toLowerCase().includes('oauth')) {
        // Settings file says OAuth is configured but the creds file isn't
        // readable — treat as a soft "not authenticated yet" rather than an
        // install error, because the browser flow may be mid-flight.
        return {
          authenticated: false,
          email: null,
          method: 'credentials_file',
          error: 'OAuth not yet complete — run `qwen` and finish `/auth`.',
        };
      }
    } catch { /* no settings yet */ }

    return {
      authenticated: false,
      email: null,
      method: null,
      error: 'Qwen Code is not configured',
    };
  }
}
