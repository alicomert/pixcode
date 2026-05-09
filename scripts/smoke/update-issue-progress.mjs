#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const parserPath = 'src/components/version-upgrade/utils/releaseIssueProgress.ts';
const componentPath = 'src/components/version-upgrade/view/ReleaseIssueProgress.tsx';
const modalPath = 'src/components/version-upgrade/view/VersionUpgradeModal.tsx';
const trackingPath = 'RELEASE_TRACKING_v1.37.md';

assert.ok(existsSync(parserPath), 'Release issue progress parser should exist.');
assert.ok(existsSync(componentPath), 'Release issue progress component should exist.');
assert.ok(existsSync(trackingPath), 'v1.37 release tracking document should exist.');

const parserSource = readFileSync(parserPath, 'utf8');
assert.ok(
  parserSource.includes('RELEASE_ISSUE_PROGRESS_MARKER'),
  'Parser should expose a stable release-note marker for issue progress blocks.',
);
assert.ok(
  parserSource.includes('extractIssueProgress'),
  'Parser should export extractIssueProgress for release body parsing.',
);
assert.ok(
  parserSource.includes('DEFAULT_V137_ISSUE_PROGRESS'),
  'Parser should provide a v1.37 fallback issue map until the release body is published.',
);
assert.ok(
  parserSource.includes('\\[([xX ~-])\\]') || parserSource.includes('[x]'),
  'Parser should understand checked issue/task rows.',
);

const componentSource = readFileSync(componentPath, 'utf8');
assert.ok(
  componentSource.includes('extractIssueProgress'),
  'Component should render parsed issue progress from release notes.',
);
assert.ok(
  componentSource.includes('completedCount'),
  'Component should summarize completed issue progress.',
);
assert.ok(
  componentSource.includes("version?.startsWith('1.37')") || componentSource.includes('version.startsWith'),
  'Component should only use the v1.37 fallback for v1.37 release notes.',
);

const modalSource = readFileSync(modalPath, 'utf8');
assert.ok(
  modalSource.includes('ReleaseIssueProgress'),
  'Version modal should include release issue progress.',
);
assert.ok(
  modalSource.includes('releaseInfo.body'),
  'Version modal should pass release body text to the issue progress view.',
);

const trackingSource = readFileSync(trackingPath, 'utf8');
for (const issueNumber of [6, 7, 8, 9, 10, 11, 12, 13, 14]) {
  assert.ok(
    trackingSource.includes(`#${issueNumber}`),
    `Release tracking should mention issue #${issueNumber}.`,
  );
}
assert.ok(
  trackingSource.includes('<!-- pixcode:issue-progress -->'),
  'Release tracking should include the issue-progress marker block used in release notes.',
);

console.log('update issue progress smoke passed');
