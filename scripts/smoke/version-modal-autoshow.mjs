#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/sidebar/view/Sidebar.tsx', 'utf8');

assert.ok(
  source.includes('VERSION_RELEASE_NOTES_SEEN_KEY'),
  'Sidebar should persist the latest equal-version release notes it auto-showed.',
);
assert.ok(
  source.includes('localStorage.getItem(VERSION_RELEASE_NOTES_SEEN_KEY)'),
  'Sidebar should read the seen release-notes version from localStorage.',
);
assert.ok(
  source.includes('localStorage.setItem(VERSION_RELEASE_NOTES_SEEN_KEY, latestVersion)'),
  'Sidebar should mark equal-version release notes as seen when auto-showing them.',
);
assert.ok(
  source.includes('hasSeenCurrentReleaseNotes'),
  'Sidebar should avoid auto-showing release notes when the current version was already seen.',
);
assert.ok(
  source.includes('!hasSeenCurrentReleaseNotes'),
  'The auto-show condition should be gated by the seen-version check.',
);

console.log('version modal autoshow smoke passed');
