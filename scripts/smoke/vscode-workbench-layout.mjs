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
const issuePlan = read('docs/issues/vscode-workbench-layout.md');

const enCommon = JSON.parse(read('src/i18n/locales/en/common.json'));
const enSettings = JSON.parse(read('src/i18n/locales/en/settings.json'));
const enAuth = JSON.parse(read('src/i18n/locales/en/auth.json'));

assert(
  preferenceHook.includes('WORKBENCH_LAYOUT_STORAGE_KEY')
    && preferenceHook.includes("'classic'")
    && preferenceHook.includes("'vscode'")
    && preferenceHook.includes('pixcode:workbench-layout-change'),
  'Workbench layout preference hook should persist classic/vscode and broadcast updates.',
);

assert(
  appContent.includes('useWorkbenchLayoutPreference')
    && appContent.includes('VSCodeWorkbench')
    && appContent.includes('useVscodeWorkbench')
    && appContent.includes('!useVscodeWorkbench && !isMobile')
    && appContent.includes('<VSCodeWorkbench'),
  'AppContent should switch desktop users from the classic shell into VSCodeWorkbench.',
);

assert(
  workbench.includes('FileTree')
    && workbench.includes('CodeEditor')
    && workbench.includes('ChatInterface')
    && workbench.includes('StandaloneShell')
    && workbench.includes('GitPanel')
    && workbench.includes('role="separator"')
    && workbench.includes('aria-orientation="vertical"')
    && workbench.includes('leftPaneWidth')
    && workbench.includes('rightPaneWidth')
    && workbench.includes('ActivityButton'),
  'VSCodeWorkbench should compose existing files/editor/git/shell/chat surfaces with vertical resizers.',
);

assert(
  appearanceTab.includes('workbenchLayout')
    && appearanceTab.includes('onWorkbenchLayoutChange')
    && appearanceTab.includes('role="radio"')
    && appearanceTab.includes('appearanceSettings.workbenchLayout'),
  'Appearance settings should expose the workbench layout selector.',
);

assert(
  loginForm.includes('useWorkbenchLayoutPreference')
    && loginForm.includes('login.layout')
    && loginForm.includes('setWorkbenchLayout'),
  'Login should let users choose the workspace layout before signing in.',
);

assert(
  enCommon.vscodeWorkbench?.title
    && enCommon.vscodeWorkbench?.activity?.explorer
    && enCommon.vscodeWorkbench?.panels?.cli,
  'English common locale should include VSCode workbench copy.',
);

assert(
  enSettings.appearanceSettings?.workbenchLayout?.title
    && enSettings.appearanceSettings?.workbenchLayout?.options?.vscode?.label,
  'English settings locale should include workbench layout settings copy.',
);

assert(
  enAuth.login?.layout?.title
    && enAuth.login?.layout?.options?.vscode,
  'English auth locale should include login layout selector copy.',
);

assert(
  issuePlan.includes('Issue 1')
    && issuePlan.includes('Issue 2')
    && issuePlan.includes('Issue 3')
    && issuePlan.includes('Issue 4')
    && issuePlan.includes('Issue 5')
    && issuePlan.includes('Status: Completed'),
  'Local issue plan should track the sliced work and completion notes while GitHub is unavailable.',
);

console.log('vscode workbench layout smoke passed');
