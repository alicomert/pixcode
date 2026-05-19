#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const serverIndex = read('server/index.js');
const api = read('src/utils/api.js');
const app = read('src/App.tsx');
const settings = read('src/components/settings/view/Settings.tsx');
const settingsSidebar = read('src/components/settings/view/SettingsSidebar.tsx');

assert.doesNotMatch(serverIndex, /taskmasterRoutes|\/api\/taskmaster/, 'TaskMaster API route should not be mounted.');
assert.doesNotMatch(api, /taskmaster:\s*\{|\/api\/taskmaster/, 'Frontend API client should not expose TaskMaster endpoints.');
assert.doesNotMatch(app, /TaskMasterProvider/, 'App should not mount TaskMasterProvider.');
assert.doesNotMatch(settings, /TasksSettingsTab|activeTab === 'tasks'/, 'Settings should not render the TaskMaster settings tab.');
assert.doesNotMatch(settingsSidebar, /mainTabs\.tasks|id: 'tasks'/, 'Settings navigation should not include Tasks.');
assert.ok(!existsSync('src/components/onboarding/view/subcomponents/TaskSystemStep.tsx'), 'TaskMaster onboarding step should be removed.');
assert.ok(!existsSync('src/components/task-master'), 'TaskMaster component directory should be removed.');
assert.ok(!existsSync('src/components/prd-editor'), 'TaskMaster PRD editor should be removed.');
assert.ok(!existsSync('server/routes/taskmaster.js'), 'TaskMaster backend route file should be removed.');

console.log('taskmaster removal smoke passed');
