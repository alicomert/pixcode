#!/usr/bin/env node
import { buildPayload } from '../github/create-v1.38-issues.mjs';

const payload = buildPayload();

if (payload.version !== '1.38') {
  throw new Error(`expected version 1.38, got ${payload.version}`);
}

if (!Array.isArray(payload.issues) || payload.issues.length !== 7) {
  throw new Error(`expected 7 child issues, got ${payload.issues?.length}`);
}

if (!payload.epic || !payload.epic.title.includes('v1.38')) {
  throw new Error('missing v1.38 epic payload');
}

const expectedKeys = ['remote', 'api', 'telegram', 'taskmaster', 'plugins', 'desktop', 'observability'];
for (const key of expectedKeys) {
  const issue = payload.issues.find(item => item.key === key);
  if (!issue) {
    throw new Error(`missing issue key ${key}`);
  }
  if (!issue.title || !issue.body.includes('## Acceptance Criteria')) {
    throw new Error(`issue ${key} is missing title or acceptance criteria`);
  }
}

if (!payload.trackingReplacements || payload.trackingReplacements.length !== 8) {
  throw new Error('expected replacement plan for 7 issues plus epic');
}

console.log('v1.38 issue planner smoke passed');
