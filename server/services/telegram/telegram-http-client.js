import { EventEmitter } from 'node:events';

/**
 * Minimal Telegram Bot API client.
 *
 * Replaces `node-telegram-bot-api` which pulled in the deprecated
 * `request` / `har-validator` / `uuid@3` chain (~30 transitive packages,
 * npm install warnings on every fresh box). The Bot API itself is just
 * HTTP, and we only use a few endpoints (getUpdates polling + sendMessage +
 * callback answers + message edits),
 * so 100 lines of fetch is all that's needed. Exposes the same surface
 * the bot.js consumer relied on: `getMe()`, `sendMessage()`,
 * `editMessageText()`, `answerCallbackQuery()`,
 * `on('message'|'callback_query'|'polling_error')`, `stopPolling()`.
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
  constructor(token, { polling = true, pollTimeoutSec = 30, pollLimit = 25, dropPendingUpdates = true } = {}) {
    super();
    if (!token) throw new Error('TelegramHttpBot: token is required');
    this._token = token;
    this._pollTimeoutSec = pollTimeoutSec;
    this._pollLimit = pollLimit;
    this._dropPendingUpdates = dropPendingUpdates;
    this._offset = 0;
    this._polling = false;
    this._abortController = null;
    this._pollingLoop = null;
    this._pollingErrorCount = 0;
    if (polling) this.startPolling();
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

  async editMessageText(text, extra = {}) {
    return callApi(this._token, 'editMessageText', {
      text,
      ...extra,
    });
  }

  async answerCallbackQuery(callbackQueryId, extra = {}) {
    return callApi(this._token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...extra,
    });
  }

  async stopPolling(_opts = {}) {
    this._polling = false;
    try { this._abortController?.abort(); } catch { /* ignore */ }
    this._abortController = null;
    if (this._pollingLoop) {
      await this._pollingLoop.catch(() => {});
      this._pollingLoop = null;
    }
  }

  // ---------- Polling loop ----------

  async startPolling({ dropPendingUpdates = this._dropPendingUpdates } = {}) {
    if (this._polling) return;
    this._polling = true;
    this._pollingLoop = this._runPollingLoop({ dropPendingUpdates });
    await Promise.resolve();
  }

  async _dropPendingUpdatesBeforePolling() {
    try {
      await callApi(this._token, 'deleteWebhook', { drop_pending_updates: true });
      return;
    } catch (err) {
      this.emit('polling_error', err);
    }

    // Fallback for environments where deleteWebhook is rejected: a negative
    // offset asks Telegram to forget older queued updates.
    try {
      const updates = await callApi(this._token, 'getUpdates', {
        offset: -1,
        limit: 1,
        timeout: 0,
        allowed_updates: ['message', 'callback_query'],
      });
      const lastUpdate = Array.isArray(updates) ? updates.at(-1) : null;
      if (typeof lastUpdate?.update_id === 'number') {
        this._offset = lastUpdate.update_id + 1;
      }
    } catch (err) {
      this.emit('polling_error', err);
    }
  }

  async _emitSerial(eventName, payload) {
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      try {
        await listener(payload);
      } catch (err) {
        this.emit('polling_error', err);
      }
    }
  }

  async _runPollingLoop({ dropPendingUpdates }) {
    if (dropPendingUpdates) {
      await this._dropPendingUpdatesBeforePolling();
    }

    // Each iteration long-polls getUpdates for up to pollTimeoutSec, then
    // loops immediately. We deliberately serialize update handling because a
    // stale Telegram backlog can otherwise fan out into many expensive scans.
    while (this._polling) {
      this._abortController = new AbortController();
      try {
        const updates = await callApi(
          this._token,
          'getUpdates',
          {
            offset: this._offset,
            limit: this._pollLimit,
            timeout: this._pollTimeoutSec,
            allowed_updates: ['message', 'callback_query'],
          },
          { signal: this._abortController.signal },
        );
        for (const update of updates) {
          if (typeof update.update_id === 'number') {
            this._offset = Math.max(this._offset, update.update_id + 1);
          }
          if (update.message) {
            await this._emitSerial('message', update.message);
          }
          if (update.callback_query) {
            await this._emitSerial('callback_query', update.callback_query);
          }
        }
        this._pollingErrorCount = 0;
      } catch (err) {
        // AbortError is the expected path when stopPolling() is called.
        if (err?.name === 'AbortError' || !this._polling) break;
        this.emit('polling_error', err);
        const status = err?.response?.statusCode || err?.code;
        const baseDelay = status === 409 ? 2000 : 1000;
        const delay = Math.min(60_000, baseDelay * 2 ** this._pollingErrorCount);
        this._pollingErrorCount = Math.min(this._pollingErrorCount + 1, 6);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
