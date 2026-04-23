export const APP_CONFIG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

export const USER_NOTIFICATION_PREFERENCES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id INTEGER PRIMARY KEY,
  preferences_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`;

export const VAPID_KEYS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS vapid_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

export const PUSH_SUBSCRIPTIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`;

export const SESSION_NAMES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS session_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  custom_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, provider)
);`;

export const SESSION_NAMES_LOOKUP_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_session_names_lookup ON session_names(session_id, provider);`;

// Telegram integration: one global bot config row (id = 1), plus per-user links.
// The singleton CHECK keeps callers from accidentally inserting a second config
// — we only ever host one bot per Pixcode instance, and swapping tokens is an
// UPDATE, not an INSERT.
export const TELEGRAM_CONFIG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS telegram_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_token TEXT NOT NULL,
  bot_username TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

export const TELEGRAM_LINKS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS telegram_links (
  user_id INTEGER PRIMARY KEY,
  chat_id TEXT,
  telegram_username TEXT,
  language TEXT DEFAULT 'en',
  pairing_code TEXT,
  pairing_code_expires_at DATETIME,
  verified_at DATETIME,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  bridge_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`;

export const TELEGRAM_LINKS_CHAT_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chat_id);`;
export const TELEGRAM_LINKS_CODE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_telegram_links_code ON telegram_links(pairing_code);`;

export const DATABASE_SCHEMA_SQL = `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1,
  git_name TEXT,
  git_email TEXT,
  has_completed_onboarding BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  key_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

CREATE TABLE IF NOT EXISTS user_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_name TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  credential_value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

${USER_NOTIFICATION_PREFERENCES_TABLE_SQL}

${VAPID_KEYS_TABLE_SQL}

${PUSH_SUBSCRIPTIONS_TABLE_SQL}

${SESSION_NAMES_TABLE_SQL}

${SESSION_NAMES_LOOKUP_INDEX_SQL}

${APP_CONFIG_TABLE_SQL}

${TELEGRAM_CONFIG_TABLE_SQL}

${TELEGRAM_LINKS_TABLE_SQL}

${TELEGRAM_LINKS_CHAT_INDEX_SQL}

${TELEGRAM_LINKS_CODE_INDEX_SQL}
`;
