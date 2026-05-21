import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const workbench = read('src/components/vscode-workbench/view/VSCodeWorkbench.tsx');
const projectType = read('src/types/app.ts');
const projectsServer = read('server/projects.js');
const mainState = read('src/components/main-content/view/subcomponents/MainContentStateView.tsx');
const chatInterface = read('src/components/chat/view/ChatInterface.tsx');
const chatComposer = read('src/components/chat/view/subcomponents/ChatComposer.tsx');
const workerSlots = read('src/components/chat/view/subcomponents/WorkerSlotsControl.tsx');
const wizard = read('src/components/project-creation-wizard/ProjectCreationWizard.tsx');
const sidebar = read('src/components/sidebar/view/Sidebar.tsx');
const shellTerminal = read('src/components/shell/hooks/useShellTerminal.ts');
const gitPanel = read('src/components/git-panel/view/GitPanel.tsx');
const gitPanelHeader = read('src/components/git-panel/view/GitPanelHeader.tsx');
const gitViewTabs = read('src/components/git-panel/view/GitViewTabs.tsx');

assert.match(
  workbench,
  /function WorkbenchMenuBar/,
  'VS Code workbench should render a top menu bar.',
);

for (const item of ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help']) {
  assert.match(workbench, new RegExp(`label: '${item}'`), `Workbench menu should include ${item}.`);
}

assert.match(
  workbench,
  /type:\s*'existing'/,
  'File > Open Project should dispatch the existing-folder project wizard flow.',
);

assert.match(
  workbench,
  /type:\s*'new'/,
  'File > Clone From GitHub should dispatch the GitHub clone project wizard flow.',
);

assert.match(
  workbench,
  /function WorkbenchProjectsPanel/,
  'Projects activity should use a dedicated project-directory panel.',
);

assert.match(
  workbench,
  /function WorkbenchProjectLanding/,
  'Workbench center should show a project landing page instead of a blank editor when no project is selected.',
);

for (const token of [
  'vscodeWorkbench.welcome.openProject',
  'vscodeWorkbench.welcome.cloneProject',
  'vscodeWorkbench.welcome.startHermes',
  'DarkModeToggle',
  'welcomeActionCards',
  'welcomeAppearancePanel',
]) {
  assert.match(workbench, new RegExp(token.replaceAll('.', '\\.')), `Workbench welcome should include ${token}.`);
}

const welcomeSource = workbench.slice(
  workbench.indexOf('function WorkbenchProjectLanding'),
  workbench.indexOf('const cliProviders'),
);

assert.doesNotMatch(
  welcomeSource,
  /lg:grid-cols-\[minmax\(0,1fr\)_18rem\]/,
  'Workbench welcome should not reserve a right column that squeezes the three start actions.',
);

assert.match(
  welcomeSource,
  /welcomeAppearancePanel[\s\S]*?recentProjects/,
  'Appearance controls should sit below the three primary welcome actions and above recent projects.',
);

assert.match(
  welcomeSource,
  /gridTemplateColumns:\s*'repeat\(auto-fit, minmax\(min\(100%, 13rem\), 1fr\)\)'/,
  'Workbench welcome action cards should auto-wrap responsively instead of staying cramped.',
);

assert.match(
  workbench,
  /function WorkbenchCliPanel/,
  'Right workbench pane should use a terminal-only CLI panel.',
);

assert.match(
  workbench,
  /function WorkbenchWorkspaceTabs/,
  'Workbench should render Chrome-style workspace tabs directly under the menu bar.',
);

assert.doesNotMatch(
  workbench,
  /\.\.\.currentTabs\.filter\(\(tab\) => tab\.id !== tabId\)/,
  'Selecting an existing workspace tab must preserve tab order instead of moving it to the end.',
);

assert.match(
  workbench,
  /function WorkspaceTabContextMenu/,
  'Workspace tabs should expose their actions through a right-click context menu.',
);

assert.match(
  workbench,
  /onContextMenu=\{\(event\) => openWorkspaceContextMenu\(event, tab\)\}/,
  'Workspace tab actions should open from right-click on the tab.',
);

const workspaceTabsSource = workbench.slice(
  workbench.indexOf('function WorkbenchWorkspaceTabs'),
  workbench.indexOf('function EditorTabContextMenu'),
);

assert.doesNotMatch(
  workspaceTabsSource,
  /MoreHorizontal/,
  'Workspace tabs should not render a three-dot action button.',
);

for (const token of ['closeOtherWorkspaces', 'closeAllWorkspaces']) {
  assert.match(workbench, new RegExp(token), `Workspace tab context menu should support ${token}.`);
}

