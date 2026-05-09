#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installJobs = readFileSync('server/services/install-jobs.js', 'utf8');
const taskmasterRoutes = readFileSync('server/routes/taskmaster.js', 'utf8');
const onboarding = readFileSync('src/components/onboarding/view/Onboarding.tsx', 'utf8');
const stepProgress = readFileSync('src/components/onboarding/view/subcomponents/OnboardingStepProgress.tsx', 'utf8');
const taskStep = readFileSync('src/components/onboarding/view/subcomponents/TaskSystemStep.tsx', 'utf8');

assert.ok(
  installJobs.includes("'task-master': 'task-master'"),
  'TaskMaster package should be verified by the sandbox CLI installer.',
);

assert.ok(
  taskmasterRoutes.includes("router.post('/install'"),
  'TaskMaster routes should expose an authenticated install endpoint.',
);

assert.ok(
  taskmasterRoutes.includes("router.get('/install/:jobId/stream'"),
  'TaskMaster install should expose the same resilient log stream pattern as provider installs.',
);

assert.ok(
  taskmasterRoutes.includes("provider: 'taskmaster'") && taskmasterRoutes.includes("packageName: 'task-master'"),
  'TaskMaster install route should install the task-master npm package under the taskmaster job provider.',
);

assert.ok(
  onboarding.includes('TaskSystemStep') && onboarding.includes('currentStep < 2'),
  'Onboarding should include a third Task system step before completion.',
);

assert.ok(
  onboarding.includes("localStorage.setItem('tasks-enabled'"),
  'Onboarding should persist the user task-system choice.',
);

assert.ok(
  stepProgress.includes('Task System'),
  'Onboarding progress should show the Task System step.',
);

assert.ok(
  taskStep.includes('/api/taskmaster/installation-status') && taskStep.includes('/api/taskmaster/install'),
  'TaskSystemStep should check and install TaskMaster through the backend API.',
);

console.log('taskmaster onboarding smoke passed');
