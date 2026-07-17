#!/usr/bin/env node
/**
 * Live PixBot / NanoClaw API smoke against a local daemon.
 *
 * All identity comes from the environment — no hardcoded project names/paths.
 *
 *   PIXCODE_API_KEY   required (px_…)
 *   PIXCODE_URL       default http://127.0.0.1:3001
 *   PIXCODE_PROJECT_ID     optional workspace id (from Pixcode registry)
 *   PIXCODE_PROJECT_PATH   optional absolute path to workspace
 *
 * Never commit real API keys.
 */
const base = (process.env.PIXCODE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const key = process.env.PIXCODE_API_KEY || process.env.PIXBOT_API_KEY || '';
const projectId = process.env.PIXCODE_PROJECT_ID || 'general';
const projectPath = process.env.PIXCODE_PROJECT_PATH || '';

if (!key) {
  console.error('Set PIXCODE_API_KEY=px_…');
  process.exit(1);
}

const headers = {
  'content-type': 'application/json',
  'x-api-key': key,
  accept: 'application/json',
};

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { ok: res.ok, status: res.status, json, text };
}

function pickAssistant(payload) {
  const msgs = payload?.messages || [];
  return [...msgs].reverse().find((m) => m.role === 'assistant') || null;
}

async function main() {
  console.log(`→ ${base} projectId=${projectId} path=${projectPath || '(registry/none)'}`);
  const health = await req('GET', '/health');
  console.log('health', health.status, health.json?.version, health.json?.installMode);

  const status = await req('GET', '/api/nanoclaw/status');
  console.log('nanoclaw', status.status, 'started=', status.json?.started);

  const llm = await req('GET', '/api/tasks/bot/llm');
  console.log('llm', llm.status, 'configured=', llm.json?.configured, 'providers=', llm.json?.providerCount);

  const chatBody = {
    projectId,
    ...(projectPath ? { projectPath } : {}),
    message: 'What is this workspace? Answer in 2 short sentences. Do not ask me to paste files.',
  };
  const chat = await req('POST', '/api/tasks/bot/chat', chatBody);
  const a1 = pickAssistant(chat.json);
  console.log('chat', chat.status, 'mode=', chat.json?.mode, 'agent=', chat.json?.agentType);
  console.log('  ', String(a1?.content || chat.text).slice(0, 240).replace(/\s+/g, ' '));

  const grokBody = {
    projectId,
    ...(projectPath ? { projectPath } : {}),
    message: '/grok Using attached workspace context only, list framework + 3 risks. Do not ask to paste files.',
  };
  const grok = await req('POST', '/api/tasks/bot/chat', grokBody);
  const a2 = pickAssistant(grok.json);
  console.log('grok', grok.status, 'mode=', grok.json?.mode, 'agent=', grok.json?.agentType || a2?.agentType);
  console.log('  ', String(a2?.content || grok.text).slice(0, 360).replace(/\s+/g, ' '));

  if (!chat.ok || !grok.ok) {
    console.error('SMOKE FAILED');
    process.exit(2);
  }
  if (grok.json?.mode === 'api' && a2?.agentType === 'pixbot') {
    console.error('SMOKE FAILED: /grok fell through to PixBot HTTP; expected CLI agent');
    process.exit(3);
  }
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