assert.match(
  workspaceTabsSource,
  /items-center justify-center/,
  'Workspace add button should center its plus icon instead of rendering an off-center bare icon.',
);

assert.match(
  workspaceTabsSource,
  /workspaceTabStripRef/,
  'Workspace tabs should use a scrollable strip like editor tabs.',
);

assert.match(
  workspaceTabsSource,
  /scrollWorkspaceTabs/,
  'Workspace tabs should expose left/right scroll controls when the tab row overflows.',
);

assert.match(
  workspaceTabsSource,
  /border-r border-border/,
  'Workspace add button should read as part of the tab strip instead of a floating bare button.',
);

assert.match(
  workspaceTabsSource,
  /onToggleCliPanel/,
  'Workspace tab bar should expose a right-panel toggle at the end of the strip.',
);

assert.match(
  workbench,
  /WORKBENCH_WORKSPACE_TABS_STORAGE_KEY/,
  'Workspace tabs should persist names, stars, and open tabs across reloads.',
);

assert.doesNotMatch(
  workbench,
  /workspaceSlots/,
  'Workspace controls should no longer occupy space inside the Explorer panel.',
);

assert.match(
  workbench,
  /editorTabStripRef/,
  'Editor tabs should have a scrollable strip instead of shrinking every tab.',
);

assert.match(
  workbench,
  /WORKBENCH_EDITOR_STATE_STORAGE_KEY/,
  'Editor tabs should keep separate persisted state for each workspace.',
);

assert.doesNotMatch(
  workbench,
  /useEffect\(\(\) => \{\s*setOpenEditorTabs\(\[\]\);\s*setActiveEditorPath\(null\);\s*setSplitEditorFile\(null\);[\s\S]*?\}, \[selectedProject\?\.name\]\);/,
  'Editor tabs should not be wiped by the selected-project change effect.',
);

assert.match(
  workbench,
  /handleEditorTabContextMenu/,
  'Editor tabs should expose a right-click context menu.',
);

for (const token of ['closeAllTabs', 'copyPath', 'splitRight', 'splitMoveRight']) {
  assert.match(workbench, new RegExp(token), `Editor tab context menu should support ${token}.`);
}

assert.match(
  workbench,
  /SessionProviderLogo/,
  'CLI provider picker should keep provider icons visible.',
);

assert.match(
  workbench,
  /useProviderAuthStatus/,
  'CLI provider picker should show install/update status without opening Settings.',
);

assert.match(
  workbench,
  /autoConnect=\{canAutoConnect\}/,
  'Right CLI terminal should auto-connect when the selected provider can run.',
);

assert.match(
  workbench,
  /setIsTerminalOpen\(true\)/,
  'Right CLI panel should switch from picker mode into a full-height terminal after Start.',
);

assert.match(
  workbench,
  /onClose=\{closeTerminal\}/,
  'Right CLI terminal close button should return to the picker through the persisted close flow.',
);

assert.match(
  workbench,
  /function WorkbenchSessionHistory/,
  'CLI history should be integrated as a polished project-scoped panel.',
);

assert.match(
  workbench,
  /terminalSession/,
  'Right CLI panel should track whether the terminal is running a new session or a selected history session.',
);

assert.match(
  workbench,
  /WORKBENCH_CLI_STATE_STORAGE_KEY/,
  'Right CLI panel should persist per-project terminal state when switching workspaces.',
);

assert.match(
  workbench,
  /openNewCliSessionPicker/,
  'Right CLI panel toolbar plus should stop the current terminal view and return to CLI selection.',
);

assert.match(
  workbench,
  /terminateCurrentCliSession\(selectedProvider\)/,
  'Right CLI panel toolbar plus should explicitly terminate the current provider PTY before showing the picker.',
);

assert.match(
  workbench,
  /forceNewSession=\{terminalLaunch\.forceNewSession\}/,
  'Right CLI panel should mark explicitly started new sessions so the backend does not reconnect the old PTY.',
);

assert.match(
  workbench,
  /function WorkbenchCliPanelToolbar/,
  'Right CLI terminal should keep compact History and New Session actions visible while the terminal is open.',
);

assert.match(
  workbench,
  /function WorkbenchBottomTerminal/,
  'Terminal activity should open a VS Code-style bottom terminal instead of the provider CLI picker.',
);

for (const token of ['BOTTOM_TERMINAL_MIN_HEIGHT', 'isBottomTerminalMinimized', 'shrinkCliPanel', 'expandCliPanel']) {
  assert.match(workbench, new RegExp(token), `Workbench should include ${token}.`);
}

