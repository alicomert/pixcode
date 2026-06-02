#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.PIXCODE_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.PIXCODE_API_KEY || '';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mcpServerPath = path.join(appRoot, 'scripts', 'hermes', 'pixcode-mcp-server.mjs');
const READBACK_IDLE_STABLE_MS = Math.max(
  1000,
  Number.parseInt(process.env.PIXCODE_MCP_READBACK_IDLE_STABLE_MS || '8000', 10) || 8000,
);
const DEFAULT_STARTUP_WAIT_MS = 100000;
const ALLOWED_PIXCODE_API_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

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
    description: 'Use this instead of Hermes shell/proc/skill execution whenever the user asks to open Codex, Claude, Cursor, Gemini, Qwen, or OpenCode inside Pixcode. It asks the open Pixcode workbench to continue the existing visible provider terminal in the project and submit startup input there. Do not run a parallel Hermes codex/claude/proc command for the same request. Do not request a fresh session unless the user explicitly asks for a new session. For multi-step, piece-by-piece, or long-running work, put the full user instruction in startupInput so the provider CLI does the work visibly inside Pixcode. When startupInput is present, Pixcode waits for the terminal to become idle before returning readback by default; never treat the first working frame as final output.',
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
        forceNewSession: {
          type: 'boolean',
          description: 'Start a fresh visible provider CLI session only when the user explicitly asks for a new session. Omit or false to continue the existing visible provider terminal.',
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
          description: 'Optional milliseconds to wait for recent terminal output. Pixcode keeps polling while terminalState is busy, so use a large value when the user asks for the final provider answer.',
        },
        waitForCompletionMs: {
          type: 'number',
          description: 'Optional explicit milliseconds to wait for the visible provider CLI to return to an idle prompt before reporting output. Overrides waitForOutputMs.',
        },
        launchId: {
          type: 'number',
          description: 'Optional Pixcode terminal launch id. Use the id returned by pixcode_open_cli_terminal when reading one specific visible terminal.',
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
    description: 'Ask Pixcode to call Hermes Agent REST endpoints and report whether health, capabilities, model discovery, and an optional real prompt respond.',
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
  {
    name: 'pixcode_get_hermes_diagnostics',
    description: 'Read Pixcode Hermes integration diagnostics: installed command, active model/provider, Hermes toolsets, Pixcode MCP tool registration, REST gateway status, cron API state, and redacted recent error signals.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to diagnose the first running managed Hermes gateway and default Hermes profile.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_get_hermes_control_plane',
    description: 'Read the full Pixcode Hermes control-plane snapshot: install status, managed/source Hermes homes, workspace gateways, profiles, sessions, cron jobs, MCP readiness, capabilities, diagnostics, and recommended fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to inspect all managed Hermes gateways and the active/default Hermes profile.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_repair_hermes_control_plane',
    description: 'Ask Pixcode to repair Hermes control-plane wiring by starting or replacing the managed gateway and rewriting Pixcode MCP config for the workspace. Use forceRestart only when stale tools or an unhealthy gateway must be replaced.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute project path for the managed Hermes gateway.',
        },
        forceRestart: {
          type: 'boolean',
          description: 'Stop and restart the managed Hermes gateway before repairing MCP config.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_get_api_manifest',
    description: 'Read Pixcode public API documentation manifest. Use this to discover controllable Pixcode API groups, paths, and scopes before calling pixcode_api_request.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_api_request',
    description: 'Call the authenticated local Pixcode REST API. Use this for full Pixcode control after reading pixcode_get_api_manifest. Path must be a local /api/... path or /health; never pass an external URL.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method to use.',
        },
        path: {
          type: 'string',
          description: 'Local Pixcode path, for example /api/projects, /api/providers/codex/auth/status?refresh=1, or /api/remote/config.',
        },
        body: {
          type: 'object',
          description: 'Optional JSON body for POST, PUT, PATCH, or DELETE requests.',
          additionalProperties: true,
        },
      },
      required: ['method', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_hermes_gateway_request',
    description: 'Call the Pixcode-managed Hermes REST gateway for advanced Hermes features such as /v1/runs, /v1/responses, /api/jobs cron management, /v1/capabilities, and /health. Use startIfNeeded when the gateway is not already running.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        endpoint: {
          type: 'string',
          description: 'Hermes gateway endpoint, for example /api/jobs, /api/jobs/<id>/run, /v1/capabilities, or /v1/responses.',
        },
        body: {
          type: 'object',
          additionalProperties: true,
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project path for the managed Hermes gateway.',
        },
        startIfNeeded: {
          type: 'boolean',
          description: 'Start the managed Hermes gateway first when it is not already running.',
        },
      },
      required: ['method', 'endpoint'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_manage_hermes_cron',
    description: 'Create, list, update, pause, resume, run, or delete Hermes cron jobs through the Pixcode-managed Hermes REST gateway. Cron jobs can run in a project workdir and use Hermes skills/toolsets.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'get', 'update', 'delete', 'pause', 'resume', 'run'],
        },
        jobId: {
          type: 'string',
          description: 'Required for get, update, delete, pause, resume, and run.',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project path for the managed Hermes gateway and default cron workdir.',
        },
        name: { type: 'string' },
        schedule: { type: 'string' },
        prompt: { type: 'string' },
        workdir: { type: 'string' },
        skills: {
          type: 'array',
          items: { type: 'string' },
        },
        delivery: { type: 'string' },
        startIfNeeded: { type: 'boolean' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixcode_send_cli_input',
    description: 'Send text or an Enter key directly to an existing visible Pixcode provider terminal. Use this when a terminal is already open and the user asks Hermes to continue that exact visible session.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'],
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project path. Omit to use the newest visible terminal for the provider.',
        },
        input: {
          type: 'string',
          description: 'Text to type. May be empty when submit=true to press Enter on already typed input.',
        },
        submit: {
          type: 'boolean',
          description: 'Append Enter after input. Defaults to true.',
        },
        launchId: {
          type: 'number',
          description: 'Optional Pixcode terminal launch id to target one visible terminal.',
        },
      },
      required: ['provider'],
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

