#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appTypes = readFileSync('src/types/app.ts', 'utf8');
const mainContent = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');
const tabSwitcher = readFileSync('src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx', 'utf8');
const quickSettings = readFileSync('src/components/quick-settings-panel/view/QuickSettingsContent.tsx', 'utf8');

assert.ok(
  appTypes.includes("'changes'"),
  'AppTab should expose Changes as a first-class tab.',
);

assert.ok(
  /const sidePanelTabs = new Set<AppTab>\(\[[^\]]*'changes'[^\]]*\]\)/.test(mainContent),
  'Changes should use the same split/full side-panel behavior as Files, Shell, and Source Control.',
);

assert.ok(
  tabSwitcher.includes("id: 'changes'")
    && tabSwitcher.includes("labelKey: 'tabs.changes'"),
  'The main tab switcher should render a Changes pill in the top-left project nav.',
);

assert.ok(
  /renderSidePanel = \(tab: [^)]*'changes'/.test(mainContent),
  'MainContent should render Changes through the side-panel renderer.',
);

assert.ok(
  mainContent.includes("useChangedFilesMonitor(selectedProject, Boolean(selectedProject), latestMessage, changeTrackingMode)"),
  'Changed-file tracking should not depend on the Quick Settings Command Center toggle.',
);

assert.ok(
  !mainContent.includes('showChangedFilesRail'),
  'Changed files should live in the Changes side panel, not as a rail that changes chat layout.',
);

assert.ok(
  !quickSettings.includes('quickSettings.sections.changeAwareness')
    && !quickSettings.includes("onPreferenceChange('changeAwareness'"),
  'Quick Settings should not own the Changes panel toggle.',
);

console.log('changes panel layout smoke passed');
