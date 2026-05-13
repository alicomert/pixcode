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
assert.match(projectsState, /handleQuickStartTasks/, 'Project state should expose a Task quick-start flow.');
assert.match(projectsState, /quickStartIntoTab\('tasks'\)/, 'Task quick-start should land on the tasks tab.');
assert.match(projectsState, /setTasksEnabled\?\.?\(true\)|setTasksEnabled\(true\)/, 'Task quick-start should enable the Tasks surface before opening it.');

const appContent = read('src/components/app/AppContent.tsx');
assert.match(appContent, /handleQuickStartTasks/, 'App content should pass the Task quick-start flow into MainContent.');
assert.match(appContent, /onQuickStartTasks=\{handleQuickStartTasks\}/, 'MainContent should receive a Task quick-start callback.');

const mainContentTypes = read('src/components/main-content/types/types.ts');
assert.match(mainContentTypes, /onQuickStartTasks/, 'Main content props should include Task quick-start support.');

const mainContent = read('src/components/main-content/view/MainContent.tsx');
assert.match(mainContent, /const shouldShowTasksTab = Boolean\(tasksEnabled\)/, 'Tasks tab visibility should be controlled by the user-facing tasks setting, not CLI install state.');
assert.doesNotMatch(mainContent, /!shouldShowTasksTab && activeTab === 'tasks'/, 'Selecting Tasks should not immediately redirect back to chat because installation is still being checked.');
assert.match(mainContent, /onQuickStartTasks=\{onQuickStartTasks\}/, 'Empty landing state should receive the Task quick-start callback.');

const emptyState = read('src/components/main-content/view/subcomponents/MainContentStateView.tsx');
assert.match(emptyState, /onQuickStartTasks/, 'Empty state should expose a Task quick-start callback.');
assert.match(emptyState, /void onQuickStartTasks\?\.\(\)/, 'Task landing card should call the Task quick-start callback.');
assert.doesNotMatch(
  emptyState,
  /ClipboardCheck[\s\S]{0,900}pixcode:create-project/,
  'Task landing card should not reuse the generic create-project flow that drops users into chat.',
);

console.log('default landing routing smoke passed');
