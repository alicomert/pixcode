#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.PIXCODE_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.PIXCODE_API_KEY || '';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mcpServerPath = path.join(appRoot, 'scripts', 'hermes', 'pixcode-mcp-server.mjs');

const tools = [
  {
    name: 'pixcode_list_projects',
    description: 'List Pixcode workspaces/projects visible to this user, including display name, path, and file count when available.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_get_provider_status',
    description: 'Get install/auth/version status for one Pixcode CLI provider before launching it inside Pixcode.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'],
        },
      },
      required: ['provider'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_open_cli_terminal',
    description: 'Use this instead of Hermes shell/proc/skill execution whenever the user asks to open Codex, Claude, Cursor, Gemini, Qwen, or OpenCode inside Pixcode. It asks the open Pixcode workbench to open a visible provider CLI terminal in the project and can type startup input into that terminal. For multi-step, piece-by-piece, or long-running work, put the full user instruction in startupInput so the provider CLI does the work visibly inside Pixcode.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'],
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to use the currently selected Pixcode project.',
        },
        prompt: {
          type: 'string',
          description: 'Optional audit/reason text for Pixcode. This is not typed into the provider CLI.',
        },
        startupInput: {
          type: 'string',
          description: 'Exact startup input typed into the provider CLI after the TUI is ready. Use this for commands like /init, hello prompts, or full multi-step task instructions the user asked to run visibly.',
        },
        bypassPermissions: {
          type: 'boolean',
          description: 'When true, Pixcode starts the provider CLI with its strongest no-approval/bypass flags where supported. Defaults to true for Hermes-launched visible task work.',
        },
        permissionMode: {
          type: 'string',
          enum: ['default', 'bypassPermissions', 'acceptEdits', 'yolo', 'auto_edit', 'plan'],
          description: 'Optional provider permission mode. Omit to use bypassPermissions when bypassPermissions is not false.',
        },
        waitForOutputMs: {
          type: 'number',
          description: 'Optional milliseconds to wait and then read recent terminal output. Useful when the user asks you to report the provider output.',
        },
      },
      required: ['provider'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_read_cli_terminal',
    description: 'Read recent visible Pixcode provider CLI terminal output for a project. Use after pixcode_open_cli_terminal when the user asks what Codex/Claude/Gemini/Qwen/OpenCode printed.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'],
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to use the currently selected Pixcode project.',
        },
        maxChars: {
          type: 'number',
          description: 'Maximum transcript characters to return, capped by Pixcode.',
        },
      },
      required: ['provider'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_get_hermes_gateway_status',
    description: 'Read Pixcode-managed Hermes REST gateway status, including base URL, running state, and the last probe result.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to inspect all managed Hermes gateways.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_probe_hermes_gateway',
    description: 'Ask Pixcode to call Hermes Agent REST endpoints and report whether health, capabilities, and model discovery respond.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to probe the first running managed Hermes gateway.',
        },
        input: {
          type: 'string',
          description: 'Optional prompt to submit to Hermes /v1/runs after the lightweight REST checks pass.',
        },
        startIfNeeded: {
          type: 'boolean',
          description: 'When true, Pixcode starts the managed Hermes gateway before probing.',
        },
      },
      additionalProperties: false,
    },
  },
];

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function textResult(text) {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pixcodeFetch(endpoint, options = {}) {
  if (!baseUrl || !apiKey) {
    throw new Error('Pixcode MCP is missing PIXCODE_BASE_URL or PIXCODE_API_KEY.');
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`Pixcode API ${endpoint} failed with HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return body;
}

async function readProviderStatus(provider) {
  const body = await pixcodeFetch(`/api/providers/${encodeURIComponent(provider)}/auth/status?refresh=1`);
  return body?.data ?? body;
}

async function readProviderTerminalOutput(provider, projectPath, maxChars) {
  const params = new URLSearchParams({
    provider,
    maxChars: String(maxChars || 12000),
  });
  if (projectPath) params.set('projectPath', projectPath);
  return pixcodeFetch(`/api/shell/sessions/provider-output?${params.toString()}`);
}

function isLegacyPromptLikelyStartupInput(prompt) {
  if (!prompt || prompt.length > 160 || prompt.includes('\n')) return false;
  if (/^[/:!@]/u.test(prompt)) return true;
  if (prompt.includes(':')) return false;
  if (/\b(user|request|reason|audit|task|kullanıcı|kullanicinin|istek|isteği|gorev|görev|terminal|codex|claude|qwen|gemini|cursor|opencode|open|aç|ac|başlat|baslat|send|gönder|gonder)\b/iu.test(prompt)) {
    return false;
  }
  return prompt.length <= 80;
}

async function ensureProviderPixcodeMcp(provider, projectPath) {
  const body = await pixcodeFetch(`/api/providers/${encodeURIComponent(provider)}/mcp/servers`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'pixcode',
      transport: 'stdio',
      scope: 'project',
      workspacePath: projectPath || process.cwd(),
      command: process.execPath,
      args: [mcpServerPath],
      env: {
        PIXCODE_BASE_URL: baseUrl,
        PIXCODE_API_KEY: apiKey,
      },
    }),
  });
  return body?.data?.server ?? body?.server ?? body;
}

async function callTool(name, args = {}) {
  if (name === 'pixcode_list_projects') {
    const projects = await pixcodeFetch('/api/projects');
    const normalized = (Array.isArray(projects) ? projects : []).map((project) => ({
      name: project.name,
      displayName: project.displayName,
      path: project.fullPath || project.path,
      fileCount: project.fileCount ?? null,
    }));
    return textResult(JSON.stringify(normalized, null, 2));
  }

  if (name === 'pixcode_get_provider_status') {
    const provider = String(args.provider || '');
    const status = await readProviderStatus(provider);
    return textResult(JSON.stringify(status, null, 2));
  }

  if (name === 'pixcode_open_cli_terminal') {
    const provider = String(args.provider || '');
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? args.projectPath.trim()
      : null;
    const status = await readProviderStatus(provider);
    if (status?.installed === false) {
      return textResult(JSON.stringify({
        launched: false,
        provider,
        reason: 'not_installed',
        message: `${provider} CLI is not installed. Install it in Pixcode before launching a terminal.`,
        status,
      }, null, 2));
    }

    let mcpConfigured = false;
    let mcpError = null;
    try {
      await ensureProviderPixcodeMcp(provider, projectPath);
      mcpConfigured = true;
    } catch (error) {
      mcpError = error instanceof Error ? error.message : String(error);
    }

    const startupInput = typeof args.startupInput === 'string' && args.startupInput.trim()
      ? args.startupInput
      : (isLegacyPromptLikelyStartupInput(args.prompt) ? args.prompt.trim() : null);
    const bypassPermissions = args.bypassPermissions === false ? false : true;
    const permissionMode = typeof args.permissionMode === 'string' && args.permissionMode.trim()
      ? args.permissionMode.trim()
      : (bypassPermissions ? 'bypassPermissions' : null);

    const body = await pixcodeFetch('/api/orchestration/hermes/terminal-launches', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        projectPath,
        prompt: args.prompt || null,
        startupInput,
        bypassPermissions,
        skipPermissions: bypassPermissions,
        permissionMode,
      }),
    });
    let terminalOutput = null;
    const waitForOutputMs = Math.min(15000, Math.max(0, Number(args.waitForOutputMs || 0)));
    if (waitForOutputMs > 0) {
      const startedAt = Date.now();
      do {
        await sleep(Math.min(1000, Math.max(250, waitForOutputMs)));
        terminalOutput = await readProviderTerminalOutput(provider, projectPath, 12000).catch((error) => ({
          active: false,
          error: error instanceof Error ? error.message : String(error),
        }));
        if (terminalOutput?.active && terminalOutput?.output) break;
      } while (Date.now() - startedAt < waitForOutputMs);
    }
    return textResult(JSON.stringify({
      launched: true,
      pixcodeMcpConfigured: mcpConfigured,
      pixcodeMcpError: mcpError,
      event: body?.event ?? body,
      permissionBypass: bypassPermissions,
      status,
      terminalOutput,
    }, null, 2));
  }

  if (name === 'pixcode_read_cli_terminal') {
    const provider = String(args.provider || '');
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? args.projectPath.trim()
      : null;
    const maxChars = Math.min(20000, Math.max(1000, Number(args.maxChars || 12000)));
    const body = await readProviderTerminalOutput(provider, projectPath, maxChars);
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_get_hermes_gateway_status') {
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? `?projectPath=${encodeURIComponent(args.projectPath.trim())}`
      : '';
    const body = await pixcodeFetch(`/api/orchestration/hermes/gateway/status${projectPath}`);
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_probe_hermes_gateway') {
    const body = await pixcodeFetch('/api/orchestration/hermes/gateway/probe', {
      method: 'POST',
      body: JSON.stringify({
        projectPath: args.projectPath || null,
        input: args.input || null,
        startIfNeeded: args.startIfNeeded === true,
      }),
    });
    return textResult(JSON.stringify(body, null, 2));
  }

  throw new Error(`Unknown Pixcode MCP tool: ${name}`);
}

async function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'pixcode-mcp',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools },
    });
    return;
  }

  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      send({
        jsonrpc: '2.0',
        id: message.id,
        result,
      });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return;
  }

  if (typeof message.id !== 'undefined') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${message.method}`,
      },
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

rl.on('line', (line) => {
  if (!line.trim()) return;

  void (async () => {
    try {
      await handleMessage(JSON.parse(line));
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  })();
});
