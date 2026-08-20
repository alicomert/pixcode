import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

import { appConfigDb } from '../database/db.js';

const CONFIG_KEY = 'webhooks';
const MAX_ATTEMPTS = 2;
const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_DNS_TIMEOUT_MS = 3_000;

export const PIXCODE_WEBHOOK_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'run.failed',
  'run.canceled',
  'file.changed',
  'approval.needed',
  'approval.resolved',
  'live_view.started',
  'live_view.failed',
];

function nowIso() {
  return new Date().toISOString();
}

function readStore() {
  const raw = appConfigDb.get(CONFIG_KEY);
  if (!raw) return { version: 1, webhooks: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      webhooks: Array.isArray(parsed?.webhooks) ? parsed.webhooks.map(normalizeWebhook).filter(Boolean) : [],
    };
  } catch {
    return { version: 1, webhooks: [] };
  }
}

function writeStore(store) {
  appConfigDb.set(CONFIG_KEY, JSON.stringify({
    version: 1,
    webhooks: store.webhooks.map(normalizeWebhook).filter(Boolean),
  }));
}

function normalizeUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new Error('Webhook URL is required.');
  if (/[\u0000-\u001F\u007F]/u.test(raw)) {
    throw new Error('Webhook URL cannot contain control characters.');
  }
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Webhook URL must not contain embedded credentials.');
  }
  parsed.hash = '';
  return parsed.toString();
}

function isPrivateIp(value) {
  const normalized = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(normalized);
  if (version === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && b >= 18 && b <= 19)
      || a >= 224;
  }
  if (version === 6) {
    // Node's URL/fetch stack accepts hexadecimal IPv4-mapped IPv6 literals
    // (for example [::ffff:7f00:1]) and routes them to 127.0.0.1. Expand the
    // compressed form before applying the IPv4 private-range checks so this
    // alternate spelling cannot bypass the SSRF guard.
    const mapped = normalized.split('::');
    const head = mapped[0] ? mapped[0].split(':') : [];
    const tail = mapped[1] ? mapped[1].split(':') : [];
    if (mapped.length <= 2 && head.length + tail.length <= 8) {
      const expanded = [
        ...head,
        ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'),
        ...tail,
      ];
      if (expanded.length === 8
        && expanded.slice(0, 5).every((part) => Number.parseInt(part || '0', 16) === 0)
        && Number.parseInt(expanded[5] || '0', 16) === 0xffff) {
        const high = Number.parseInt(expanded[6] || '0', 16);
        const low = Number.parseInt(expanded[7] || '0', 16);
        return isPrivateIp(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
      }
    }
    const compact = normalized.replace(/^::ffff:/, '');
    if (compact !== normalized && net.isIP(compact) === 4) return isPrivateIp(compact);
    return normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || /^fe[89a-f]/u.test(normalized)
      || normalized.startsWith('ff');
  }
  return false;
}

function isBlockedHostname(value) {
  const hostname = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === 'localhost.localdomain'
    || hostname === '0.0.0.0'
    || hostname === 'metadata.google.internal'
    || hostname.endsWith('.metadata.google.internal');
}

async function assertWebhookTargetSafe(webhookUrl) {
  if (process.env.PIXCODE_ALLOW_PRIVATE_WEBHOOK === '1') return;

  const parsed = new URL(webhookUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname) || isPrivateIp(hostname)) {
    throw new Error('Webhook URL cannot target a private, loopback, link-local, multicast, or metadata address. Set PIXCODE_ALLOW_PRIVATE_WEBHOOK=1 for an intentional local integration.');
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Fail closed when the destination cannot be resolved safely. The fetch
    // would fail too, while allowing it to continue could turn a transient
    // resolver failure into an SSRF bypass after DNS changes.
    throw new Error('Webhook hostname could not be resolved safely.');
  }
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error('Webhook hostname resolves to a private, loopback, link-local, multicast, or metadata address. Set PIXCODE_ALLOW_PRIVATE_WEBHOOK=1 for an intentional local integration.');
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return ['run.completed', 'run.failed', 'approval.needed'];
  return Array.from(new Set(events
    .filter((event) => PIXCODE_WEBHOOK_EVENT_TYPES.includes(event))
  )).sort();
}

