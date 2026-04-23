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
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS service
import { getProviderModels, clearProviderModelCache } from '@/services/provider-models.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS service
import {
  createInstallJob,
  getInstallJob,
  cancelInstallJob,
  snapshotDonePayload,
} from '@/services/install-jobs.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS shared module
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  GEMINI_MODELS,
  QWEN_MODELS,
  CURSOR_MODELS,
} from '../../../shared/modelConstants.js';

const STATIC_MODELS_BY_PROVIDER: Record<LLMProvider, Array<{ value: string; label: string }>> = {
  claude: CLAUDE_MODELS.OPTIONS,
  codex: CODEX_MODELS.OPTIONS,
  cursor: CURSOR_MODELS.OPTIONS,
  gemini: GEMINI_MODELS.OPTIONS,
  qwen: QWEN_MODELS.OPTIONS,
};
import type { LLMProvider, McpScope, McpTransport, UpsertProviderMcpServerInput } from '@/shared/types.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import http from 'node:http';

/**
 * npm-global install command per provider. Used by POST
 * /api/providers/:p/install to run the install directly from Pixcode so
 * users don't have to drop into a shell just to get a CLI on the host.
 * Cursor uses its own install script, not npm.
 */
/**
 * npm package name per provider. The in-app installer drops these into
 * ~/.pixcode/cli-bin/ as LOCAL deps (no -g, no sudo). A sibling string
 * for display ("npm install -g …") is surfaced in the UI so users who
 * prefer to install manually still see a recognizable command.
 */
const PROVIDER_INSTALL_PACKAGES: Record<LLMProvider, string | null> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  gemini: '@google/gemini-cli',
  qwen: '@qwen-code/qwen-code',
  // Cursor ships via a bash script hosted at cursor.com; safer to ask
  // users to run it themselves than to pipe-to-bash from our server.
  cursor: null,
};

const PROVIDER_INSTALL_COMMANDS: Record<LLMProvider, string | null> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  qwen: 'npm install -g @qwen-code/qwen-code',
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
 * GET /api/providers/:provider/models?refresh=1
 * Merged model catalog: hardcoded defaults + live API discovery when an
 * API key is configured. Ships a stable baseline so dropdowns never sit
 * empty, then overlays whatever the upstream API reports so users get
 * new models without a Pixcode release. 6-hour cache; pass `refresh=1`
 * to force an upstream hit.
 */
router.get(
  '/:provider/models',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === '1';
    const result = await getProviderModels(provider, {
      forceRefresh,
      staticList: STATIC_MODELS_BY_PROVIDER[provider] ?? [],
    });
    res.json(createApiSuccessResponse(result));
  }),
);

router.delete(
  '/:provider/models/cache',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    await clearProviderModelCache(provider);
    res.json(createApiSuccessResponse({ cleared: true, provider }));
  }),
);

/**
 * POST /api/providers/:provider/install
 * Kicks off the install in the background and immediately returns
 * `{ jobId }`. The actual log stream is fetched separately via
 * GET /install/:jobId/stream (EventSource). This split solves the
 * "Client disconnected before install finished" class of errors,
 * where a single long-lived POST SSE would get torn down by dev
 * proxies, service-worker reloads, or Vite HMR and short-circuit
 * an in-flight install. The child now outlives the request.
 */
router.post(
  '/:provider/install',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseProvider(req.params.provider);
    const packageName = PROVIDER_INSTALL_PACKAGES[parsed];
    const installCmd = PROVIDER_INSTALL_COMMANDS[parsed];
    if (!packageName || !installCmd) {
      throw new AppError(
        `${parsed} cannot be installed automatically — please follow the documented install steps.`,
        { code: 'PROVIDER_NOT_AUTO_INSTALLABLE', statusCode: 400 },
      );
    }

    const job = createInstallJob({ provider: parsed, installCmd, packageName });
    res.json(createApiSuccessResponse({
      jobId: job.id,
      provider: parsed,
      installCmd,
      startedAt: job.startedAt,
    }));
  }),
);

/**
 * GET /api/providers/:provider/install/:jobId/stream
 * SSE endpoint (EventSource-friendly). Replays every buffered log line
 * to the new subscriber, then forwards live stdout/stderr until the
 * child exits. Clients can reconnect freely — reconnects replay from
 * the start, so you never miss output, even if the browser dropped
 * the previous connection while npm was mid-download.
 *
 * EventSource can't set custom headers, so this endpoint also accepts
 * ?token=... as a fallback auth channel (same pattern the search
 * endpoint uses).
 */
router.get(
  '/:provider/install/:jobId/stream',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseProvider(req.params.provider);
    const jobId = readPathParam(req.params.jobId, 'jobId');
    const job = getInstallJob(jobId);
    if (!job || job.provider !== parsed) {
      throw new AppError('Install job not found or already expired.', {
        code: 'INSTALL_JOB_NOT_FOUND',
        statusCode: 404,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    try {
      (res.socket as NodeJS.Socket & { setNoDelay?: (on: boolean) => void })?.setNoDelay?.(true);
    } catch { /* noop */ }

    let closed = false;
    const write = (event: string, payload: unknown) => {
      if (closed) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* socket gone */ }
    };

    // Immediate primer + heartbeat, same as before — keeps intermediary
    // proxies from treating the connection as idle.
    try { res.write(': start\n\n'); } catch { /* noop */ }
    const heartbeat = setInterval(() => {
      if (closed) return;
      try { res.write(': ping\n\n'); } catch { /* noop */ }
    }, 5000);

    // Replay the buffered transcript first so late subscribers see
    // every line npm has already produced.
    for (const entry of job.logs) {
      write('log', { stream: entry.stream, chunk: entry.chunk });
    }

    const onLog = (entry: { stream: string; chunk: string }) => {
      write('log', { stream: entry.stream, chunk: entry.chunk });
    };
    const onDone = (payload: Record<string, unknown>) => {
      write('done', payload);
      cleanup();
      try { res.end(); } catch { /* noop */ }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      job.emitter.off('log', onLog);
      job.emitter.off('done', onDone);
    };

    if (job.status !== 'running') {
      // Job already finished — replay the terminal done frame and exit.
      write('done', snapshotDonePayload(job));
      cleanup();
      try { res.end(); } catch { /* noop */ }
      return;
    }

    job.emitter.on('log', onLog);
    job.emitter.once('done', onDone);

    req.on('close', () => {
      // Client walked away. DO NOT cancel the install — detaching is fine.
      cleanup();
    });
  }),
);

router.delete(
  '/:provider/install/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseProvider(req.params.provider);
    const jobId = readPathParam(req.params.jobId, 'jobId');
    const job = getInstallJob(jobId);
    if (!job || job.provider !== parsed) {
      throw new AppError('Install job not found.', {
        code: 'INSTALL_JOB_NOT_FOUND',
        statusCode: 404,
      });
    }
    const cancelled = cancelInstallJob(jobId);
    res.json(createApiSuccessResponse({ cancelled }));
  }),
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