function normalizeLocalPixcodePath(pathValue) {
  const endpoint = typeof pathValue === 'string' ? pathValue.trim() : '';
  if (!endpoint) {
    throw new Error('Pixcode API path is required.');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(endpoint) || endpoint.startsWith('//')) {
    throw new Error('Pixcode API path must be local; external URLs are not allowed.');
  }
  if (endpoint !== '/health' && !endpoint.startsWith('/api/')) {
    throw new Error('Pixcode API path must start with /api/ or be /health.');
  }
  return endpoint;
}

function normalizeHermesGatewayEndpoint(endpointValue) {
  const endpoint = typeof endpointValue === 'string' ? endpointValue.trim() : '';
  if (!endpoint) {
    throw new Error('Hermes gateway endpoint is required.');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(endpoint) || endpoint.startsWith('//')) {
    throw new Error('Hermes gateway endpoint must be local; external URLs are not allowed.');
  }
  if (!endpoint.startsWith('/')) {
    throw new Error('Hermes gateway endpoint must start with /.');
  }
  if (
    endpoint !== '/health' &&
    endpoint !== '/health/detailed' &&
    !endpoint.startsWith('/v1/') &&
    !endpoint.startsWith('/api/')
  ) {
    throw new Error('Hermes gateway endpoint must be /health, /v1/..., or /api/....');
  }
  return endpoint;
}

function normalizeHttpMethod(methodValue) {
  const method = String(methodValue || 'GET').trim().toUpperCase();
  if (!ALLOWED_PIXCODE_API_METHODS.has(method)) {
    throw new Error(`Unsupported HTTP method: ${method || '(empty)'}`);
  }
  return method;
}

