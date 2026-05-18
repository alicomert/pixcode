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

assert.match(
  workbench,
  /compactComposer/,
  'Workbench should request compact composer behavior in the right CLI pane.',
);

assert.match(
  workbench,
  /activeTab === 'chat' && activityPanel === 'projects'/,
  'Projects activity should stay selected while the center chat tab is active.',
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
