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

export async function startNanoclawBridge() {
  if (started) return { ok: true, already: true };
  process.env.NANOCLAW_STANDALONE = '0';
  process.env.NANOCLAW_NO_PRETTY = process.env.NANOCLAW_NO_PRETTY || '1';
  const nc = await loadNanoclaw();
  const database = await loadDb();
  database.initDatabase();
  await nc.startEmbeddedNanoclaw();
  started = true;
  console.log('[nanoclaw] Embedded NanoClaw-lite started (Pixcode bridge)');
  return { ok: true, state: nc.getNanoclawRuntimeState?.() };
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
 * Express router mounted at /api/nanoclaw and also mirrored under /api/tasks for PixBot UI.
 */
export function nanoclawRouter() {
  const router = express.Router();

  router.get('/status', async (_req, res) => {
    try {
      const nc = await loadNanoclaw();
      res.json({
        ok: true,
        started,
        engine: 'nanoclaw-lite',
        brand: 'PixBot',
        state: nc.getNanoclawRuntimeState?.() || null,
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

  // Compatibility aliases for old PixBot hooks
  router.get('/bot/crons', async (req, res) => {
    req.url = '/tasks';
    return router.handle(req, res, () => {});
  });

  router.post('/bot/chat', async (req, res) => {
    // Chat message → schedule as once task (nanoclaw schedule_task)
    req.body = {
      ...req.body,
      prompt: req.body?.message || req.body?.prompt,
      schedule_type: 'once',
      projectId: req.body?.projectId,
    };
    // Reuse POST /tasks logic via internal call
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'message is required' });
    try {
      const tools = await loadMcp();
      if (req.body.projectId) {
        await ensureProjectGroup({ name: req.body.projectId, displayName: req.body.projectId });
      }
      const d = new Date(Date.now() + 3000);
      const schedule_value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19);
      const result = await tools.toolScheduleTask(
        { prompt, schedule_type: 'once', schedule_value, context_mode: 'isolated' },
        toolContext(req, req.body),
      );
      const database = await loadDb();
      const tasks = database.getAllTasks();
      res.json({
        conversation: { id: crypto.randomUUID(), projectId: req.body.projectId, title: prompt.slice(0, 72) },
        messages: [
          { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.content?.[0]?.text || 'Task scheduled via NanoClaw.',
            createdAt: new Date().toISOString(),
            kind: 'system',
          },
        ],
        proposals: [],
        tasks: tasks.map(publicScheduledTask),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/conversations', (_req, res) => res.json({ conversations: [] }));
  router.get('/bot/proposals', (_req, res) => res.json({ proposals: [] }));
  router.get('/bot/plans', (_req, res) => res.json({ plans: [] }));
  router.get('/meta/agents', (_req, res) => res.json({
    agents: [
      { value: 'claude-code', label: 'Claude Code (NanoClaw SDK)', provider: 'claude' },
      { value: 'opencode', label: 'OpenCode', provider: 'opencode' },
    ],
  }));
  router.get('/meta/roles', (_req, res) => res.json({ roles: [] }));
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`data: ${JSON.stringify({ type: 'connected', engine: 'nanoclaw-lite' })}\n\n`);
    req.on('close', () => {});
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
