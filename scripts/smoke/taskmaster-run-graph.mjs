#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const graph = read('server/modules/orchestration/tasks/task-run-graph.ts');
assert.match(graph, /PIXCODE_TASK_RUN_GRAPH_PROTOCOL/, 'Task/run graph should declare a stable protocol id.');
assert.match(graph, /pixcode\.task-run-graph\.v1/, 'Task/run graph should use the v1 protocol id.');
assert.match(graph, /buildTaskRunGraph/, 'Task/run graph builder is missing.');
assert.match(graph, /acceptanceCriteria/, 'Task/run graph should expose acceptance criteria.');
assert.match(graph, /changedFiles/, 'Task/run graph should expose changed files.');
assert.match(graph, /workflowRuns/, 'Task/run graph should expose workflow runs.');
assert.match(graph, /taskmasterId/, 'Task/run graph should link TaskMaster ids.');

const taskTypes = read('server/modules/orchestration/tasks/orchestration-task.types.ts');
assert.match(taskTypes, /workflowRunIds\?: string\[\]/, 'Orchestration tasks should persist workflow run ids.');
assert.match(taskTypes, /acceptanceCriteria/, 'Orchestration tasks should persist acceptance criteria snapshots.');
assert.match(taskTypes, /changedFiles\?: string\[\]/, 'Orchestration tasks should persist changed file snapshots.');

const taskService = read('server/modules/orchestration/tasks/orchestration-task.service.ts');
assert.match(taskService, /linkWorkflowRun/, 'Orchestration task service should link workflow runs to tasks.');
assert.match(taskService, /updateFromWorkflowRun/, 'Orchestration task service should write workflow results back to tasks.');

const workflowRunner = read('server/modules/orchestration/workflows/workflow-runner.ts');
assert.match(workflowRunner, /linkWorkflowRun/, 'Workflow runner should link runs to orchestration tasks.');
assert.match(workflowRunner, /updateFromWorkflowRun/, 'Workflow runner should write terminal run results to the task graph.');

const taskmasterRoute = read('server/routes/taskmaster.js');
assert.match(taskmasterRoute, /buildTaskRunGraph/, 'TaskMaster routes should attach task graph data.');
assert.match(taskmasterRoute, /taskGraph/, 'TaskMaster task responses should include taskGraph.');
assert.match(taskmasterRoute, /workflowRunner\.start/, 'TaskMaster execute route should support starting workflow runs.');

const workflowPanel = read('src/components/orchestration/workflows/WorkflowRunPanel.tsx');
assert.match(workflowPanel, /linkedTask/, 'Workflow run panel should render linked task metadata.');
assert.match(workflowPanel, /taskmasterId/, 'Workflow run panel should read taskmasterId metadata.');

const taskDetail = read('src/components/task-master/view/TaskDetailModal.tsx');
assert.match(taskDetail, /taskGraph/, 'Task detail modal should render task graph data.');
assert.match(taskDetail, /Associated runs/, 'Task detail modal should show associated runs.');
assert.match(taskDetail, /Changed files/, 'Task detail modal should show changed files.');
assert.match(taskDetail, /Acceptance criteria/, 'Task detail modal should show acceptance criteria.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert.match(en, /"linkedTask"/, 'English linked task translation is missing.');
assert.match(tr, /"linkedTask"/, 'Turkish linked task translation is missing.');

console.log('taskmaster run graph smoke passed');
