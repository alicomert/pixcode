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
const hermesInstallJobs = read('server/services/hermes-install-jobs.js');
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
assert.match(workbench, /WorkbenchBottomTerminalViewMode/, 'Bottom terminal should support explicit half and full-screen modes.');
assert.doesNotMatch(workbench, /BOTTOM_TERMINAL_MINIMIZED_HEIGHT|Minimize terminal/, 'Bottom terminal should not expose the old minimized strip behavior.');
assert.match(workbench, /bottomTerminalProject/, 'Bottom terminal should stay bound to the project it was opened for.');
assert.match(workbench, /setBottomTerminalProject/, 'Opening a bottom terminal should capture its project instead of following workspace selection changes.');
assert.match(workbench, /terminalProject = bottomTerminalProject \?\? selectedProject/, 'Workbench should render bottom terminals against their captured project binding.');
assert.match(workbench, /WORKBENCH_HERMES_STATE_STORAGE_KEY/, 'Hermes bottom terminal open state should be stored per workspace.');
assert.match(workbench, /readWorkbenchHermesState/, 'Workspace switches should restore the Hermes terminal state for that project.');
assert.match(workbench, /writeWorkbenchHermesState/, 'Opening, minimizing, and closing Hermes should persist per-project state.');
assert.match(workbench, /isPlainShell/, 'Bottom terminal should open the selected project folder without starting the selected AI CLI.');
assert.doesNotMatch(workbench, /HERMES_AGENT_START_COMMAND/, 'Hermes Agent should not launch from the bottom terminal through a server-side sentinel.');
assert.doesNotMatch(workbench, /HermesApiChatPanel|HermesTerminalTranscript/, 'Hermes Agent should use the real PTY terminal UI, not a custom REST chat transcript.');
assert.doesNotMatch(workbench, /REST POST \/|transport=|response=|gateway=http/, 'Hermes terminal UI must not expose REST debug internals to the user.');
assert.match(workbench, /HERMES_DEFAULT_COMMAND = 'hermes --yolo --toolsets mcp-pixcode'/, 'Hermes Agent bottom panel should launch the actual `hermes` CLI with Pixcode MCP-only tools.');
assert.match(workbench, /HERMES_HISTORY_COMMAND = 'hermes sessions browse'/, 'Hermes terminal history should open the native interactive session picker.');
assert.match(workbench, /onOpenHistory=\{openHermesHistory\}/, 'Hermes terminal header should wire its history button to the native Hermes sessions command.');
assert.match(workbench, /Pixcode MCP Live/, 'Hermes terminal should show a user-facing Pixcode MCP live badge.');
assert.doesNotMatch(workbench, /ml-auto border-blue-500\/40 bg-blue-500\/10/, 'Hermes REST panel must not use right-aligned chat bubbles.');
assert.match(workbench, /terminal-launches\/stream/, 'Hermes CLI launch requests should arrive through an EventSource stream.');
assert.doesNotMatch(workbench, /HERMES_TERMINAL_LAUNCH_POLL_MS|setInterval\([\s\S]*terminal-launches/, 'Hermes CLI launch requests should not be polled every few seconds.');
assert.match(workbench, /forceNewSession:\s*hermesCliLaunch\.forceNewSession === true/, 'Hermes MCP provider launches should continue the current visible CLI session by default.');
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
assert.doesNotMatch(serverIndex, /pixcode:hermes:start/, 'Backend should not need a Hermes terminal sentinel for the workbench Hermes panel.');
assert.match(serverIndex, /buildHermesCliCommand/, 'Backend should configure Pixcode MCP before launching the resolved Hermes command.');
assert.match(serverIndex, /configure-pixcode-mcp\.mjs/, 'Hermes PTY launches should configure Pixcode MCP before starting the CLI.');
assert.match(serverIndex, /resolveHermesMcpBaseUrl/, 'Hermes MCP should use the local Pixcode API base URL from the host process.');
assert.doesNotMatch(hermesInstallJobs, /iex \(irm https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.ps1\)/, 'Windows Hermes install should avoid the old inline iex pattern.');
assert.doesNotMatch(hermesInstallJobs, /scriptblock\]::Create\(\(irm https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.ps1\)\)/, 'Windows Hermes install should avoid scriptblock Invoke-RestMethod eval patterns.');
assert.match(hermesInstallJobs, /downloadHermesInstaller/, 'Windows Hermes install should download the installer through backend API code before running it.');
assert.match(hermesInstallJobs, /resolveHermesCommandCandidates|isUsableHermesCommand/, 'Hermes install/status should resolve and test an existing hermes binary before installing.');
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
assert.match(hermesRoutes, /terminal-launches\/stream/, 'Hermes MCP terminal launch requests should stream to the workbench over SSE.');
assert.match(hermesRoutes, /hermesTerminalLaunchEmitter/, 'Hermes terminal launch stream should broadcast new events instead of relying on polling.');
assert.match(hermesRoutes, /router\.post\('\/gateway\/chat'/, 'Hermes should still expose a REST chat endpoint for health checks and integrations.');
assert.match(hermesRoutes, /install-status/, 'Hermes settings and terminal UI should have an install-status endpoint.');
assert.match(hermesRoutes, /router\.post\('\/install'/, 'Hermes should install through the backend API instead of terminal command paste.');
assert.match(read('scripts/smoke/hermes-api-install.mjs'), /hermes API install smoke passed/, 'Hermes API install behavior should have a focused smoke test.');
assert.match(workbench, /terminalStartupInput/, 'Hermes terminal launch prompts should be passed into the selected CLI.');
assert.match(read('src/components/shell/hooks/useShellConnection.ts'), /startupInputRef/, 'Shell connections should support one-shot startup input for Hermes-triggered CLI work.');
assert.match(read('src/components/shell/hooks/useShellTerminal.ts'), /sanitizeTerminalInputData/, 'Terminal should filter xterm color-query replies before forwarding input to provider CLIs.');
assert.match(read('src/components/shell/hooks/useShellConnection.ts'), /forceNewSessionRef\.current[\s\S]+startupInputForCommand/, 'Codex startup input should only be sent as a CLI argument for explicit fresh sessions.');
assert.match(read('src/components/shell/hooks/useShellConnection.ts'), /startupInputDelivery:\s*handlesStartupInputInCommand \? 'command' : 'terminal'/, 'Reused visible sessions should submit startup input through the backend terminal path.');
assert.match(shellTerminal, /handleTerminalPaste/, 'Terminal should support browser paste events.');
assert.match(shellTerminal, /handleCopyPasteShortcut/, 'Terminal should normalize Ctrl/Cmd copy and paste shortcuts.');
assert.match(shellTerminal, /event\.shiftKey/, 'Terminal should support Ctrl+Shift+C/V style shortcuts.');
assert.match(shellTerminal, /copyTerminalSelection/, 'Terminal should copy selected terminal text through shortcuts.');
assert.match(read('src/components/shell/view/Shell.tsx'), /sendInput\(`\$\{opt\.number\}\\r`\)/, 'CLI prompt option buttons should submit the selected option with Enter, not leave the choice typed.');
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
