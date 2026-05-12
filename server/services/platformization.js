import crypto from 'node:crypto';

import { appConfigDb } from '../database/db.js';

const CONFIG_KEY = 'platformization';

export const TEAM_ROLES = {
  owner: [
    'team:manage',
    'project:admin',
    'run:approve',
    'secret:manage',
    'marketplace:manage',
    'eval:run',
    'usage:view',
    'security:audit',
  ],
  admin: [
    'project:admin',
    'run:approve',
    'secret:manage',
    'marketplace:manage',
    'eval:run',
    'usage:view',
    'security:audit',
  ],
  member: [
    'project:write',
    'run:create',
    'secret:use',
    'eval:run',
    'usage:view',
  ],
  viewer: [
    'project:read',
    'usage:view',
  ],
};

export const SECRET_SCOPES = ['global', 'provider', 'project', 'workflow', 'telegram', 'api'];

export const MARKETPLACE_PLUGIN_TYPES = ['mcp-server', 'workflow-template', 'provider-adapter', 'notification-channel'];

export const SECURITY_AUDIT_CHECKS = [
  'dependency_audit',
  'secret_scan',
  'permission_audit',
  'agent_output_leak_detection',
];

function nowIso() {
  return new Date().toISOString();
}

function emptyStore() {
  return {
    teamMembers: [],
    secrets: [],
    marketplacePlugins: [],
    evaluationSuites: [],
    evaluationRuns: [],
    usageEvents: [],
    securityAuditRuns: [],
    auditLog: [],
  };
}

function readStore() {
  const raw = appConfigDb.get(CONFIG_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    return {
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : [],
      secrets: Array.isArray(parsed.secrets) ? parsed.secrets : [],
      marketplacePlugins: Array.isArray(parsed.marketplacePlugins) ? parsed.marketplacePlugins : [],
      evaluationSuites: Array.isArray(parsed.evaluationSuites) ? parsed.evaluationSuites : [],
      evaluationRuns: Array.isArray(parsed.evaluationRuns) ? parsed.evaluationRuns : [],
      usageEvents: Array.isArray(parsed.usageEvents) ? parsed.usageEvents : [],
      securityAuditRuns: Array.isArray(parsed.securityAuditRuns) ? parsed.securityAuditRuns : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  appConfigDb.set(CONFIG_KEY, JSON.stringify(store));
}

function compact(text, max = 120) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max).replace(/[-_\s]+$/g, '') : value;
}

function slugify(value) {
  const slug = compact(value, 72)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || crypto.randomUUID();
}

function addAudit(store, action, actorId, details = {}) {
  store.auditLog.unshift({
    id: crypto.randomUUID(),
    action,
    actorId: actorId || null,
    createdAt: nowIso(),
    details,
  });
  store.auditLog = store.auditLog.slice(0, 250);
}

function normalizeRole(role) {
  return TEAM_ROLES[role] ? role : 'viewer';
}

function normalizeScope(scope) {
  return SECRET_SCOPES.includes(scope) ? scope : 'project';
}

function vaultKey() {
  const material = process.env.PIXCODE_SECRET_KEY || process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();
  return crypto.createHash('sha256').update(material).digest();
}

function sealSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function openSecret(sealed) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function redactSecret(secret) {
  return {
    ...secret,
    sealedValue: undefined,
    redacted: '********',
  };
}

function scopeMatches(secret, input = {}) {
  if (secret.scope === 'global') return true;
  if (secret.scope === 'provider') return !input.provider || secret.target === input.provider;
  if (secret.scope === 'project') return !input.projectPath || secret.target === input.projectPath || secret.target === input.projectName;
  if (secret.scope === 'workflow') return !input.workflowId || secret.target === input.workflowId;
  if (secret.scope === 'telegram') return input.channel === 'telegram';
  if (secret.scope === 'api') return input.channel === 'api';
  return false;
}

export function getPlatformizationState() {
  const store = readStore();
  return {
    roles: TEAM_ROLES,
    secretScopes: SECRET_SCOPES,
    marketplacePluginTypes: MARKETPLACE_PLUGIN_TYPES,
    securityAuditChecks: SECURITY_AUDIT_CHECKS,
    teamMembers: store.teamMembers,
    secrets: store.secrets.map(redactSecret),
    marketplacePlugins: store.marketplacePlugins,
    evaluationSuites: store.evaluationSuites,
    evaluationRuns: store.evaluationRuns,
    usageSummary: summarizeUsageEvents(store.usageEvents),
    securityAuditRuns: store.securityAuditRuns,
    auditLog: store.auditLog,
  };
}

