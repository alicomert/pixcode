import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { findAppRoot, getModuleDir } from '../utils/runtime-paths.js';

import { JsonStore, nowIso } from './json-store.js';

// CommonJS `require` shim — we only reach for it once, during the
// legacy-to-JSON migration below, to dynamically import better-sqlite3
// only when an old auth.db is actually present on disk.
const require = createRequire(import.meta.url);

const __dirname = getModuleDir(import.meta.url);
// The compiled backend lives under dist-server/server/database, but the install root we log
// should still point at the project/app root. Resolving it here avoids build-layout drift.
const APP_ROOT = findAppRoot(__dirname);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

// DATABASE_PATH keeps its historical meaning (user override), but points
// at a `.json` file now. If the user's env var still names a `.db`
// extension, we swap to the corresponding `.json` sibling — the auth
// store moved off SQLite in v1.33.0.
const rawDbPath = process.env.DATABASE_PATH || path.join(__dirname, 'auth.db');
const JSON_PATH = rawDbPath.endsWith('.db')
    ? rawDbPath.replace(/\.db$/, '.json')
    : (rawDbPath.endsWith('.json') ? rawDbPath : `${rawDbPath}.json`);
const LEGACY_SQLITE_PATH = rawDbPath.endsWith('.db')
    ? rawDbPath
    : rawDbPath.replace(/\.json$/, '.db');

// Ensure parent dir exists before migration / initial write.
{
    const dir = path.dirname(JSON_PATH);
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); }
        catch (err) {
            console.error(`Failed to create database directory ${dir}:`, err.message);
            throw err;
        }
    }
}

/**
 * One-time migration from the previous better-sqlite3 auth.db to the
 * new JSON format. Triggered only when:
 *   - The legacy .db exists
 *   - AND no .json has been created yet
 * The legacy file is kept in place as `<name>.db.migrated-<timestamp>`
 * so a user can roll back by moving it into place and reinstalling
 * better-sqlite3 if they hit a showstopper. Runs synchronously because
 * all downstream modules (auth.js, vapid-keys.js) import `db` at module
 * load and can't wait for async startup.
 */