assert.match(
  workbench,
  /isPlainShell/,
  'Workbench bottom terminal should run a plain shell in the selected project directory.',
);

assert.doesNotMatch(
  workbench,
  /HERMES_AGENT_START_COMMAND/,
  'Hermes Agent should not launch through the bottom terminal with a server-side command sentinel.',
);

assert.doesNotMatch(
  workbench,
  /HermesApiChatPanel/,
  'Hermes Agent should use the real PTY terminal UI instead of the removed REST chat panel.',
);

assert.match(
  workbench,
  /HERMES_DEFAULT_COMMAND = 'hermes --yolo'/,
  'Hermes Agent should launch the Hermes CLI directly in bypass mode.',
);

assert.doesNotMatch(
  workbench,
  /Project-scoped agent terminal\. Installs Hermes when missing/,
  'Right CLI picker should not show the old Hermes install card.',
);

assert.match(
  workbench,
  /onNewSession=\{openNewCliSessionPicker\}/,
  'Right CLI terminal toolbar should wire the plus button to the new-session picker flow.',
);

assert.doesNotMatch(
  workbench,
  /return <Sidebar \{\.\.\.sidebarProps\} isMobile=\{false\} \/>/,
  'Projects activity should not render the chat-history sidebar.',
);

assert.match(
  workbench,
  /formatProjectPath/,
  'Projects panel should render a shortened path instead of dumping the full directory.',
);

assert.match(
  workbench,
  /formatFileCount/,
  'Projects panel should show file counts.',
);

assert.match(
  workbench,
  /Work in this folder/,
  'Project cards should make the folder binding explicit.',
);

assert.match(projectType, /fileCount\?: number/, 'Project type should expose optional fileCount metadata.');
assert.match(projectsServer, /async function countProjectFiles/, 'Backend should count project files for the workbench project list.');

assert.match(
  mainState,
  /repeat\(auto-fit,\s*minmax\(min\(100%,\s*11rem\),\s*1fr\)\)/,
  'Start workspace cards should auto-fit instead of forcing cramped fixed columns.',
);

assert.doesNotMatch(
  workbench,
  /<main className="min-w-\[360px\]/,
  'Workbench center panel should be allowed to shrink with narrow three-pane layouts.',
);

assert.doesNotMatch(workbench, /<ChatInterface/, 'Workbench should not embed the chat composer in the right CLI pane.');

assert.match(
  workbench,
  /activeTab === 'chat' && activityPanel === 'projects'/,
  'Projects activity should stay selected while the center chat tab is active.',
);

assert.match(
  workbench,
  /setActivityPanel\('explorer'\)/,
  'Selecting a project from Projects should switch the left pane back to Explorer.',
);

assert.match(
  workbench,
  /<GitPanel selectedProject=\{selectedProject\} isMobile=\{false\} compact onFileOpen=\{handleFileOpen\}/,
  'Source Control should render in compact icon-first mode inside the VS Code workbench side panel.',
);

assert.match(gitPanel, /compact = false/, 'GitPanel should accept a compact prop.');
assert.match(gitPanelHeader, /compact/, 'GitPanelHeader should receive compact mode for narrow panes.');
assert.match(gitViewTabs, /compact/, 'GitViewTabs should render compact icon-only tabs.');

assert.doesNotMatch(
  shellTerminal,
  /new WebglAddon\(\)/,
  'Shell terminal should avoid the WebGL renderer that can leave stale glyph trails with OpenCode output.',
);

assert.match(chatInterface, /compactComposer\?: boolean/, 'ChatInterface should expose compactComposer for narrow workbench panes.');
assert.match(chatComposer, /compact\?: boolean/, 'ChatComposer should expose a compact prop.');
assert.match(chatComposer, /flex-wrap/, 'ChatComposer footer should wrap controls in narrow panes.');
assert.match(workerSlots, /panelClassName\?: string/, 'WorkerSlotsControl should allow a compact panel width override.');
assert.match(chatComposer, /panelClassName=\{compact/, 'Compact composer should constrain the worker-slot panel.');

assert.match(
  wizard,
  /initialWorkspaceType\?: WorkspaceType/,
  'Project wizard should accept an initial workspace type from the workbench File menu.',
);

assert.match(
  sidebar,
  /event as CustomEvent<\{ workspaceType\?: WorkspaceType \}>/,
  'Sidebar create-project event should forward the requested workspace type into the wizard.',
);

console.log('vscode workbench polish smoke passed');
