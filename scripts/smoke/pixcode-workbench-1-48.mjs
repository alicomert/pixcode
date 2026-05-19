import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const preferenceHook = read('src/hooks/useWorkbenchLayoutPreference.ts');
const appContent = read('src/components/app/AppContent.tsx');
const loginForm = read('src/components/auth/view/LoginForm.tsx');
const appearanceTab = read('src/components/settings/view/tabs/AppearanceSettingsTab.tsx');
const workbench = read('src/components/vscode-workbench/view/VSCodeWorkbench.tsx');
const fileTreeData = read('src/components/file-tree/hooks/useFileTreeData.ts');
const settingsSidebar = read('src/components/settings/view/SettingsSidebar.tsx');
const settingsMainTabs = read('src/components/settings/view/SettingsMainTabs.tsx');
const settingsTypes = read('src/components/settings/types/types.ts');
const settingsController = read('src/components/settings/hooks/useSettingsController.ts');
const app = read('src/App.tsx');
const orchestration = read('src/components/orchestration/OrchestrationPage.tsx');
const serverIndex = read('server/index.js');
const hermesRoutes = read('server/modules/orchestration/hermes/hermes.routes.ts');

assert.match(
  preferenceHook,
  /export type WorkbenchLayoutPreference = 'vscode';/,
  'Classic layout should be removed from the persisted layout type.',
);
assert.doesNotMatch(preferenceHook, /'classic'/, 'Workbench preference hook should not fall back to classic.');
assert.match(appContent, /<VSCodeWorkbench/, 'Desktop app should render the VS Code workbench.');
assert.doesNotMatch(appContent, /!useVscodeWorkbench/, 'AppContent should not keep a classic desktop branch.');

assert.doesNotMatch(loginForm, /login\.layout|setWorkbenchLayout|WorkbenchLayoutPreference|classic/i, 'Login should not expose layout switching.');
assert.doesNotMatch(appearanceTab, /workbenchLayout|WorkbenchLayoutPreference|onWorkbenchLayoutChange|classic/i, 'Appearance settings should not expose layout switching.');

assert.match(workbench, /useState<ActivityPanel>\('projects'\)/, 'Workbench should open on the Projects panel.');
assert.match(workbench, /WorkbenchWorkspaceTabs|WORKBENCH_WORKSPACE_TABS_STORAGE_KEY/, 'Workbench should expose persistent top workspace tabs.');
assert.match(workbench, /openEditorTabs|activeEditorPath/, 'Workbench editor should keep a Monaco-style tab set.');
assert.doesNotMatch(workbench, /<ChatInterface/, 'Right workbench panel should not render the chat composer.');
assert.match(workbench, /WorkbenchCliPanel/, 'Right workbench panel should render the CLI terminal panel.');
assert.doesNotMatch(workbench, /TaskMasterPanel|useTaskMaster|useTasksSettings|tabs\.tasks/, 'Workbench should not expose TaskMaster.');

assert.match(fileTreeData, /pixcode:file-tree-refresh/, 'File tree data should listen for websocket-backed file refresh events.');
assert.match(appContent, /pixcode:file-tree-refresh/, 'AppContent should bridge project websocket updates into file-tree refresh events.');

assert.doesNotMatch(app, /TaskMasterProvider/, 'App should not wrap the product UI in TaskMasterProvider.');
assert.doesNotMatch(settingsSidebar, /id: 'tasks'/, 'Settings sidebar should not show a Tasks tab.');
assert.doesNotMatch(settingsMainTabs, /id: 'tasks'/, 'Settings main tabs should not show a Tasks tab.');
assert.doesNotMatch(settingsTypes, /'tasks'/, 'Settings tab type should not include tasks.');
assert.doesNotMatch(settingsController, /'tasks'/, 'Settings controller should not treat tasks as a known tab.');

assert.match(orchestration, /Hermes/, 'Orchestration page should present Hermes as the control agent.');
assert.doesNotMatch(orchestration, /A2A|a2a/, 'Orchestration page should not present A2A terminology.');
assert.match(serverIndex, /app\.use\('\/hermes', createHermesTaskRouter\(\)\)/, 'Internal task router should be mounted behind Hermes.');
assert.doesNotMatch(serverIndex, /app\.use\('\/a2a'/, 'Server should not expose the old A2A route.');
assert.match(hermesRoutes, /createHermesRouter/, 'Hermes should have a dedicated orchestration API router.');

console.log('pixcode workbench 1.48 smoke passed');
