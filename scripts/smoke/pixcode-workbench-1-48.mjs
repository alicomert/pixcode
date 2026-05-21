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
const settings = read('src/components/settings/view/Settings.tsx');
const app = read('src/App.tsx');
const serverIndex = read('server/index.js');
const hermesRoutes = read('server/modules/orchestration/hermes/hermes.routes.ts');
const shellTerminal = read('src/components/shell/hooks/useShellTerminal.ts');
const shellConnection = read('src/components/shell/hooks/useShellConnection.ts');
const geminiCli = read('server/gemini-cli.js');
const qwenCli = read('server/qwen-code-cli.js');
const agentSettings = read('src/components/settings/view/tabs/agents-settings/AgentsSettingsTab.tsx');
const gitPanelHeader = read('src/components/git-panel/view/GitPanelHeader.tsx');
const themeContext = read('src/contexts/ThemeContext.jsx');

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
assert.match(workbench, /onCloseTerminal=\{closeTerminal\}/, 'CLI terminal toolbar should keep a close button that returns to provider selection.');
assert.match(workbench, /vscodeWorkbench\.cli\.closeTerminal/, 'CLI terminal close action should have a dedicated accessible label.');
assert.match(workbench, /WORKBENCH_CLI_STATE_STORAGE_KEY/, 'CLI terminal should remember per-project open state across workspace switches.');
assert.match(workbench, /function WorkbenchBottomTerminal/, 'Terminal activity should render as a bottom plain-shell panel.');
assert.match(workbench, /BOTTOM_TERMINAL_MIN_HEIGHT/, 'Bottom terminal should support height resizing.');
assert.match(workbench, /isBottomTerminalMinimized/, 'Bottom terminal should support minimizing without closing.');
assert.match(workbench, /isPlainShell/, 'Bottom terminal should open the selected project folder without starting the selected AI CLI.');
assert.match(workbench, /HERMES_AGENT_START_COMMAND/, 'Hermes Agent should launch from the bottom terminal through a server-side sentinel.');
assert.doesNotMatch(workbench, /Project-scoped agent terminal\. Installs Hermes when missing/, 'Right CLI panel should not show the old Hermes card.');
assert.doesNotMatch(workbench, /vscodeWorkbench\.hermes\.docsShort|HERMES_AGENT_DOCS_URL/, 'Hermes terminal header should not include a docs shortcut.');
assert.match(workbench, /shrinkCliPanel/, 'Right CLI panel should expose a shrink action.');
assert.match(workbench, /expandCliPanel/, 'Right CLI panel should expose an expand action.');
assert.match(workbench, /vscodeWorkbench\.welcome\.openProject/, 'Workbench welcome should expose a simple Open Project action.');
assert.match(workbench, /vscodeWorkbench\.welcome\.cloneProject/, 'Workbench welcome should expose a simple Clone action.');
assert.match(workbench, /vscodeWorkbench\.welcome\.startHermes/, 'Workbench welcome should expose a Hermes start action.');
assert.match(workbench, /DarkModeToggle/, 'Workbench welcome should expose a dark-mode toggle.');
assert.match(themeContext, /return true;/, 'Pixcode should default new installs to dark mode.');
assert.match(workbench, /openNewCliSessionPicker/, 'CLI terminal plus should return to provider selection before starting a fresh session.');
assert.match(workbench, /terminateCurrentCliSession\(selectedProvider\)/, 'CLI terminal plus should terminate the existing provider PTY before showing selection.');
assert.match(workbench, /forceNewSession=\{terminalLaunch\.forceNewSession\}/, 'Fresh CLI sessions should bypass the cached default PTY.');
assert.doesNotMatch(workbench, /suspendAutoConnect/, 'Right CLI provider starts should auto-connect directly instead of showing the shell continue overlay.');
assert.match(serverIndex, /\/api\/shell\/sessions\/terminate/, 'Backend should expose an authenticated endpoint to terminate cached provider PTYs immediately.');
assert.match(serverIndex, /isPlainShell && !initialCommand/, 'Backend should spawn an interactive plain shell when no terminal command is provided.');
assert.match(serverIndex, /pixcode:hermes:start/, 'Backend should expand Hermes terminal sentinels on the server host.');
assert.match(serverIndex, /Hermes Agent is starting/, 'Hermes terminal should show an immediate startup line before the interactive app draws.');
assert.match(serverIndex, /"\$HERMES_CMD" chat/, 'POSIX Hermes terminal should start the interactive chat command explicitly.');
assert.match(serverIndex, /& \$script:HermesCmd chat/, 'Windows Hermes terminal should start the interactive chat command explicitly.');
assert.doesNotMatch(serverIndex, /iex \(irm https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.ps1\)/, 'Windows Hermes install should avoid the old inline iex pattern.');
assert.doesNotMatch(serverIndex, /scriptblock\]::Create\(\(irm https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.ps1\)\)/, 'Windows Hermes install should avoid scriptblock Invoke-RestMethod eval patterns.');
assert.match(serverIndex, /Invoke-WebRequest[\s\S]+install\.ps1[\s\S]+-OutFile/, 'Windows Hermes install should download the installer to a file before running it.');
assert.match(serverIndex, /Resolve-HermesCommand|resolveHermesCommand/, 'Hermes start/install should resolve an existing hermes binary before installing.');
assert.match(serverIndex, /buildProviderShellCommand/, 'Provider terminal launch should centralize provider-specific permission flags.');
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
assert.match(hermesRoutes, /terminal-launches/, 'Hermes MCP should be able to request visible Pixcode CLI terminal launches.');
assert.match(hermesRoutes, /install-status/, 'Hermes settings and terminal UI should have an install-status endpoint.');
assert.match(hermesRoutes, /router\.post\('\/install'/, 'Hermes should install through the backend API instead of terminal command paste.');
assert.match(read('scripts/smoke/hermes-api-install.mjs'), /hermes API install smoke passed/, 'Hermes API install behavior should have a focused smoke test.');
assert.match(workbench, /terminalStartupInput/, 'Hermes terminal launch prompts should be passed into the selected CLI.');
assert.match(read('src/components/shell/hooks/useShellConnection.ts'), /startupInputRef/, 'Shell connections should support one-shot startup input for Hermes-triggered CLI work.');
assert.match(serverIndex, /forceNewSession/, 'Shell backend should support explicit fresh-session launches from the workbench.');
assert.match(serverIndex, /killProviderPtySessions/, 'Shell backend should terminate old provider PTYs when a fresh CLI session is requested.');

assert.match(settingsTypes, /'hermes'/, 'Settings should support Hermes Agent as a first-class tab.');
assert.match(settingsSidebar, /id: 'hermes'/, 'Settings sidebar should show Hermes Agent as its own page instead of hiding it at the end of Agents.');
assert.match(settings, /<HermesSettingsTab/, 'Settings should render the dedicated Hermes Agent page.');
assert.doesNotMatch(agentSettings, /'hermes'/, 'Settings Agents picker should not bury Hermes Agent at the end of the provider list.');
assert.match(workbench, /hermesInstallStatus/, 'Workbench should hide Hermes install actions when Hermes is already installed.');
assert.match(workbench, /HermesActivityButton/, 'Workbench activity rail should include a dedicated Hermes launcher button.');
assert.match(shellConnection, /cursor-tools-settings/, 'Cursor shell launches should read Cursor permission settings, not Claude settings.');
assert.match(shellConnection, /permissionMode/, 'Shell websocket init should send provider permission mode to the backend.');
assert.match(serverIndex, /--dangerously-bypass-approvals-and-sandbox/, 'Codex terminal bypass mode should use the Codex CLI bypass flag.');
assert.match(serverIndex, /--yolo/, 'Gemini and Qwen terminal bypass mode should use --yolo.');
assert.match(serverIndex, /--dangerously-skip-permissions/, 'Claude/OpenCode terminal bypass mode should pass the provider bypass flag.');
assert.match(geminiCli, /permissionMode === 'bypassPermissions'[\s\S]+--yolo|--yolo[\s\S]+permissionMode === 'bypassPermissions'/, 'Gemini chat route should map Pixcode bypassPermissions to --yolo.');
assert.match(qwenCli, /permissionMode === 'bypassPermissions'[\s\S]+--yolo|--yolo[\s\S]+permissionMode === 'bypassPermissions'/, 'Qwen chat route should map Pixcode bypassPermissions to --yolo.');

console.log('pixcode workbench 1.48 smoke passed');
