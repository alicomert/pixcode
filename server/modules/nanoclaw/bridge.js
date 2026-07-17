/**
 * Pixcode ↔ NanoClaw-lite bridge.
 * Embeds vendor/nanoclaw-lite in the Pixcode daemon with thin HTTP surface for PixBot UI.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW_ROOT = path.resolve(__dirname, '../../vendor/nanoclaw-lite/src');

let started = false;
let nanoclaw = null;
let db = null;
let mcp = null;
let scheduler = null;

async function loadNanoclaw() {
  if (nanoclaw) return nanoclaw;
  // Compiled emit lands in dist-server/server/vendor/nanoclaw-lite/src/
  // Source runs from server/vendor/... — try both via relative import path that tsc emits.
  const candidates = [
    path.join(NANOCLAW_ROOT, 'index.js'),
    path.join(NANOCLAW_ROOT, 'index.ts'),
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      nanoclaw = await import(pathToFileURL(candidate).href);
      return nanoclaw;
    } catch (error) {
      lastError = error;
    }
  }
  // Fallback: package-relative (after tsc to dist-server)
  try {
    nanoclaw = await import('../../vendor/nanoclaw-lite/src/index.js');
    return nanoclaw;
  } catch (error) {
    lastError = error;
  }
  throw lastError || new Error('Failed to load nanoclaw-lite');
}

async function loadDb() {
  if (db) return db;
  db = await import('../../vendor/nanoclaw-lite/src/db.js');
  return db;
}

async function loadMcp() {
  if (mcp) return mcp;
  mcp = await import('../../vendor/nanoclaw-lite/src/nanoclaw-mcp-tools.js');
  return mcp;
}

async function loadScheduler() {
  if (scheduler) return scheduler;
  scheduler = await import('../../vendor/nanoclaw-lite/src/task-scheduler.js');
  return scheduler;
}

/**
 * Map a Pixcode project into a NanoClaw registered group (project = group).
 */
