#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const runtimeDir = path.resolve('.pixcode-dev', 'smoke-telegram-control');
mkdirSync(runtimeDir, { recursive: true });
process.env.DATABASE_PATH = path.join(runtimeDir, 'auth.db');

const checks = [
  {
    name: 'telegram bot wires the remote control center and callback queries',
    file: 'server/services/telegram/bot.js',
    test: (source) => (
      source.includes('handleTelegramControlMessage')
      && source.includes('handleTelegramControlCallback')
      && source.includes("bot.on('callback_query'")
    ),
  },
  {
    name: 'telegram HTTP client polls callback queries and can answer them',
    file: 'server/services/telegram/telegram-http-client.js',
    test: (source) => (
      source.includes("allowed_updates: ['message', 'callback_query']")
      && source.includes('answerCallbackQuery')
      && source.includes('editMessageText')
      && (
        source.includes("this.emit('callback_query'")
        || source.includes("_emitSerial('callback_query'")
      )
    ),
  },
  {
    name: 'telegram control center exposes provider, model, workflow, install, streaming activity, and settings actions',
    file: 'server/services/telegram/control-center.js',
    test: (source) => (
      source.includes('showMainMenu')
      && source.includes('showProviderMenu')
      && source.includes('showModelMenu')
      && source.includes('showWorkflowMenu')
      && source.includes('runWorkflow')
      && source.includes('startCliInstall')
      && source.includes('localAgentStream')
      && source.includes('editTelegramActivity')
      && source.includes('updateTelegramControlState')
      && source.includes('/api/agent')
      && source.includes('/api/orchestration/workflows')
      && source.includes('TELEGRAM_CONTROL_SCOPES')
      && source.includes('confirm_action')
    ),
  },
  {
    name: 'telegram natural language router is provider-backed instead of source keyword matching',
    file: 'server/services/telegram/telegram-gateway.js',
    test: (source) => (
      source.includes('buildTelegramIntentPrompt')
      && source.includes('parseTelegramAiIntentResponse')
      && source.includes('Decide the user intent by meaning')
      && !source.includes('classifyTelegramIntent')
    ),
  },
  {
    name: 'agent API accepts restricted permission mode for Telegram intent routing',
    file: 'server/routes/agent.js',
    test: (source) => (
      source.includes('requestedPermissionMode')
      && source.includes("permissionMode: permissionMode || 'bypassPermissions'")
    ),
  },
  {
    name: 'telegram link state persists remote-control preferences',
    file: 'server/database/db.js',
    test: (source) => (
      source.includes('telegram_control')
      && source.includes('getControlState')
      && source.includes('updateControlState')
      && source.includes('remoteControlEnabled')
      && source.includes('routerEnabled')
      && source.includes('pendingConfirmation')
    ),
  },
  {
    name: 'telegram settings UI exposes remote-control toggles',
    file: 'src/components/settings/view/tabs/telegram-settings/TelegramSettingsTab.tsx',
    test: (source) => (
      source.includes('controlEnabled')
      && source.includes('progressMode')
      && source.includes('routerEnabled')
      && source.includes('telegram.control.title')
      && source.includes('telegram.control.progressMode')
      && source.includes('telegram.router.title')
    ),
  },
];

const failures = [];

for (const check of checks) {
  let source = '';
  try {
    source = readFileSync(check.file, 'utf8');
  } catch {
    failures.push(`${check.name} (${check.file} missing)`);
    continue;
  }

  if (!check.test(source)) failures.push(check.name);
}

