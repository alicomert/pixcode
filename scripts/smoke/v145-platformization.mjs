#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const service = read('server/services/platformization.js');
assert.match(service, /TEAM_ROLES/, 'Platformization should define enterprise RBAC roles.');
assert.match(service, /createTeamMember/, 'Platformization should create team members.');
assert.match(service, /sealSecret/, 'Platformization should seal scoped secrets.');
assert.match(service, /materializeScopedEnv/, 'Platformization should materialize scoped env previews.');
assert.match(service, /upsertMarketplacePlugin/, 'Platformization should manage plugin marketplace entries.');
assert.match(service, /createEvaluationSuite/, 'Platformization should create evaluation suites.');
assert.match(service, /createEvaluationRun/, 'Platformization should create evaluation runs.');
assert.match(service, /summarizeUsageEvents/, 'Platformization should summarize cost, token, and latency usage.');
assert.match(service, /createSecurityAuditRun/, 'Platformization should create security audit runs.');
assert.match(service, /agent_output_leak_detection/, 'Security audit mode should include output leak detection.');

const routes = read('server/routes/platformization.js');
assert.match(routes, /\/team\/members/, 'Platformization routes should expose team management.');
assert.match(routes, /\/secrets\/scoped-env/, 'Platformization routes should expose scoped env assembly.');
assert.match(routes, /\/marketplace\/plugins/, 'Platformization routes should expose marketplace management.');
assert.match(routes, /\/eval\/runs/, 'Platformization routes should expose evaluation runs.');
assert.match(routes, /\/usage\/summary/, 'Platformization routes should expose usage dashboards.');
assert.match(routes, /\/security\/audit-runs/, 'Platformization routes should expose security audit mode.');
assert.match(routes, /\/audit-log/, 'Platformization routes should expose audit logs.');

const server = read('server/index.js');
assert.match(server, /platformizationRoutes/, 'Server should import platformization routes.');
assert.match(server, /\/api\/platformization/, 'Server should mount platformization routes.');

const projects = read('server/routes/projects.js');
assert.match(projects, /WORKSPACES_USERS_BASE/, 'Member workspaces should use a per-user root.');
assert.match(projects, /allowedRoot/, 'Workspace validation should enforce an allowed root.');
assert.match(projects, /requireWorkspaceUser/, 'Workspace routes should accept authenticated members through a scoped guard.');
assert.match(projects, /userHasWorkspacePathAccess/, 'Shared workspace paths should use collaborator path permissions.');

const gitConfig = read('server/utils/gitConfig.js');
assert.match(gitConfig, /isSafeGithubCloneUrl/, 'Git clone sources should use a centralized GitHub URL guard.');
assert.match(gitConfig, /Local\/file URLs/i, 'Clone URL guard should document local/file rejection.');

const agent = read('server/routes/agent.js');
assert.match(agent, /isSafeGithubCloneUrl/, 'Agent clone API should validate GitHub clone sources.');

const nanoclaw = read('server/modules/nanoclaw/bridge.js');
assert.match(nanoclaw, /requireTaskScope/, 'NanoClaw API keys should be constrained by task scopes.');
assert.match(nanoclaw, /resolveRequestProjectPath/, 'NanoClaw runs should resolve an authorized workspace before execution.');
assert.match(nanoclaw, /privateWorkspaceRootFor/, 'Path-less member NanoClaw runs should use private workspaces.');
const nanoclawPath = read('server/modules/nanoclaw/project-path.js');
assert.match(nanoclawPath, /realpathSync/, 'NanoClaw project paths should canonicalize symlinks before execution.');

const docs = read('docs/platformization.md');
assert.match(docs, /RBAC/i, 'Docs should explain RBAC/team mode.');
assert.match(docs, /Secret Vault/i, 'Docs should explain the secret vault.');
assert.match(docs, /MCP\/plugin Marketplace/i, 'Docs should explain marketplace management.');
assert.match(docs, /Evaluation Harness/i, 'Docs should explain evaluations.');
assert.match(docs, /Cost, Token, and Latency/i, 'Docs should explain usage dashboards.');
assert.match(docs, /Security\/audit Mode/i, 'Docs should explain security audit mode.');

console.log('v1.45 platformization smoke passed');
