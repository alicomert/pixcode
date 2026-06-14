import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import bcrypt from 'bcryptjs';

import { appConfigDb, userDb } from '../database/db.js';

const CONFIG_KEY = 'platformization';
const execFileAsync = promisify(execFile);

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
  project_partner: [
    'project:write',
    'run:create',
    'run:approve',
    'review:manage',
    'usage:view',
  ],
  project_worker: [
    'project:write',
    'run:create',
    'review:update',
  ],
  project_reviewer: [
    'project:read',
    'review:manage',
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
    projectCollaborators: [],
    remoteAccessConfigs: [],
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
      projectCollaborators: Array.isArray(parsed.projectCollaborators) ? parsed.projectCollaborators : [],
      remoteAccessConfigs: Array.isArray(parsed.remoteAccessConfigs) ? parsed.remoteAccessConfigs : [],
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

function compactProjectIdentifier(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

export function isAdminUser(user = {}) {
  return user?.role === 'admin' || user?.role === 'owner';
}

function resolveUser(input = {}) {
  const users = userDb.listUsers();
  const userId = Number(input.userId);
  if (Number.isFinite(userId)) {
    return users.find((user) => user.id === userId && user.is_active) || null;
  }

  const userRef = compact(input.userRef || input.email || input.username || '').toLowerCase();
  if (!userRef) return null;
  return users.find((user) => user.is_active && String(user.username).toLowerCase() === userRef) || null;
}

function projectMatches(collaborator, project = {}) {
  const projectName = compactProjectIdentifier(project.name || project.projectName || project);
  const projectPath = compactProjectIdentifier(project.fullPath || project.path || project.projectPath || '');

  return Boolean(
    (projectName && collaborator.projectName === projectName) ||
    (projectPath && collaborator.projectPath === projectPath)
  );
}

function isPathInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeAllowedRoots(input) {
  const roots = Array.isArray(input) ? input : [];
  const normalized = roots
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/g, ''))
    .map((entry) => entry || '.')
    .filter((entry) => !entry.includes('..'));
  return Array.from(new Set(normalized.length > 0 ? normalized : ['.']));
}

function collaboratorAllowedRoots(collaborator) {
  return normalizeAllowedRoots(collaborator.allowedRoots || collaborator.allowedFolders || ['.']);
}

export function userHasProjectAccess(user, project, capability = 'viewFiles') {
  if (isAdminUser(user)) return true;
  if (!user?.id && !user?.userId) return false;

  const userId = Number(user.id ?? user.userId);
  const username = String(user.username || '').toLowerCase();
  const store = readStore();

  return store.projectCollaborators.some((collaborator) => {
    if (collaborator.status === 'disabled') return false;
    if (!projectMatches(collaborator, project)) return false;

    const sameUser = Number(collaborator.userId) === userId ||
      String(collaborator.userRef || '').toLowerCase() === username;
    if (!sameUser) return false;

    if (capability === 'viewFiles') {
      return collaborator.capabilities?.viewFiles !== false;
    }

    return collaborator.capabilities?.[capability] === true;
  });
}

export function getProjectAccessForUser(user, project, capability = 'viewFiles') {
  if (isAdminUser(user)) {
    return { unrestricted: true, allowedRoots: ['.'] };
  }
  if (!user?.id && !user?.userId) return { unrestricted: false, allowedRoots: [] };

  const userId = Number(user.id ?? user.userId);
  const username = String(user.username || '').toLowerCase();
  const store = readStore();
  const allowedRoots = [];

  for (const collaborator of store.projectCollaborators) {
    if (collaborator.status === 'disabled') continue;
    if (!projectMatches(collaborator, project)) continue;
    const sameUser = Number(collaborator.userId) === userId ||
      String(collaborator.userRef || '').toLowerCase() === username;
    if (!sameUser) continue;
    const capabilityAllowed = capability === 'viewFiles'
      ? collaborator.capabilities?.viewFiles !== false
      : collaborator.capabilities?.[capability] === true;
    if (!capabilityAllowed) continue;
    allowedRoots.push(...collaboratorAllowedRoots(collaborator));
  }

  return { unrestricted: false, allowedRoots: Array.from(new Set(allowedRoots)) };
}