function migrateSqliteIfPresent() {
    if (fs.existsSync(JSON_PATH)) return; // Already migrated or fresh install.
    if (!fs.existsSync(LEGACY_SQLITE_PATH)) return; // Nothing to migrate.

    console.log(`${c.info('[MIGRATION]')} Converting ${c.bright(LEGACY_SQLITE_PATH)} → ${c.bright(JSON_PATH)} (JSON auth store, v1.33.0)`);

    let Database;
    try {
        const mod = require('better-sqlite3');
        Database = mod.default || mod;
    } catch {
        // Auto-install path fell through — the user has a legacy file but
        // better-sqlite3 isn't present (they may have a trimmed dep tree).
        // Surface a clear error; we'd rather fail startup than silently
        // skip migration and strand the user's saved credentials.
        console.error('[MIGRATION] Legacy auth.db present but better-sqlite3 not installed.');
        console.error('[MIGRATION] Install it once to migrate: `npm install better-sqlite3` in your pixcode install dir, then restart.');
        throw new Error('Auth DB migration requires better-sqlite3 (legacy file detected).');
    }

    const legacy = new Database(LEGACY_SQLITE_PATH, { readonly: true });
    const store = new JsonStore(JSON_PATH);

    // Pull every table, skipping silently when it doesn't exist (old
    // installs that never ran some migrations). We rely on `IF NOT EXISTS`
    // patterns from the old schema.js — missing tables throw a SQLite
    // error which we catch per-table.
    const safeAll = (sql) => {
        try { return legacy.prepare(sql).all(); } catch { return []; }
    };

    const users = safeAll('SELECT id, username, password_hash, created_at, last_login, is_active, git_name, git_email, has_completed_onboarding FROM users');
    for (const u of users) {
        store.raw.users.push({
            id: u.id,
            username: u.username,
            password_hash: u.password_hash,
            created_at: u.created_at || nowIso(),
            last_login: u.last_login || null,
            is_active: u.is_active !== 0,
            git_name: u.git_name || null,
            git_email: u.git_email || null,
            has_completed_onboarding: u.has_completed_onboarding === 1,
        });
        store.raw._sequences.users = Math.max(store.raw._sequences.users, u.id);
    }

    const apiKeys = safeAll('SELECT id, user_id, key_name, api_key, created_at, last_used, is_active FROM api_keys');
    for (const k of apiKeys) {
        store.raw.api_keys.push({
            id: k.id,
            user_id: k.user_id,
            key_name: k.key_name,
            api_key: k.api_key,
            created_at: k.created_at || nowIso(),
            last_used: k.last_used || null,
            is_active: k.is_active !== 0,
        });
        store.raw._sequences.api_keys = Math.max(store.raw._sequences.api_keys, k.id);
    }

    const credentials = safeAll('SELECT id, user_id, credential_name, credential_type, credential_value, description, created_at, is_active FROM user_credentials');
    for (const cr of credentials) {
        store.raw.user_credentials.push({
            id: cr.id,
            user_id: cr.user_id,
            credential_name: cr.credential_name,
            credential_type: cr.credential_type,
            credential_value: cr.credential_value,
            description: cr.description || null,
            created_at: cr.created_at || nowIso(),
            is_active: cr.is_active !== 0,
        });
        store.raw._sequences.user_credentials = Math.max(store.raw._sequences.user_credentials, cr.id);
    }

    const prefs = safeAll('SELECT user_id, preferences_json, updated_at FROM user_notification_preferences');
    for (const p of prefs) {
        store.raw.user_notification_preferences.push({
            user_id: p.user_id,
            preferences_json: p.preferences_json,
            updated_at: p.updated_at || nowIso(),
        });
    }

    const vapid = safeAll('SELECT id, public_key, private_key, created_at FROM vapid_keys');
    for (const v of vapid) {
        store.raw.vapid_keys.push({
            id: v.id,
            public_key: v.public_key,
            private_key: v.private_key,
            created_at: v.created_at || nowIso(),
        });
        store.raw._sequences.vapid_keys = Math.max(store.raw._sequences.vapid_keys, v.id);
    }

    const pushSubs = safeAll('SELECT id, user_id, endpoint, keys_p256dh, keys_auth, created_at FROM push_subscriptions');
    for (const s of pushSubs) {
        store.raw.push_subscriptions.push({
            id: s.id,
            user_id: s.user_id,
            endpoint: s.endpoint,
            keys_p256dh: s.keys_p256dh,
            keys_auth: s.keys_auth,
            created_at: s.created_at || nowIso(),
        });
        store.raw._sequences.push_subscriptions = Math.max(store.raw._sequences.push_subscriptions, s.id);
    }

    const sessionNames = safeAll('SELECT session_id, provider, custom_name, created_at, updated_at FROM session_names');
    for (const sn of sessionNames) {
        store.raw.session_names.push({
            session_id: sn.session_id,
            provider: sn.provider,
            custom_name: sn.custom_name,
            created_at: sn.created_at || nowIso(),
            updated_at: sn.updated_at || nowIso(),
        });
    }

    const appConfig = safeAll('SELECT key, value, created_at FROM app_config');
    for (const a of appConfig) {
        store.raw.app_config.push({
            key: a.key,
            value: a.value,
            created_at: a.created_at || nowIso(),
        });
    }

    const telegramConfig = safeAll('SELECT id, bot_token, bot_username, updated_at FROM telegram_config');
    for (const t of telegramConfig) {
        store.raw.telegram_config.push({
            id: 1,
            bot_token: t.bot_token,
            bot_username: t.bot_username || null,
            updated_at: t.updated_at || nowIso(),
        });
    }

    const telegramLinks = safeAll('SELECT user_id, chat_id, telegram_username, language, pairing_code, pairing_code_expires_at, verified_at, notifications_enabled, bridge_enabled, updated_at FROM telegram_links');
    for (const tl of telegramLinks) {
        store.raw.telegram_links.push({
            user_id: tl.user_id,
            chat_id: tl.chat_id || null,
            telegram_username: tl.telegram_username || null,
            language: tl.language || 'en',
            pairing_code: tl.pairing_code || null,
            pairing_code_expires_at: tl.pairing_code_expires_at || null,
            verified_at: tl.verified_at || null,
            notifications_enabled: tl.notifications_enabled !== 0,
            bridge_enabled: tl.bridge_enabled !== 0,
            updated_at: tl.updated_at || nowIso(),
        });
    }

    store.save();
    legacy.close();

    // Rename the old .db out of the way so we never migrate it twice.
    // Keep it (not delete) so the user can roll back if needed.
    const backup = `${LEGACY_SQLITE_PATH}.migrated-${Date.now()}`;
    try {
        fs.renameSync(LEGACY_SQLITE_PATH, backup);
        for (const suffix of ['-wal', '-shm']) {
            if (fs.existsSync(LEGACY_SQLITE_PATH + suffix)) {
                try { fs.renameSync(LEGACY_SQLITE_PATH + suffix, backup + suffix); } catch { /* noop */ }
            }
        }
    } catch (err) {
        console.warn(`[MIGRATION] Migration succeeded but could not rename old DB: ${err.message}`);
    }

    console.log(`${c.info('[MIGRATION]')} Migration complete. Old DB preserved as ${c.dim(backup)}.`);
}

