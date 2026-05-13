#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const controlRoom = read('src/components/control-room/ControlRoomPage.tsx');
for (const phrase of [
  'Production loop',
  'Admin system',
  'Project collaborators',
  'Secret vault',
  'MCP/plugin marketplace',
  'Evaluation harness',
  'Cost, token, and latency dashboard',
  'Security audit mode',
  'Self-hosted access',
  '/api/production-agent-loop/github/issue-to-pr',
  '/api/platformization/admin/users',
  '/api/platformization/project-collaborators',
  '/api/platformization/remote-access/tailscale',
  '/api/platformization/remote-access/health',
]) {
  assert.match(controlRoom, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Control room UI should include ${phrase}.`);
}

assert.match(controlRoom, /lg:flex-row/, 'Control room must use responsive layout.');
assert.match(controlRoom, /sm:grid-cols-2/, 'Control room must include mobile-first responsive grids.');
assert.match(controlRoom, /xl:grid-cols/, 'Control room must scale to wide screens.');

const appTypes = read('src/types/app.ts');
assert.match(appTypes, /controlRoom/, 'App tabs should include controlRoom.');

const tabSwitcher = read('src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx');
assert.match(tabSwitcher, /tabs\.controlRoom/, 'Tab switcher should expose the Control tab.');

const mainContent = read('src/components/main-content/view/MainContent.tsx');
assert.match(mainContent, /ControlRoomPage/, 'Main content should render the Control Room page.');
assert.match(mainContent, /activeTab === 'controlRoom'/, 'Control Room should render as its own primary tab.');
assert.match(mainContent, /setActiveTab\('controlRoom'\)/, 'Empty-state users should have a direct Control Room launcher.');

const mainContentTypes = read('src/components/main-content/types/types.ts');
assert.match(mainContentTypes, /onOpenControlRoom/, 'Main content state should expose a direct Control Room launcher callback.');
assert.match(mainContentTypes, /selectedProject: Project \| null/, 'Control Room header should support server-level access without requiring a selected project.');

const mainContentHeader = read('src/components/main-content/view/subcomponents/MainContentHeader.tsx');
assert.match(mainContentHeader, /Open Control Room/, 'Header should include a visible Open Control Room button.');

const emptyState = read('src/components/main-content/view/subcomponents/MainContentStateView.tsx');
assert.match(emptyState, /Open Control Room/, 'Empty project state should include a visible Open Control Room button.');

const platformService = read('server/services/platformization.js');
for (const symbol of [
  'createAdminUser',
  'createProjectCollaborator',
  'getAuditLog',
  'saveRemoteAccessConfig',
  'detectTailscaleStatus',
  'checkRemoteAccessHealth',
  'project_partner',
  'project_worker',
]) {
  assert.match(platformService, new RegExp(symbol), `Platformization service should include ${symbol}.`);
}

const platformRoutes = read('server/routes/platformization.js');
for (const route of [
  '/admin/users',
  '/project-collaborators',
  '/remote-access',
  '/remote-access/tailscale',
  '/remote-access/health',
  '/audit-log/export',
]) {
  assert.match(platformRoutes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Platformization routes should expose ${route}.`);
}

console.log('v1.46 control room UI smoke passed');
