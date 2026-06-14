import express from 'express';

import { requireAdmin } from '../middleware/auth.js';
import {
  checkRemoteAccessHealth,
  createAdminUser,
  createEvaluationRun,
  createEvaluationSuite,
  createProjectCollaborator,
  createSecret,
  createSecurityAuditRun,
  createTeamMember,
  detectTailscaleStatus,
  exportAuditLog,
  getAuditLog,
  getPlatformizationState,
  getRemoteAccessState,
  installTailscale,
  loginTailscale,
  listSecrets,
  materializeScopedEnv,
  recordUsageEvent,
  saveRemoteAccessConfig,
  summarizeUsageEvents,
  updateAdminUser,
  updateMarketplacePluginHealth,
  updateProjectCollaborator,
  updateTeamMember,
  upsertMarketplacePlugin,
} from '../services/platformization.js';

const router = express.Router();

function userId(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function handleError(res, error) {
  res.status(400).json({ success: false, error: error.message });
}

router.get('/', (_req, res) => {
  res.json({ success: true, state: getPlatformizationState() });
});

router.get('/roles', (_req, res) => {
  const state = getPlatformizationState();
  res.json({ success: true, roles: state.roles });
});

router.get('/team/members', (_req, res) => {
  res.json({ success: true, members: getPlatformizationState().teamMembers });
});

router.post('/team/members', (req, res) => {
  try {
    res.status(201).json({ success: true, member: createTeamMember(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/team/members/:id', (req, res) => {
  const member = updateTeamMember(req.params.id, req.body || {}, userId(req));
  if (!member) {
    res.status(404).json({ success: false, error: 'Team member not found.' });
    return;
  }
  res.json({ success: true, member });
});

router.get('/admin/users', requireAdmin, (_req, res) => {
  res.json({ success: true, users: getPlatformizationState().adminUsers });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  try {
    res.status(201).json({ success: true, user: await createAdminUser(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/admin/users/:id', requireAdmin, (req, res) => {
  const user = updateAdminUser(req.params.id, req.body || {}, userId(req));
  if (!user) {
    res.status(404).json({ success: false, error: 'Admin user not found.' });
    return;
  }
  res.json({ success: true, user });
});

router.get('/project-collaborators', requireAdmin, (_req, res) => {
  res.json({ success: true, collaborators: getPlatformizationState().projectCollaborators });
});

router.post('/project-collaborators', requireAdmin, (req, res) => {
  try {
    res.status(201).json({ success: true, collaborator: createProjectCollaborator(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/project-collaborators/:id', requireAdmin, (req, res) => {
  const collaborator = updateProjectCollaborator(req.params.id, req.body || {}, userId(req));
  if (!collaborator) {
    res.status(404).json({ success: false, error: 'Project collaborator not found.' });
    return;
  }
  res.json({ success: true, collaborator });
});

router.get('/secrets', (_req, res) => {
  res.json({ success: true, secrets: listSecrets() });
});

router.post('/secrets', (req, res) => {
  try {
    res.status(201).json({ success: true, secret: createSecret(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/secrets/scoped-env', (req, res) => {
  try {
    res.json({ success: true, scopedEnv: materializeScopedEnv(req.body || {}, { reveal: req.body?.reveal === true }) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/marketplace/plugins', (_req, res) => {
  res.json({ success: true, plugins: getPlatformizationState().marketplacePlugins });
});

router.post('/marketplace/plugins', (req, res) => {
  res.status(201).json({ success: true, plugin: upsertMarketplacePlugin(req.body || {}, userId(req)) });
});

router.post('/marketplace/plugins/:id/health', (req, res) => {
  const plugin = updateMarketplacePluginHealth(req.params.id, req.body || {}, userId(req));
  if (!plugin) {
    res.status(404).json({ success: false, error: 'Marketplace plugin not found.' });
    return;
  }
  res.json({ success: true, plugin });
});

router.get('/eval/suites', (_req, res) => {
  const state = getPlatformizationState();
  res.json({ success: true, suites: state.evaluationSuites, runs: state.evaluationRuns });
});

router.post('/eval/suites', (req, res) => {
  res.status(201).json({ success: true, suite: createEvaluationSuite(req.body || {}, userId(req)) });
});

router.post('/eval/runs', (req, res) => {
  res.status(201).json({ success: true, run: createEvaluationRun(req.body || {}, userId(req)) });
});

router.get('/usage/summary', (_req, res) => {
  res.json({ success: true, summary: summarizeUsageEvents() });
});

router.post('/usage/events', (req, res) => {
  res.status(201).json({ success: true, event: recordUsageEvent(req.body || {}, userId(req)) });
});

router.get('/security/audit-runs', (_req, res) => {
  res.json({ success: true, runs: getPlatformizationState().securityAuditRuns });
});

router.post('/security/audit-runs', (req, res) => {
  res.status(201).json({ success: true, run: createSecurityAuditRun(req.body || {}, userId(req)) });
});

router.get('/remote-access', (_req, res) => {
  res.json({ success: true, remoteAccess: getRemoteAccessState() });
});

router.post('/remote-access/configs', (req, res) => {
  try {
    res.status(201).json({ success: true, config: saveRemoteAccessConfig(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/remote-access/tailscale', async (_req, res) => {
  res.json({ success: true, tailscale: await detectTailscaleStatus() });
});

router.post('/remote-access/tailscale/install', async (req, res) => {
  try {
    res.json({ success: true, result: await installTailscale(userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/remote-access/tailscale/login', async (req, res) => {
  try {
    res.json({ success: true, result: await loginTailscale(userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/remote-access/health', async (req, res) => {
  try {
    res.json({ success: true, health: await checkRemoteAccessHealth(req.body || {}, userId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/audit-log', (req, res) => {
  res.json({ success: true, auditLog: getAuditLog(req.query || {}) });
});

router.get('/audit-log/export', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const body = exportAuditLog(format, req.query || {});
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  res.send(body);
});

export default router;
