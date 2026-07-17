/**
 * WhatsApp channel for Pixcode-embedded NanoClaw.
 * Optional: requires @whiskeysockets/baileys when WHATSAPP_ENABLED=1.
 * Upstream nanoclaw-lite only stubs WhatsApp; this adapter fills the gap.
 */
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from '../config.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  NewMessage,
  OnChatMetadata,
  OnInboundMessage,
} from '../types.js';

type BaileysModule = {
  default: any;
  useMultiFileAuthState: (dir: string) => Promise<any>;
  DisconnectReason: { loggedOut: number };
  fetchLatestBaileysVersion: () => Promise<{ version: any }>;
};

async function tryLoadBaileys(): Promise<BaileysModule | null> {
  try {
    // Dynamic so Pixcode still runs when baileys is not installed.
    // String form avoids hard dependency at compile time.
    const mod = ' @whiskeysockets/baileys'.trim();
    return (await import(/* webpackIgnore: true */ mod)) as unknown as BaileysModule;
  } catch {
    return null;
  }
}

export class WhatsAppChannel implements Channel {
  name = 'whatsapp';
  private opts: ChannelOpts;
  private sock: any = null;
  private authDir: string;
  private connected = false;

  constructor(opts: ChannelOpts, authDir: string) {
    this.opts = opts;
    this.authDir = authDir;
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us');
  }

  async connect(): Promise<void> {
    const baileys = await tryLoadBaileys();
    if (!baileys) {
      throw new Error(
        'WhatsApp requires @whiskeysockets/baileys. Run: npm i -g @whiskeysockets/baileys (or install with pixcode).',
      );
    }

    fs.mkdirSync(this.authDir, { recursive: true });
    const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir);
    const { version } = await baileys.fetchLatestBaileysVersion();

    this.sock = baileys.default({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: logger.child({ channel: 'whatsapp' }) as any,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        logger.info('WhatsApp: scan QR in terminal (or use a QR helper) to link the device');
      }
      if (connection === 'open') {
        this.connected = true;
        logger.info('WhatsApp connected');
      }
      if (connection === 'close') {
        this.connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === baileys.DisconnectReason.loggedOut;
        logger.warn({ code, loggedOut }, 'WhatsApp connection closed');
        if (!loggedOut) {
          logger.info('WhatsApp: restart Pixcode daemon to reconnect if needed');
        }
      }
    });

    this.sock.ev.on('messages.upsert', async (upsert: any) => {
      if (upsert.type !== 'notify') return;
      for (const msg of upsert.messages || []) {
        try {
          const jid = msg.key?.remoteJid;
          if (!jid || jid === 'status@broadcast') continue;
          const text =
            msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || '';
          if (!text) continue;
          const timestamp = new Date(
            (Number(msg.messageTimestamp) || Date.now() / 1000) * 1000,
          ).toISOString();
          const inbound: NewMessage = {
            id: msg.key?.id || `${Date.now()}`,
            chat_jid: jid,
            sender: msg.key?.participant || jid,
            sender_name: msg.pushName || '',
            content: text,
            timestamp,
            is_from_me: Boolean(msg.key?.fromMe),
            is_bot_message: Boolean(msg.key?.fromMe),
          };
          this.opts.onMessage(jid, inbound);
          this.opts.onChatMetadata?.(
            jid,
            timestamp,
            undefined,
            'whatsapp',
            jid.endsWith('@g.us'),
          );
        } catch (err) {
          logger.warn({ err }, 'WhatsApp message parse failed');
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    try {
      await this.sock?.end?.(undefined);
    } catch {
      // ignore
    }
    this.sock = null;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    await this.sock.sendMessage(jid, { text });
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.sock || !isTyping) return;
    try {
      await this.sock.sendPresenceUpdate('composing', jid);
    } catch {
      // ignore
    }
  }
}

registerChannel('whatsapp', (opts: ChannelOpts) => {
  if (process.env.WHATSAPP_ENABLED !== '1' && process.env.PIXCODE_WHATSAPP_ENABLED !== '1') {
    logger.debug('WhatsApp: disabled (set WHATSAPP_ENABLED=1 to enable)');
    return null;
  }
  const authDir =
    process.env.WHATSAPP_AUTH_DIR
    || process.env.PIXCODE_WHATSAPP_AUTH_DIR
    || path.join(DATA_DIR, 'whatsapp-auth');

  logger.info({ authDir }, 'WhatsApp channel enabled — QR may appear on first connect');
  return new WhatsAppChannel(opts, authDir);
});
