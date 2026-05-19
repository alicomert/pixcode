#!/usr/bin/env node

const baseUrl = process.env.PIXCODE_BASE_URL || 'http://127.0.0.1:3001';
const apiKey = process.env.PIXCODE_API_KEY;
const goal = process.env.PIXCODE_LIVE_GOAL;
const timeoutMs = Number.parseInt(process.env.PIXCODE_LIVE_TIMEOUT_MS || '1200000', 10);
const minAgentOutputs = Number.parseInt(process.env.PIXCODE_LIVE_MIN_AGENT_OUTPUTS || '2', 10);
const workflowId = process.env.PIXCODE_LIVE_WORKFLOW_ID || 'agent_team';

if (!apiKey) {
  console.error('PIXCODE_API_KEY is required.');
  process.exit(1);
}

if (!goal) {
  console.error('PIXCODE_LIVE_GOAL is required.');
  process.exit(1);
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`${name} is required.`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function headers(extra = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  }
  return body;
}

function terminal(status) {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

function agentTextCount(run) {
  return (run.nodeRuns || []).filter((node) =>
    (node.messages || []).some((message) => message.role !== 'user' && message.text?.trim()) ||
    Boolean(node.outputText?.trim()),
  ).length;
}

function compactNodes(run) {
  return (run.nodeRuns || []).map((node) => ({
    nodeId: node.nodeId,
    label: node.agentLabel,
    status: node.status,
    taskId: node.hermesTaskId,
    messageCount: (node.messages || []).filter((message) => message.role !== 'user').length,
    hasOutput: Boolean(node.outputText?.trim()),
    error: node.error,
  }));
}

async function cancelRun(runId) {
  try {
    await request(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
  } catch {
    // Best-effort cleanup only.
  }
}

async function main() {
  const agents = parseJsonEnv('PIXCODE_LIVE_AGENTS_JSON');
  assert(Array.isArray(agents) && agents.length > 0, 'PIXCODE_LIVE_AGENTS_JSON must be a non-empty array.');

  const settings = process.env.PIXCODE_LIVE_SETTINGS_JSON
    ? JSON.parse(process.env.PIXCODE_LIVE_SETTINGS_JSON)
    : {};
  const metadata = {
    agents,
    projectPath: process.env.PIXCODE_LIVE_PROJECT_PATH,
    projectId: process.env.PIXCODE_LIVE_PROJECT_ID,
    settings: {
      maxParallelAgents: Number.parseInt(process.env.PIXCODE_LIVE_MAX_PARALLEL || '3', 10),
      isolation: process.env.PIXCODE_LIVE_ISOLATION || 'host',
      keepWorkspace: process.env.PIXCODE_LIVE_KEEP_WORKSPACE !== 'false',
      ...settings,
    },
  };

  const preview = await request(`/api/orchestration/workflows/${encodeURIComponent(workflowId)}/preview`, {
    method: 'POST',
    body: JSON.stringify({ metadata }),
  });
  assert(preview.nodeCount >= agents.length + 1, 'Preview did not expand enough nodes for the requested agents.');
  console.log(JSON.stringify({ event: 'preview', nodeIds: preview.nodes.map((node) => node.id) }));

  const started = await request(`/api/orchestration/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: 'POST',
    body: JSON.stringify({ input: goal, metadata }),
  });
  const runId = started.id;
  assert(runId, 'Run id missing from start response.');
  console.log(JSON.stringify({ event: 'started', runId, contextId: started.contextId }));

  const deadline = Date.now() + timeoutMs;
  let lastSignature = '';
  let latest = started;
  while (!terminal(latest.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    latest = await request(`/api/orchestration/workflows/runs/${encodeURIComponent(runId)}`);
    const nodes = compactNodes(latest);
    const signature = JSON.stringify(nodes.map((node) => [
      node.nodeId,
      node.status,
      node.messageCount,
      node.hasOutput,
      node.error,
    ]));
    if (signature !== lastSignature) {
      lastSignature = signature;
      console.log(JSON.stringify({
        event: 'progress',
        status: latest.status,
        agentOutputs: agentTextCount(latest),
        nodes,
      }));
    }
  }

  if (!terminal(latest.status)) {
    await cancelRun(runId);
    throw new Error(`Run ${runId} did not finish before ${timeoutMs}ms; canceled.`);
  }

  const outputCount = agentTextCount(latest);
  if (outputCount < minAgentOutputs) {
    throw new Error(`Expected at least ${minAgentOutputs} nodes with agent output; got ${outputCount}.`);
  }

  if (latest.status !== 'completed') {
    throw new Error(`Run ended with ${latest.status}: ${JSON.stringify(compactNodes(latest))}`);
  }

  console.log(JSON.stringify({
    event: 'completed',
    runId,
    contextId: latest.contextId,
    outputCount,
    nodes: compactNodes(latest),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