export function createTeamMember(input = {}, actorId = null) {
  const email = compact(input.email || input.username || '');
  if (!email) throw new Error('Team member email or username is required.');
  const store = readStore();
  const member = {
    id: crypto.randomUUID(),
    email,
    displayName: compact(input.displayName || email, 80),
    role: normalizeRole(input.role || 'viewer'),
    projectScopes: Array.isArray(input.projectScopes) ? input.projectScopes : [],
    status: input.status || 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  member.permissions = TEAM_ROLES[member.role];
  store.teamMembers.unshift(member);
  addAudit(store, 'team.member.created', actorId, { memberId: member.id, role: member.role });
  writeStore(store);
  return member;
}

export function updateTeamMember(memberId, patch = {}, actorId = null) {
  const store = readStore();
  let updated = null;
  store.teamMembers = store.teamMembers.map((member) => {
    if (member.id !== memberId) return member;
    updated = {
      ...member,
      ...patch,
      id: member.id,
      role: normalizeRole(patch.role || member.role),
      updatedAt: nowIso(),
    };
    updated.permissions = TEAM_ROLES[updated.role];
    return updated;
  });
  if (updated) {
    addAudit(store, 'team.member.updated', actorId, { memberId, role: updated.role });
    writeStore(store);
  }
  return updated;
}

export function createSecret(input = {}, actorId = null) {
  const name = compact(input.name || input.envName || '');
  const value = input.value;
  if (!name || typeof value !== 'string') throw new Error('Secret name and string value are required.');
  const scope = normalizeScope(input.scope || 'project');
  const store = readStore();
  const secret = {
    id: crypto.randomUUID(),
    name,
    envName: compact(input.envName || name).replace(/[^A-Z0-9_]/gi, '_').toUpperCase(),
    scope,
    target: input.target || input.projectPath || input.provider || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    fingerprint: crypto.createHash('sha256').update(value).digest('hex').slice(0, 12),
    sealedValue: sealSecret(value),
  };
  store.secrets = store.secrets.filter((existing) => !(existing.envName === secret.envName && existing.scope === secret.scope && existing.target === secret.target));
  store.secrets.unshift(secret);
  addAudit(store, 'secret.created', actorId, { secretId: secret.id, scope: secret.scope, envName: secret.envName });
  writeStore(store);
  return redactSecret(secret);
}

export function listSecrets() {
  return readStore().secrets.map(redactSecret);
}

export function materializeScopedEnv(input = {}, options = {}) {
  const store = readStore();
  const env = {};
  const included = [];
  for (const secret of store.secrets) {
    if (!scopeMatches(secret, input)) continue;
    included.push({
      id: secret.id,
      envName: secret.envName,
      scope: secret.scope,
      target: secret.target,
      redacted: '********',
    });
    if (options.reveal === true) {
      env[secret.envName] = openSecret(secret.sealedValue);
    }
  }
  return { env, included };
}

export function upsertMarketplacePlugin(input = {}, actorId = null) {
  const pluginId = input.id || slugify(input.name || input.packageName || 'plugin');
  const store = readStore();
  const existing = store.marketplacePlugins.find((plugin) => plugin.id === pluginId);
  const plugin = {
    id: pluginId,
    name: compact(input.name || pluginId, 100),
    type: MARKETPLACE_PLUGIN_TYPES.includes(input.type) ? input.type : 'mcp-server',
    source: input.source || input.packageName || input.repository || null,
    permissionScopes: Array.isArray(input.permissionScopes) ? input.permissionScopes : [],
    installCommand: input.installCommand || null,
    status: input.status || existing?.status || 'available',
    health: input.health || existing?.health || { status: 'unknown', checkedAt: null },
    updatedAt: nowIso(),
    createdAt: existing?.createdAt || nowIso(),
  };
  store.marketplacePlugins = [plugin, ...store.marketplacePlugins.filter((item) => item.id !== pluginId)];
  addAudit(store, 'marketplace.plugin.upserted', actorId, { pluginId, type: plugin.type });
  writeStore(store);
  return plugin;
}

export function updateMarketplacePluginHealth(pluginId, health = {}, actorId = null) {
  const store = readStore();
  let updated = null;
  store.marketplacePlugins = store.marketplacePlugins.map((plugin) => {
    if (plugin.id !== pluginId) return plugin;
    updated = {
      ...plugin,
      health: {
        status: health.status || 'unknown',
        message: health.message || '',
        checkedAt: nowIso(),
      },
      updatedAt: nowIso(),
    };
    return updated;
  });
  if (updated) {
    addAudit(store, 'marketplace.plugin.health_checked', actorId, { pluginId, status: updated.health.status });
    writeStore(store);
  }
  return updated;
}

export function createEvaluationSuite(input = {}, actorId = null) {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const suite = {
    id: input.id || slugify(input.name || 'evaluation-suite'),
    name: compact(input.name || 'Evaluation suite', 100),
    description: compact(input.description || '', 240),
    tasks: tasks.map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      title: compact(task.title || `Task ${index + 1}`, 120),
      acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
      projectPath: task.projectPath || null,
    })),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const store = readStore();
  store.evaluationSuites = [suite, ...store.evaluationSuites.filter((item) => item.id !== suite.id)];
  addAudit(store, 'eval.suite.upserted', actorId, { suiteId: suite.id, tasks: suite.tasks.length });
  writeStore(store);
  return suite;
}

