#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taskmasterRoutes = readFileSync('server/routes/taskmaster.js', 'utf8');
const taskService = readFileSync('server/modules/orchestration/tasks/orchestration-task.service.ts', 'utf8');
const taskTypes = readFileSync('server/modules/orchestration/tasks/orchestration-task.types.ts', 'utf8');
const telegramControl = readFileSync('server/services/telegram/control-center.js', 'utf8');
const translations = readFileSync('server/services/telegram/translations.js', 'utf8');

assert.ok(
  taskmasterRoutes.includes("router.post('/execute/:projectName/:taskId'"),
  'TaskMaster route should expose project/task execution endpoint.',
);

assert.ok(
  taskmasterRoutes.includes('orchestrationTaskService.dispatch') && taskmasterRoutes.includes('model'),
  'TaskMaster execution should dispatch through orchestration with model support.',
);

assert.ok(
  taskService.includes('projectPath?: string') || taskTypes.includes('projectPath?: string'),
  'Orchestration task dispatch should carry projectPath into A2A workspace metadata.',
);

assert.ok(
  taskService.includes('model: input.model') && taskService.includes('projectPath: input.projectPath'),
  'Task dispatch should forward selected model and project path to A2A.',
);

assert.ok(
  telegramControl.includes("'/tasks'") && telegramControl.includes("'/task'"),
  'Telegram control should register TaskMaster commands.',
);

assert.ok(
  telegramControl.includes('showTaskMasterTasks') && telegramControl.includes('runTaskMasterTask'),
  'Telegram control should list and execute TaskMaster tasks.',
);

assert.ok(
  telegramControl.includes('/api/taskmaster/execute/') && telegramControl.includes('monitorA2ATask'),
  'Telegram TaskMaster execution should call the backend and monitor the A2A task.',
);

assert.ok(
  translations.includes('control.button.tasks') && translations.includes('control.taskStarted'),
  'Telegram translations should include TaskMaster task controls.',
);

console.log('taskmaster execution telegram smoke passed');
