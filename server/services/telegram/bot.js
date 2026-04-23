import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

import { telegramConfigDb, telegramLinksDb } from '../../database/db.js';

import { t } from './translations.js';

// node-telegram-bot-api is a CommonJS module. Using createRequire keeps the
// default-export interop clean across ESM/CJS boundaries.
const requireCjs = createRequire(import.meta.url);
const TelegramBot = requireCjs('node-telegram-bot-api');

// Pairing code TTL. Ten minutes gives a user enough time to switch apps and
// type the code without leaving a long-lived code sitting around if they
// abandon the flow.
const PAIRING_TTL_MS = 10 * 60 * 1000;

// Singleton bot state. We intentionally host one bot per Pixcode instance —
// running multiple bots from the same token would cause Telegram to trip
// polling conflicts, and per-user bots are overkill.
let bot = null;
let botInfo = null; // { id, username, first_name }
let lastError = null;

// Subscribers (notification-orchestrator, future session bridge) use this to
// react to events without importing the bot module directly.
export const telegramEvents = new EventEmitter();

const now = () => Date.now();

const generate6DigitCode = () => {
  // Zero-padded random 6-digit code. Using rand instead of crypto is fine
  // here: the code is short-lived (10min), single-use, and verified against
  // a per-user row — brute-force requires both the code AND a live pairing.
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
};

export const createPairingCode = (userId, language = 'en') => {
  const code = generate6DigitCode();
  const expiresAtIso = new Date(now() + PAIRING_TTL_MS).toISOString();
  telegramLinksDb.setPairingCode(userId, code, expiresAtIso, language);
  return { code, expiresAt: expiresAtIso };
};

export const getBotState = () => ({
  running: Boolean(bot),
  username: botInfo?.username || null,
  error: lastError,
});

export const getPublicConfig = () => {
  const config = telegramConfigDb.get();
  return {
    configured: Boolean(config?.bot_token),
    username: config?.bot_username || null,
  };
};

const parseMaybeCode = (text) => {
  const trimmed = text.trim();
  // Only treat the message as a pairing attempt when it's *exactly* 6 digits,
  // otherwise a paired user typing "123456" as part of a prompt would get
  // rejected with "invalid code" instead of being forwarded.
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
};

const safeSend = async (chatId, text) => {
  if (!bot) return;
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    // Markdown parse errors from user input are common; retry plaintext.
    try {
      await bot.sendMessage(chatId, text);
    } catch (fallbackErr) {
      console.warn('[telegram] sendMessage failed:', fallbackErr?.message || fallbackErr);
    }
  }
};

const handlePairing = async (msg, code) => {
  const link = telegramLinksDb.findByPairingCode(code);
  const language = link?.language || 'en';

  if (!link) {
    await safeSend(msg.chat.id, t(language, 'pairing.notFound'));
    return;
  }

  const expiresAt = link.pairing_code_expires_at ? Date.parse(link.pairing_code_expires_at) : 0;
  if (!expiresAt || expiresAt < now()) {
    await safeSend(msg.chat.id, t(language, 'pairing.expired'));
    return;
  }

  const telegramUsername = msg.from?.username || null;
  telegramLinksDb.verify(link.user_id, String(msg.chat.id), telegramUsername);
  telegramEvents.emit('paired', { userId: link.user_id, chatId: String(msg.chat.id), username: telegramUsername });

  await safeSend(msg.chat.id, t(language, 'pairing.success'));
};

const handleBridgeMessage = async (msg, existing) => {
  const language = existing.language || 'en';

  if (!existing.bridge_enabled) {
    await safeSend(msg.chat.id, t(language, 'bridge.disabled'));
    return;
  }

  // Fan out to subscribers (future: session-prompt bridge). We don't do the
  // actual agent dispatch here to keep the bot service narrowly focused on
  // Telegram I/O and let the rest of the server opt in.
  telegramEvents.emit('prompt', {
    userId: existing.user_id,
    chatId: String(msg.chat.id),
    text: msg.text || '',
    language,
    messageId: msg.message_id,
  });

  await safeSend(msg.chat.id, t(language, 'bridge.queued'));
};