// Module-load order matters — auth middleware imports `db` and reads the
// JWT secret before anything else gets to boot. So the store has to be
// ready synchronously at the first `import { db } from './db.js'`.
migrateSqliteIfPresent();

const store = new JsonStore(JSON_PATH);

console.log('');
console.log(c.dim('═'.repeat(60)));
console.log(`${c.info('[INFO]')} App Installation: ${c.bright(APP_ROOT)}`);
console.log(`${c.info('[INFO]')} Auth store: ${c.dim(path.relative(APP_ROOT, JSON_PATH))}`);
if (process.env.DATABASE_PATH) {
    console.log(`       ${c.dim('(Using custom DATABASE_PATH from environment)')}`);
}
console.log(c.dim('═'.repeat(60)));
console.log('');

// initializeDatabase used to run `CREATE TABLE IF NOT EXISTS` + migrations.
// The JSON store always has its shape pre-baked, so this is a no-op —
// keeping the export preserves the server boot sequence.
const initializeDatabase = async () => { /* schema lives in code, not in file */ };

// ---------------------------------------------------------------------------
// Back-compat `db` shim — a few modules outside database/db.js imported `db`
// and called `db.prepare(sql)` directly. Most of those uses were for trivial
// transaction markers (BEGIN/COMMIT/ROLLBACK — no-op under our JSON store)
// or very specific SELECTs we've wrapped in explicit helpers. This shim
// lets those call sites keep working without a bigger refactor.
// ---------------------------------------------------------------------------
const db = {
    prepare(sql) {
        const normalized = sql.trim().toUpperCase();
        // Transaction markers — our store writes atomically per op, so
        // there's no real transaction to start. No-op + success result.
        if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
            return {
                run: () => ({ changes: 0, lastInsertRowid: 0 }),
            };
        }

        // Specific query routed through the new helpers — used by
        // server/routes/projects.js to fetch a single github credential.
        if (/FROM USER_CREDENTIALS\s+WHERE ID = \?\s+AND USER_ID = \?\s+AND CREDENTIAL_TYPE = \?\s+AND IS_ACTIVE = 1/.test(normalized)) {
            return {
                get: (id, userId, credentialType) =>
                    store.findWhere('user_credentials',
                        (r) => r.id === id && r.user_id === userId && r.credential_type === credentialType && r.is_active)
                    || undefined,
            };
        }

        throw new Error(
            `db.prepare: unsupported SQL passed through the compat shim: ${sql.slice(0, 80)}`
            + '\nExtend server/database/db.js or use a dedicated helper (userDb, credentialsDb, …).',
        );
    },
};

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------
const userDb = {
    hasUsers: () => store.count('users', (r) => r.is_active) > 0,

    createUser: (username, passwordHash) => {
        const row = store.insert('users', {
            username,
            password_hash: passwordHash,
            created_at: nowIso(),
            last_login: null,
            is_active: true,
            git_name: null,
            git_email: null,
            has_completed_onboarding: false,
        });
        return { id: row.id, username: row.username };
    },

    getUserByUsername: (username) =>
        store.findWhere('users', (r) => r.username === username && r.is_active) || undefined,

    updateLastLogin: (userId) => {
        try {
            store.updateWhere('users', (r) => r.id === userId, { last_login: nowIso() });
        } catch (err) {
            console.warn('Failed to update last login:', err.message);
        }
    },

    getUserById: (userId) => {
        const row = store.findWhere('users', (r) => r.id === userId && r.is_active);
        if (!row) return undefined;
        return {
            id: row.id,
            username: row.username,
            created_at: row.created_at,
            last_login: row.last_login,
        };
    },

    getFirstUser: () => {
        const row = store.raw.users.find((r) => r.is_active);
        if (!row) return undefined;
        return {
            id: row.id,
            username: row.username,
            created_at: row.created_at,
            last_login: row.last_login,
        };
    },

    updateGitConfig: (userId, gitName, gitEmail) => {
        store.updateWhere('users', (r) => r.id === userId, { git_name: gitName, git_email: gitEmail });
    },

    getGitConfig: (userId) => {
        const row = store.findWhere('users', (r) => r.id === userId);
        if (!row) return undefined;
        return { git_name: row.git_name || null, git_email: row.git_email || null };
    },

    completeOnboarding: (userId) => {
        store.updateWhere('users', (r) => r.id === userId, { has_completed_onboarding: true });
    },

    hasCompletedOnboarding: (userId) => {
        const row = store.findWhere('users', (r) => r.id === userId);
        return Boolean(row?.has_completed_onboarding);
    },
};

