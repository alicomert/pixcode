import express, { type Request, type Response } from 'express';

import { providerAuthService } from '@/modules/providers/services/provider-auth.service.js';
import { providerMcpService } from '@/modules/providers/services/mcp.service.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS service, typed via inference
import {
  applyProviderCredentialsToEnv,
  listProviderCredentialSummaries,
  setProviderCredentials,
  PROVIDER_ENV_VARS,
} from '@/services/provider-credentials.js';
import type { LLMProvider, McpScope, McpTransport, UpsertProviderMcpServerInput } from '@/shared/types.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import http from 'node:http';
import { spawn } from 'node:child_process';

/**
 * npm-global install command per provider. Used by POST
 * /api/providers/:p/install to run the install directly from Pixcode so
 * users don't have to drop into a shell just to get a CLI on the host.
 * Cursor uses its own install script, not npm.
 */
const PROVIDER_INSTALL_COMMANDS: Record<LLMProvider, string | null> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  qwen: 'npm install -g @qwen-code/qwen-code',
  // Cursor's installer is a bash script hosted at cursor.com; safer to
  // ask users to run it themselves rather than pipe-to-bash from our
  // server process.
  cursor: null,
};

const router = express.Router();

const readPathParam = (value: unknown, name: string): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  throw new AppError(`${name} path parameter is invalid.`, {
    code: 'INVALID_PATH_PARAMETER',
    statusCode: 400,
  });
};

const normalizeProviderParam = (value: unknown): string =>
  readPathParam(value, 'provider').trim().toLowerCase();

const readOptionalQueryString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseMcpScope = (value: unknown): McpScope | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = readOptionalQueryString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'user' || normalized === 'local' || normalized === 'project') {
    return normalized;
  }

  throw new AppError(`Unsupported MCP scope "${normalized}".`, {
    code: 'INVALID_MCP_SCOPE',
    statusCode: 400,
  });
};

const parseMcpTransport = (value: unknown): McpTransport => {
  const normalized = readOptionalQueryString(value);
  if (!normalized) {
    throw new AppError('transport is required.', {
      code: 'MCP_TRANSPORT_REQUIRED',
      statusCode: 400,
    });
  }

  if (normalized === 'stdio' || normalized === 'http' || normalized === 'sse') {
    return normalized;
  }

  throw new AppError(`Unsupported MCP transport "${normalized}".`, {
    code: 'INVALID_MCP_TRANSPORT',
    statusCode: 400,
  });
};

const parseMcpUpsertPayload = (payload: unknown): UpsertProviderMcpServerInput => {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const body = payload as Record<string, unknown>;
  const name = readOptionalQueryString(body.name);
  if (!name) {
    throw new AppError('name is required.', {
      code: 'MCP_NAME_REQUIRED',
      statusCode: 400,
    });
  }

  const transport = parseMcpTransport(body.transport);
  const scope = parseMcpScope(body.scope);
  const workspacePath = readOptionalQueryString(body.workspacePath);

  return {
    name,
    transport,
    scope,
    workspacePath,
    command: readOptionalQueryString(body.command),
    args: Array.isArray(body.args) ? body.args.filter((entry): entry is string => typeof entry === 'string') : undefined,
    env: typeof body.env === 'object' && body.env !== null
      ? Object.fromEntries(
          Object.entries(body.env as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    cwd: readOptionalQueryString(body.cwd),
    url: readOptionalQueryString(body.url),
    headers: typeof body.headers === 'object' && body.headers !== null
      ? Object.fromEntries(
          Object.entries(body.headers as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    envVars: Array.isArray(body.envVars)
      ? body.envVars.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    bearerTokenEnvVar: readOptionalQueryString(body.bearerTokenEnvVar),
    envHttpHeaders: typeof body.envHttpHeaders === 'object' && body.envHttpHeaders !== null
      ? Object.fromEntries(
          Object.entries(body.envHttpHeaders as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
  };
};

const parseProvider = (value: unknown): LLMProvider => {
  const normalized = normalizeProviderParam(value);
  if (
    normalized === 'claude' ||
    normalized === 'codex' ||
    normalized === 'cursor' ||
    normalized === 'gemini' ||
    normalized === 'qwen'
  ) {
    return normalized;
  }

  throw new AppError(`Unsupported provider "${normalized}".`, {
    code: 'UNSUPPORTED_PROVIDER',
    statusCode: 400,
  });
};

router.get(
  '/:provider/auth/status',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    const status = await providerAuthService.getProviderAuthStatus(provider);
    res.json(createApiSuccessResponse(status));
  }),
);

router.get(
  '/:provider/mcp/servers',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    const workspacePath = readOptionalQueryString(req.query.workspacePath);
    const scope = parseMcpScope(req.query.scope);

    if (scope) {
      const servers = await providerMcpService.listProviderMcpServersForScope(provider, scope, { workspacePath });
      res.json(createApiSuccessResponse({ provider, scope, servers }));
      return;
    }

    const groupedServers = await providerMcpService.listProviderMcpServers(provider, { workspacePath });
    res.json(createApiSuccessResponse({ provider, scopes: groupedServers }));
  }),
);

router.post(
  '/:provider/mcp/servers',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    const payload = parseMcpUpsertPayload(req.body);
    const server = await providerMcpService.upsertProviderMcpServer(provider, payload);
    res.status(201).json(createApiSuccessResponse({ server }));
  }),
);

