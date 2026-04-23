import express from 'express';

import { telegramLinksDb } from '../database/db.js';
import {
  createPairingCode,
  getBotState,
  getPublicConfig,
  removeBotConfig,
  startBot,
  stopBot,
} from '../services/telegram/bot.js';
import { SUPPORTED_LANGUAGES } from '../services/telegram/translations.js';

const router = express.Router();

const sanitizeLanguage = (raw) => {
  if (typeof raw !== 'string') return 'en';
  return SUPPORTED_LANGUAGES.includes(raw) ? raw : 'en';
};

// GET /api/telegram/status — combined bot + personal link state
router.get('/status', (req, res) => {
  try {
    const bot = getBotState();
    const config = getPublicConfig();
    const link = telegramLinksDb.getByUserId(req.user.id);
    res.json({
      bot: { ...bot, ...config },
      link: link
        ? {
            paired: Boolean(link.chat_id && link.verified_at),
            telegramUsername: link.telegram_username,
            language: link.language,
            notificationsEnabled: Boolean(link.notifications_enabled),
            bridgeEnabled: Boolean(link.bridge_enabled),
            pairingCode: link.pairing_code,
            pairingExpiresAt: link.pairing_code_expires_at,
            verifiedAt: link.verified_at,
          }
        : null,
    });
  } catch (error) {
    console.error('telegram/status failed:', error);
    res.status(500).json({ error: 'Failed to read Telegram status' });
  }
});

// POST /api/telegram/bot — save token and start the bot
router.post('/bot', async (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || token.length < 10) {
    return res.status(400).json({ error: 'A valid bot token is required' });
  }
  try {
    const info = await startBot({ token });
    res.json({ success: true, bot: { ...getBotState(), configured: true, username: info.username } });
  } catch (error) {
    console.error('telegram/bot start failed:', error);
    const status = error?.code === 'INVALID_TOKEN' ? 400 : 502;
    res.status(status).json({ error: error?.message || 'Failed to start bot' });
  }
});

// DELETE /api/telegram/bot — stop and remove the configured bot
router.delete('/bot', async (req, res) => {
  try {
    await removeBotConfig();
    res.json({ success: true, bot: getBotState() });
  } catch (error) {
    console.error('telegram/bot remove failed:', error);
    res.status(502).json({ error: 'Failed to remove bot' });
  }
});

// POST /api/telegram/bot/stop — stop polling but keep the token
router.post('/bot/stop', async (req, res) => {
  try {
    await stopBot();
    res.json({ success: true, bot: getBotState() });
  } catch (error) {
    console.error('telegram/bot/stop failed:', error);
    res.status(502).json({ error: 'Failed to stop bot' });
  }
});

// POST /api/telegram/pairing-code — (re)generate a 6-digit code for this user
router.post('/pairing-code', (req, res) => {
  try {
    const language = sanitizeLanguage(req.body?.language);
    const { code, expiresAt } = createPairingCode(req.user.id, language);
    res.json({ success: true, code, expiresAt, language });
  } catch (error) {
    console.error('telegram/pairing-code failed:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// PATCH /api/telegram/link — update language / toggles on the user's link
router.patch('/link', (req, res) => {
  try {
    const { language, notificationsEnabled, bridgeEnabled } = req.body || {};
    const payload = {};
    if (language !== undefined) payload.language = sanitizeLanguage(language);
    if (notificationsEnabled !== undefined) payload.notificationsEnabled = Boolean(notificationsEnabled);
    if (bridgeEnabled !== undefined) payload.bridgeEnabled = Boolean(bridgeEnabled);
    telegramLinksDb.updatePreferences(req.user.id, payload);
    res.json({ success: true, link: telegramLinksDb.getByUserId(req.user.id) });
  } catch (error) {
    console.error('telegram/link patch failed:', error);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// DELETE /api/telegram/link — unpair
router.delete('/link', (req, res) => {
  try {
    telegramLinksDb.unlink(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('telegram/link delete failed:', error);
    res.status(500).json({ error: 'Failed to unpair' });
  }
});

export default router;
