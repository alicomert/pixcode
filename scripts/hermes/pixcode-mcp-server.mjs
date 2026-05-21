#!/usr/bin/env node
import readline from 'node:readline';

const baseUrl = (process.env.PIXCODE_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.PIXCODE_API_KEY || '';

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
    description: 'Get install/auth/version status for one Pixcode CLI provider.',
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
    description: 'Ask the open Pixcode workbench to open a visible CLI terminal for a provider in a project.',
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
          description: 'Optional short reason shown to Pixcode for audit/display.',
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
    const body = await pixcodeFetch(`/api/providers/${encodeURIComponent(provider)}/auth/status?refresh=1`);
    return textResult(JSON.stringify(body?.data ?? body, null, 2));
  }

  if (name === 'pixcode_open_cli_terminal') {
    const body = await pixcodeFetch('/api/orchestration/hermes/terminal-launches', {
      method: 'POST',
      body: JSON.stringify({
        provider: args.provider,
        projectPath: args.projectPath || null,
        prompt: args.prompt || null,
      }),
    });
    return textResult(JSON.stringify(body?.event ?? body, null, 2));
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