export function userHasProjectPathAccess(user, project, targetPath, capability = 'viewFiles') {
  if (isAdminUser(user)) return true;
  const projectPath = project?.fullPath || project?.path || project?.projectPath;
  if (!projectPath || !targetPath) return false;
  const access = getProjectAccessForUser(user, project, capability);
  return access.allowedRoots.some((root) => {
    const allowedPath = root === '.' ? projectPath : path.resolve(projectPath, root);
    return isPathInside(allowedPath, targetPath);
  });
}

export function filterFileTreeForUser(files = [], user, project, capability = 'viewFiles') {
  if (isAdminUser(user)) return files;
  const projectPath = project?.fullPath || project?.path || project?.projectPath;
  if (!projectPath) return [];
  return files.filter((entry) => {
    const entryPath = entry?.path || entry?.fullPath || entry?.relativePath || '';
    const absoluteEntryPath = path.isAbsolute(entryPath) ? entryPath : path.resolve(projectPath, entryPath);
    return userHasProjectPathAccess(user, { ...project, fullPath: projectPath }, absoluteEntryPath, capability);
  });
}

export function filterProjectsForUser(projects = [], user) {
  if (isAdminUser(user)) return projects;
  return projects.filter((project) => userHasProjectAccess(user, project, 'viewFiles'));
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
    adminUsers: listAdminUsers(),
    projectCollaborators: store.projectCollaborators,
    remoteAccessConfigs: store.remoteAccessConfigs,
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

export function listAdminUsers() {
  return userDb.listUsers().map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role || 'member',
    status: user.is_active ? 'active' : 'disabled',
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
    lastLogin: user.last_login,
  }));
}

export async function createAdminUser(input = {}, actorId = null) {
  const username = compact(input.username || input.email || '');
  const password = String(input.password || '');
  if (!username || password.length < 6) {
    throw new Error('Admin user creation requires a username and a password with at least 6 characters.');
  }

  const role = normalizeRole(input.role || 'member');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = userDb.createManagedUser(username, passwordHash, {
    role,
    is_active: input.status !== 'disabled',
  });

  const store = readStore();
  const member = {
    id: crypto.randomUUID(),
    userId: user.id,
    email: input.email || username,
    displayName: compact(input.displayName || username, 80),
    role,
    projectScopes: Array.isArray(input.projectScopes) ? input.projectScopes : [],
    status: input.status || 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    permissions: TEAM_ROLES[role],
  };
  store.teamMembers.unshift(member);
  addAudit(store, 'admin.user.created', actorId, { userId: user.id, username, role });
  writeStore(store);
  return {
    ...user,
    status: member.status,
    permissions: member.permissions,
  };
}

export function updateAdminUser(userId, patch = {}, actorId = null) {
  const numericUserId = Number(userId);
  const role = patch.role ? normalizeRole(patch.role) : undefined;
  const isActive = patch.status === 'disabled' ? false : patch.status === 'active' ? true : undefined;
  const user = userDb.updateUser(numericUserId, {
    username: patch.username,
    role,
    is_active: isActive,
  });
  if (!user) return null;

  const store = readStore();
  store.teamMembers = store.teamMembers.map((member) => {
    if (member.userId !== numericUserId) return member;
    const nextRole = role || member.role;
    const nextStatus = patch.status || member.status;
    return {
      ...member,
      role: nextRole,
      status: nextStatus,
      permissions: TEAM_ROLES[nextRole] || TEAM_ROLES.viewer,
      updatedAt: nowIso(),
    };
  });
  addAudit(store, 'admin.user.updated', actorId, { userId: numericUserId, role: role || user.role, status: patch.status });
  writeStore(store);
  return {
    ...user,
    role: role || user.role || 'member',
    status: user.is_active ? 'active' : 'disabled',
  };
}

