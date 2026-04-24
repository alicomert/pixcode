import { EventEmitter } from 'node:events';

/**
 * Minimal Telegram Bot API client.
 *
 * Replaces `node-telegram-bot-api` which pulled in the deprecated
 * `request` / `har-validator` / `uuid@3` chain (~30 transitive packages,
 * npm install warnings on every fresh box). The Bot API itself is just
 * HTTP, and we only use two endpoints (getUpdates polling + sendMessage),
 * so 100 lines of fetch is all that's needed. Exposes the same surface
 * the bot.js consumer relied on: `getMe()`, `sendMessage()`, `on('message'|'polling_error')`,
 * `stopPolling()`.
 *
 * No third-party deps — uses Node 22's built-in `fetch`.
 */

const API_BASE = 'https://api.telegram.org/bot';

class TelegramApiError extends Error {
  constructor(method, body, httpStatus) {
    const description = body?.description || `HTTP ${httpStatus}`;
    super(`Telegram ${method} failed: ${description}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.httpStatus = httpStatus;
    // Mirror the shape node-telegram-bot-api exposed so upstream error
    // handling (401/409 checks in bot.js) keeps working unchanged.
    this.response = { statusCode: httpStatus, body };
    this.code = body?.error_code || httpStatus;
  }
}

/**
 * Call a Bot API method by name. Returns the `result` field on success,
 * throws a TelegramApiError otherwise.
 */
async function callApi(token, method, params, { signal } = {}) {
  const url = `${API_BASE}${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
    signal,
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body?.ok) {
    throw new TelegramApiError(method, body, res.status);
  }
  return body.result;
}

export class TelegramHttpBot extends EventEmitter {
  constructor(token, { polling = true, pollTimeoutSec = 30 } = {}) {
    super();
    if (!token) throw new Error('TelegramHttpBot: token is required');
    this._token = token;
    this._pollTimeoutSec = pollTimeoutSec;
    this._offset = 0;
    this._polling = false;
    this._abortController = null;
    if (polling) this._startPolling();
  }

  // ---------- Public API (mirrors node-telegram-bot-api surface) ----------

  async getMe() {
    return callApi(this._token, 'getMe', {});
  }

  async sendMessage(chatId, text, extra = {}) {
    return callApi(this._token, 'sendMessage', {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  async stopPolling(_opts = {}) {
    this._polling = false;
    try { this._abortController?.abort(); } catch { /* ignore */ }
    this._abortController = null;
  }

  // ---------- Polling loop ----------

  async _startPolling() {
    this._polling = true;
    // Kick off a non-awaited loop. Each iteration long-polls getUpdates for
    // up to pollTimeoutSec, then loops immediately. We deliberately serialize
    // (no concurrent long-polls) because Telegram rejects that with 409.
    (async () => {
      while (this._polling) {
        this._abortController = new AbortController();
        try {
          const updates = await callApi(
            this._token,
            'getUpdates',
            {
              offset: this._offset,
              timeout: this._pollTimeoutSec,
              allowed_updates: ['message'],
            },
            { signal: this._abortController.signal },
          );
          for (const update of updates) {
            if (typeof update.update_id === 'number') {
              this._offset = Math.max(this._offset, update.update_id + 1);
            }
            if (update.message) {
              try { this.emit('message', update.message); } catch (err) {
                // Don't let a listener exception break the poll loop.
                this.emit('polling_error', err);
              }
            }
          }
        } catch (err) {
          // AbortError is the expected path when stopPolling() is called.
          if (err?.name === 'AbortError' || !this._polling) break;
          this.emit('polling_error', err);
          // Back off before retrying — rapid retries on 401/409 would
          // otherwise spin at 100% CPU. Upstream consumer's polling_error
          // handler may also call stopBot() on 401/409 which flips _polling
          // off and breaks the loop on the next tick.
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
  }
}