// ---------------------------------------------------------------------------
// API key operations
// ---------------------------------------------------------------------------
const apiKeysDb = {
    generateApiKey: () => 'ck_' + crypto.randomBytes(32).toString('hex'),

    createApiKey: (userId, keyName) => {
        const apiKey = apiKeysDb.generateApiKey();
        const row = store.insert('api_keys', {
            user_id: userId,
            key_name: keyName,
            api_key: apiKey,
            created_at: nowIso(),
            last_used: null,
            is_active: true,
        });
        return { id: row.id, keyName, apiKey };
    },

    getApiKeys: (userId) => {
        const rows = store.filterWhere('api_keys', (r) => r.user_id === userId);
        // Match the old ORDER BY created_at DESC behaviour.
        return rows
            .slice()
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .map((r) => ({
                id: r.id,
                key_name: r.key_name,
                api_key: r.api_key,
                created_at: r.created_at,
                last_used: r.last_used,
                is_active: r.is_active ? 1 : 0,
            }));
    },

    validateApiKey: (apiKey) => {
        const key = store.findWhere('api_keys', (r) => r.api_key === apiKey && r.is_active);
        if (!key) return undefined;
        const user = store.findWhere('users', (r) => r.id === key.user_id && r.is_active);
        if (!user) return undefined;
        // Mirror the SQL-era side effect: stamp last_used. Only relevant
        // for the "which key was used last" display in the UI.
        store.updateWhere('api_keys', (r) => r.id === key.id, { last_used: nowIso() });
        return {
            id: user.id,
            username: user.username,
            api_key_id: key.id,
        };
    },

    deleteApiKey: (userId, apiKeyId) =>
        store.deleteWhere('api_keys', (r) => r.id === apiKeyId && r.user_id === userId) > 0,

    toggleApiKey: (userId, apiKeyId, isActive) =>
        store.updateWhere('api_keys', (r) => r.id === apiKeyId && r.user_id === userId, { is_active: Boolean(isActive) }) > 0,
};

