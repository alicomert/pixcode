#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/components/main-content/view/subcomponents/MainContentHeader.tsx',
    assert: (source) => source.includes('window.toggleQuickSettings?.()') && source.includes('sm:flex-row'),
    message: 'Mobile main header must expose quick settings in the header and split title/tabs responsively.',
  },
  {
    path: 'src/components/main-content/view/MainContent.tsx',
    assert: (source) =>
      source.includes('mobileShellTabId') &&
      source.includes('immersive={isMobile}') &&
      !source.includes('OrchestrationPage') &&
      !source.includes('LiveViewPanel'),
    message: 'Main content must keep mobile shell continuity and must not expose orchestration/live view tabs.',
  },
  {
    path: 'src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx',
    assert: (source) =>
      source.includes('<select') &&
      !source.includes("id: 'orchestration'") &&
      !source.includes("id: 'liveView'") &&
      !source.includes('w-max min-w-full justify-start overflow-x-visible') &&
      !source.includes("'w-9 px-0 py-1.5'"),
    message: 'Mobile tab switcher must use a compact select and exclude orchestration/live view.',
  },
  {
    path: 'src/components/shell/view/Shell.tsx',
    assert: (source) =>
      source.includes('pixcode-shell-terminal') &&
      source.includes("pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0") &&
      source.includes("'p-0 pb-16 md:pb-0'"),
    message: 'Shell terminal must reserve the mobile shortcut bar while filling desktop surfaces.',
  },
  {
    path: 'src/components/shell/utils/terminalStyles.ts',
    assert: (source) => source.includes('.pixcode-shell-terminal .xterm') && source.includes('height: 100%'),
    message: 'Shell terminal styles must keep xterm height aligned with its container.',
  },
  {
    path: 'src/components/shell/view/subcomponents/ShellMinimalView.tsx',
    assert: (source) => source.includes('pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0'),
    message: 'Minimal terminal mode must reserve the mobile shortcut bar and safe-area inset.',
  },
  {
    path: 'src/components/quick-settings-panel/view/QuickSettingsPanelView.tsx',
    assert: (source) => !source.includes('QuickSettingsHandle') && source.includes('translate-y-[calc(100%+1rem)]'),
    message: 'Quick settings must stay off the mobile right edge handle and open as a bottom sheet.',
  },
  {
    path: 'src/components/sidebar/view/subcomponents/SidebarHeader.tsx',
    assert: (source) => !source.includes("searchMode === 'projects' && (\n              <HistoryViewToggle"),
    message: 'Mobile Recent / By project toggle must not be hidden in conversations mode.',
  },
  {
    path: 'src/components/settings/view/SettingsSidebar.tsx',
    assert: (source) => !source.includes('PillBar') && source.includes('Mobile section switcher'),
    message: 'Mobile settings navigation must use the compact section switcher instead of a long pill bar.',
  },
  {
    path: 'AGENTS.md',
    assert: (source) => source.includes('Mobile parity requirement') && source.includes('npm run smoke:mobile-ux'),
    message: 'AGENTS.md must keep the mobile parity requirement visible to future agents.',
  },
];

const failures = checks.flatMap(({ path, assert, message }) => {
  const source = read(path);
  return assert(source) ? [] : [`${path}: ${message}`];
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('mobile UX static checks passed');