export function createProjectCollaborator(input = {}, actorId = null) {
  const projectName = compactProjectIdentifier(input.projectName || input.project || '');
  const projectPath = input.projectPath || null;
  const targetUser = resolveUser(input);
  const userRef = compact(input.userRef || input.email || input.username || targetUser?.username || '');
  if (!projectName || !userRef) {
    throw new Error('Project collaborator requires a project name and user reference.');
  }

  if (!targetUser) {
    throw new Error('Create the user account before assigning project access.');
  }

  const role = ['partner', 'worker', 'reviewer', 'viewer'].includes(input.role) ? input.role : 'worker';
  const capabilities = {
    chatAgents: input.capabilities?.chatAgents !== false,
    viewFiles: true,
    editFiles: role === 'partner' || role === 'worker',
    useShell: role === 'partner',
    approveActions: role === 'partner' || role === 'reviewer',
    manageSecrets: role === 'partner',
    manageProjectSettings: role === 'partner',
  };
  const collaborator = {
    id: crypto.randomUUID(),
    projectName,
    projectPath,
    userId: targetUser.id,
    userRef,
    role,
    capabilities: {
      ...capabilities,
      ...(input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : {}),
    },
    allowedRoots: normalizeAllowedRoots(input.allowedRoots || input.allowedFolders || ['.']),
    status: input.status || 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const store = readStore();
  store.projectCollaborators.unshift(collaborator);
  addAudit(store, 'project.collaborator.created', actorId, { collaboratorId: collaborator.id, projectName, userRef, role });
  writeStore(store);
  return collaborator;
}

export function updateProjectCollaborator(collaboratorId, patch = {}, actorId = null) {
  const store = readStore();
  let updated = null;
  store.projectCollaborators = store.projectCollaborators.map((collaborator) => {
    if (collaborator.id !== collaboratorId) return collaborator;
    updated = {
      ...collaborator,
      ...patch,
      id: collaborator.id,
      capabilities: {
        ...collaborator.capabilities,
        ...(patch.capabilities && typeof patch.capabilities === 'object' ? patch.capabilities : {}),
      },
      allowedRoots: patch.allowedRoots || patch.allowedFolders
        ? normalizeAllowedRoots(patch.allowedRoots || patch.allowedFolders)
        : collaboratorAllowedRoots(collaborator),
      updatedAt: nowIso(),
    };
    return updated;
  });
  if (updated) {
    addAudit(store, 'project.collaborator.updated', actorId, { collaboratorId, role: updated.role, status: updated.status });
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

export function getAuditLog(filters = {}) {
  const store = readStore();
  let entries = store.auditLog;
  if (filters.userId) {
    entries = entries.filter((entry) => String(entry.actorId) === String(filters.userId));
  }
  if (filters.eventType) {
    entries = entries.filter((entry) => entry.action === filters.eventType || entry.action.includes(filters.eventType));
  }
  if (filters.projectName) {
    entries = entries.filter((entry) => entry.details?.projectName === filters.projectName);
  }
  if (filters.severity) {
    entries = entries.filter((entry) => entry.details?.severity === filters.severity);
  }
  return entries.slice(0, Number(filters.limit || 200));
}

export function exportAuditLog(format = 'json', filters = {}) {
  const entries = getAuditLog(filters);
  if (format === 'csv') {
    const header = ['id', 'createdAt', 'actorId', 'action', 'details'];
    const lines = entries.map((entry) => header.map((field) => {
      const value = field === 'details' ? JSON.stringify(entry.details || {}) : entry[field];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(','));
    return [header.join(','), ...lines].join('\n');
  }
  return JSON.stringify(entries, null, 2);
}

function normalizeAccessMode(mode) {
  return ['lan', 'tailscale', 'cloudflare_tunnel', 'custom_domain'].includes(mode) ? mode : 'lan';
}

function resolveTailscaleInstallPlan() {
  const platform = os.platform();
  if (platform === 'darwin') {
    return {
      platform,
      command: 'brew',
      args: ['install', 'tailscale'],
      displayCommand: 'brew install tailscale',
      docsUrl: 'https://tailscale.com/download/mac',
      note: 'If Homebrew is not installed, open the download page and install the macOS app.',
    };
  }
  if (platform === 'win32') {
    return {
      platform,
      command: 'winget',
      args: ['install', '--id', 'Tailscale.Tailscale', '-e', '--silent'],
      displayCommand: 'winget install --id Tailscale.Tailscale -e --silent',
      docsUrl: 'https://tailscale.com/download/windows',
      note: 'If winget is unavailable, install from the Tailscale download page.',
    };
  }
  return {
    platform,
    command: 'sh',
    args: ['-c', 'curl -fsSL https://tailscale.com/install.sh | sh'],
    displayCommand: 'curl -fsSL https://tailscale.com/install.sh | sh',
    docsUrl: 'https://tailscale.com/download/linux',
    note: 'Linux install may require root privileges. If this fails, run the command with sudo in a terminal.',
  };
}

function extractFirstUrl(text = '') {
  return String(text).match(/https?:\/\/[^\s]+/i)?.[0] || null;
}

function runTailscaleCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      resolve({ ok: false, code: null, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr, error: code === 0 ? null : `${command} exited with code ${code}` });
    });
  });
}

function normalizePublicUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Remote access URL must use http or https.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function saveRemoteAccessConfig(input = {}, actorId = null) {
  const mode = normalizeAccessMode(input.mode);
  const id = input.id || mode;
  const config = {
    id,
    mode,
    label: compact(input.label || mode.replace(/_/g, ' '), 80),
    url: input.url ? normalizePublicUrl(input.url) : null,
    targetPort: Number(input.targetPort || process.env.SERVER_PORT || 3001),
    public: mode === 'cloudflare_tunnel' || mode === 'custom_domain',
    tlsRequired: mode === 'cloudflare_tunnel' || mode === 'custom_domain',
    privateOnly: mode === 'tailscale' || mode === 'lan',
    status: input.status || 'configured',
    notes: compact(input.notes || '', 240),
    updatedAt: nowIso(),
    createdAt: input.createdAt || nowIso(),
    lastHealth: input.lastHealth || null,
  };
  const store = readStore();
  store.remoteAccessConfigs = [config, ...store.remoteAccessConfigs.filter((item) => item.id !== id)];
  addAudit(store, 'remote.access.configured', actorId, { mode, url: config.url, public: config.public });
  writeStore(store);
  return config;
}

export function getRemoteAccessState() {
  const store = readStore();
  return {
    host: os.hostname(),
    platform: os.platform(),
    localUrl: `http://127.0.0.1:${process.env.SERVER_PORT || 3001}`,
    configs: store.remoteAccessConfigs,
    recommendations: [
      {
        mode: 'tailscale',
        label: 'Tailscale private network',
        recommendedWhen: 'No stable domain, no public IP, private team access.',
      },
      {
        mode: 'cloudflare_tunnel',
        label: 'Cloudflare Tunnel',
        recommendedWhen: 'Stable public HTTPS URL without opening inbound ports.',
      },
      {
        mode: 'custom_domain',
        label: 'Custom domain / reverse proxy',
        recommendedWhen: 'Existing domain, reverse proxy, and TLS termination.',
      },
    ],
  };
}

