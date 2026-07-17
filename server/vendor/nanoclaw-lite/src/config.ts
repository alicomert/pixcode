import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

// Pixcode embedding: brand as PixBot when not overridden.
export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || process.env.PIXCODE_ASSISTANT_NAME || 'PixBot';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths — under ~/.pixcode/nanoclaw when embedded in Pixcode
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || os.homedir();
const PIXCODE_NANOCLAW_HOME =
  process.env.PIXCODE_NANOCLAW_DIR
  || path.join(process.env.PIXCODE_HOME || path.join(HOME_DIR, '.pixcode'), 'nanoclaw');

// Allowlist path for sender authorization
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'sender-allowlist.json',
);

// Prefer dedicated Pixcode data root so cwd is not polluted (global npm install)
export const STORE_DIR = process.env.NANOCLAW_STORE_DIR
  || path.join(PIXCODE_NANOCLAW_HOME, 'store');
export const GROUPS_DIR = process.env.NANOCLAW_GROUPS_DIR
  || path.join(PIXCODE_NANOCLAW_HOME, 'groups');
export const DATA_DIR = process.env.NANOCLAW_DATA_DIR
  || path.join(PIXCODE_NANOCLAW_HOME, 'data');

// Agent timeout (30 minutes default)
export const AGENT_TIMEOUT = parseInt(
  process.env.AGENT_TIMEOUT || '1800000',
  10,
);
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default
export const IPC_POLL_INTERVAL = 1000;

// Maximum concurrent agents
export const MAX_CONCURRENT_AGENTS = parseInt(
  process.env.PIXCODE_TASK_CONCURRENCY || process.env.MAX_CONCURRENT_AGENTS || '5',
  10,
);
// Do NOT default to 3001 — that collides with Pixcode SERVER_PORT
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.NANOCLAW_CREDENTIAL_PROXY_PORT || '3199',
  10,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
