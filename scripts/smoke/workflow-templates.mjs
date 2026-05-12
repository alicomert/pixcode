#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const templates = read('server/modules/orchestration/workflows/workflow-templates.ts');
assert.match(templates, /PIXCODE_WORKFLOW_TEMPLATE_PROTOCOL/, 'Workflow templates should declare a stable protocol id.');
assert.match(templates, /pixcode\.workflow-template\.v1/, 'Workflow templates should use the v1 protocol id.');
assert.match(templates, /bug_fix_team/, 'Bug fix team template is missing.');
assert.match(templates, /pr_review_team/, 'PR review team template is missing.');
assert.match(templates, /frontend_polish/, 'Frontend polish template is missing.');
assert.match(templates, /release_manager/, 'Release manager template is missing.');
assert.match(templates, /dependency_audit/, 'Dependency audit template is missing.');
assert.match(templates, /agentSlots/, 'Templates should use provider-independent agent slots.');
assert.match(templates, /acceptanceCriteria/, 'Templates should include acceptance criteria.');
assert.match(templates, /applyWorkflowTemplateToMetadata/, 'Templates should be applicable to run metadata.');

const routes = read('server/modules/orchestration/workflows/workflow.routes.ts');
assert.match(routes, /workflows\/templates/, 'Workflow routes should expose templates.');
assert.match(routes, /WORKFLOW_TEMPLATE_NOT_FOUND/, 'Workflow template start route should validate template ids.');
assert.match(routes, /applyWorkflowTemplateToMetadata/, 'Workflow routes should apply templates before starting runs.');

const trace = read('server/modules/orchestration/workflows/workflow-trace.ts');
assert.match(trace, /workflow\.trace\.template/, 'Trace timeline should surface template metadata.');

const page = read('src/components/orchestration/OrchestrationPage.tsx');
assert.match(page, /WorkflowTemplate/, 'Orchestration page should type workflow templates.');
assert.match(page, /applyTemplate/, 'Orchestration page should let users apply a template before launch.');
assert.match(page, /workflowTemplate/, 'Template run metadata should be sent with orchestration runs.');

const en = read('src/i18n/locales/en/common.json');
const tr = read('src/i18n/locales/tr/common.json');
assert.match(en, /"templates"/, 'English template UI label is missing.');
assert.match(tr, /"templates"/, 'Turkish template UI label is missing.');

console.log('workflow templates smoke passed');