export async function detectTailscaleStatus() {
  const installPlan = resolveTailscaleInstallPlan();
  try {
    const { stdout } = await execFileAsync('tailscale', ['status', '--json'], { timeout: 5000 });
    const status = JSON.parse(stdout || '{}');
    const self = status.Self || {};
    const tailscaleIps = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
    return {
      installed: true,
      loggedIn: Boolean(self.ID || self.DNSName || tailscaleIps.length),
      backendState: status.BackendState || null,
      deviceName: self.HostName || os.hostname(),
      magicDnsName: self.DNSName || null,
      tailscaleIp: tailscaleIps[0] || null,
      pixcodeUrl: tailscaleIps[0] ? `http://${tailscaleIps[0]}:${process.env.SERVER_PORT || 3001}` : null,
      installUrl: 'https://tailscale.com/download',
      installPlan,
      checkedAt: nowIso(),
      message: tailscaleIps[0] ? 'Tailscale is ready for private Pixcode access.' : 'Tailscale CLI is installed but no device IP was detected.',
    };
  } catch (error) {
    const isMissing = error?.code === 'ENOENT';
    return {
      installed: false,
      loggedIn: false,
      backendState: 'missing',
      deviceName: os.hostname(),
      magicDnsName: null,
      tailscaleIp: null,
      pixcodeUrl: null,
      installUrl: 'https://tailscale.com/download',
      installPlan,
      checkedAt: nowIso(),
      message: isMissing
        ? 'Tailscale is optional. Use the LAN links now, or install Tailscale from Settings > Access for private team access without a public domain.'
        : (error?.message || 'Tailscale status could not be read.'),
    };
  }
}

export async function installTailscale(actorId = null) {
  const plan = resolveTailscaleInstallPlan();
  const result = await runTailscaleCommand(plan.command, plan.args);
  const store = readStore();
  addAudit(store, 'remote.access.tailscale.install', actorId, {
    platform: plan.platform,
    ok: result.ok,
    command: plan.displayCommand,
  });
  writeStore(store);
  return {
    ...result,
    plan,
    message: result.ok
      ? 'Tailscale install command completed. Run login/connect next.'
      : `Install command failed. ${plan.note}`,
  };
}

export async function loginTailscale(actorId = null) {
  const result = await runTailscaleCommand('tailscale', ['up']);
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  const authUrl = extractFirstUrl(combinedOutput);
  const store = readStore();
  addAudit(store, 'remote.access.tailscale.login', actorId, {
    ok: result.ok,
    authUrl: Boolean(authUrl),
  });
  writeStore(store);
  return {
    ...result,
    authUrl,
    message: result.ok
      ? 'Tailscale is connected.'
      : (authUrl ? 'Open the login URL to finish connecting this device.' : 'Tailscale login command failed.'),
    tailscale: await detectTailscaleStatus(),
  };
}

export async function checkRemoteAccessHealth(input = {}, actorId = null) {
  const url = normalizePublicUrl(input.url || input.remoteUrl || '');
  const checkedAt = nowIso();
  if (!url) {
    throw new Error('Remote access health check requires a URL.');
  }
  const parsed = new URL(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(input.timeoutMs || 5000));
  try {
    const response = await fetch(`${url}/api/auth/status`, { signal: controller.signal });
    const health = {
      url,
      reachable: response.ok,
      checkedAt,
      statusCode: response.status,
      https: parsed.protocol === 'https:',
      websocketExpected: true,
      message: response.ok ? 'Pixcode auth endpoint is reachable.' : `Pixcode returned HTTP ${response.status}.`,
    };
    const store = readStore();
    addAudit(store, 'remote.access.health_checked', actorId, { url, reachable: health.reachable, https: health.https });
    writeStore(store);
    return health;
  } catch (error) {
    const health = {
      url,
      reachable: false,
      checkedAt,
      statusCode: null,
      https: parsed.protocol === 'https:',
      websocketExpected: true,
      message: error?.name === 'AbortError' ? 'Health check timed out.' : (error?.message || 'Remote access URL is unreachable.'),
    };
    const store = readStore();
    addAudit(store, 'remote.access.health_checked', actorId, { url, reachable: false, https: health.https });
    writeStore(store);
    return health;
  } finally {
    clearTimeout(timeout);
  }
}
