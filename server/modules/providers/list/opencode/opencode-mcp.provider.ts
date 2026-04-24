import os from 'node:os';
import path from 'node:path';

import { McpProvider } from '@/modules/providers/shared/mcp/mcp.provider.js';
import type { McpScope, ProviderMcpServer, UpsertProviderMcpServerInput } from '@/shared/types.js';
import {
  AppError,
  readJsonConfig,
  readObjectRecord,
  readOptionalString,
  readStringArray,
  readStringRecord,
  writeJsonConfig,
} from '@/shared/utils.js';

/**
 * OpenCode MCP provider.
 *
 * OpenCode's MCP servers live under the top-level `mcp` key in
 * `opencode.json` (global at `~/.config/opencode/opencode.json`, project at
 * `<workspace>/opencode.json`). Each entry is either a local stdio command
 * (`{ command, args, env }`) or a remote server (`{ type: "remote", url,
 * headers, enabled }`). OpenCode's schema also supports an `enabled: false`
 * flag we preserve on write but don't surface in the UI yet.
 */
export class OpencodeMcpProvider extends McpProvider {
  constructor() {
    super('opencode', ['user', 'project'], ['stdio', 'http', 'sse']);
  }

  protected async readScopedServers(scope: McpScope, workspacePath: string): Promise<Record<string, unknown>> {
    const filePath = scope === 'user'
      ? path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
      : path.join(workspacePath, 'opencode.json');
    const config = await readJsonConfig(filePath);
    return readObjectRecord(config.mcp) ?? {};
  }

  protected async writeScopedServers(
    scope: McpScope,
    workspacePath: string,
    servers: Record<string, unknown>,
  ): Promise<void> {
    const filePath = scope === 'user'
      ? path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
      : path.join(workspacePath, 'opencode.json');
    const config = await readJsonConfig(filePath);
    config.mcp = servers;
    await writeJsonConfig(filePath, config);
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
        type: 'local',
        command: input.command,
        args: input.args ?? [],
        env: input.env ?? {},
        cwd: input.cwd,
        enabled: true,
      };
    }

    if (!input.url?.trim()) {
      throw new AppError('url is required for http/sse MCP servers.', {
        code: 'MCP_URL_REQUIRED',
        statusCode: 400,
      });
    }

    return {
      type: 'remote',
      url: input.url,
      headers: input.headers ?? {},
      enabled: true,
    };
  }

  protected normalizeServerConfig(
    scope: McpScope,
    name: string,
    rawConfig: unknown,
  ): ProviderMcpServer | null {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const config = rawConfig as Record<string, unknown>;
    const opencodeType = readOptionalString(config.type);

    // Local (stdio) entries — either type: "local" explicitly or any entry
    // with a command field (pre-type schemas).
    if (opencodeType === 'local' || typeof config.command === 'string') {
      return {
        provider: 'opencode',
        name,
        scope,
        transport: 'stdio',
        command: typeof config.command === 'string' ? config.command : '',
        args: readStringArray(config.args),
        env: readStringRecord(config.env),
        cwd: readOptionalString(config.cwd),
      };
    }

    // Remote entries — type: "remote" or any entry with a url field.
    if (opencodeType === 'remote' || typeof config.url === 'string') {
      return {
        provider: 'opencode',
        name,
        scope,
        transport: 'http',
        url: typeof config.url === 'string' ? config.url : '',
        headers: readStringRecord(config.headers),
      };
    }

    return null;
  }
}