export function createEvaluationRun(input = {}, actorId = null) {
  const results = Array.isArray(input.results) ? input.results : [];
  const passed = results.filter((result) => result.status === 'passed').length;
  const run = {
    id: crypto.randomUUID(),
    suiteId: input.suiteId || null,
    provider: input.provider || null,
    model: input.model || null,
    status: input.status || 'completed',
    createdAt: nowIso(),
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.filter((result) => result.status === 'failed').length,
      passRate: results.length ? Math.round((passed / results.length) * 1000) / 10 : 0,
      averageLatencyMs: average(results.map((result) => Number(result.latencyMs || 0)).filter(Boolean)),
    },
  };
  const store = readStore();
  store.evaluationRuns.unshift(run);
  addAudit(store, 'eval.run.created', actorId, { runId: run.id, suiteId: run.suiteId, passRate: run.summary.passRate });
  writeStore(store);
  return run;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function recordUsageEvent(input = {}, actorId = null) {
  const event = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt || nowIso(),
    provider: input.provider || 'unknown',
    model: input.model || 'unknown',
    workflow: input.workflow || input.source || 'manual',
    inputTokens: Number(input.inputTokens || 0),
    outputTokens: Number(input.outputTokens || 0),
    costUsd: Number(input.costUsd || 0),
    latencyMs: Number(input.latencyMs || 0),
    status: input.status || 'ok',
  };
  const store = readStore();
  store.usageEvents.unshift(event);
  store.usageEvents = store.usageEvents.slice(0, 2000);
  addAudit(store, 'usage.event.recorded', actorId, { provider: event.provider, model: event.model, status: event.status });
  writeStore(store);
  return event;
}

export function summarizeUsageEvents(events = readStore().usageEvents) {
  const groups = new Map();
  for (const event of events) {
    const key = `${event.provider}:${event.model}:${event.workflow}`;
    const current = groups.get(key) || {
      provider: event.provider,
      model: event.model,
      workflow: event.workflow,
      runs: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    };
    current.runs += 1;
    current.errors += event.status === 'error' ? 1 : 0;
    current.inputTokens += event.inputTokens;
    current.outputTokens += event.outputTokens;
    current.totalTokens += event.inputTokens + event.outputTokens;
    current.costUsd += event.costUsd;
    current.latencyMs += event.latencyMs;
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    costUsd: Math.round(group.costUsd * 10000) / 10000,
    averageLatencyMs: group.runs ? Math.round(group.latencyMs / group.runs) : 0,
    errorRate: group.runs ? Math.round((group.errors / group.runs) * 1000) / 10 : 0,
    latencyMs: undefined,
  }));
}

export function createSecurityAuditRun(input = {}, actorId = null) {
  const checks = Array.isArray(input.checks) && input.checks.length
    ? input.checks.filter((check) => SECURITY_AUDIT_CHECKS.includes(check))
    : SECURITY_AUDIT_CHECKS;
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const run = {
    id: crypto.randomUUID(),
    protocol: 'pixcode.security-audit.v1',
    status: input.status || 'queued',
    projectName: input.projectName || null,
    projectPath: input.projectPath || null,
    checks,
    createdAt: nowIso(),
    findings: findings.map((finding, index) => ({
      id: finding.id || `finding-${index + 1}`,
      severity: finding.severity || 'medium',
      title: compact(finding.title || 'Security finding', 140),
      file: finding.file || null,
      recommendation: finding.recommendation || null,
    })),
    checklist: checks.map((check) => ({
      check,
      status: 'pending',
    })),
  };
  const store = readStore();
  store.securityAuditRuns.unshift(run);
  addAudit(store, 'security.audit.created', actorId, { runId: run.id, checks });
  writeStore(store);
  return run;
}
