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
const serverIndex = read('server/index.js');
const hermesRoutes = read('server/modules/orchestration/hermes/hermes.routes.ts');
const shellTerminal = read('src/components/shell/hooks/useShellTerminal.ts');
const gitPanelHeader = read('src/components/git-panel/view/GitPanelHeader.tsx');

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
assert.match(workbench, /workspaceTabStripRef/, 'Workbench workspace tabs should scroll instead of overflowing the viewport.');
assert.match(workbench, /onToggleCliPanel/, 'Workbench workspace tab bar should expose a right CLI panel collapse toggle.');
assert.match(workbench, /WorkspaceTabContextMenu/, 'Workbench workspace tabs should use right-click actions.');
assert.doesNotMatch(workbench, /\.\.\.currentTabs\.filter\(\(tab\) => tab\.id !== tabId\)/, 'Workspace selection should not reorder tabs.');
assert.match(workbench, /openEditorTabs|activeEditorPath/, 'Workbench editor should keep a Monaco-style tab set.');
assert.match(workbench, /WORKBENCH_EDITOR_STATE_STORAGE_KEY/, 'Workbench editor should persist open tabs per workspace.');
assert.match(workbench, /readWorkbenchEditorState/, 'Workbench editor should restore open tabs when switching back to a workspace.');
assert.doesNotMatch(
  workbench,
  /useEffect\(\(\) => \{\s*setOpenEditorTabs\(\[\]\);\s*setActiveEditorPath\(null\);\s*setSplitEditorFile\(null\);[\s\S]*?\}, \[selectedProject\?\.name\]\);/,
  'Workbench editor must not clear every open tab when the selected workspace changes.',
);
assert.doesNotMatch(workbench, /<ChatInterface/, 'Right workbench panel should not render the chat composer.');
assert.match(workbench, /WorkbenchCliPanel/, 'Right workbench panel should render the CLI terminal panel.');
assert.match(workbench, /setIsTerminalOpen\(true\)/, 'CLI picker should give way to a full-height terminal after the user starts a provider.');
assert.match(workbench, /onClose=\{closeTerminal\}/, 'Closing the workbench terminal should return to the CLI picker.');
assert.match(workbench, /WorkbenchCliPanelToolbar/, 'CLI terminal should keep history and new-session actions visible.');
assert.match(workbench, /WORKBENCH_CLI_STATE_STORAGE_KEY/, 'CLI terminal should remember per-project open state across workspace switches.');
assert.match(workbench, /function WorkbenchBottomTerminal/, 'Terminal activity should render as a bottom plain-shell panel.');
assert.match(workbench, /isPlainShell/, 'Bottom terminal should open the selected project folder without starting the selected AI CLI.');
assert.match(workbench, /startHermesAgent/, 'Right CLI panel should launch Hermes Agent in the active project.');
assert.match(workbench, /openNewCliSessionPicker/, 'CLI terminal plus should return to provider selection before starting a fresh session.');
assert.match(workbench, /terminateCurrentCliSession\(selectedProvider\)/, 'CLI terminal plus should terminate the existing provider PTY before showing selection.');
assert.match(workbench, /forceNewSession=\{terminalLaunch\.forceNewSession\}/, 'Fresh CLI sessions should bypass the cached default PTY.');
assert.match(serverIndex, /\/api\/shell\/sessions\/terminate/, 'Backend should expose an authenticated endpoint to terminate cached provider PTYs immediately.');
assert.match(serverIndex, /isPlainShell && !initialCommand/, 'Backend should spawn an interactive plain shell when no terminal command is provided.');
assert.doesNotMatch(shellTerminal, /new WebglAddon\(\)/, 'Workbench terminal should use the stable xterm renderer.');
assert.match(workbench, /setActivityPanel\('explorer'\)/, 'Selecting a project should return the side panel to Explorer.');
assert.match(gitPanelHeader, /compact/, 'Workbench Source Control should have compact icon-only controls.');
assert.doesNotMatch(workbench, /TaskMasterPanel|useTaskMaster|useTasksSettings|tabs\.tasks/, 'Workbench should not expose TaskMaster.');

assert.match(fileTreeData, /pixcode:file-tree-refresh/, 'File tree data should listen for websocket-backed file refresh events.');
assert.match(appContent, /pixcode:file-tree-refresh/, 'AppContent should bridge project websocket updates into file-tree refresh events.');
assert.match(read('src/components/file-tree/view/FileTree.tsx'), /loading && files\.length === 0/, 'File tree refresh should keep the current tree visible after the initial load.');
assert.match(read('src/components/file-tree/view/FileTree.tsx'), /liveChangedFilePaths/, 'File tree should highlight websocket-backed file changes without a manual refresh.');

assert.doesNotMatch(app, /TaskMasterProvider/, 'App should not wrap the product UI in TaskMasterProvider.');
assert.doesNotMatch(settingsSidebar, /id: 'tasks'/, 'Settings sidebar should not show a Tasks tab.');
assert.doesNotMatch(settingsMainTabs, /id: 'tasks'/, 'Settings main tabs should not show a Tasks tab.');
assert.doesNotMatch(settingsTypes, /'tasks'/, 'Settings tab type should not include tasks.');
assert.doesNotMatch(settingsController, /'tasks'/, 'Settings controller should not treat tasks as a known tab.');

assert.doesNotMatch(workbench, /<OrchestrationPage/, 'Workbench should not expose the old orchestration page.');
assert.doesNotMatch(workbench, /tabs\.orchestration/, 'Workbench menus should not route users into orchestration.');
assert.match(serverIndex, /app\.use\('\/hermes', createHermesTaskRouter\(\)\)/, 'Internal task router should be mounted behind Hermes.');
assert.doesNotMatch(serverIndex, /app\.use\('\/a2a'/, 'Server should not expose the old A2A route.');
assert.match(hermesRoutes, /createHermesRouter/, 'Hermes should have a dedicated orchestration API router.');
assert.match(serverIndex, /forceNewSession/, 'Shell backend should support explicit fresh-session launches from the workbench.');
assert.match(serverIndex, /killProviderPtySessions/, 'Shell backend should terminate old provider PTYs when a fresh CLI session is requested.');

console.log('pixcode workbench 1.48 smoke passed');
