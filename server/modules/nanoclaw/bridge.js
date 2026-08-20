/**
 * Pixcode ↔ NanoClaw-lite bridge.
 * Embeds vendor/nanoclaw-lite in the Pixcode daemon with thin HTTP surface for PixBot UI.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import express from 'express';

import { userHasProjectAccess, userHasProjectPathAccess } from '../../services/platformization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW_ROOT = path.resolve(__dirname, '../../vendor/nanoclaw-lite/src');

let started = false;
let nanoclaw = null;
let db = null;
let mcp = null;
let scheduler = null;

// NanoClaw requests can start provider processes and persist task rows. Keep
// their individual fields bounded even though the global JSON parser accepts
// larger payloads for file-oriented APIs; otherwise one authenticated client
// could enqueue megabytes of prompt/cron text and pin memory or the scheduler.
const MAX_NANO_PROMPT_CHARS = 64 * 1024;
const MAX_NANO_SCHEDULE_CHARS = 256;
const MAX_NANO_PROJECT_ID_CHARS = 256;
const MAX_NANO_PROJECT_PATH_CHARS = 4096;

function readNanoText(value, maxChars, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      const error = new Error(`${field} is required.`);
      error.statusCode = 400;
      throw error;
    }
    return '';
  }
  if (typeof value !== 'string') {
    const error = new Error(`${field} must be a string.`);
    error.statusCode = 400;
    throw error;
  }
  const text = value.trim();
  if (text.length > maxChars) {
    const error = new Error(`${field} exceeds the ${maxChars} character limit.`);
    error.statusCode = 400;
    throw error;
  }
  if (required && !text) {
    const error = new Error(`${field} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

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
  let projectPath = project.fullPath || project.path || null;
  if (projectPath) {
    try {
      // Persist a canonical path so a later scheduler restart cannot follow a
      // newly introduced symlink and silently move agent execution elsewhere.
      projectPath = await fs.realpath(projectPath);
    } catch {
      projectPath = path.resolve(String(projectPath));
    }
  }
  const group = {
    name: project.displayName || projectId,
    folder,
    trigger: '@PixBot',
    added_at: new Date().toISOString(),
    requiresTrigger: false,
    isMain: false,
    // Extra metadata for Pixcode (not all fields used by nanoclaw)
    projectPath,
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

  // Route scheduler/agent outbound text into the originating PixBot conversation (no spam chats)
  if (typeof nc.setOutboundMessageHandler === 'function') {
    nc.setOutboundMessageHandler(async (jid, text) => {
      try {
        const chat = await import('./chat-engine.js');
        let taskId = null;
        let prompt = null;
        let conversationId = null;
        let agentType = null;
        try {
          const folder = String(jid || '').startsWith('pixcode:project:')
            ? String(jid).slice('pixcode:project:'.length).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
            : null;
          // Member task groups are namespaced by user id (`u<id>_...`).
          // Preserve that owner when routing the scheduler's outbound text;
          // the chat engine uses it to authorize any conversation id carried
          // by the task prompt.
          const ownerMatch = folder?.match(/^u(\d+)_/u);
          const parsedOwnerUserId = ownerMatch ? Number(ownerMatch[1]) : null;
          const ownerUserId = ownerMatch
            ? (Number.isSafeInteger(parsedOwnerUserId) && parsedOwnerUserId > 0 ? parsedOwnerUserId : 0)
            : null;
          const tasks = folder
            ? database.getTasksForGroup(folder)
            : database.getAllTasks();
          const recent = (tasks || [])
            .filter((t) => t.last_run || t.status === 'active' || t.status === 'completed')
            .sort((a, b) => String(b.last_run || b.created_at || '').localeCompare(String(a.last_run || a.created_at || '')))[0];
          taskId = recent?.id || null;
          prompt = recent?.prompt || null;
          const convMatch = String(prompt || '').match(/\[pixconv:([^\]]+)\]/i);
          if (convMatch) conversationId = convMatch[1].trim();
          const agentMatch = String(prompt || '').match(/\[agent:([^\s\]]+)/i);
          if (agentMatch) agentType = agentMatch[1];
        } catch { /* ignore */ }

          const posted = chat.postScheduledTaskResult({
            jid,
            text,
            taskId,
            prompt,
            conversationId,
            agentType,
            ownerUserId,
          });
        if (posted?.message) {
          console.log(`[nanoclaw] Task result → conversation ${posted.conversation?.id || '?'}`);
        } else if (posted?.skipped) {
          console.log(`[nanoclaw] Task result skipped: ${posted.skipped}`);
        }
      } catch (error) {
        console.warn('[nanoclaw] Failed to post task result to PixBot:', error?.message || error);
      }
    });
  }

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

