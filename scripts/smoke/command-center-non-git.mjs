#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gitRoute = readFileSync('server/routes/git.js', 'utf8');
const changedFilesHook = readFileSync('src/hooks/useChangedFilesMonitor.ts', 'utf8');
const mainContent = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');

assert.ok(
  gitRoute.includes('isGitRepository: false'),
  'Git status route should return a structured non-git status instead of a Git operation failed error.',
);

assert.ok(
  gitRoute.includes('filesystemChangeSnapshots'),
  'Git status route should maintain filesystem snapshots for local-only projects.',
);

assert.ok(
  changedFilesHook.includes('isGitRepository?: boolean'),
  'Changed-files monitor should understand git-backed and filesystem-backed status payloads.',
);

assert.ok(
  !changedFilesHook.includes('setError(data.details || data.error'),
  'Changed-files monitor should not surface the non-git fallback as a blocking error.',
);

assert.ok(
  mainContent.includes('ChangedFilesActivityRail'),
  'Main content should render changed-file activity beside chat/orchestration, not only in Quick Settings.',
);

assert.ok(
  mainContent.includes('setFocusedChangedFilePath(latestDetectedFile.path)'),
  'New changes should highlight the activity rail without automatically stealing the user into the Files panel.',
);

// The current Quick Settings surface intentionally omits change tracking; the
// dedicated Changes panel is the single source of truth. Older builds exposed
// a compact summary here, so no Quick Settings assertion is needed.

console.log('command center non-git smoke passed');
