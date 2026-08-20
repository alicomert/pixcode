#!/usr/bin/env node

import {
  skipIfOrchestrationApiRetired,
  skipIfOrchestrationRetired,
} from './_orchestration-retired.mjs';

const baseUrl = process.env.PIXCODE_BASE_URL || 'http://127.0.0.1:3001';
const apiKey = process.env.PIXCODE_API_KEY;

if (skipIfOrchestrationRetired('orchestration API smoke')) process.exit(0);

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nodeById(nodes, id) {
  const node = nodes.find((candidate) => candidate.id === id);
  assert(node, `Missing workflow node: ${id}`);
  return node;
}

function parseJsonEnv(name, fallback) {
  if (!process.env[name]) return fallback;
  try {
    return JSON.parse(process.env[name]);
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function safeNodeId(adapterId, suffix) {
  return `${adapterId.replace(/[^a-zA-Z0-9_]+/g, '_')}_${suffix}`;
}

function safeAgentNodeId(agent, index, suffix) {
  return `agent_${index + 1}_${safeNodeId(agent.adapterId, suffix)}`;
}

const smokeAgents = parseJsonEnv('PIXCODE_SMOKE_AGENTS_JSON', [
  {
    instanceId: 'codex-frontend',
    adapterId: 'codex',
    label: 'Agent #1',
    role: 'frontend',
    enabled: true,
  },
  {
    instanceId: 'codex-backend',
    adapterId: 'codex',
    label: 'Agent #2',
    role: 'backend',
    enabled: true,
  },
  {
    instanceId: 'codex-review',
    adapterId: 'codex',
    label: 'Agent #3',
    role: 'review',
    enabled: true,
  },
]);

const teamMetadata = {
  agents: smokeAgents,
  settings: {
    ...parseJsonEnv('PIXCODE_SMOKE_SETTINGS_JSON', {}),
    maxParallelAgents: Number.parseInt(process.env.PIXCODE_SMOKE_MAX_PARALLEL || '3', 10),
    isolation: process.env.PIXCODE_SMOKE_ISOLATION || 'host',
    keepWorkspace: process.env.PIXCODE_SMOKE_KEEP_WORKSPACE !== 'false',
  },
};

async function main() {
  if (await skipIfOrchestrationApiRetired({ baseUrl, label: 'orchestration API smoke' })) return;
  if (!apiKey) {
    console.error('PIXCODE_API_KEY is required.');
    process.exit(1);
  }

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  assert(health.status === 'ok', 'Health check did not return ok.');

  const workflows = await request('/api/orchestration/workflows');
  assert(Array.isArray(workflows.workflows), 'Workflow list payload is invalid.');
  assert(workflows.workflows.some((workflow) => workflow.id === 'agent_team'), 'agent_team workflow is missing.');

  const preview = await request('/api/orchestration/workflows/agent_team/preview', {
    method: 'POST',
    body: JSON.stringify({ metadata: teamMetadata }),
  });
  assert(preview.workflow?.id === 'agent_team', 'Preview did not return the agent_team workflow.');
  assert(preview.nodeCount === preview.nodes.length, 'Preview nodeCount does not match nodes length.');

  const backendIndex = smokeAgents.findIndex((agent) => agent.role === 'backend');
  const frontendIndex = smokeAgents.findIndex((agent) => agent.role === 'frontend');
  const reviewIndex = smokeAgents.findIndex((agent) => agent.role === 'review');
  assert(backendIndex >= 0, 'Smoke agents must include one role=backend agent.');
  assert(frontendIndex >= 0, 'Smoke agents must include one role=frontend agent.');
  assert(reviewIndex >= 0, 'Smoke agents must include one role=review agent.');

  const backendAgent = smokeAgents[backendIndex];
  const frontendAgent = smokeAgents[frontendIndex];
  const reviewAgent = smokeAgents[reviewIndex];
  const backendHandoffId = safeAgentNodeId(backendAgent, backendIndex, 'handoff');
  const backendWorkId = safeAgentNodeId(backendAgent, backendIndex, 'work');
  const frontendWorkId = safeAgentNodeId(frontendAgent, frontendIndex, 'work');
  const reviewWorkId = safeAgentNodeId(reviewAgent, reviewIndex, 'work');

  const backendHandoff = nodeById(preview.nodes, backendHandoffId);
  const backendWork = nodeById(preview.nodes, backendWorkId);
  const frontendWork = nodeById(preview.nodes, frontendWorkId);
  const reviewWork = nodeById(preview.nodes, reviewWorkId);
  const finalReport = nodeById(preview.nodes, 'final_report');

  assert(backendHandoff.timeoutMs === 120000, 'Backend handoff timeout is not set to 120000ms.');
  assert(backendHandoff.inputs.includes('coordinator'), 'Backend handoff must depend on coordinator.');
  assert(backendWork.inputs.includes(backendHandoffId), 'Backend work must depend on backend handoff.');
  assert(frontendWork.inputs.includes(backendHandoffId), 'Frontend work must depend on backend handoff.');
  assert(!frontendWork.inputs.includes(backendWorkId), 'Frontend must not wait for full backend implementation.');
  assert(reviewWork.inputs.includes(frontendWorkId), 'Review must depend on frontend work.');
  assert(reviewWork.inputs.includes(backendWorkId), 'Review must depend on backend work.');
  assert(finalReport.inputs.includes(reviewWorkId), 'Final report must include review output.');

  const runs = await request('/api/orchestration/workflows/runs?limit=5');
  assert(Array.isArray(runs.runs), 'Runs payload is invalid.');

  let eventsChecked = false;
  if (runs.runs[0]?.id) {
    const controller = new AbortController();
    const response = await fetch(
      `${baseUrl}/api/orchestration/workflows/runs/${encodeURIComponent(runs.runs[0].id)}/events`,
      {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    assert(response.ok, `Run events endpoint returned ${response.status}.`);
    assert(response.body, 'Run events endpoint did not return a readable body.');
    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    controller.abort();
    const eventText = new TextDecoder().decode(firstChunk.value || new Uint8Array());
    assert(eventText.includes('event: snapshot'), 'Run events endpoint did not emit an initial snapshot.');
    eventsChecked = true;
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    workflowCount: workflows.workflows.length,
    previewNodeIds: preview.nodes.map((node) => node.id),
    recentRunCount: runs.runs.length,
    eventsChecked,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