async function pixcodeJsonRequest(pathValue, { method = 'GET', body } = {}) {
  const endpoint = normalizeLocalPixcodePath(pathValue);
  const normalizedMethod = normalizeHttpMethod(method);
  const requestOptions = { method: normalizedMethod };
  if (typeof body !== 'undefined' && normalizedMethod !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }
  return pixcodeFetch(endpoint, requestOptions);
}

async function sendProviderTerminalInput(provider, projectPath, input, submit = true, launchId = null) {
  return pixcodeFetch('/api/shell/sessions/provider-input', {
    method: 'POST',
    body: JSON.stringify({
      provider,
      projectPath: projectPath || null,
      input: typeof input === 'string' ? input : '',
      submit: submit !== false,
      launchId: Number(launchId || 0) || null,
    }),
  });
}

async function readProviderStatus(provider) {
  const body = await pixcodeFetch(`/api/providers/${encodeURIComponent(provider)}/auth/status?refresh=1`);
  return body?.data ?? body;
}

async function readProviderTerminalOutput(provider, projectPath, maxChars, launchId = null) {
  const params = new URLSearchParams({
    provider,
    maxChars: String(maxChars || 12000),
  });
  if (projectPath) params.set('projectPath', projectPath);
  if (launchId) params.set('launchId', String(launchId));
  return pixcodeFetch(`/api/shell/sessions/provider-output?${params.toString()}`);
}

function getLastMatchIndex(text, pattern) {
  let lastIndex = -1;
  for (const match of text.matchAll(pattern)) {
    lastIndex = match.index ?? lastIndex;
  }
  return lastIndex;
}

function inferTerminalState(provider, terminalOutput) {
  if (!terminalOutput) return 'unknown';
  if (typeof terminalOutput.terminalState === 'string') return terminalOutput.terminalState;
  if (typeof terminalOutput.isBusy === 'boolean') return terminalOutput.isBusy ? 'busy' : 'idle';
  if (terminalOutput.active === false) return terminalOutput.output ? 'idle' : 'unknown';

  const output = String(terminalOutput.output || '');
  if (!output.trim()) return 'unknown';
  if (/Process exited with code/iu.test(output)) return 'idle';

  const lastWeakBusy = getLastMatchIndex(output, /(?:^|\n)\s*[•*]\s*(?:Working|Running|Thinking)\b/giu);
  const lastStrongBusy = Math.max(
    getLastMatchIndex(output, /\bWorking\s*\([^)]*esc to interrupt[^)]*\)/giu),
    getLastMatchIndex(output, /\bmsg=interrupt\b/giu),
  );
  const lastBusy = Math.max(lastWeakBusy, lastStrongBusy);

  if (provider === 'codex') {
    const lastPrompt = Math.max(
      getLastMatchIndex(output, /(?:^|\n)\s*›(?:\s|$)/gu),
      getLastMatchIndex(output, /(?:^|\n)\s*❯(?:\s|$)/gu),
    );
    if (lastPrompt >= 0) return lastStrongBusy > lastPrompt ? 'busy' : 'idle';
    if (lastBusy >= 0) return 'busy';
    return 'unknown';
  }

  if (lastBusy >= 0) return 'busy';
  return 'unknown';
}

function isTerminalReadbackFinal(provider, terminalOutput) {
  const terminalState = inferTerminalState(provider, terminalOutput);
  return terminalState === 'idle' || terminalState === 'completed' || terminalState === 'exited' || terminalState === 'failed';
}

function isTerminalReadbackHardFinal(provider, terminalOutput) {
  const terminalState = inferTerminalState(provider, terminalOutput);
  return terminalState === 'completed' || terminalState === 'exited' || terminalState === 'failed' || Boolean(terminalOutput?.terminalFailed);
}

function getReadbackFingerprint(terminalOutput) {
  return [
    terminalOutput?.terminalState || '',
    terminalOutput?.lifecycleState || '',
    terminalOutput?.exitCode ?? '',
    terminalOutput?.exitSignal || '',
    String(terminalOutput?.output || '').slice(-12000),
  ].join('\n---pixcode-readback---\n');
}