const handleMessage = async (msg) => {
  if (!msg?.chat?.id || !msg?.text) return;

  const existing = telegramLinksDb.getByChatId(String(msg.chat.id));
  if (existing) {
    // Paired user path: a 6-digit-only message is treated as noise (we keep
    // the already-paired binding); anything else is bridge traffic.
    const maybeCode = parseMaybeCode(msg.text);
    if (maybeCode) {
      await safeSend(msg.chat.id, t(existing.language || 'en', 'welcome.alreadyPaired'));
      return;
    }
    await handleBridgeMessage(msg, existing);
    return;
  }

  // Unpaired user path: only thing we accept is a 6-digit code. Anything else
  // is gently redirected to "please send your code" in a best-effort language
  // (we don't know their app language yet, so fall back to English).
  const maybeCode = parseMaybeCode(msg.text);
  if (maybeCode) {
    await handlePairing(msg, maybeCode);
    return;
  }

  if (/^\/start\b/i.test(msg.text)) {
    await safeSend(msg.chat.id, t('en', 'welcome.needsCode'));
    return;
  }

  // Anything else: keep nudging for the code (per user's "hep lütfen kodu
  // giriniz desin" requirement).
  await safeSend(msg.chat.id, t('en', 'pairing.stillNeeded'));
};

const wirePollingErrors = () => {
  if (!bot) return;
  bot.on('polling_error', (err) => {
    // 401 = bad token. 409 = another polling instance exists. Both mean we
    // should stop and surface the error rather than thrash.
    const code = err?.response?.statusCode || err?.code;
    lastError = { code: code || 'polling_error', message: err?.message || String(err) };
    if (code === 401 || code === 409) {
      console.error('[telegram] fatal polling error, stopping:', lastError);
      stopBot().catch(() => {});
    } else {
      console.warn('[telegram] polling error:', lastError);
    }
  });
};

export const startBot = async ({ token, persist = true } = {}) => {
  if (!token) {
    const config = telegramConfigDb.get();
    token = config?.bot_token;
  }
  if (!token) {
    throw new Error('No Telegram bot token available');
  }

  // Stop any previously-running instance before creating a new one — otherwise
  // node-telegram-bot-api will keep two pollers alive and Telegram will throw
  // 409 conflicts on every long-poll.
  if (bot) await stopBot();

  const instance = new TelegramBot(token, { polling: true });
  // Validate the token first — if getMe fails we never want to persist a
  // broken token or leave the poller running.
  let me;
  try {
    me = await instance.getMe();
  } catch (err) {
    try { await instance.stopPolling(); } catch { /* ignore */ }
    const reason = err?.response?.body?.description || err?.message || String(err);
    lastError = { code: 'auth', message: reason };
    const error = new Error(`Invalid bot token: ${reason}`);
    error.code = 'INVALID_TOKEN';
    throw error;
  }

  bot = instance;
  botInfo = { id: me.id, username: me.username, first_name: me.first_name };
  lastError = null;

  if (persist) telegramConfigDb.set(token, me.username);

  bot.on('message', (msg) => {
    handleMessage(msg).catch((err) => {
      console.error('[telegram] handleMessage crashed:', err);
    });
  });
  wirePollingErrors();

  console.log(`[telegram] bot started as @${me.username}`);
  telegramEvents.emit('started', { username: me.username });
  return botInfo;
};

export const stopBot = async () => {
  if (!bot) return;
  try {
    await bot.stopPolling({ cancel: true });
  } catch (err) {
    console.warn('[telegram] stopPolling failed:', err?.message || err);
  }
  bot = null;
  botInfo = null;
  telegramEvents.emit('stopped');
};

export const removeBotConfig = async () => {
  await stopBot();
  telegramConfigDb.clear();
};

export const sendToUser = async (userId, text) => {
  const link = telegramLinksDb.getByUserId(userId);
  if (!link?.chat_id || !bot) return false;
  try {
    await bot.sendMessage(link.chat_id, text);
    return true;
  } catch (err) {
    console.warn('[telegram] sendToUser failed:', err?.message || err);
    return false;
  }
};

// Convenience helper for notification-orchestrator: pick a translation key
// based on notification kind, fill vars, and dispatch if the user has
// notifications enabled.
export const notifyUser = async ({ userId, kind, title, error }) => {
  const link = telegramLinksDb.getByUserId(userId);
  if (!link?.chat_id || !link.notifications_enabled) return false;
  const lang = link.language || 'en';
  const key =
    kind === 'error'
      ? 'notification.taskFailed'
      : kind === 'action_required'
        ? 'notification.actionRequired'
        : 'notification.taskDone';
  const text = t(lang, key, { title: title || 'Session', error: error || '' });
  return sendToUser(userId, text);
};

// Boot the bot automatically if a token was previously persisted. This runs
// once during server startup so a restart doesn't silently un-pair everyone.
export const restoreBotFromConfig = async () => {
  const config = telegramConfigDb.get();
  if (!config?.bot_token) return;
  try {
    await startBot({ token: config.bot_token, persist: false });
  } catch (err) {
    console.warn('[telegram] Failed to restore bot:', err?.message || err);
  }
};
