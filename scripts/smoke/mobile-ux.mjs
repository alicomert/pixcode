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
    assert: (source) => source.includes('mobileShellTabId') && source.includes('immersive={isMobile}'),
    message: 'Mobile shell must keep a stable tab id and use immersive terminal mode.',
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