function outputHasProviderPrompt(provider, output) {
  const text = String(output || '');
  if (provider === 'codex') {
    return /(?:^|\n)\s*[›❯]\s*$/u.test(text) || /(?:^|\n)\s*›\s+[^\n]*$/u.test(text);
  }
  return /(?:^|\n).{0,80}(?:>\s*|❯\s*)$/u.test(text);
}

function startupInputLooksStuckAtPrompt(provider, terminalOutput, startupInput) {
  if (!startupInput || !terminalOutput?.output || terminalOutput.isBusy) return false;
  const output = String(terminalOutput.output || '');
  const escapedInput = startupInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (provider === 'codex') {
    return new RegExp(`(?:^|\\n)\\s*[›❯]\\s*${escapedInput}\\s*$`, 'u').test(output);
  }
  return output.endsWith(startupInput) || outputHasProviderPrompt(provider, output);
}

async function recoverStuckStartupInput(provider, projectPath, startupInput, terminalOutput, launchId = null) {
  if (!startupInputLooksStuckAtPrompt(provider, terminalOutput, startupInput)) {
    return null;
  }

  const output = String(terminalOutput?.output || '');
  const inputAlreadyVisible = output.includes(startupInput);
  return sendProviderTerminalInput(
    provider,
    projectPath,
    inputAlreadyVisible ? '' : startupInput,
    true,
    launchId,
  );
}

async function waitForProviderTerminalOutput(provider, projectPath, waitMs, launchId = null) {
  const startedAt = Date.now();
  let latestOutput = null;
  let stableFingerprint = null;
  let stableSince = 0;
  let stableFinal = false;
  do {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, waitMs - elapsed);
    await sleep(Math.min(1000, Math.max(250, remaining)));
    latestOutput = await readProviderTerminalOutput(provider, projectPath, 12000, launchId).catch((error) => ({
      active: false,
      terminalState: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    }));

    if (latestOutput?.output && isTerminalReadbackFinal(provider, latestOutput)) {
      if (isTerminalReadbackHardFinal(provider, latestOutput)) {
        stableFinal = true;
        break;
      }

      const fingerprint = getReadbackFingerprint(latestOutput);
      if (fingerprint !== stableFingerprint) {
        stableFingerprint = fingerprint;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince >= READBACK_IDLE_STABLE_MS) {
        stableFinal = true;
        break;
      }
    } else {
      stableFingerprint = null;
      stableSince = 0;
    }
  } while (Date.now() - startedAt < waitMs);

  if (latestOutput && !latestOutput.terminalState) {
    latestOutput.terminalState = inferTerminalState(provider, latestOutput);
  }
  if (latestOutput && typeof latestOutput.isBusy !== 'boolean') {
    latestOutput.isBusy = latestOutput.terminalState === 'busy';
  }
  if (latestOutput) {
    latestOutput.readbackStable = stableFinal;
    latestOutput.terminalOutputFinal = stableFinal;
  }
  return latestOutput;
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

