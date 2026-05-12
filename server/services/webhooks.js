import crypto from 'node:crypto';

import { appConfigDb } from '../database/db.js';

const CONFIG_KEY = 'webhooks';
const MAX_ATTEMPTS = 2;

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
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use http or https.');
  }
  parsed.hash = '';
  return parsed.toString();
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
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
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