router.delete(
  '/:provider/mcp/servers/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    const scope = parseMcpScope(req.query.scope);
    const workspacePath = readOptionalQueryString(req.query.workspacePath);
    const result = await providerMcpService.removeProviderMcpServer(provider, {
      name: readPathParam(req.params.name, 'name'),
      scope,
      workspacePath,
    });
    res.json(createApiSuccessResponse(result));
  }),
);

/**
 * GET /api/providers/credentials
 * Summary for every provider (hasKey + baseUrl + updatedAt). Used by the
 * Settings UI to pre-fill the "API Key" tab.
 */
router.get(
  '/credentials',
  asyncHandler(async (_req: Request, res: Response) => {
    const summaries = await listProviderCredentialSummaries();
    res.json(createApiSuccessResponse(summaries));
  }),
);

/**
 * POST /api/providers/:provider/auth/api-key
 * Body: { apiKey: string, baseUrl?: string }. Stores the credentials in
 * ~/.pixcode/provider-credentials.json and applies them to process.env
 * so the next CLI spawn/SDK call picks them up. Empty apiKey clears.
 */
router.post(
  '/:provider/auth/api-key',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    if (!(provider in PROVIDER_ENV_VARS)) {
      throw new AppError(`Provider "${provider}" does not accept API-key auth.`, {
        code: 'PROVIDER_NO_API_KEY',
        statusCode: 400,
      });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : '';

    await setProviderCredentials(provider, { apiKey, baseUrl });
    await applyProviderCredentialsToEnv(provider);

    res.json(createApiSuccessResponse({ provider, stored: Boolean(apiKey.trim()) }));
  }),
);

/**
 * POST /api/providers/:provider/oauth-paste
 * Body: { callbackUrl: string }.
 *
 * When the CLI starts an OAuth flow it spins up a local HTTP server on
 * 127.0.0.1:<PORT> and expects the OAuth provider to redirect the user's
 * browser to `http://127.0.0.1:<PORT>/callback?code=...`. On remote VPS
 * setups that redirect hits the user's laptop localhost (which has nothing
 * listening), not the server running the CLI. This endpoint is the escape
 * hatch: the user copies the dead callback URL from their browser and
 * posts it here; we parse out the port + code and forward the original
 * GET to the VPS-side 127.0.0.1:PORT so the CLI's local handler completes
 * the token exchange.
 */