// ---------------------------------------------------------------------------
// Credentials (GitHub tokens, etc.) operations
// ---------------------------------------------------------------------------
const credentialsDb = {
    createCredential: (userId, credentialName, credentialType, credentialValue, description = null) => {
        const row = store.insert('user_credentials', {
            user_id: userId,
            credential_name: credentialName,
            credential_type: credentialType,
            credential_value: credentialValue,
            description,
            created_at: nowIso(),
            is_active: true,
        });
        return { id: row.id, credentialName, credentialType };
    },

    getCredentials: (userId, credentialType = null) => {
        const rows = store.filterWhere('user_credentials', (r) =>
            r.user_id === userId && (credentialType == null || r.credential_type === credentialType),
        );
        return rows
            .slice()
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .map((r) => ({
                id: r.id,
                credential_name: r.credential_name,
                credential_type: r.credential_type,
                description: r.description,
                created_at: r.created_at,
                is_active: r.is_active ? 1 : 0,
            }));
    },

    getActiveCredential: (userId, credentialType) => {
        const rows = store.filterWhere('user_credentials', (r) =>
            r.user_id === userId && r.credential_type === credentialType && r.is_active,
        );
        if (rows.length === 0) return null;
        // "Most recent active" — mirror ORDER BY created_at DESC LIMIT 1
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return rows[0].credential_value;
    },

    getCredentialById: (userId, credentialId, credentialType = null) => {
        const row = store.findWhere('user_credentials', (r) =>
            r.id === credentialId && r.user_id === userId && r.is_active
            && (credentialType == null || r.credential_type === credentialType),
        );
        return row || undefined;
    },

    deleteCredential: (userId, credentialId) =>
        store.deleteWhere('user_credentials', (r) => r.id === credentialId && r.user_id === userId) > 0,

    toggleCredential: (userId, credentialId, isActive) =>
        store.updateWhere('user_credentials', (r) => r.id === credentialId && r.user_id === userId, { is_active: Boolean(isActive) }) > 0,
};

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------
const DEFAULT_NOTIFICATION_PREFERENCES = {
    channels: { inApp: false, webPush: false },
    events: { actionRequired: true, stop: true, error: true },
};

const normalizeNotificationPreferences = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    return {
        channels: {
            inApp: source.channels?.inApp === true,
            webPush: source.channels?.webPush === true,
        },
        events: {
            actionRequired: source.events?.actionRequired !== false,
            stop: source.events?.stop !== false,
            error: source.events?.error !== false,
        },
    };
};

const notificationPreferencesDb = {
    getPreferences: (userId) => {
        const row = store.findWhere('user_notification_preferences', (r) => r.user_id === userId);
        if (!row) {
            const defaults = normalizeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
            store.insert('user_notification_preferences', {
                user_id: userId,
                preferences_json: JSON.stringify(defaults),
                updated_at: nowIso(),
            }, { autoId: false });
            return defaults;
        }
        try {
            return normalizeNotificationPreferences(JSON.parse(row.preferences_json));
        } catch {
            return normalizeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
        }
    },

    updatePreferences: (userId, preferences) => {
        const normalized = normalizeNotificationPreferences(preferences);
        store.upsertWhere(
            'user_notification_preferences',
            (r) => r.user_id === userId,
            { user_id: userId, preferences_json: JSON.stringify(normalized), updated_at: nowIso() },
        );
        return normalized;
    },
};

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------
const pushSubscriptionsDb = {
    saveSubscription: (userId, endpoint, keysP256dh, keysAuth) => {
        // The old SQL path upserted on `endpoint`, updating user_id as
        // well. Preserve that exact behaviour.
        const existing = store.findWhere('push_subscriptions', (r) => r.endpoint === endpoint);
        if (existing) {
            store.updateWhere('push_subscriptions', (r) => r.endpoint === endpoint, {
                user_id: userId,
                keys_p256dh: keysP256dh,
                keys_auth: keysAuth,
            });
            return;
        }
        store.insert('push_subscriptions', {
            user_id: userId,
            endpoint,
            keys_p256dh: keysP256dh,
            keys_auth: keysAuth,
            created_at: nowIso(),
        });
    },

    getSubscriptions: (userId) =>
        store.filterWhere('push_subscriptions', (r) => r.user_id === userId).map((r) => ({
            endpoint: r.endpoint,
            keys_p256dh: r.keys_p256dh,
            keys_auth: r.keys_auth,
        })),

    removeSubscription: (endpoint) => {
        store.deleteWhere('push_subscriptions', (r) => r.endpoint === endpoint);
    },

    removeAllForUser: (userId) => {
        store.deleteWhere('push_subscriptions', (r) => r.user_id === userId);
    },
};