try {
  const {
    parseTelegramAiIntentResponse,
  } = await import('../../server/services/telegram/telegram-gateway.js');
  const {
    cleanTerminalBridgeOutput,
    handleTelegramControlCallback,
    handleTelegramControlMessage,
  } = await import('../../server/services/telegram/control-center.js');
  const {
    handleIncomingTelegramMessage,
    setTelegramBotForTesting,
  } = await import('../../server/services/telegram/bot.js');
  const { telegramLinksDb } = await import('../../server/database/db.js');
  const { stripAnsiSequences } = await import('../../server/utils/url-detection.js');

  assert.equal(
    parseTelegramAiIntentResponse('{"action":"show_runs","confidence":0.4}', 'Selam dostum son durum nedir şimdi?').action,
    'agent_prompt',
    'low-confidence natural-language control guesses should fall back to the agent',
  );
  assert.equal(
    parseTelegramAiIntentResponse('{"action":"show_runs","confidence":0.94}', 'Orchestration run listesini aç').action,
    'show_runs',
    'high-confidence AI router results should be accepted',
  );
  assert.equal(
    parseTelegramAiIntentResponse('not json', 'Selam dostum son durum nedir şimdi?').action,
    'agent_prompt',
    'unparseable AI router responses should fall back to the agent',
  );
  assert.equal(stripAnsiSequences('\u001b[43;35Hok'), 'ok', 'CSI escape sequences should be fully stripped');
  assert.equal(stripAnsiSequences('\u001b]0;orhan\u0007ok'), 'ok', 'OSC title sequences should be fully stripped');

  const terminal = {
    provider: 'codex',
    projectName: 'orhan',
    projectLabel: 'orhan',
    projectPath: '/Users/halilbilik/Desktop/orhan',
  };
  assert.equal(
    cleanTerminalBridgeOutput(
      '[43;35H40;⠸ orhan0;⠼ orhan0;⠴ orhan0;⠦ orhan0;⠧ orhan0;⠇ orhan0;⠏ orhanW0;⠋ orhanWo•Wor0;⠙ orhan•Work0;⠹ orhanWorki•Workin0;⠸ orhan5•Working',
      'pm2 kontrol',
      terminal,
    ),
    '',
    'terminal bridge should suppress spinner/title redraw noise',
  );
  assert.equal(
    cleanTerminalBridgeOutput(
      [
        '9m0;⠇ orhan0;⠏ orhan',
        '- trade-bot: stopped, PID 00;⠋ orhan0;⠙ orhan0;⠹ orhan',
        '<PIXCODE_TELEGRAM_FINAL>',
        'Evet, durdurmuşsun. Sunucuda PM2 durumu şu an:',
        '- trade-bot: stopped, PID 0',
        '- zeroclaw-gw: stopped, PID 0',
        '</PIXCODE_TELEGRAM_FINAL>',
      ].join('\n'),
      'pm2 kontrol',
      terminal,
    ),
    [
      'Evet, durdurmuşsun. Sunucuda PM2 durumu şu an:',
      '- trade-bot: stopped, PID 0',
      '- zeroclaw-gw: stopped, PID 0',
    ].join('\n'),
    'terminal bridge should prefer explicit Telegram final blocks',
  );

  const userId = 4242;
  telegramLinksDb.unlink(userId);
  telegramLinksDb.setPairingCode(userId, '123456', new Date(Date.now() + 600_000).toISOString(), 'tr');
  telegramLinksDb.verify(userId, 'chat-4242', 'ali');

  const sent = [];
  const bot = {
    sendMessage: async (chatId, text, extra = {}) => {
      sent.push({ chatId, text, extra });
      return { ok: true };
    },
  };

  const link = telegramLinksDb.getByUserId(userId);
  const expectReply = async (input, expectedFragment) => {
    sent.length = 0;
    const handled = await handleTelegramControlMessage({
      bot,
      msg: { chat: { id: 4242 }, text: input },
      link,
    });
    assert.equal(handled, true, `${input} should be handled`);
    assert.ok(sent.length > 0, `${input} should send at least one reply`);
    assert.ok(
      sent[0].text.includes(expectedFragment),
      `${input} should include "${expectedFragment}" but got "${sent[0].text}"`,
    );
  };

  await expectReply('/start', 'Pixcode Telegram kontrol merkezi');
  await expectReply('/help', 'Komutlar:');
  await expectReply('/start@Otobot', 'Pixcode Telegram kontrol merkezi');
  await expectReply('/help@Otobot', 'Komutlar:');
  await expectReply('/', 'Komutlar:');

  const menuEvents = [];
  const menuBot = {
    sendMessage: async (chatId, text, extra = {}) => {
      menuEvents.push({ type: 'send', chatId, text, extra });
      return { ok: true, message_id: 77 };
    },
    editMessageText: async (text, extra = {}) => {
      menuEvents.push({ type: 'edit', text, extra });
      return { ok: true, message_id: extra.message_id };
    },
    answerCallbackQuery: async () => ({ ok: true }),
  };
  const findButton = (markup, predicate) => {
    for (const row of markup?.inline_keyboard || []) {
      for (const candidate of row) {
        if (predicate(candidate)) return candidate;
      }
    }
    return null;
  };

  menuEvents.length = 0;
  await handleTelegramControlMessage({
    bot: menuBot,
    msg: { chat: { id: 4242 }, text: '/settings' },
    link,
  });
  const settingsMenu = menuEvents.at(-1);
  const languageButton = findButton(
    settingsMenu.extra.reply_markup,
    (candidate) => /language|dil/i.test(candidate.text),
  );
  assert.ok(languageButton, 'settings menu should expose a language button');

  menuEvents.length = 0;
  await handleTelegramControlCallback({
    bot: menuBot,
    query: {
      id: 'query-language-menu',
      data: languageButton.callback_data,
      message: { chat: { id: 4242 }, message_id: 77 },
    },
    link,
  });
  assert.equal(menuEvents.length, 1, 'callback menus should replace the existing menu message');
  assert.equal(menuEvents[0].type, 'edit', 'callback menus should use editMessageText');
  const trButton = findButton(menuEvents[0].extra.reply_markup, (candidate) => candidate.text === 'tr');
  assert.ok(trButton, 'language menu should include Turkish');

  menuEvents.length = 0;
  await handleTelegramControlCallback({
    bot: menuBot,
    query: {
      id: 'query-language-tr',
      data: trButton.callback_data,
      message: { chat: { id: 4242 }, message_id: 77 },
    },
    link,
  });
  assert.equal(telegramLinksDb.getByUserId(userId).language, 'tr', 'language selection should persist');
  assert.equal(menuEvents.length, 1, 'language selection should not send a confirmation plus a second menu');
  assert.equal(menuEvents[0].type, 'edit', 'language selection should replace the menu in place');
  assert.ok(
    menuEvents[0].text.includes('Pixcode Telegram kontrol merkezi'),
    `Turkish menu should render after selection, got "${menuEvents[0].text}"`,
  );
  assert.ok(
    !menuEvents[0].text.includes('Project:'),
    'Turkish menu should not keep English summary labels after language selection',
  );

  const botLevelMessages = [];
  setTelegramBotForTesting({
    sendMessage: async (chatId, text, extra = {}) => {
      botLevelMessages.push({ chatId, text, extra });
      return { ok: true };
    },
    answerCallbackQuery: async () => ({ ok: true }),
  });

  const expectBotReply = async (input, expectedFragment) => {
    botLevelMessages.length = 0;
    await handleIncomingTelegramMessage({
      chat: { id: 'chat-4242' },
      text: input,
      message_id: 1,
      from: { username: 'ali' },
    });
    assert.ok(botLevelMessages.length > 0, `${input} should reply from bot.js`);
    assert.ok(
      botLevelMessages[0].text.includes(expectedFragment),
      `${input} should include "${expectedFragment}" but got "${botLevelMessages[0].text}"`,
    );
    assert.ok(
      !botLevelMessages.some((entry) => entry.text.includes('Mesaj son oturumuna iletildi')),
      `${input} should never hit the bridge queue reply`,
    );
  };

  await expectBotReply('/start', 'Nasıl başlarsın');
  await expectBotReply('/help', 'Komutlar:');

  telegramLinksDb.unlink(userId);
} catch (error) {
  failures.push(error?.message || String(error));
} finally {
  rmSync(runtimeDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`Telegram control smoke failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('telegram control smoke passed');
