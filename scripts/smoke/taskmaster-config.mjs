#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taskmasterRoutes = readFileSync('server/routes/taskmaster.js', 'utf8');
const taskmasterConfig = readFileSync('server/services/taskmaster-config.js', 'utf8');
const tasksSettingsContext = readFileSync('src/contexts/TasksSettingsContext.jsx', 'utf8');
const tasksSettingsTab = readFileSync('src/components/settings/view/tabs/tasks-settings/TasksSettingsTab.tsx', 'utf8');
const mainContentState = readFileSync('src/components/main-content/view/subcomponents/MainContentStateView.tsx', 'utf8');

assert.ok(
  taskmasterConfig.includes('TASKMASTER_CONFIG_FIELDS') && taskmasterConfig.includes('ANTHROPIC_API_KEY'),
  'TaskMaster should have a dedicated config store for provider environment variables.',
);

assert.ok(
  taskmasterConfig.includes('OPENAI_BASE_URL') && taskmasterConfig.includes('AZURE_OPENAI_ENDPOINT'),
  'TaskMaster config should support API URL / endpoint fields, not only keys.',
);

assert.ok(
  taskmasterConfig.includes('openaiCompatibleApiKey')
    && taskmasterConfig.includes('OPENAI_COMPATIBLE_BASE_URL')
    && taskmasterConfig.includes('CUSTOM_OPENAI_API_KEY')
    && taskmasterConfig.includes('buildTaskMasterConfigEnvValues'),
  'TaskMaster config should support custom OpenAI-compatible API keys, API URLs, model values, and shared env resolution.',
);

assert.ok(
  taskmasterRoutes.includes("router.get('/config'") && taskmasterRoutes.includes("router.put('/config'"),
  'TaskMaster routes should expose authenticated config read/write endpoints.',
);

assert.ok(
  taskmasterRoutes.includes('buildTaskMasterCliEnv') && taskmasterRoutes.includes('task-master-ai'),
  'TaskMaster CLI execution should receive saved env config and detect both task-master and task-master-ai binaries.',
);

assert.ok(
  tasksSettingsContext.includes('refreshTaskMasterInstallation'),
  'Task settings context should expose a manual TaskMaster installation refresh action.',
);

assert.ok(
  tasksSettingsTab.includes('/api/taskmaster/config')
    && tasksSettingsTab.includes('ANTHROPIC_API_KEY')
    && tasksSettingsTab.includes('OPENAI_BASE_URL')
    && tasksSettingsTab.includes('Custom OpenAI-compatible')
    && tasksSettingsTab.includes('OPENAI_COMPATIBLE_MODEL'),
  'Task settings tab should let users save TaskMaster API keys, API URLs, and custom OpenAI-compatible provider settings.',
);

assert.ok(
  mainContentState.includes('pixcode:create-project') && mainContentState.includes('mainContent.landing.taskSystem'),
  'Landing Task system card should be actionable instead of a static locked-looking panel.',
);

console.log('taskmaster config smoke passed');
