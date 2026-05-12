import express from 'express';

import {
  PIXCODE_WEBHOOK_EVENT_TYPES,
  deleteWebhook,
  deliverWebhookEvent,
  listWebhooks,
  upsertWebhook,
} from '../services/webhooks.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    eventTypes: PIXCODE_WEBHOOK_EVENT_TYPES,
    webhooks: listWebhooks(),
  });
});

router.post('/', (req, res) => {
  try {
    const webhook = upsertWebhook(req.body || {});
    res.status(201).json({ success: true, webhook });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const webhook = upsertWebhook({ ...(req.body || {}), id: req.params.id });
    res.json({ success: true, webhook });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  if (!deleteWebhook(req.params.id)) {
    res.status(404).json({ success: false, error: 'Webhook not found.' });
    return;
  }
  res.json({ success: true });
});

router.post('/test', async (req, res) => {
  try {
    const result = await deliverWebhookEvent({
      type: req.body?.type || 'run.completed',
      payload: {
        test: true,
        message: 'Pixcode webhook test delivery',
        sentBy: req.user?.id ?? null,
      },
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
