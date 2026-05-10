#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const changedFilesUtil = readFileSync('src/utils/changedFiles.ts', 'utf8');
const changedFilesHook = readFileSync('src/hooks/useChangedFilesMonitor.ts', 'utf8');
const mainContent = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');
const rail = readFileSync('src/components/main-content/view/subcomponents/ChangedFilesActivityRail.tsx', 'utf8');

assert.ok(
  changedFilesUtil.includes('extractChangedFilesFromMessage'),
  'Changed-files utilities should extract Write/Edit/ApplyPatch tool events from realtime agent messages.',
);

assert.ok(
  changedFilesUtil.includes('toolName') && changedFilesUtil.includes('toolInput'),
  'Realtime extraction should understand normalized toolName/toolInput messages.',
);

assert.ok(
  changedFilesUtil.includes('diffInfo') && changedFilesUtil.includes('old_string') && changedFilesUtil.includes('new_string'),
  'Realtime agent writes should preserve diff payloads so the editor can highlight the changed content.',
);

assert.ok(
  changedFilesHook.includes('latestMessage') && changedFilesHook.includes('extractChangedFilesFromMessage'),
  'Changed-files monitor should ingest the latest realtime agent message in addition to polling git/filesystem status.',
);

assert.ok(
  changedFilesHook.includes('mergeChangedFiles'),
  'Changed-files monitor should merge direct agent writes with polled git/filesystem changes instead of replacing them.',
);

assert.ok(
  mainContent.includes('useChangedFilesMonitor(selectedProject, changeAwareness, latestMessage)'),
  'MainContent should pass latestMessage into the changed-files monitor.',
);

assert.ok(
  mainContent.includes('handleChangedFileOpen') && mainContent.includes('handleFileOpen(file.path, file.diffInfo'),
  'Clicking a changed file should open the editor with diff context, not only focus the Files panel.',
);

assert.ok(
  rail.includes('onOpenFile: (file: ChangedFileEntry) => void') && rail.includes('onClick={() => onOpenFile(file)}'),
  'ChangedFilesActivityRail should pass the full changed-file entry, including diffInfo, to the open handler.',
);

console.log('command center agent writes smoke passed');
