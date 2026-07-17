import type { UpsertProviderMcpServerInput, ProviderMcpServer, McpScope } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';
import { McpProvider } from '@/modules/providers/shared/mcp/mcp.provider.js';

/**
 * Grok Build does not use Pixcode-managed MCP config files yet.
 * Stub keeps the provider registry complete without writing junk configs.
 */
export class GrokMcpProvider extends McpProvider {
  constructor() {
    super('grok', ['user'], ['stdio']);
  }

  protected async readScopedServers(_scope: McpScope, _workspacePath: string): Promise<Record<string, unknown>> {
    return {};
  }

  protected async writeScopedServers(
    _scope: McpScope,
    _workspacePath: string,
    _servers: Record<string, unknown>,
  ): Promise<void> {
    // no-op — Grok Build MCP is managed outside Pixcode for now
  }

  protected buildServerConfig(input: UpsertProviderMcpServerInput): Record<string, unknown> {
    if (input.transport === 'stdio') {
      if (!input.command?.trim()) {
        throw new AppError('command is required for stdio MCP servers.', {
          code: 'MCP_COMMAND_REQUIRED',
          statusCode: 400,
        });
      }
      return {
        command: input.command,
        args: input.args ?? [],
        env: input.env ?? {},
      };
    }
    throw new AppError('Grok Build MCP only supports stdio transport in this stub.', {
      code: 'MCP_TRANSPORT_UNSUPPORTED',
      statusCode: 400,
    });
  }

  protected normalizeServerConfig(
    scope: McpScope,
    name: string,
    rawConfig: unknown,
  ): ProviderMcpServer | null {
    if (!rawConfig || typeof rawConfig !== 'object') return null;
    const config = rawConfig as Record<string, unknown>;
    if (typeof config.command !== 'string') return null;
    return {
      provider: 'grok',
      name,
      scope,
      transport: 'stdio',
      command: config.command,
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      env: (config.env && typeof config.env === 'object') ? config.env as Record<string, string> : {},
    };
  }
}
