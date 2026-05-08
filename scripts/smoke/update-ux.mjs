#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const checks = [
  {
    name: 'update frequency defaults to 30 minutes',
    file: 'src/utils/updateCheckPreferences.ts',
    test: (source) => (
      source.includes("export type UpdateCheckFrequency = 'off' | '30m' |")
      && source.includes("{ value: '30m'")
      && /DEFAULT_UPDATE_CHECK_PREFERENCES[\s\S]*frequency:\s*'30m'/.test(source)
    ),
  },
  {
    name: 'sidebar opens the version modal when an update is detected',
    file: 'src/components/sidebar/view/Sidebar.tsx',
    test: (source) => (
      source.includes('PIXCODE_UPDATE_AVAILABLE_EVENT')
      && source.includes('setShowVersionModal(true)')
      && source.includes('updateAvailable')
    ),
  },
  {
    name: 'version modal supports release-notes-only opens',
    file: 'src/components/version-upgrade/view/VersionUpgradeModal.tsx',
    test: (source) => (
      source.includes('isUpdateAvailable')
      && source.includes('versionUpdate.releaseNotesTitle')
      && source.includes('showUpdateActions')
    ),
  },
  {
    name: 'desktop splash makes startup update work visible',
    file: 'desktop/electron/main.cjs',
    test: (source) => (
      source.includes('Checking for updates before launch')
      && source.includes('Applying Pixcode update')
    ),
  },
];

const failures = [];

for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  if (!check.test(source)) failures.push(check.name);
}

if (failures.length > 0) {
  console.error(`Update UX smoke failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('update UX smoke passed');
