import express from 'express';

import { requireAdmin } from '../middleware/auth.js';
import {
  createIssueToPrRun,
  createReviewQueueItem,
  createWorkspaceCheckpoint,
  evaluateDesktopReleaseAssetPolicy,
  getProductionAgentLoopState,
  parseCiRepairSignals,
  scheduleBackgroundAgentJob,
  updateReviewQueueItem,
} from '../services/production-agent-loop.js';

const router = express.Router();

// This loop persists installation-wide queues/schedulers in appConfigDb and
// is not project-scoped yet.  Restrict both reads and writes until jobs carry
// an explicit per-project authorization model.
router.use(requireAdmin);

function userId(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

router.get('/', (_req, res) => {
  res.json({ success: true, state: getProductionAgentLoopState() });
});

router.post('/github/issue-to-pr', (req, res) => {
  try {
    const run = createIssueToPrRun(req.body || {}, userId(req));
    res.status(202).json({ success: true, run });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/ci/repair-plan', (req, res) => {
  res.json({
    success: true,
    repairPlan: parseCiRepairSignals(req.body?.log || req.body?.output || ''),
  });
});

router.get('/review-queue', (_req, res) => {
  res.json({ success: true, reviewQueue: getProductionAgentLoopState().reviewQueue });
});

router.post('/review-queue', (req, res) => {
  const item = createReviewQueueItem(req.body || {}, userId(req));
  res.status(201).json({ success: true, item });
});

router.patch('/review-queue/:id', (req, res) => {
  const item = updateReviewQueueItem(req.params.id, req.body || {});
  if (!item) {
    res.status(404).json({ success: false, error: 'Review queue item not found.' });
    return;
  }
  res.json({ success: true, item });
});

router.get('/scheduler/jobs', (_req, res) => {
  res.json({ success: true, jobs: getProductionAgentLoopState().schedulerJobs });
});

router.post('/scheduler/jobs', (req, res) => {
  const job = scheduleBackgroundAgentJob(req.body || {}, userId(req));
  res.status(201).json({ success: true, job });
});

router.get('/snapshots', (_req, res) => {
  res.json({ success: true, checkpoints: getProductionAgentLoopState().checkpoints });
});

router.post('/snapshots', (req, res) => {
  const checkpoint = createWorkspaceCheckpoint(req.body || {}, userId(req));
  res.status(201).json({ success: true, checkpoint });
});

router.post('/desktop-release/assets-policy', (req, res) => {
  res.json({
    success: true,
    policy: evaluateDesktopReleaseAssetPolicy(req.body?.assets || req.body?.assetNames || []),
  });
});

router.get('/desktop-release/assets-policy', (_req, res) => {
  res.json({
    success: true,
    policy: evaluateDesktopReleaseAssetPolicy([]),
  });
});

export default router;