router.post(
  '/:provider/oauth-paste',
  asyncHandler(async (req: Request, res: Response) => {
    parseProvider(req.params.provider); // validate id but we don't use it further
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = typeof body.callbackUrl === 'string' ? body.callbackUrl.trim() : '';
    if (!raw) {
      throw new AppError('callbackUrl is required.', {
        code: 'OAUTH_PASTE_URL_REQUIRED',
        statusCode: 400,
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new AppError('callbackUrl must be a valid URL.', {
        code: 'OAUTH_PASTE_URL_INVALID',
        statusCode: 400,
      });
    }

    // Accept localhost / 127.0.0.1 callbacks — reject anything else so we
    // never proxy arbitrary outbound requests on behalf of a user.
    const host = parsed.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      throw new AppError('Only local CLI callback URLs are accepted.', {
        code: 'OAUTH_PASTE_URL_NOT_LOCAL',
        statusCode: 400,
      });
    }

    const port = Number(parsed.port);
    if (!port || port < 1 || port > 65535) {
      throw new AppError('Callback URL must include the CLI callback port.', {
        code: 'OAUTH_PASTE_PORT_INVALID',
        statusCode: 400,
      });
    }

    const pathAndQuery = parsed.pathname + parsed.search;
    await new Promise<void>((resolve, reject) => {
      const forwardReq = http.request(
        {
          host: '127.0.0.1',
          port,
          method: 'GET',
          path: pathAndQuery,
          timeout: 10000,
        },
        (forwardRes) => {
          forwardRes.resume(); // drain
          forwardRes.on('end', () => resolve());
        },
      );
      forwardReq.on('timeout', () => {
        forwardReq.destroy(new Error('CLI callback server did not respond within 10s'));
      });
      forwardReq.on('error', (err) => reject(err));
      forwardReq.end();
    });

    res.json(createApiSuccessResponse({ forwarded: true, port }));
  }),
);

/**
 * POST /api/providers/:provider/install
 * SSE stream. Runs the provider's npm-global install command server-side so
 * users can kick off the install from the UI instead of pasting a command
 * into a terminal. Each stdout/stderr chunk streams as a `log` event; a
 * final `done` event carries the exit code and whether a retry is worth it.
 *
 * Fires once; if already installed, the backend still re-runs the command —
 * npm will reinstall / bump to latest, which is what users usually want when
 * they hit "Install" on a "not installed" card that has since stale-updated.
 */
router.post(
  '/:provider/install',
  (req: Request, res: Response) => {
    (async () => {
      let parsed: LLMProvider;
      try {
        parsed = parseProvider(req.params.provider);
      } catch (err) {
        res.status(400).json({ success: false, error: (err as Error).message });
        return;
      }

      const installCmd = PROVIDER_INSTALL_COMMANDS[parsed];
      if (!installCmd) {
        res.status(400).json({
          success: false,
          error: `${parsed} cannot be installed automatically — please follow the documented install steps.`,
        });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      let ended = false;
      const send = (event: string, payload: unknown) => {
        if (ended) return;
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const endStream = () => {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        res.end();
      };

      // Heartbeat every 15s — proxies love to close an idle long install.
      const heartbeat = setInterval(() => {
        if (ended) return;
        res.write(': ping\n\n');
      }, 15000);

      send('log', { stream: 'meta', chunk: `Running: ${installCmd}\n` });

      // Cross-platform shell so Windows (cmd.exe) and POSIX (/bin/sh) both work.
      const child = spawn(installCmd, {
        shell: true,
        env: process.env,
      });

      req.on('close', () => {
        if (res.writableEnded) return;
        try { child.kill(); } catch { /* noop */ }
        endStream();
      });

      child.stdout?.on('data', (data: Buffer) => send('log', { stream: 'stdout', chunk: data.toString() }));
      child.stderr?.on('data', (data: Buffer) => send('log', { stream: 'stderr', chunk: data.toString() }));

      child.on('error', (err: Error) => {
        if (ended) return;
        send('done', { success: false, error: err.message });
        endStream();
      });

      child.on('close', (code: number | null) => {
        if (ended) return;
        if (code === 0) {
          send('done', {
            success: true,
            exitCode: 0,
            message: `${parsed} installed. Refreshing auth status…`,
          });
        } else {
          send('done', {
            success: false,
            exitCode: code,
            error: `Install command exited with code ${code}`,
          });
        }
        endStream();
      });
    })().catch((err) => {
      try {
        res.status(500).json({ success: false, error: err?.message || String(err) });
      } catch { /* response already started */ }
    });
  },
);

router.post(
  '/mcp/servers/global',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseMcpUpsertPayload(req.body);
    if (payload.scope === 'local') {
      throw new AppError('Global MCP add supports only "user" or "project" scopes.', {
        code: 'INVALID_GLOBAL_MCP_SCOPE',
        statusCode: 400,
      });
    }

    const results = await providerMcpService.addMcpServerToAllProviders({
      ...payload,
      scope: payload.scope === 'user' ? 'user' : 'project',
    });
    res.status(201).json(createApiSuccessResponse({ results }));
  }),
);

export default router;
