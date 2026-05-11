#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/components/orchestration/OrchestrationPage.tsx', 'utf8');
const runner = readFileSync('server/modules/orchestration/workflows/workflow-runner.ts', 'utf8');

assert.ok(
  page.includes("from '../../hooks/useProviderModels'") || page.includes('from "@/hooks/useProviderModels"'),
  'Orchestration page should use the same live provider model catalog hook as chat.',
);

assert.ok(
  page.includes('providerModelCatalogs') && page.includes('sanitizeAgentModel'),
  'Orchestration agents should sanitize stale selected models against the live catalog before starting runs.',
);

assert.ok(
  runner.includes('resolveWorkflowModel') && runner.includes('modelCatalogsByProvider'),
  'Workflow runner should validate provider models server-side before submitting A2A tasks.',
);

assert.ok(
  runner.includes('Original user request')
    && runner.indexOf('Original user request') < runner.lastIndexOf('workspaceContextPrompt(workspaceTarget)'),
  'Workflow runner should place a labeled original user request before workspace context so agents do not answer the context header.',
);

console.log('orchestration model sync smoke passed');