async function upsertProviderPixcodeMcp(provider, projectPath, scope) {
  const body = await pixcodeFetch(`/api/providers/${encodeURIComponent(provider)}/mcp/servers`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'pixcode',
      transport: 'stdio',
      scope,
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

async function ensureProviderPixcodeMcp(provider, projectPath) {
  try {
    const server = await upsertProviderPixcodeMcp(provider, projectPath, 'project');
    return { scope: 'project', server, projectScopeError: null };
  } catch (error) {
    const projectScopeError = error instanceof Error ? error.message : String(error);
    try {
      const server = await upsertProviderPixcodeMcp(provider, projectPath, 'user');
      return { scope: 'user', server, projectScopeError };
    } catch (fallbackError) {
      const userScopeError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Pixcode MCP auto-config failed for project scope (${projectScopeError}) and user scope (${userScopeError})`);
    }
  }
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
    let mcpConfig = null;
    let mcpError = null;
    try {
      mcpConfig = await ensureProviderPixcodeMcp(provider, projectPath);
      mcpConfigured = true;
    } catch (error) {
      mcpError = error instanceof Error ? error.message : String(error);
    }

    const startupInput = typeof args.startupInput === 'string' && args.startupInput.trim()
      ? args.startupInput
      : (isLegacyPromptLikelyStartupInput(args.prompt) ? args.prompt.trim() : null);
    const bypassPermissions = args.bypassPermissions === false ? false : true;
    const forceNewSession = args.forceNewSession === true || args.newSession === true || args.freshSession === true;
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
        forceNewSession,
        bypassPermissions,
        skipPermissions: bypassPermissions,
        permissionMode,
      }),
    });
    const launchId = Number(body?.event?.id || body?.id || 0) || null;
    let terminalOutput = null;
    const defaultWaitMs = startupInput ? DEFAULT_STARTUP_WAIT_MS : 0;
    const requestedWaitMs = Number(args.waitForCompletionMs ?? args.waitForOutputMs ?? defaultWaitMs);
    const waitForOutputMs = Math.min(600000, Math.max(0, requestedWaitMs));
    if (waitForOutputMs > 0) {
      terminalOutput = await waitForProviderTerminalOutput(provider, projectPath, waitForOutputMs, launchId);
      if (startupInput && terminalOutput && !isTerminalReadbackFinal(provider, terminalOutput)) {
        const recovery = await recoverStuckStartupInput(provider, projectPath, startupInput, terminalOutput, launchId).catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
        if (recovery) {
          const recoveredOutput = await waitForProviderTerminalOutput(provider, projectPath, Math.min(waitForOutputMs, 120000), launchId);
          terminalOutput = recoveredOutput || terminalOutput;
          if (terminalOutput) {
            terminalOutput.startupInputRecovery = recovery;
          }
        }
      }
    }
    const terminalOutputFinal = terminalOutput
      ? Boolean(terminalOutput.terminalOutputFinal ?? isTerminalReadbackFinal(provider, terminalOutput))
      : false;
    return textResult(JSON.stringify({
      launched: true,
      launchId,
      pixcodeMcpConfigured: mcpConfigured,
      pixcodeMcpScope: mcpConfig?.scope ?? null,
      pixcodeMcpProjectScopeError: mcpConfig?.projectScopeError ?? null,
      pixcodeMcpError: mcpError,
      event: body?.event ?? body,
      permissionBypass: bypassPermissions,
      status,
      terminalOutputFinal,
      terminalFailed: Boolean(terminalOutput?.terminalFailed),
      message: terminalOutput && !terminalOutputFinal
        ? 'Provider terminal is still running or not at an idle prompt yet. Do not summarize this as final output; call pixcode_read_cli_terminal with launchId later.'
        : terminalOutput?.terminalFailed
          ? 'Provider terminal exited with a failure. Do not report this as successful; tell the user the visible CLI failed and include the exit code/output.'
        : undefined,
      terminalOutput,
    }, null, 2));
  }

  if (name === 'pixcode_read_cli_terminal') {
    const provider = String(args.provider || '');
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? args.projectPath.trim()
      : null;
    const maxChars = Math.min(20000, Math.max(1000, Number(args.maxChars || 12000)));
    const launchId = Number(args.launchId || 0) || null;
    const body = await readProviderTerminalOutput(provider, projectPath, maxChars, launchId);
    if (body && !body.terminalState) {
      body.terminalState = inferTerminalState(provider, body);
    }
    if (body && typeof body.isBusy !== 'boolean') {
      body.isBusy = body.terminalState === 'busy';
    }
    body.terminalOutputFinal = isTerminalReadbackFinal(provider, body);
    body.terminalFailed = Boolean(body.terminalFailed);
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

  if (name === 'pixcode_get_hermes_diagnostics') {
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? `?projectPath=${encodeURIComponent(args.projectPath.trim())}`
      : '';
    const body = await pixcodeFetch(`/api/orchestration/hermes/diagnostics${projectPath}`);
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_get_hermes_control_plane') {
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? `?projectPath=${encodeURIComponent(args.projectPath.trim())}`
      : '';
    const body = await pixcodeFetch(`/api/orchestration/hermes/control-plane${projectPath}`);
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_repair_hermes_control_plane') {
    const body = await pixcodeFetch('/api/orchestration/hermes/control-plane/repair', {
      method: 'POST',
      body: JSON.stringify({
        projectPath: args.projectPath || null,
        forceRestart: args.forceRestart === true,
      }),
    });
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_get_api_manifest') {
    const body = await pixcodeJsonRequest('/api/public/manifest', { method: 'GET' });
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_api_request') {
    const body = await pixcodeJsonRequest(args.path, {
      method: args.method || 'GET',
      body: args.body,
    });
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_hermes_gateway_request') {
    const endpoint = normalizeHermesGatewayEndpoint(args.endpoint);
    const body = await pixcodeFetch('/api/orchestration/hermes/gateway/request', {
      method: 'POST',
      body: JSON.stringify({
        method: normalizeHttpMethod(args.method || 'GET'),
        endpoint,
        body: args.body || null,
        projectPath: args.projectPath || null,
        startIfNeeded: args.startIfNeeded === true,
      }),
    });
    return textResult(JSON.stringify(body, null, 2));
  }

  if (name === 'pixcode_manage_hermes_cron') {
    const action = String(args.action || '').trim();
    const jobId = typeof args.jobId === 'string' && args.jobId.trim() ? args.jobId.trim() : null;
    const jobBody = {
      name: args.name || undefined,
      schedule: args.schedule || undefined,
      prompt: args.prompt || undefined,
      workdir: args.workdir || args.projectPath || undefined,
      skills: Array.isArray(args.skills) ? args.skills : undefined,
      delivery: args.delivery || undefined,
    };
    Object.keys(jobBody).forEach((key) => {
      if (typeof jobBody[key] === 'undefined') delete jobBody[key];
    });

    let method = 'GET';
    let endpoint = '/api/jobs';
    let body = null;
    if (action === 'create') {
      method = 'POST';
      body = jobBody;
    } else if (action === 'list') {
      method = 'GET';
    } else {
      if (!jobId) throw new Error(`jobId is required for Hermes cron action "${action}".`);
      const encodedJobId = encodeURIComponent(jobId);
      if (action === 'get') {
        method = 'GET';
        endpoint = `/api/jobs/${encodedJobId}`;
      } else if (action === 'update') {
        method = 'PATCH';
        endpoint = `/api/jobs/${encodedJobId}`;
        body = jobBody;
      } else if (action === 'delete') {
        method = 'DELETE';
        endpoint = `/api/jobs/${encodedJobId}`;
      } else if (action === 'pause' || action === 'resume' || action === 'run') {
        method = 'POST';
        endpoint = `/api/jobs/${encodedJobId}/${action}`;
      } else {
        throw new Error(`Unsupported Hermes cron action: ${action || '(empty)'}`);
      }
    }

    const response = await pixcodeFetch('/api/orchestration/hermes/gateway/request', {
      method: 'POST',
      body: JSON.stringify({
        method,
        endpoint,
        body,
        projectPath: args.projectPath || args.workdir || null,
        startIfNeeded: args.startIfNeeded !== false,
      }),
    });
    return textResult(JSON.stringify(response, null, 2));
  }

  if (name === 'pixcode_send_cli_input') {
    const provider = String(args.provider || '');
    const projectPath = typeof args.projectPath === 'string' && args.projectPath.trim()
      ? args.projectPath.trim()
      : null;
    const body = await sendProviderTerminalInput(
      provider,
      projectPath,
      typeof args.input === 'string' ? args.input : '',
      args.submit !== false,
      Number(args.launchId || 0) || null,
    );
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
