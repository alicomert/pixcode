/**
 * Nanoclaw-lite-inspired SQLite store for Pixcode PixBot.
 * Schema mirrors scheduled_tasks / task_run_logs / sessions; group_folder → project_id.
 */
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { DB_PATH, DATA_DIR } from './config.js';

let db;

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_path TEXT,
      user_id TEXT,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      context_mode TEXT DEFAULT 'isolated',
      agent_type TEXT DEFAULT 'opencode',
      model TEXT,
      autonomy_level TEXT DEFAULT 'supervised',
      title TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nc_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_nc_status ON scheduled_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_nc_project ON scheduled_tasks(project_id);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_nc_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS sessions (
      project_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_type TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      project_id TEXT NOT NULL,
      project_path TEXT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      autonomy_level TEXT DEFAULT 'supervised',
      plan_json TEXT,
      summary TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nc_jobs_project ON jobs(project_id, created_at);

    CREATE TABLE IF NOT EXISTS job_steps (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      agent_type TEXT,
      model TEXT,
      role TEXT,
      depends_on TEXT,
      status TEXT DEFAULT 'pending',
      task_run_id TEXT,
      result TEXT,
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_nc_steps_job ON job_steps(job_id);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function initNanoclawDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  return db;
}

export function getDb() {
  if (!db) initNanoclawDb();
  return db;
}

// ── Scheduled tasks (nanoclaw parity) ─────────────────────────────────

export function createTask(task) {
  getDb().prepare(`
    INSERT INTO scheduled_tasks (
      id, project_id, project_path, user_id, prompt, schedule_type, schedule_value,
      context_mode, next_run, status, agent_type, model, autonomy_level, title, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.project_id,
    task.project_path || null,
    task.user_id || null,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run || null,
    task.status || 'active',
    task.agent_type || 'opencode',
    task.model || null,
    task.autonomy_level || 'supervised',
    task.title || null,
    task.created_at || new Date().toISOString(),
  );
}

export function getTaskById(id) {
  return getDb().prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}

export function getTasksForProject(projectId) {
  return getDb()
    .prepare('SELECT * FROM scheduled_tasks WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
}

export function getAllTasks(userId = null) {
  if (userId != null) {
    return getDb()
      .prepare('SELECT * FROM scheduled_tasks WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC')
      .all(String(userId));
  }
  return getDb().prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all();
}

export function getDueTasks() {
  const now = new Date().toISOString();
  return getDb().prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `).all(now);
}

export function updateTask(id, updates) {
  const fields = [];
  const values = [];
  for (const key of [
    'prompt', 'schedule_type', 'schedule_value', 'next_run', 'status',
    'agent_type', 'model', 'autonomy_level', 'title', 'context_mode', 'last_run', 'last_result',
  ]) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTask(id) {
  getDb().prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  getDb().prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function updateTaskAfterRun(id, nextRun, lastResult) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?,
        status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log) {
  getDb().prepare(`
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result ?? null,
    log.error ?? null,
  );
}

export function getTaskRunLogs(taskId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY run_at DESC LIMIT ?
  `).all(taskId, limit);
}

// ── Sessions ──────────────────────────────────────────────────────────

export function getSession(projectId) {
  return getDb().prepare('SELECT session_id, agent_type FROM sessions WHERE project_id = ?').get(projectId);
}

export function setSession(projectId, sessionId, agentType = null) {
  getDb().prepare(`
    INSERT INTO sessions (project_id, session_id, agent_type) VALUES (?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET session_id = excluded.session_id,
      agent_type = COALESCE(excluded.agent_type, agent_type)
  `).run(projectId, sessionId, agentType);
}

// ── Jobs / auto_plan ──────────────────────────────────────────────────

export function createJob(job) {
  getDb().prepare(`
    INSERT INTO jobs (id, user_id, project_id, project_path, title, prompt, status, autonomy_level, plan_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.user_id || null,
    job.project_id,
    job.project_path || null,
    job.title,
    job.prompt,
    job.status,
    job.autonomy_level || 'supervised',
    job.plan_json || null,
    job.created_at,
    job.updated_at || job.created_at,
  );
}

export function updateJob(id, patch) {
  const fields = [];
  const values = [];
  for (const key of ['status', 'summary', 'error', 'plan_json', 'finished_at', 'title']) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  getDb().prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getJob(id) {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

export function listJobs({ userId, projectId, limit = 50 } = {}) {
  if (projectId && userId) {
    return getDb().prepare(`
      SELECT * FROM jobs WHERE project_id = ? AND (user_id = ? OR user_id IS NULL)
      ORDER BY created_at DESC LIMIT ?
    `).all(projectId, String(userId), limit);
  }
  if (projectId) {
    return getDb().prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit);
  }
  if (userId) {
    return getDb().prepare('SELECT * FROM jobs WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT ?').all(String(userId), limit);
  }
  return getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function createJobStep(step) {
  getDb().prepare(`
    INSERT INTO job_steps (
      id, job_id, step_key, title, description, agent_type, model, role,
      depends_on, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    step.id,
    step.job_id,
    step.step_key,
    step.title,
    step.description || null,
    step.agent_type || null,
    step.model || null,
    step.role || null,
    step.depends_on ? JSON.stringify(step.depends_on) : '[]',
    step.status || 'pending',
  );
}

export function updateJobStep(id, patch) {
  const fields = [];
  const values = [];
  for (const key of ['status', 'result', 'error', 'started_at', 'finished_at', 'task_run_id', 'agent_type', 'model']) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE job_steps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getJobSteps(jobId) {
  const rows = getDb().prepare('SELECT * FROM job_steps WHERE job_id = ? ORDER BY rowid').all(jobId);
  return rows.map((row) => ({
    ...row,
    depends_on: safeJsonArray(row.depends_on),
  }));
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function publicTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title || row.prompt?.slice(0, 72),
    prompt: row.prompt,
    scheduleType: row.schedule_type,
    scheduleValue: row.schedule_value,
    nextRunAt: row.next_run,
    lastRunAt: row.last_run,
    lastResult: row.last_result,
    status: row.status,
    contextMode: row.context_mode,
    agentType: row.agent_type,
    model: row.model,
    autonomyLevel: row.autonomy_level,
    createdAt: row.created_at,
  };
}

export function publicJob(row) {
  if (!row) return null;
  let plan = null;
  try { plan = row.plan_json ? JSON.parse(row.plan_json) : null; } catch { /* ignore */ }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    autonomyLevel: row.autonomy_level,
    plan,
    summary: row.summary,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}