function normalizeWebhook(input) {
  if (!input || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID();
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Pixcode webhook';
  const url = normalizeUrl(input.url);
  const secret = typeof input.secret === 'string' && input.secret.trim()
    ? input.secret.trim()
    : crypto.randomBytes(24).toString('hex');
  return {
    id,
    name,
    url,
    secret,
    enabled: input.enabled !== false,
    events: normalizeEvents(input.events),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : nowIso(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : nowIso(),
    lastDelivery: input.lastDelivery && typeof input.lastDelivery === 'object' ? input.lastDelivery : null,
  };
}

function publicWebhook(webhook) {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    enabled: webhook.enabled,
    events: webhook.events,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    secretPresent: Boolean(webhook.secret),
    lastDelivery: webhook.lastDelivery,
  };
}

export function listWebhooks() {
  return readStore().webhooks.map(publicWebhook);
}

export function upsertWebhook(input = {}) {
  const store = readStore();
  const existing = typeof input.id === 'string'
    ? store.webhooks.find((webhook) => webhook.id === input.id)
    : null;
  const webhook = normalizeWebhook({
    ...existing,
    ...input,
    id: existing?.id ?? input.id,
    secret: input.secret === undefined ? existing?.secret : input.secret,
    createdAt: existing?.createdAt,
    updatedAt: nowIso(),
  });
  if (!webhook) throw new Error('Invalid webhook payload.');
  const next = store.webhooks.filter((candidate) => candidate.id !== webhook.id);
  next.push(webhook);
  writeStore({ ...store, webhooks: next });
  return publicWebhook(webhook);
}

export function deleteWebhook(webhookId) {
  const store = readStore();
  const next = store.webhooks.filter((webhook) => webhook.id !== webhookId);
  if (next.length === store.webhooks.length) return false;
  writeStore({ ...store, webhooks: next });
  return true;
}

function signPayload(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function deliveryPayload(event) {
  return {
    id: crypto.randomUUID(),
    protocol: 'pixcode.webhook.v1',
    emittedAt: nowIso(),
    event,
  };
}

async function deliverToWebhook(webhook, event) {
  const payload = deliveryPayload(event);
  const body = JSON.stringify(payload);
  const signature = signPayload(webhook.secret, body);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      await withTimeout(
        assertWebhookTargetSafe(webhook.url),
        WEBHOOK_DNS_TIMEOUT_MS,
        'Webhook destination safety check timed out.',
      );
      const response = await fetch(webhook.url, {
        method: 'POST',
        signal: controller.signal,
        // Do not follow a redirect from a trusted public host into an
        // internal address. Webhook URLs are administrator-configurable.
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'X-Pixcode-Event': event.type,
          'X-Pixcode-Delivery': payload.id,
          'X-Pixcode-Signature-256': `sha256=${signature}`,
        },
        body,
      });
      const result = {
        ok: response.ok,
        status: response.status,
        attempt,
        eventType: event.type,
        deliveredAt: nowIso(),
      };
      return result;
    } catch (error) {
      lastError = {
        ok: false,
        attempt,
        eventType: event.type,
        deliveredAt: nowIso(),
        error: error?.message || String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return lastError;
}

function recordDelivery(webhookId, delivery) {
  const store = readStore();
  const next = store.webhooks.map((webhook) => (
    webhook.id === webhookId ? { ...webhook, lastDelivery: delivery, updatedAt: nowIso() } : webhook
  ));
  writeStore({ ...store, webhooks: next });
}

export async function deliverWebhookEvent(event) {
  const normalized = {
    type: event?.type,
    payload: event?.payload && typeof event.payload === 'object' ? event.payload : {},
  };
  if (!PIXCODE_WEBHOOK_EVENT_TYPES.includes(normalized.type)) {
    return { delivered: 0, skipped: true, reason: 'unsupported_event' };
  }

  const webhooks = readStore().webhooks.filter((webhook) =>
    webhook.enabled && webhook.events.includes(normalized.type)
  );
  const deliveries = [];
  for (const webhook of webhooks) {
    const delivery = await deliverToWebhook(webhook, normalized);
    recordDelivery(webhook.id, delivery);
    deliveries.push({ webhookId: webhook.id, ...delivery });
  }
  return { delivered: deliveries.length, deliveries };
}

export function dispatchWebhookEvent(event) {
  deliverWebhookEvent(event).catch((error) => {
    console.warn('[webhooks] delivery failed:', error?.message || error);
  });
}
