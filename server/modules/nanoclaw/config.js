import os from 'node:os';
import path from 'node:path';

/** Poll interval for due scheduled tasks (nanoclaw-lite: 60s). */
export const SCHEDULER_POLL_INTERVAL = Number(process.env.PIXCODE_NANOCLAW_POLL_MS || 60_000);

/** Max concurrent agent/CLI runs across all projects. */
export const MAX_CONCURRENT_AGENTS = Math.max(
  1,
  Number.parseInt(process.env.PIXCODE_TASK_CONCURRENCY || '2', 10) || 2,
);

export const DATA_DIR = process.env.PIXCODE_NANOCLAW_DIR
  || path.join(process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode'), 'nanoclaw');

export const DB_PATH = process.env.PIXCODE_NANOCLAW_DB
  || path.join(DATA_DIR, 'messages.db');

export const TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const ASSISTANT_NAME = process.env.PIXCODE_ASSISTANT_NAME || 'PixBot';