export async function ensureProjectGroup(project) {
  const nc = await loadNanoclaw();
  const projectId = project.name || project.id;
  const folder = String(projectId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'project';
  const jid = `pixcode:project:${projectId}`;
  const group = {
    name: project.displayName || projectId,
    folder,
    trigger: '@PixBot',
    added_at: new Date().toISOString(),
    requiresTrigger: false,
    isMain: false,
    // Extra metadata for Pixcode (not all fields used by nanoclaw)
    projectPath: project.fullPath || project.path || null,
  };
  nc.registerGroup(jid, group);
  return { jid, group };
}

/**
 * Feed Pixcode-stored Telegram bot token into NanoClaw channel factory.
 * NanoClaw reads TELEGRAM_BOT_TOKEN from process.env / .env.
 */
async function injectMessagingCredentialsFromPixcode() {
  try {
    const { telegramConfigDb } = await import('../../database/db.js');
    const config = telegramConfigDb.get?.();
    if (config?.bot_token && !process.env.TELEGRAM_BOT_TOKEN) {
      process.env.TELEGRAM_BOT_TOKEN = config.bot_token;
      console.log('[nanoclaw] Using Telegram bot token from Pixcode Settings');
    }
  } catch (error) {
    console.warn('[nanoclaw] Could not read Pixcode telegram config:', error?.message || error);
  }

  // Optional WhatsApp (Baileys) — enable when session dir is configured
  if (!process.env.WHATSAPP_AUTH_DIR) {
    process.env.WHATSAPP_AUTH_DIR = process.env.PIXCODE_WHATSAPP_AUTH_DIR || '';
  }
}

export async function getChannelCapabilities() {
  const telegramToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  let pixcodeTelegram = false;
  try {
    const { telegramConfigDb } = await import('../../database/db.js');
    pixcodeTelegram = Boolean(telegramConfigDb.get?.()?.bot_token);
  } catch { /* ignore */ }

  return {
    telegram: {
      id: 'telegram',
      label: 'Telegram',
      available: true,
      connected: telegramToken || pixcodeTelegram,
      howTo: 'Settings → Telegram (Pixcode) or set TELEGRAM_BOT_TOKEN. Then restart daemon.',
      note: 'NanoClaw channel + Pixcode control bot can share the same token (restart after save).',
    },
    whatsapp: {
      id: 'whatsapp',
      label: 'WhatsApp',
      available: true,
      connected: Boolean(process.env.WHATSAPP_AUTH_DIR && process.env.WHATSAPP_ENABLED === '1'),
      howTo: 'Set WHATSAPP_ENABLED=1 and WHATSAPP_AUTH_DIR=~/.pixcode/nanoclaw/whatsapp-auth then scan QR on first start (Baileys).',
      note: 'Upstream nanoclaw-lite ships Telegram fully; WhatsApp is Pixcode Baileys adapter.',
    },
    agents: {
      claude: {
        engine: 'NanoClaw-lite Claude Agent SDK + Pixcode multi-runner',
        managed: true,
      },
      codex: {
        engine: 'Pixcode multi-runner → task-runtime / Codex CLI',
        managed: true,
      },
      gemini: {
        engine: 'Pixcode multi-runner → Gemini CLI',
        managed: true,
      },
      cursor: {
        engine: 'Pixcode multi-runner → Cursor CLI',
        managed: true,
      },
      opencode: {
        engine: 'Pixcode multi-runner → OpenCode CLI',
        managed: true,
      },
      qwen: {
        engine: 'Pixcode multi-runner → Qwen Code CLI',
        managed: true,
      },
      grok: {
        engine: 'Pixcode multi-runner → Grok Build (xAI)',
        managed: true,
      },
    },
    summary: {
      messaging: 'Telegram ready when token set; WhatsApp optional via Baileys env.',
      agents: 'POST /api/nanoclaw/run and scheduled tasks route via multi-runner (Claude/Codex/Gemini/Cursor/Qwen/OpenCode/Grok). Prefix [agent:codex] in prompts or pass agentType.',
      api: 'GET /api/nanoclaw/help for curl cookbook; also /api/tasks alias for UI.',
    },
  };
}

export async function startNanoclawBridge() {
  if (started) return { ok: true, already: true };
  process.env.NANOCLAW_STANDALONE = '0';
  process.env.NANOCLAW_NO_PRETTY = process.env.NANOCLAW_NO_PRETTY || '1';
  await injectMessagingCredentialsFromPixcode();
  const nc = await loadNanoclaw();
  const database = await loadDb();
  database.initDatabase();
  await nc.startEmbeddedNanoclaw();
  started = true;
  const caps = await getChannelCapabilities();
  console.log('[nanoclaw] Embedded NanoClaw-lite started (Pixcode bridge)');
  console.log('[nanoclaw] Telegram:', caps.telegram.connected ? 'configured' : 'not configured');
  console.log('[nanoclaw] WhatsApp:', caps.whatsapp.connected ? 'configured' : 'not configured');
  return { ok: true, state: nc.getNanoclawRuntimeState?.(), channels: caps };
}

export async function stopNanoclawBridge() {
  // Soft stop — nanoclaw queue shutdown if available
  try {
    const nc = await loadNanoclaw();
    if (nc.nanoclawQueue?.shutdown) {
      await nc.nanoclawQueue.shutdown(5000);
    }
  } catch {
    // ignore
  }
  started = false;
}

function toolContext(req, body = {}) {
  const projectId = body.projectId || body.project_id || req.query.projectId || 'main';
  const folder = String(projectId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return {
    chatJid: `pixcode:project:${projectId}`,
    groupFolder: folder,
    isMain: true,
    sendMessage: async (text) => {
      console.log(`[nanoclaw/pixbot] ${projectId}: ${String(text).slice(0, 200)}`);
    },
  };
}

/**
 * Express router mounted at /api/nanoclaw and also under /api/tasks (UI compatibility).
 * Public remote clients should prefer /api/nanoclaw/* with X-API-Key or Bearer token.
 */
export function nanoclawRouter() {
  const router = express.Router();

  router.get('/help', (_req, res) => {
    res.json(buildNanoclawApiHelp());
  });

  router.get('/status', async (_req, res) => {
    try {
      const nc = started ? await loadNanoclaw() : null;
      const channels = await getChannelCapabilities();
      res.json({
        ok: true,
        started,
        engine: 'nanoclaw-lite',
        brand: 'NanoClaw',
        state: nc?.getNanoclawRuntimeState?.() || null,
        channels,
        api: {
          help: '/api/nanoclaw/help',
          docs: '/api/public/cookbook',
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/start', async (_req, res) => {
    try {
      const result = await startNanoclawBridge();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/channels', async (_req, res) => {
    try {
      res.json({ ok: true, channels: await getChannelCapabilities() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Immediate multi-CLI run (does not require a schedule). */
  router.post('/run', async (req, res) => {
    try {
      if (!started) {
        await startNanoclawBridge();
      }
      const prompt = String(req.body?.prompt || req.body?.message || '').trim();
      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      const projectId = req.body?.projectId || req.body?.project_id || 'general';
      const projectPath = req.body?.projectPath || req.body?.cwd || null;
      if (projectId && projectId !== 'general') {
        await ensureProjectGroup({
          name: projectId,
          displayName: projectId,
          path: projectPath,
          fullPath: projectPath,
        });
      }

      const { runPixcodeMultiAgent, normalizeAgentType } = await import('./multi-runner.js');
      const agentType = normalizeAgentType(req.body?.agentType || req.body?.agent || req.body?.provider);
      const logs = [];
      const result = await runPixcodeMultiAgent({
        prompt,
        groupFolder: String(projectId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80),
        sessionId: req.body?.sessionId || undefined,
        agentType,
        model: req.body?.model || undefined,
        projectPath,
        isScheduledTask: false,
        onLog: (level, message) => {
          logs.push({ level, message, at: new Date().toISOString() });
        },
      });

      const statusCode = result.status === 'success' ? 200 : 502;
      res.status(statusCode).json({
        ok: result.status === 'success',
        ...result,
        agentType,
        projectId,
        logs: logs.slice(-100),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // MCP-equivalent REST: schedule_task, list_tasks, get_task, update_task, pause/resume/cancel
  router.get('/tasks', async (req, res) => {
    try {
      const database = await loadDb();
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
      const folder = projectId
        ? String(projectId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
        : null;
      const tasks = folder
        ? database.getTasksForGroup(folder)
        : database.getAllTasks();
      res.json({
        tasks: tasks.map(publicScheduledTask),
        crons: tasks.filter((t) => t.status === 'active').map(publicScheduledTask),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/tasks/:taskId', async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      const logs = database.getDb
        ? null
        : null;
      // task_run_logs via raw if exported
      let runLogs = [];
      try {
        const { default: Database } = await import('better-sqlite3');
        // use getTaskById only; optional logs via prepare if we re-export
        runLogs = [];
      } catch { /* ignore */ }
      res.json({ task: publicScheduledTask(task), logs: runLogs });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks', async (req, res) => {
    try {
      const tools = await loadMcp();
      const prompt = String(req.body?.prompt || req.body?.message || '').trim();
      if (!prompt) return res.status(400).json({ error: 'prompt is required' });

      const schedule_type = ['cron', 'interval', 'once'].includes(req.body?.schedule_type)
        ? req.body.schedule_type
        : (req.body?.scheduleType || 'once');
      let schedule_value = String(req.body?.schedule_value || req.body?.scheduleValue || '').trim();
      if (schedule_type === 'once' && !schedule_value) {
        // Run soon (local time without TZ suffix — nanoclaw once format)
        const d = new Date(Date.now() + 5000);
        schedule_value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19);
      }
      if (schedule_type === 'interval' && !schedule_value) {
        schedule_value = '3600000';
      }
      if (schedule_type === 'cron' && !schedule_value) {
        schedule_value = '0 9 * * *';
      }

      const projectId = req.body?.projectId || req.body?.project_id;
      if (projectId) {
        await ensureProjectGroup({ name: projectId, displayName: projectId, path: req.body?.projectPath });
      }

      const result = await tools.toolScheduleTask(
        {
          prompt,
          schedule_type,
          schedule_value,
          context_mode: req.body?.context_mode || 'isolated',
        },
        toolContext(req, req.body),
      );

      if (result.isError) {
        return res.status(400).json({ error: result.content?.[0]?.text || 'schedule failed' });
      }

      const database = await loadDb();
      const tasks = database.getAllTasks();
      const created = tasks[0];
      res.status(201).json({
        ok: true,
        message: result.content?.[0]?.text,
        task: created ? publicScheduledTask(created) : null,
        tasks: tasks.map(publicScheduledTask),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/pause', async (req, res) => {
    try {
      const tools = await loadMcp();
      const result = await tools.toolPauseTask(req.params.taskId, toolContext(req, req.body));
      res.json({ ok: !result.isError, message: result.content?.[0]?.text });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/resume', async (req, res) => {
    try {
      const tools = await loadMcp();
      const result = await tools.toolResumeTask(req.params.taskId, toolContext(req, req.body));
      res.json({ ok: !result.isError, message: result.content?.[0]?.text });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/cancel', async (req, res) => {
    try {
      const tools = await loadMcp();
      const result = await tools.toolCancelTask(req.params.taskId, toolContext(req, req.body));
      res.json({ ok: !result.isError, message: result.content?.[0]?.text });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.patch('/tasks/:taskId', async (req, res) => {
    try {
      const tools = await loadMcp();
      const result = await tools.toolUpdateTask(
        {
          task_id: req.params.taskId,
          prompt: req.body?.prompt,
          schedule_type: req.body?.schedule_type || req.body?.scheduleType,
          schedule_value: req.body?.schedule_value || req.body?.scheduleValue,
        },
        toolContext(req, req.body),
      );
      res.json({ ok: !result.isError, message: result.content?.[0]?.text });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.delete('/tasks/:taskId', async (req, res) => {
    try {
      const database = await loadDb();
      database.deleteTask(req.params.taskId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ---- NanoClaw conversation surface (chat-first; not a job board) ----
  router.get('/bot/crons', async (req, res) => {
    // Kept for API compat; UI no longer surfaces this panel.
    req.url = '/tasks';
    return router.handle(req, res, () => {});
  });

  router.get('/bot/help', (_req, res) => {
    import('./chat-engine.js')
      .then((chat) => res.json({ ok: true, brand: 'PixBot', ...chat.chatHelpHints() }))
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  // PixBot LLM — multi custom providers + models.dev catalog
  router.get('/bot/llm', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const bootstrap = String(req.query.bootstrap || '') === '1';
      if (bootstrap) {
        res.json({ ok: true, brand: 'PixBot', ...(await llm.bootstrapPixbot({ refresh: true })) });
        return;
      }
      res.json({ ok: true, brand: 'PixBot', ...(await llm.getPixbotConfig()) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Open PixBot: sync system providers + pull models (also used as background refresh). */
  router.post('/bot/bootstrap', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const refresh = req.body?.refresh !== false;
      res.json({ ok: true, brand: 'PixBot', ...(await llm.bootstrapPixbot({ refresh })) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.put('/bot/llm', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const config = await llm.savePixbotConfig({
        apiKey: req.body?.apiKey,
        baseUrl: req.body?.baseUrl,
        model: req.body?.model,
        name: req.body?.name,
      });
      res.json({ ok: true, brand: 'PixBot', ...config });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/providers', async (_req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      res.json({ ok: true, brand: 'PixBot', ...(await llm.listPixbotProviders()) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/providers', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const result = await llm.addPixbotProvider({
        name: req.body?.name,
        baseUrl: req.body?.baseUrl,
        apiKey: req.body?.apiKey,
        catalogId: req.body?.catalogId,
        id: req.body?.id,
      });
      if (req.body?.activate !== false && result.provider?.id) {
        await llm.setActivePixbotProvider(result.provider.id).catch(() => {});
      }
      res.json({ ok: true, brand: 'PixBot', ...result, ...(await llm.getPixbotConfig()) });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.patch('/bot/providers/:id', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const provider = await llm.updatePixbotProvider(req.params.id, {
        name: req.body?.name,
        baseUrl: req.body?.baseUrl,
        apiKey: req.body?.apiKey,
        enabled: req.body?.enabled,
        enabledModels: Object.prototype.hasOwnProperty.call(req.body || {}, 'enabledModels')
          ? req.body.enabledModels
          : undefined,
      });
      res.json({ ok: true, brand: 'PixBot', provider });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.delete('/bot/providers/:id', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const result = await llm.removePixbotProvider(req.params.id);
      res.json({ ok: true, brand: 'PixBot', ...result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/providers/:id/activate', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const provider = await llm.setActivePixbotProvider(req.params.id);
      res.json({ ok: true, brand: 'PixBot', provider, ...(await llm.getPixbotConfig()) });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/catalog', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const payload = await llm.listCatalogProviders({
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: Number(req.query.limit) || 80,
        force: String(req.query.refresh || '') === '1',
      });
      res.json({ ok: true, brand: 'PixBot', ...payload });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/models', async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : undefined;
      const refresh = String(req.query.refresh || '') === '1';
      const payload = await llm.fetchPixbotModels({ providerId, refresh });
      res.json({ ok: true, brand: 'PixBot', ...payload });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({
        error: error instanceof Error ? error.message : String(error),
        code: error?.code,
      });
    }
  });

  router.post('/bot/models/refresh', async (_req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const payload = await llm.refreshAllPixbotModels({ force: true });
      res.json({ ok: true, brand: 'PixBot', ...payload });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/chat', async (req, res) => {
    try {
      if (!started) {
        await startNanoclawBridge();
      }
      const chat = await import('./chat-engine.js');
      const projectId = req.body?.projectId || req.body?.project_id || 'general';
      let projectPath = req.body?.projectPath || req.body?.cwd || null;

      if (projectId && projectId !== 'general') {
        await ensureProjectGroup({
          name: projectId,
          displayName: projectId,
          path: projectPath,
          fullPath: projectPath,
        });
        // Best-effort resolve path from Pixcode projects registry
        if (!projectPath) {
          try {
            const { extractProjectDirectory } = await import('../../projects.js');
            projectPath = await extractProjectDirectory(projectId).catch(() => null);
          } catch { /* ignore */ }
        }
      }

      const tools = await loadMcp();
      const payload = await chat.handleChatTurn({
        projectId,
        conversationId: req.body?.conversationId || null,
        message: req.body?.message || req.body?.prompt || '',
        agentType: req.body?.agentType || req.body?.agent || null,
        model: req.body?.model || null,
        projectPath,
        forceCli: Boolean(req.body?.forceCli),
        scheduleTools: {
          toolScheduleTask: tools.toolScheduleTask,
          toolContext: toolContext(req, req.body),
        },
      });
      res.json(payload);
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Streaming chat — SSE events: user, status, assistant_start, delta, done, error */
  router.post('/bot/chat/stream', async (req, res) => {
    try {
      if (!started) {
        await startNanoclawBridge();
      }
      const chat = await import('./chat-engine.js');
      const projectId = req.body?.projectId || req.body?.project_id || 'general';
      let projectPath = req.body?.projectPath || req.body?.cwd || null;

      if (projectId && projectId !== 'general') {
        await ensureProjectGroup({
          name: projectId,
          displayName: projectId,
          path: projectPath,
          fullPath: projectPath,
        });
        if (!projectPath) {
          try {
            const { extractProjectDirectory } = await import('../../projects.js');
            projectPath = await extractProjectDirectory(projectId).catch(() => null);
          } catch { /* ignore */ }
        }
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const writeEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      };

      const tools = await loadMcp();
      await chat.handleChatTurnStream({
        projectId,
        conversationId: req.body?.conversationId || null,
        message: req.body?.message || req.body?.prompt || '',
        agentType: req.body?.agentType || req.body?.agent || null,
        model: req.body?.model || null,
        projectPath,
        forceCli: Boolean(req.body?.forceCli),
        scheduleTools: {
          toolScheduleTask: tools.toolScheduleTask,
          toolContext: toolContext(req, req.body),
        },
        onEvent: writeEvent,
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        const status = error?.statusCode || 500;
        res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
        return;
      }
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) })}\n\n`);
      } catch { /* ignore */ }
      res.end();
    }
  });

  router.get('/bot/conversations', (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
        res.json({ conversations: chat.listConversations(projectId) });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.post('/bot/conversations', (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        const conversation = chat.createConversation({
          projectId: req.body?.projectId || 'general',
          title: req.body?.title,
          defaultAgent: req.body?.agentType || req.body?.defaultAgent,
        });
        res.status(201).json({ conversation });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.get('/bot/conversations/:id/messages', (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        res.json({ messages: chat.getMessages(req.params.id) });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.get('/bot/proposals', (_req, res) => res.json({ proposals: [] }));
  router.get('/bot/plans', (_req, res) => res.json({ plans: [] }));
  router.get('/meta/agents', async (_req, res) => {
    try {
      const { MULTI_CLI_AGENTS } = await import('./multi-runner.js');
      const chat = await import('./chat-engine.js');
      res.json({
        agents: MULTI_CLI_AGENTS.map((a) => ({
          value: a.value,
          label: a.label,
          provider: a.value === 'claude-code' ? 'claude' : a.value,
        })),
        directive: '/opencode  /claude  /grok  ·  “bunu codex ile yap”  ·  @path/to/file',
        tips: chat.chatHelpHints().tips,
      });
    } catch {
      res.json({
        agents: [
          { value: 'claude-code', label: 'Claude Code', provider: 'claude' },
          { value: 'codex', label: 'OpenAI Codex', provider: 'codex' },
          { value: 'gemini', label: 'Gemini CLI', provider: 'gemini' },
          { value: 'cursor', label: 'Cursor CLI', provider: 'cursor' },
          { value: 'qwen', label: 'Qwen Code', provider: 'qwen' },
          { value: 'opencode', label: 'OpenCode', provider: 'opencode' },
          { value: 'grok', label: 'Grok Build (xAI)', provider: 'grok' },
        ],
      });
    }
  });
  router.get('/agents', (req, res) => {
    req.url = '/meta/agents';
    return router.handle(req, res, () => {});
  });
  router.get('/meta/roles', (_req, res) => res.json({ roles: [] }));
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', engine: 'nanoclaw-lite', started })}\n\n`);
    const timer = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() })}\n\n`);
    }, 25000);
    req.on('close', () => {
      clearInterval(timer);
    });
  });
  router.get('/', async (req, res) => {
    try {
      const database = await loadDb();
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
      const folder = projectId
        ? String(projectId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
        : null;
      const tasks = folder ? database.getTasksForGroup(folder) : database.getAllTasks();
      res.json({
        tasks: tasks.map((t) => ({
          id: t.id,
          projectId: folder || t.group_folder,
          title: t.prompt?.slice(0, 72),
          prompt: t.prompt,
          status: t.status === 'active' ? 'QUEUED' : t.status === 'completed' ? 'COMPLETED' : t.status === 'paused' ? 'CANCELLED' : 'PENDING',
          agentType: 'claude-code',
          role: 'fullstack',
          priority: 'normal',
          createdAt: t.created_at,
          scheduledAt: t.next_run,
        })),
        pendingApprovals: [],
        plans: [],
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

function publicScheduledTask(row) {
  return {
    id: row.id,
    projectId: row.group_folder,
    title: row.prompt?.slice(0, 80),
    prompt: row.prompt,
    scheduleType: row.schedule_type,
    scheduleValue: row.schedule_value,
    cronExpression: row.schedule_type === 'cron' ? row.schedule_value : undefined,
    recurrence: row.schedule_type,
    nextRunAt: row.next_run,
    lastRunAt: row.last_run,
    lastResult: row.last_result,
    status: row.status,
    enabled: row.status === 'active',
    contextMode: row.context_mode,
    createdAt: row.created_at,
    agentType: 'claude-code',
  };
}

function buildNanoclawApiHelp() {
  const base = '/api/nanoclaw';
  return {
    name: 'Pixcode NanoClaw API',
    engine: 'nanoclaw-lite',
    auth: {
      headers: ['X-API-Key: px_…', 'Authorization: Bearer <jwt|px_…>'],
      note: 'Create keys in Settings → API keys (scopes tasks:read / tasks:write).',
    },
    endpoints: [
      { method: 'GET', path: `${base}/help`, description: 'This document' },
      { method: 'GET', path: `${base}/status`, description: 'Engine + channel status' },
      { method: 'POST', path: `${base}/start`, description: 'Ensure embedded NanoClaw is running' },
      { method: 'GET', path: `${base}/channels`, description: 'Telegram / WhatsApp capabilities' },
      { method: 'GET', path: `${base}/agents`, description: 'Multi-CLI agents (Claude, Codex, Grok, …)' },
      { method: 'GET', path: `${base}/tasks`, description: 'List scheduled tasks (?projectId=)' },
      { method: 'GET', path: `${base}/tasks/:id`, description: 'Get one task' },
      { method: 'POST', path: `${base}/tasks`, description: 'Schedule task (once|interval|cron)' },
      { method: 'PATCH', path: `${base}/tasks/:id`, description: 'Update task prompt/schedule' },
      { method: 'POST', path: `${base}/tasks/:id/pause`, description: 'Pause task' },
      { method: 'POST', path: `${base}/tasks/:id/resume`, description: 'Resume task' },
      { method: 'POST', path: `${base}/tasks/:id/cancel`, description: 'Cancel task' },
      { method: 'DELETE', path: `${base}/tasks/:id`, description: 'Delete task' },
      { method: 'POST', path: `${base}/run`, description: 'Run agent immediately (multi-CLI)' },
      { method: 'POST', path: `${base}/bot/chat`, description: 'UI helper: chat → once schedule' },
      { method: 'GET', path: `${base}/events`, description: 'SSE heartbeat stream' },
      { method: 'GET', path: '/api/tasks', description: 'Alias of NanoClaw router (UI)' },
    ],
    examples: {
      status: `curl -H "X-API-Key: $PIXCODE_API_KEY" http://127.0.0.1:3001${base}/status`,
      listTasks: `curl -H "X-API-Key: $PIXCODE_API_KEY" "http://127.0.0.1:3001${base}/tasks"`,
      scheduleOnce: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"[agent:codex] write a README","schedule_type":"once","projectId":"my-app"}' http://127.0.0.1:3001${base}/tasks`,
      scheduleCron: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"daily dependency audit","schedule_type":"cron","schedule_value":"0 9 * * *","projectId":"my-app"}' http://127.0.0.1:3001${base}/tasks`,
      runNow: `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" -d '{"prompt":"summarize git status","agentType":"claude-code","projectId":"my-app"}' http://127.0.0.1:3001${base}/run`,
    },
  };
}

export const nanoclawTaskScheduler = {
  start() {
    void startNanoclawBridge().catch((error) => {
      console.error('[nanoclaw] failed to start:', error?.message || error);
    });
  },
  stop() {
    void stopNanoclawBridge();
  },
};
