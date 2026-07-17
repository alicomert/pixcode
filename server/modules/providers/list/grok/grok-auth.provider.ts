import spawn from 'cross-spawn';

import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';

function resolveGrokBinary(): string {
  return process.env.PIXCODE_GROK_BIN
    || process.env.GROK_BIN
    || 'grok';
}

/**
 * Grok Build (xAI) auth/install checker.
 * Binary is typically `grok` from https://x.ai/cli — not an npm package.
 * "Authenticated" when the binary is present (xAI auth is handled inside the TUI).
 */
export class GrokProviderAuth implements IProviderAuth {
  private checkInstalled(): boolean {
    const cliPath = resolveGrokBinary();
    try {
      const result = spawn.sync(cliPath, ['--version'], {
        stdio: 'ignore',
        timeout: 5000,
        windowsHide: true,
        shell: process.platform === 'win32',
      });
      if (!result.error && result.status === 0) return true;
      // Some builds exit non-zero on --version but still resolve; try bare spawn help.
      const help = spawn.sync(cliPath, ['--help'], {
        stdio: 'ignore',
        timeout: 5000,
        windowsHide: true,
        shell: process.platform === 'win32',
      });
      return !help.error;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();
    if (!installed) {
      return {
        installed,
        provider: 'grok',
        authenticated: false,
        email: null,
        method: null,
        error: 'Grok Build CLI is not installed. Install from https://x.ai/cli',
      };
    }

    return {
      installed,
      provider: 'grok',
      authenticated: true,
      email: 'Grok Build',
      method: 'cli',
      error: undefined,
    };
  }
}
