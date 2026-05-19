import { existsSync, readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  assert(existsSync(path), `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const preferenceHook = read('src/hooks/useWorkbenchLayoutPreference.ts');
const appContent = read('src/components/app/AppContent.tsx');
const workbench = read('src/components/vscode-workbench/view/VSCodeWorkbench.tsx');
const appearanceTab = read('src/components/settings/view/tabs/AppearanceSettingsTab.tsx');
const loginForm = read('src/components/auth/view/LoginForm.tsx');

const enCommon = JSON.parse(read('src/i18n/locales/en/common.json'));

assert(
  preferenceHook.includes("export type WorkbenchLayoutPreference = 'vscode';")
    && preferenceHook.includes('WORKBENCH_LAYOUT_CHANGE_EVENT')
    && !preferenceHook.includes("'classic'"),
  'Workbench layout preference should be VS Code-only and should not preserve Classic fallback.',
);

assert(
  appContent.includes('VSCodeWorkbench')
    && appContent.includes('<VSCodeWorkbench')
    && !appContent.includes('!useVscodeWorkbench'),
  'AppContent should render the VS Code workbench as the desktop shell.',
);

assert(
  workbench.includes('WorkbenchProjectLanding')
    && workbench.includes("useState<ActivityPanel>('projects')")
    && workbench.includes('WorkbenchWorkspacePanel')
    && workbench.includes('WorkbenchWorkspaceTabs')
    && workbench.includes('openEditorTabs')
    && workbench.includes('activeEditorPath')
    && workbench.includes('WorkbenchCliPanel')
    && !workbench.includes('<ChatInterface')
    && !workbench.includes('TaskMasterPanel'),
  'VSCodeWorkbench should open on Projects, expose top workspace tabs, tab files, and use terminal-only CLI panel.',
);

assert(
  !appearanceTab.includes('workbenchLayout')
    && !appearanceTab.includes('onWorkbenchLayoutChange')
    && !loginForm.includes('login.layout')
    && !loginForm.includes('setWorkbenchLayout'),
  'Login and Appearance settings should not expose layout switching.',
);

assert(
  enCommon.vscodeWorkbench?.activity?.explorer
    && enCommon.vscodeWorkbench?.panels?.cli,
  'English common locale should include VS Code workbench copy.',
);

console.log('vscode workbench layout smoke passed');
