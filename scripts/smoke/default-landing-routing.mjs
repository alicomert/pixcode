#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const projectsState = read('src/hooks/useProjectsState.ts');
assert.match(projectsState, /NON_RESTORABLE_TABS/, 'Non-default utility tabs should be excluded from startup restore.');
assert.match(projectsState, /controlRoom/, 'Control Room should be treated as a non-restorable startup tab.');
assert.match(projectsState, /getPersistableTab/, 'Active tab persistence should normalize non-restorable tabs.');
assert.doesNotMatch(projectsState, /handleQuickStartTasks|quickStartIntoTab\('tasks'\)|setTasksEnabled/, 'Task quick-start routing should be removed.');

const appContent = read('src/components/app/AppContent.tsx');
assert.doesNotMatch(appContent, /handleQuickStartTasks|onQuickStartTasks/, 'App content should not pass Task quick-start callbacks.');
assert.match(appContent, /<VSCodeWorkbench/, 'App content should use VS Code workbench as the desktop default.');

const mainContentTypes = read('src/components/main-content/types/types.ts');
assert.doesNotMatch(mainContentTypes, /onQuickStartTasks/, 'Main content props should not include Task quick-start support.');

const mainContent = read('src/components/main-content/view/MainContent.tsx');
assert.doesNotMatch(mainContent, /shouldShowTasksTab|TaskMasterPanel|tasksEnabled/, 'Main content should not render the TaskMaster surface.');

const emptyState = read('src/components/main-content/view/subcomponents/MainContentStateView.tsx');
assert.doesNotMatch(emptyState, /onQuickStartTasks|ClipboardCheck|taskSystem/, 'Empty state should not expose TaskMaster landing cards.');
assert.match(emptyState, /pixcode:create-project/, 'Empty state should keep the generic create-project flow.');

console.log('default landing routing smoke passed');
