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
  '/api/production-agent-loop/github/issue-to-pr',
  '/api/platformization/admin/users',
  '/api/platformization/project-collaborators',
]) {
  assert.match(controlRoom, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Control room UI should include ${phrase}.`);
}
assert.doesNotMatch(controlRoom, /sections\.access|Self-hosted access|remote-access\/health/, 'Self-hosted access belongs in Settings, not inside Control Room.');

assert.match(controlRoom, /lg:flex-row/, 'Control room must use responsive layout.');
assert.match(controlRoom, /sm:grid-cols-2/, 'Control room must include mobile-first responsive grids.');
assert.match(controlRoom, /xl:grid-cols/, 'Control room must scale to wide screens.');

const appTypes = read('src/types/app.ts');
assert.match(appTypes, /controlRoom/, 'App tabs should include controlRoom.');

const tabSwitcher = read('src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx');
assert.doesNotMatch(tabSwitcher, /tabs\.controlRoom/, 'Control Room should not appear as a normal top tab.');

const mainContent = read('src/components/main-content/view/MainContent.tsx');
assert.match(mainContent, /ControlRoomPage/, 'Main content should render the Control Room page.');
assert.match(mainContent, /activeTab === 'controlRoom'/, 'Control Room should render as its own primary tab.');
assert.match(mainContent, /setActiveTab\('controlRoom'\)/, 'Empty-state users should have a direct Control Room launcher.');

const projectsState = read('src/hooks/useProjectsState.ts');
assert.match(projectsState, /'controlRoom'/, 'Control Room must be a persisted primary app tab.');
assert.match(projectsState, /onOpenControlRoom/, 'Sidebar should receive a direct Control Room launcher.');

const mainContentTypes = read('src/components/main-content/types/types.ts');
assert.match(mainContentTypes, /onOpenControlRoom/, 'Main content state should expose a direct Control Room launcher callback.');
assert.match(mainContentTypes, /selectedProject: Project \| null/, 'Control Room header should support server-level access without requiring a selected project.');

const mainContentHeader = read('src/components/main-content/view/subcomponents/MainContentHeader.tsx');
assert.doesNotMatch(mainContentHeader, /Open Control Room|openControlRoom/, 'Header should not carry the fixed Control Room launcher.');
assert.match(mainContentHeader, /activeTab !== 'controlRoom'/, 'Control Room should hide the normal project tab header.');

const sidebarFooter = read('src/components/sidebar/view/subcomponents/SidebarFooter.tsx');
assert.match(sidebarFooter, /controlRoom/, 'Expanded sidebar footer should show the Control Room launcher above Settings.');
assert.match(sidebarFooter, /onOpenControlRoom/, 'Expanded sidebar footer should open Control Room directly.');

const sidebarCollapsed = read('src/components/sidebar/view/subcomponents/SidebarCollapsed.tsx');
assert.match(sidebarCollapsed, /controlRoom/, 'Collapsed sidebar should expose Control Room above Settings.');
assert.match(sidebarCollapsed, /onOpenControlRoom/, 'Collapsed sidebar should open Control Room directly.');

const emptyState = read('src/components/main-content/view/subcomponents/MainContentStateView.tsx');
assert.match(emptyState, /Open Control Room/, 'Empty project state should include a visible Open Control Room button.');

const settingsTypes = read('src/components/settings/types/types.ts');
assert.match(settingsTypes, /'access'/, 'Settings should include a global Access tab.');

const settingsController = read('src/components/settings/hooks/useSettingsController.ts');
assert.match(settingsController, /'access'/, 'Settings controller should accept the Access tab.');

const settingsSidebar = read('src/components/settings/view/SettingsSidebar.tsx');
assert.match(settingsSidebar, /mainTabs\.access/, 'Settings sidebar should expose Access as a first-class system setting.');

const settings = read('src/components/settings/view/Settings.tsx');
assert.match(settings, /AccessSettingsTab/, 'Settings should render the Access settings tab.');

const accessSettings = read('src/components/settings/view/tabs/access-settings/AccessSettingsTab.tsx');
for (const phrase of [
  '/api/network/endpoints',
  '/api/network/external',
  '/api/network/tunnel',
  '/api/platformization/remote-access',
  '/api/platformization/remote-access/configs',
  '/api/platformization/remote-access/tailscale',
  '/api/platformization/remote-access/health',
  'QRCode',
  'renderQrDataUrl',
  'toggleTunnel',
  'saveDetectedAccessPath',
  'connectionOptions',
]) {
  assert.match(accessSettings, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Access settings should use ${phrase}.`);
}

assert.match(controlRoom, /useTranslation/, 'Control Room should use the app i18n system.');
assert.match(controlRoom, /controlRoom\./, 'Control Room copy should be loaded from translation keys.');

for (const locale of ['en', 'tr', 'de', 'it', 'ja', 'ko', 'ru', 'zh-CN']) {
  const commonLocale = read(`src/i18n/locales/${locale}/common.json`);
  assert.match(commonLocale, /"controlRoom"\s*:/, `${locale} common locale should include Control Room translations.`);
}

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
assert.doesNotMatch(platformService, /Tailscale CLI is not installed/, 'Tailscale missing state should be guidance, not a raw CLI error.');

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