function isPrivilegedNanoclawUser(req) {
  if (!['admin', 'owner'].includes(req?.user?.role)) return false;
  // API-key authenticated admin users must opt into the admin scope. A key
  // should never inherit the browser/JWT administrator role implicitly.
  if (!req?.user?.api_key_id) return true;
  const scopes = Array.isArray(req.user.api_key_scopes) ? req.user.api_key_scopes : [];
  return scopes.includes('*') || scopes.includes('admin') || scopes.includes('system');
}

function projectFolder(projectId) {
  return String(projectId || 'general').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64) || 'general';
}

function scopedProjectFolder(req, projectId) {
  const folder = projectFolder(projectId);
  if (isPrivilegedNanoclawUser(req)) return folder;
  const userId = String(req?.user?.id || req?.user?.userId || 'anonymous').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `u${userId}_${folder}`.slice(0, 80);
}

function isPathInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function privateWorkspaceRootFor(user) {
  const userId = Number(user?.id ?? user?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const base = path.resolve(process.env.WORKSPACES_BASE || path.join(os.homedir(), 'pixcode', 'projects'));
  return path.join(base, 'users', String(userId));
}

function isPrivateNanoclawPath(req, targetPath) {
  if (!targetPath || isPrivilegedNanoclawUser(req)) return false;
  const root = privateWorkspaceRootFor(req.user);
  return Boolean(root && isPathInside(root, targetPath));
}

/**
 * Resolve a request's workspace before any NanoClaw runner is invoked.  The
 * direct `/run` endpoint used to pass a missing projectPath to multi-runner,
 * whose fallback was process.cwd() (the server checkout) for members.  Named
 * projects are resolved through the Pixcode registry; path-less member work is
 * forced into that user's private workspace instead.
 */
async function resolveRequestProjectPath(req, projectId, requestedPath) {
  const explicit = typeof requestedPath === 'string' ? requestedPath.trim() : '';
  const { resolveNanoclawProjectPath } = await import('./project-path.js');
  const resolved = await resolveNanoclawProjectPath({ projectId, projectPath: explicit || null });
  if (resolved || isPrivilegedNanoclawUser(req)) return resolved;
  if (explicit) {
    const error = new Error('Project path does not exist or is not a directory.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const privateRoot = privateWorkspaceRootFor(req.user);
    if (!privateRoot) return null;
    const { validateWorkspacePath } = await import('../../routes/projects.js');
    const validation = await validateWorkspacePath(privateRoot, { allowedRoot: path.dirname(privateRoot) });
    if (!validation.valid) return null;
    await fs.mkdir(privateRoot, { recursive: true });
    return privateRoot;
  } catch {
    return null;
  }
}

function taskBelongsToRequest(req, task) {
  if (isPrivilegedNanoclawUser(req)) return true;
  const userId = String(req?.user?.id || req?.user?.userId || 'anonymous').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return Boolean(task?.group_folder && task.group_folder.startsWith(`u${userId}_`));
}

function visibleTasks(database, req, projectId = null) {
  if (projectId) return database.getTasksForGroup(scopedProjectFolder(req, projectId));
  const all = database.getAllTasks();
  return isPrivilegedNanoclawUser(req) ? all : all.filter((task) => taskBelongsToRequest(req, task));
}

async function ensureRequestProjectGroup(req, projectId, projectPath = null) {
  const rawProjectId = projectId || 'general';
  return ensureProjectGroup({
    name: scopedProjectFolder(req, rawProjectId),
    displayName: rawProjectId,
    path: projectPath,
    fullPath: projectPath,
  });
}

function toolContext(req, body = {}) {
  const projectId = body.projectId || body.project_id || req.query.projectId || 'general';
  const folder = scopedProjectFolder(req, projectId);
  return {
    // Non-admin task groups are namespaced by user id. This keeps NanoClaw
    // schedules and session state separate even when two users use the same
    // project name (including the default "general" project).
    chatJid: `pixcode:project:${folder}`,
    groupFolder: folder,
    // Main-group privileges are reserved for the server owner.  Treating
    // every authenticated request as `isMain` bypassed NanoClaw's group
    // ownership checks and mixed users' task/conversation state.
    isMain: isPrivilegedNanoclawUser(req),
    sendMessage: async (text) => {
      console.log(`[nanoclaw/pixbot] ${projectId}: ${String(text).slice(0, 200)}`);
    },
  };
}

function canUseNanoclawProject(req, projectId, projectPath, capability = 'runAgents') {
  // Administrators/owners may operate NanoClaw against any registered or
  // explicitly selected workspace.  Everyone else must have an explicit
  // project grant whenever a path is supplied.
  if (isPrivilegedNanoclawUser(req)) return true;

  const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
  const normalizedProjectPath = typeof projectPath === 'string' ? projectPath.trim() : '';

  // `general` is the harmless, path-less personal workspace.  Do not let a
  // caller smuggle an arbitrary cwd through that default project id.
  if ((!normalizedProjectId || normalizedProjectId === 'general') && !normalizedProjectPath) {
    return true;
  }

  // Every member receives a private workspace root for path-less NanoClaw
  // chats/runs.  This path is not represented in the collaborator table, so
  // authorize it explicitly before checking shared-project grants.
  if (normalizedProjectPath && isPrivateNanoclawPath(req, normalizedProjectPath)) {
    return true;
  }

  const project = {
    name: normalizedProjectId || 'general',
    projectName: normalizedProjectId || 'general',
    fullPath: normalizedProjectPath || undefined,
    path: normalizedProjectPath || undefined,
  };
  if (normalizedProjectPath) {
    return userHasProjectPathAccess(req?.user, project, normalizedProjectPath, capability);
  }
  return userHasProjectAccess(req?.user, project, capability);
}

/**
 * Build the NanoClaw context used by task mutations after ownership has been
 * checked.  Frontend calls intentionally omit projectId for these endpoints;
 * use the task's persisted group so a legitimate user's own task is not
 * compared against the default `general` group.
 */
function taskMutationContext(req, body, task) {
  const context = toolContext(req, body);
  if (!isPrivilegedNanoclawUser(req) && task?.group_folder) {
    context.groupFolder = task.group_folder;
    context.chatJid = task.chat_jid || `pixcode:project:${task.group_folder}`;
  }
  return context;
}

function taskMutationResponse(res, result) {
  const message = result?.content?.[0]?.text || 'Task operation failed.';
  if (result?.isError) return res.status(400).json({ ok: false, error: message, message });
  return res.json({ ok: true, message });
}

/**
 * Conversation visibility must follow the same NanoClaw privilege/scope
 * rules as task and provider mutations.  In particular, an API-key-authenticated
 * admin without an explicit admin/system scope is not a global administrator.
 */
function conversationOwnerScope(req) {
  return isPrivilegedNanoclawUser(req) ? null : (req?.user?.id || req?.user?.userId || null);
}

/**
 * Find a conversation only when both its owner and project are visible to the
 * current request.  The chat engine intentionally returns an empty message
 * list for an owner mismatch; checking here avoids turning that into a false
 * successful response and prevents project ids from becoming an access oracle.
 */
function accessibleConversation(chat, req, conversationId) {
  const ownerUserId = conversationOwnerScope(req);
  const conversation = chat.listConversations(null, ownerUserId)
    .find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  if (!canUseNanoclawProject(req, conversation.projectId || 'general', null, 'viewFiles')) return null;
  return conversation;
}

/**
 * Express router mounted at /api/nanoclaw and also under /api/tasks (UI compatibility).
 * Public remote clients should prefer /api/nanoclaw/* with X-API-Key or Bearer token.
 */
export function nanoclawRouter() {
  const router = express.Router();
  const requireTaskScope = (scope) => (req, res, next) => {
    if (!req.user?.api_key_id) return next();
    const scopes = Array.isArray(req.user.api_key_scopes) ? req.user.api_key_scopes : [];
    if (scopes.includes('*') || scopes.includes('admin') || scopes.includes('system') || scopes.includes(scope)) return next();
    return res.status(403).json({ error: `API key lacks required scope: ${scope}.` });
  };
  const requireTaskRead = requireTaskScope('tasks:read');
  const requireTaskWrite = requireTaskScope('tasks:write');
  const requireNanoclawAdmin = (req, res, next) => {
    if (!isPrivilegedNanoclawUser(req)) {
      return res.status(403).json({ error: 'NanoClaw administration requires an admin-scoped account.' });
    }
    return next();
  };

  router.get('/help', requireTaskRead, (_req, res) => {
    res.json(buildNanoclawApiHelp());
  });

  router.get('/status', requireTaskRead, async (_req, res) => {
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

  router.post('/start', requireNanoclawAdmin, async (_req, res) => {
    try {
      const result = await startNanoclawBridge();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/channels', requireTaskRead, async (_req, res) => {
    try {
      res.json({ ok: true, channels: await getChannelCapabilities() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Immediate multi-CLI run (does not require a schedule). */
  router.post('/run', requireTaskWrite, async (req, res) => {
    try {
      if (!started) {
        await startNanoclawBridge();
      }
      const prompt = readNanoText(
        req.body?.prompt ?? req.body?.message,
        MAX_NANO_PROMPT_CHARS,
        'prompt',
        { required: true },
      );

      const projectId = readNanoText(
        req.body?.projectId ?? req.body?.project_id ?? 'general',
        MAX_NANO_PROJECT_ID_CHARS,
        'projectId',
      ) || 'general';
      const requestedProjectPath = readNanoText(
        req.body?.projectPath ?? req.body?.cwd,
        MAX_NANO_PROJECT_PATH_CHARS,
        'projectPath',
      ) || null;
      const projectPath = await resolveRequestProjectPath(req, projectId, requestedProjectPath);
      if (!canUseNanoclawProject(req, projectId, projectPath)) {
        return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
      }
      // Provider session ids are opaque and are not self-authenticating. The
      // normal chat/WebSocket paths record ownership centrally, but this
      // standalone runner has no durable ownership context. Do not allow a
      // regular user to guess another user's provider session and resume it.
      if (req.body?.sessionId && !isPrivilegedNanoclawUser(req)) {
        return res.status(403).json({ error: 'Resuming a provider session requires an admin-scoped account.' });
      }
      await ensureRequestProjectGroup(req, projectId, projectPath);

      const { runPixcodeMultiAgent, normalizeAgentType } = await import('./multi-runner.js');
      const agentType = normalizeAgentType(req.body?.agentType || req.body?.agent || req.body?.provider);
      const logs = [];
      const result = await runPixcodeMultiAgent({
        prompt,
        groupFolder: scopedProjectFolder(req, projectId),
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
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // MCP-equivalent REST: schedule_task, list_tasks, get_task, update_task, pause/resume/cancel
  router.get('/tasks', requireTaskRead, async (req, res) => {
    try {
      const database = await loadDb();
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
      const tasks = visibleTasks(database, req, projectId);
      res.json({
        tasks: tasks.map(publicScheduledTask),
        crons: tasks.filter((t) => t.status === 'active').map(publicScheduledTask),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/tasks/:taskId', requireTaskRead, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      let runLogs = [];
      try {
        if (typeof database.getTaskRunLogs === 'function') {
          runLogs = database.getTaskRunLogs(req.params.taskId, 30).map((log) => ({
            id: log.id,
            taskId: log.task_id,
            runAt: log.run_at,
            durationMs: log.duration_ms,
            status: log.status,
            result: log.result,
            error: log.error,
          }));
        }
      } catch { /* ignore */ }
      res.json({
        task: publicScheduledTask(task),
        logs: runLogs,
        /** Human-friendly unwrapped result (last_result is often JSON) */
        resultText: formatTaskResultText(task.last_result),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks', requireTaskWrite, async (req, res) => {
    try {
      const tools = await loadMcp();
      const prompt = readNanoText(
        req.body?.prompt ?? req.body?.message,
        MAX_NANO_PROMPT_CHARS,
        'prompt',
        { required: true },
      );

      const requestedScheduleType = req.body?.schedule_type ?? req.body?.scheduleType ?? 'once';
      if (typeof requestedScheduleType !== 'string' || !['cron', 'interval', 'once'].includes(requestedScheduleType)) {
        return res.status(400).json({ error: 'schedule_type must be one of: cron, interval, once' });
      }
      const schedule_type = requestedScheduleType;
      let schedule_value = readNanoText(
        req.body?.schedule_value ?? req.body?.scheduleValue,
        MAX_NANO_SCHEDULE_CHARS,
        'schedule_value',
      );
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

      const projectId = readNanoText(
        req.body?.projectId ?? req.body?.project_id ?? 'general',
        MAX_NANO_PROJECT_ID_CHARS,
        'projectId',
      ) || 'general';
      const requestedProjectPath = readNanoText(
        req.body?.projectPath ?? req.body?.cwd,
        MAX_NANO_PROJECT_PATH_CHARS,
        'projectPath',
      ) || null;
      const projectPath = await resolveRequestProjectPath(req, projectId, requestedProjectPath);
      if (!canUseNanoclawProject(req, projectId, projectPath)) {
        return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
      }
      await ensureRequestProjectGroup(req, projectId, projectPath);

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
      const tasks = visibleTasks(database, req, typeof projectId === 'string' ? projectId : null);
      const created = tasks[0];
      res.status(201).json({
        ok: true,
        message: result.content?.[0]?.text,
        task: created ? publicScheduledTask(created) : null,
        tasks: tasks.map(publicScheduledTask),
      });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/pause', requireTaskWrite, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      const tools = await loadMcp();
      const result = await tools.toolPauseTask(req.params.taskId, taskMutationContext(req, req.body, task));
      return taskMutationResponse(res, result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/resume', requireTaskWrite, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      const tools = await loadMcp();
      const result = await tools.toolResumeTask(req.params.taskId, taskMutationContext(req, req.body, task));
      return taskMutationResponse(res, result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/tasks/:taskId/cancel', requireTaskWrite, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      const tools = await loadMcp();
      const result = await tools.toolCancelTask(req.params.taskId, taskMutationContext(req, req.body, task));
      return taskMutationResponse(res, result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.patch('/tasks/:taskId', requireTaskWrite, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      const tools = await loadMcp();
      const update = { task_id: req.params.taskId };
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'prompt')
        || Object.prototype.hasOwnProperty.call(req.body || {}, 'message')) {
        update.prompt = readNanoText(
          req.body?.prompt ?? req.body?.message,
          MAX_NANO_PROMPT_CHARS,
          'prompt',
          { required: true },
        );
      }
      const requestedScheduleType = req.body?.schedule_type ?? req.body?.scheduleType;
      if (requestedScheduleType !== undefined) {
        if (typeof requestedScheduleType !== 'string' || !['cron', 'interval', 'once'].includes(requestedScheduleType)) {
          return res.status(400).json({ error: 'schedule_type must be one of: cron, interval, once' });
        }
        update.schedule_type = requestedScheduleType;
      }
      const requestedScheduleValue = req.body?.schedule_value ?? req.body?.scheduleValue;
      if (requestedScheduleValue !== undefined) {
        update.schedule_value = readNanoText(
          requestedScheduleValue,
          MAX_NANO_SCHEDULE_CHARS,
          'schedule_value',
        );
      }
      const result = await tools.toolUpdateTask(
        update,
        taskMutationContext(req, req.body, task),
      );
      return taskMutationResponse(res, result);
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.delete('/tasks/:taskId', requireTaskWrite, async (req, res) => {
    try {
      const database = await loadDb();
      const task = database.getTaskById(req.params.taskId);
      if (!task || !taskBelongsToRequest(req, task)) return res.status(404).json({ error: 'Task not found' });
      database.deleteTask(req.params.taskId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ---- NanoClaw conversation surface (chat-first; not a job board) ----
  router.get('/bot/crons', requireTaskRead, async (req, res) => {
    // Compat alias → real scheduled tasks list (preserve query string e.g. projectId)
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/tasks${qs}`;
    return router.handle(req, res, () => {});
  });

  router.get('/bot/help', requireTaskRead, (_req, res) => {
    import('./chat-engine.js')
      .then((chat) => res.json({ ok: true, brand: 'PixBot', ...chat.chatHelpHints() }))
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  // PixBot LLM — multi custom providers + models.dev catalog
  router.get('/bot/llm', requireTaskRead, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const bootstrap = String(req.query.bootstrap || '') === '1';
      if (bootstrap) {
        if (!isPrivilegedNanoclawUser(req)) {
          return res.status(403).json({ error: 'NanoClaw administration requires an admin-scoped account.' });
        }
        res.json({ ok: true, brand: 'PixBot', ...(await llm.bootstrapPixbot({ refresh: true })) });
        return;
      }
      res.json({ ok: true, brand: 'PixBot', ...(await llm.getPixbotConfig()) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Open PixBot: sync system providers + pull models (also used as background refresh). */
  router.post('/bot/bootstrap', requireNanoclawAdmin, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const refresh = req.body?.refresh !== false;
      res.json({ ok: true, brand: 'PixBot', ...(await llm.bootstrapPixbot({ refresh })) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.put('/bot/llm', requireNanoclawAdmin, async (req, res) => {
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

  router.get('/bot/providers', requireTaskRead, async (_req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      res.json({ ok: true, brand: 'PixBot', ...(await llm.listPixbotProviders()) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/providers', requireNanoclawAdmin, async (req, res) => {
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

  router.patch('/bot/providers/:id', requireNanoclawAdmin, async (req, res) => {
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

  router.delete('/bot/providers/:id', requireNanoclawAdmin, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const result = await llm.removePixbotProvider(req.params.id);
      res.json({ ok: true, brand: 'PixBot', ...result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/providers/:id/activate', requireNanoclawAdmin, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const provider = await llm.setActivePixbotProvider(req.params.id);
      res.json({ ok: true, brand: 'PixBot', provider, ...(await llm.getPixbotConfig()) });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/catalog', requireTaskRead, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const forceRefresh = String(req.query.refresh || '') === '1';
      if (forceRefresh && !isPrivilegedNanoclawUser(req)) {
        return res.status(403).json({ error: 'NanoClaw administration requires an admin-scoped account.' });
      }
      const payload = await llm.listCatalogProviders({
        q: typeof req.query.q === 'string' ? req.query.q : '',
        limit: Number(req.query.limit) || 80,
        force: forceRefresh,
      });
      res.json({ ok: true, brand: 'PixBot', ...payload });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/bot/models', requireTaskRead, async (req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : undefined;
      const refresh = String(req.query.refresh || '') === '1';
      if (refresh && !isPrivilegedNanoclawUser(req)) {
        return res.status(403).json({ error: 'NanoClaw administration requires an admin-scoped account.' });
      }
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

  router.post('/bot/models/refresh', requireNanoclawAdmin, async (_req, res) => {
    try {
      const llm = await import('./pixbot-llm.js');
      const payload = await llm.refreshAllPixbotModels({ force: true });
      res.json({ ok: true, brand: 'PixBot', ...payload });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/bot/chat', requireTaskWrite, async (req, res) => {
    try {
      const message = readNanoText(
        req.body?.message ?? req.body?.prompt,
        MAX_NANO_PROMPT_CHARS,
        'message',
        { required: true },
      );
      const projectId = readNanoText(
        req.body?.projectId ?? req.body?.project_id ?? 'general',
        MAX_NANO_PROJECT_ID_CHARS,
        'projectId',
      ) || 'general';
      const requestedProjectPath = readNanoText(
        req.body?.projectPath ?? req.body?.cwd,
        MAX_NANO_PROJECT_PATH_CHARS,
        'projectPath',
      ) || null;
      if (!started) {
        await startNanoclawBridge();
      }
      const chat = await import('./chat-engine.js');
      const projectPath = await resolveRequestProjectPath(req, projectId, requestedProjectPath);

      if (!canUseNanoclawProject(req, projectId, projectPath)) {
        return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
      }

      await ensureRequestProjectGroup(req, projectId, projectPath);

      const tools = await loadMcp();
      const payload = await chat.handleChatTurn({
        projectId,
        conversationId: req.body?.conversationId || null,
        message,
        agentType: req.body?.agentType || req.body?.agent || null,
        model: req.body?.model || null,
        projectPath,
        forceCli: Boolean(req.body?.forceCli),
        ownerUserId: req.user?.id || null,
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
  router.post('/bot/chat/stream', requireTaskWrite, async (req, res) => {
    try {
      const message = readNanoText(
        req.body?.message ?? req.body?.prompt,
        MAX_NANO_PROMPT_CHARS,
        'message',
        { required: true },
      );
      const projectId = readNanoText(
        req.body?.projectId ?? req.body?.project_id ?? 'general',
        MAX_NANO_PROJECT_ID_CHARS,
        'projectId',
      ) || 'general';
      const requestedProjectPath = readNanoText(
        req.body?.projectPath ?? req.body?.cwd,
        MAX_NANO_PROJECT_PATH_CHARS,
        'projectPath',
      ) || null;
      if (!started) {
        await startNanoclawBridge();
      }
      const chat = await import('./chat-engine.js');
      const projectPath = await resolveRequestProjectPath(req, projectId, requestedProjectPath);

      if (!canUseNanoclawProject(req, projectId, projectPath)) {
        return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
      }

      await ensureRequestProjectGroup(req, projectId, projectPath);

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
        message,
        agentType: req.body?.agentType || req.body?.agent || null,
        model: req.body?.model || null,
        projectPath,
        forceCli: Boolean(req.body?.forceCli),
        ownerUserId: req.user?.id || null,
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

  router.get('/bot/conversations', requireTaskRead, (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
        if (projectId && !canUseNanoclawProject(req, projectId, null, 'viewFiles')) {
          return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
        }
        const ownerUserId = conversationOwnerScope(req);
        const conversations = chat.listConversations(projectId, ownerUserId)
          .filter((conversation) => canUseNanoclawProject(req, conversation.projectId || 'general', null, 'viewFiles'));
        return res.json({ conversations });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.post('/bot/conversations', requireTaskWrite, (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        const projectId = String(req.body?.projectId || 'general').trim() || 'general';
        if (!canUseNanoclawProject(req, projectId, null, 'chatAgents')) {
          return res.status(403).json({ error: 'NanoClaw access denied for this project.' });
        }
        const conversation = chat.createConversation({
          projectId,
          title: req.body?.title,
          defaultAgent: req.body?.agentType || req.body?.defaultAgent,
          ownerUserId: isPrivilegedNanoclawUser(req) ? null : (req.user?.id || req.user?.userId || null),
        });
        return res.status(201).json({ conversation });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.get('/bot/conversations/:id/messages', requireTaskRead, (req, res) => {
    import('./chat-engine.js')
      .then((chat) => {
        const conversation = accessibleConversation(chat, req, req.params.id);
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        const ownerUserId = conversationOwnerScope(req);
        return res.json({ messages: chat.getMessages(req.params.id, ownerUserId) });
      })
      .catch((error) => res.status(500).json({ error: error?.message || String(error) }));
  });

  router.get('/bot/proposals', requireTaskRead, (_req, res) => res.json({ proposals: [] }));
  router.get('/bot/plans', requireTaskRead, (_req, res) => res.json({ plans: [] }));
  router.get('/meta/agents', requireTaskRead, async (_req, res) => {
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
  router.get('/agents', requireTaskRead, (req, res) => {
    req.url = '/meta/agents';
    return router.handle(req, res, () => {});
  });
  router.get('/meta/roles', requireTaskRead, (_req, res) => res.json({ roles: [] }));
  router.get('/events', requireTaskRead, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', engine: 'nanoclaw-lite', started })}\n\n`);
    const timer = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() })}\n\n`);
    }, 25000);
    req.on('close', () => {
      clearInterval(timer);
    });
  });
  router.get('/', requireTaskRead, async (req, res) => {
    try {
      const database = await loadDb();
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
      const tasks = visibleTasks(database, req, projectId);
      res.json({
        tasks: tasks.map((t) => {
          const pub = publicScheduledTask(t);
          return {
            id: pub.id,
            projectId: pub.projectId,
            title: pub.title,
            prompt: pub.prompt,
            status: t.status === 'active' ? 'QUEUED' : t.status === 'completed' ? 'COMPLETED' : t.status === 'paused' ? 'CANCELLED' : 'PENDING',
            agentType: pub.agent || pub.agentType || 'claude-code',
            role: 'custom',
            priority: 'normal',
            createdAt: pub.createdAt,
            scheduledAt: pub.nextRunAt,
            result: pub.resultText || pub.lastResult || undefined,
          };
        }),
        pendingApprovals: [],
        plans: [],
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

function parseAgentFromPrompt(prompt) {
  const text = String(prompt || '');
  const match = text.match(/^\s*\[agent:([^\s\]]+)(?:\s+model:([^\]]+))?\]/i);
  if (!match) return { agent: null, model: null, body: text };
  return {
    agent: match[1] || null,
    model: match[2]?.trim() || null,
    body: text.slice(match[0].length).trim(),
  };
}

/** Unwrap JSON-ish last_result blobs into readable agent output. */
function formatTaskResultText(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (parsed.error) return `Hata: ${typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error, null, 2)}`;
      if (parsed.result != null) {
        return typeof parsed.result === 'string'
          ? parsed.result
          : JSON.stringify(parsed.result, null, 2);
      }
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // plain text
  }
  return text;
}

function publicScheduledTask(row) {
  const parsed = parseAgentFromPrompt(row.prompt);
  const body = parsed.body || row.prompt || '';
  const lastResult = row.last_result;
  return {
    id: row.id,
    // Storage folders for non-admin users are namespaced (`u<id>_...`), but
    // that implementation detail should not leak into the UI/API contract.
    projectId: String(row.group_folder || '').replace(/^u(?:\d+|anonymous)_/u, ''),
    title: body.slice(0, 80) || row.prompt?.slice(0, 80),
    prompt: row.prompt,
    scheduleType: row.schedule_type,
    scheduleValue: row.schedule_value,
    cronExpression: row.schedule_type === 'cron' ? row.schedule_value : undefined,
    recurrence: row.schedule_type,
    nextRunAt: row.next_run,
    lastRunAt: row.last_run,
    lastResult,
    resultText: formatTaskResultText(lastResult),
    status: row.status,
    enabled: row.status === 'active',
    contextMode: row.context_mode,
    createdAt: row.created_at,
    agentType: parsed.agent || 'claude-code',
    agent: parsed.agent,
    model: parsed.model,
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