// ---------------------------------------------------------------------------
// VAPID key storage (for web push)
// ---------------------------------------------------------------------------
const vapidKeysDb = {
    getLatest: () => {
        if (store.raw.vapid_keys.length === 0) return null;
        // Mirror ORDER BY id DESC LIMIT 1 — take the newest row.
        const rows = store.raw.vapid_keys.slice().sort((a, b) => b.id - a.id);
        return { public_key: rows[0].public_key, private_key: rows[0].private_key };
    },
    insert: (publicKey, privateKey) => {
        store.insert('vapid_keys', {
            public_key: publicKey,
            private_key: privateKey,
            created_at: nowIso(),
        });
    },
};

// ---------------------------------------------------------------------------
// Session custom names
// ---------------------------------------------------------------------------
const sessionNamesDb = {
    setName: (sessionId, provider, customName) => {
        store.upsertWhere(
            'session_names',
            (r) => r.session_id === sessionId && r.provider === provider,
            { session_id: sessionId, provider, custom_name: customName, updated_at: nowIso(), created_at: nowIso() },
        );
    },

    getName: (sessionId, provider) => {
        const row = store.findWhere('session_names', (r) => r.session_id === sessionId && r.provider === provider);
        return row?.custom_name || null;
    },

    getNames: (sessionIds, provider) => {
        if (!sessionIds.length) return new Map();
        const lookup = new Set(sessionIds);
        const matches = store.filterWhere('session_names',
            (r) => r.provider === provider && lookup.has(r.session_id));
        return new Map(matches.map((r) => [r.session_id, r.custom_name]));
    },

    deleteName: (sessionId, provider) =>
        store.deleteWhere('session_names', (r) => r.session_id === sessionId && r.provider === provider) > 0,
};

function applyCustomSessionNames(sessions, provider) {
    if (!sessions?.length) return;
    try {
        const ids = sessions.map((s) => s.id);
        const customNames = sessionNamesDb.getNames(ids, provider);
        for (const session of sessions) {
            const custom = customNames.get(session.id);
            if (custom) session.summary = custom;
        }
    } catch (error) {
        console.warn(`[DB] Failed to apply custom session names for ${provider}:`, error.message);
    }
}

// ---------------------------------------------------------------------------
// App config (key/value)
// ---------------------------------------------------------------------------
const appConfigDb = {
    get: (key) => {
        const row = store.findWhere('app_config', (r) => r.key === key);
        return row?.value || null;
    },

    set: (key, value) => {
        store.upsertWhere('app_config', (r) => r.key === key,
            { key, value, created_at: nowIso() });
    },

    getOrCreateJwtSecret: () => {
        let secret = appConfigDb.get('jwt_secret');
        if (!secret) {
            secret = crypto.randomBytes(64).toString('hex');
            appConfigDb.set('jwt_secret', secret);
        }
        return secret;
    },
};

// ---------------------------------------------------------------------------
// Telegram — singleton config + per-user links
// ---------------------------------------------------------------------------
const telegramConfigDb = {
    get: () => {
        const row = store.raw.telegram_config[0];
        if (!row) return null;
        return { bot_token: row.bot_token, bot_username: row.bot_username, updated_at: row.updated_at };
    },
    set: (botToken, botUsername = null) => {
        store.raw.telegram_config = [{
            id: 1,
            bot_token: botToken,
            bot_username: botUsername,
            updated_at: nowIso(),
        }];
        store.save();
    },
    clear: () => {
        store.raw.telegram_config = [];
        store.save();
    },
};

