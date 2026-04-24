import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal JSON-backed store with atomic writes.
 *
 * Replaces the `better-sqlite3` auth/session/telegram DB from previous
 * releases. The backing store is kilobytes, not gigabytes — a SQL engine
 * was overkill and the native compile dragged install-time warnings +
 * on-disk WAL files that confused users. This impl:
 *
 *   - Loads the entire store into memory on first access (synchronous
 *     readFileSync) and keeps it cached; all subsequent reads hit the
 *     in-memory structure.
 *   - Every write flushes the whole document via write-to-tmp + rename
 *     so a crash mid-write can never truncate the file; either the
 *     old file survives or the new one is fully written.
 *   - All operations are synchronous and rely on Node's single-threaded
 *     JS execution for concurrency safety. No async queue, no locks.
 *
 * The schema is a flat object with one array per "table":
 *   { _version, _sequences: {<table>: nextId}, users: [...], ... }
 *
 * Callers use helpers like `insert`, `updateWhere`, `findWhere`,
 * `deleteWhere` rather than composing queries — this is a key/value map
 * with filter helpers, not a SQL engine.
 */

const CURRENT_VERSION = 1;

// Tables the store manages — empty arrays on a fresh file.
const EMPTY_STORE = () => ({
  _version: CURRENT_VERSION,
  _sequences: {
    users: 0,
    api_keys: 0,
    user_credentials: 0,
    vapid_keys: 0,
    push_subscriptions: 0,
  },
  users: [],
  api_keys: [],
  user_credentials: [],
  user_notification_preferences: [], // each row: { user_id, preferences_json, updated_at }
  vapid_keys: [],
  push_subscriptions: [],
  session_names: [], // each row: { session_id, provider, custom_name, created_at, updated_at }
  app_config: [], // each row: { key, value, created_at }
  telegram_config: [], // 0 or 1 row: { id=1, bot_token, bot_username, updated_at }
  telegram_links: [], // each row: { user_id, chat_id, ... }
});

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = `${filePath}.tmp`;
    this.data = null;
    this._ensureLoaded();
  }

  _ensureLoaded() {
    if (this.data) return;

    // Ensure parent directory exists — matches the old better-sqlite3
    // behavior where the directory was created during initialization.
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      this.data = EMPTY_STORE();
      this._flush();
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      // Fill missing keys from EMPTY_STORE so adding a new "table" in a
      // later schema doesn't crash a fresh deploy reading an old file.
      this.data = { ...EMPTY_STORE(), ...parsed };
      // Ensure each well-known array key is actually an array — defends
      // against a hand-edited file that set one to null or an object.
      const empty = EMPTY_STORE();
      for (const key of Object.keys(empty)) {
        if (key === '_version' || key === '_sequences') continue;
        if (!Array.isArray(this.data[key])) {
          this.data[key] = [];
        }
      }
      this.data._sequences = { ...empty._sequences, ...(parsed._sequences || {}) };
    } catch (err) {
      // Corrupted file — back up and start fresh. Never hide this; it's
      // very likely user-visible (logins will reset).
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      console.error(`[JsonStore] Failed to read ${this.filePath}: ${err.message}. Backing up to ${backup}.`);
      try { fs.renameSync(this.filePath, backup); } catch { /* noop */ }
      this.data = EMPTY_STORE();
      this._flush();
    }
  }

  _flush() {
    const serialized = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(this.tmpPath, serialized, 'utf8');
    fs.renameSync(this.tmpPath, this.filePath);
  }

  // ---------- Raw access ----------
  get raw() {
    this._ensureLoaded();
    return this.data;
  }

  save() { this._flush(); }

  // ---------- Sequence (AUTOINCREMENT) ----------
  nextId(table) {
    this._ensureLoaded();
    this.data._sequences[table] = (this.data._sequences[table] || 0) + 1;
    return this.data._sequences[table];
  }

  // ---------- Query helpers ----------
  findWhere(table, predicate) {
    this._ensureLoaded();
    return this.data[table].find(predicate) || null;
  }

  filterWhere(table, predicate) {
    this._ensureLoaded();
    return this.data[table].filter(predicate);
  }

  count(table, predicate) {
    this._ensureLoaded();
    if (!predicate) return this.data[table].length;
    return this.data[table].filter(predicate).length;
  }

  // ---------- Mutation helpers ----------
  insert(table, row, { autoId = true, sequenceKey } = {}) {
    this._ensureLoaded();
    const finalRow = { ...row };
    if (autoId && finalRow.id === undefined) {
      finalRow.id = this.nextId(sequenceKey || table);
    }
    this.data[table].push(finalRow);
    this._flush();
    return finalRow;
  }

  updateWhere(table, predicate, updater) {
    this._ensureLoaded();
    let changed = 0;
    for (const row of this.data[table]) {
      if (predicate(row)) {
        const patch = typeof updater === 'function' ? updater(row) : updater;
        Object.assign(row, patch);
        changed += 1;
      }
    }
    if (changed > 0) this._flush();
    return changed;
  }

  upsertWhere(table, predicate, row) {
    this._ensureLoaded();
    const existing = this.data[table].find(predicate);
    if (existing) {
      Object.assign(existing, row);
      this._flush();
      return existing;
    }
    return this.insert(table, row);
  }

  deleteWhere(table, predicate) {
    this._ensureLoaded();
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter((row) => !predicate(row));
    const removed = before - this.data[table].length;
    if (removed > 0) this._flush();
    return removed;
  }
}

/**
 * Helper — ISO timestamp matching the DATETIME format SQLite used to
 * write. Stored as a plain ISO string; no one actually parses it beyond
 * displaying "last login X hours ago".
 */
export const nowIso = () => new Date().toISOString();