const telegramLinksDb = {
    setPairingCode: (userId, code, expiresAt, language) => {
        store.upsertWhere('telegram_links', (r) => r.user_id === userId, {
            user_id: userId,
            pairing_code: code,
            pairing_code_expires_at: expiresAt,
            language,
            chat_id: null,
            telegram_username: null,
            verified_at: null,
            notifications_enabled: true,
            bridge_enabled: true,
            updated_at: nowIso(),
        });
    },
    findByPairingCode: (code) => {
        const row = store.findWhere('telegram_links', (r) => r.pairing_code === code);
        if (!row) return null;
        return {
            user_id: row.user_id,
            pairing_code: row.pairing_code,
            pairing_code_expires_at: row.pairing_code_expires_at,
            language: row.language,
        };
    },
    verify: (userId, chatId, telegramUsername) => {
        store.updateWhere('telegram_links', (r) => r.user_id === userId, {
            chat_id: chatId,
            telegram_username: telegramUsername,
            verified_at: nowIso(),
            pairing_code: null,
            pairing_code_expires_at: null,
            updated_at: nowIso(),
        });
    },
    getByUserId: (userId) => {
        const row = store.findWhere('telegram_links', (r) => r.user_id === userId);
        return row ? { ...row } : null;
    },
    getByChatId: (chatId) => {
        const row = store.findWhere('telegram_links', (r) => r.chat_id === chatId);
        if (!row) return null;
        return {
            user_id: row.user_id,
            chat_id: row.chat_id,
            telegram_username: row.telegram_username,
            language: row.language,
            notifications_enabled: row.notifications_enabled,
            bridge_enabled: row.bridge_enabled,
        };
    },
    listVerified: () =>
        store.filterWhere('telegram_links', (r) => r.chat_id && r.verified_at).map((r) => ({
            user_id: r.user_id,
            chat_id: r.chat_id,
            telegram_username: r.telegram_username,
            language: r.language,
            notifications_enabled: r.notifications_enabled,
            bridge_enabled: r.bridge_enabled,
        })),
    updatePreferences: (userId, { language, notificationsEnabled, bridgeEnabled }) => {
        const patch = { updated_at: nowIso() };
        if (language !== undefined) patch.language = language;
        if (notificationsEnabled !== undefined) patch.notifications_enabled = Boolean(notificationsEnabled);
        if (bridgeEnabled !== undefined) patch.bridge_enabled = Boolean(bridgeEnabled);
        if (Object.keys(patch).length === 1) return; // only updated_at → no real change
        store.updateWhere('telegram_links', (r) => r.user_id === userId, patch);
    },
    unlink: (userId) => {
        store.deleteWhere('telegram_links', (r) => r.user_id === userId);
    },
};

// Back-compat surface — older callers used `githubTokensDb.*`; internally
// they always delegated to credentialsDb with `credential_type='github_token'`.
const githubTokensDb = {
    createGithubToken: (userId, tokenName, githubToken, description = null) =>
        credentialsDb.createCredential(userId, tokenName, 'github_token', githubToken, description),
    getGithubTokens: (userId) => credentialsDb.getCredentials(userId, 'github_token'),
    getActiveGithubToken: (userId) => credentialsDb.getActiveCredential(userId, 'github_token'),
    deleteGithubToken: (userId, tokenId) => credentialsDb.deleteCredential(userId, tokenId),
    toggleGithubToken: (userId, tokenId, isActive) => credentialsDb.toggleCredential(userId, tokenId, isActive),
};

export {
    db,
    initializeDatabase,
    userDb,
    apiKeysDb,
    credentialsDb,
    notificationPreferencesDb,
    pushSubscriptionsDb,
    vapidKeysDb,
    sessionNamesDb,
    applyCustomSessionNames,
    appConfigDb,
    telegramConfigDb,
    telegramLinksDb,
    githubTokensDb,
};
