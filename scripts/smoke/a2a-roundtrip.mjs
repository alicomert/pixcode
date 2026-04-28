// scripts/smoke/a2a-roundtrip.mjs
// End-to-end smoke check for the A2A foundation.
//
// Usage:   node scripts/smoke/a2a-roundtrip.mjs [baseUrl]
// Default: http://127.0.0.1:3001
//
// Pre-reqs:
//   - pixcode server running (npm run server:dev-watch)
//   - ANTHROPIC_API_KEY (or pixcode auth) configured for Claude Code
//
// What it does:
//   1. GET /a2a/.well-known/agent-card.json   - sanity check
//   2. GET /a2a/agents                        - confirms claude-code is registered
//   3. POST /a2a/tasks                        - submits a tiny task
//   4. Streams /a2a/tasks/:id/stream          - prints events until terminal state
//
// Pass/fail:
//   Exits 0 on terminal state "completed". Non-zero otherwise.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3001';

async function jget(path) {
  const r = await fetch(`${baseUrl}${path}`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function main() {
  console.log('1) /a2a/.well-known/agent-card.json');
  const card = await jget('/a2a/.well-known/agent-card.json');
  console.log('   name=', card.name, 'version=', card.version);
  if (card.name !== 'pixcode') throw new Error('AgentCard.name != "pixcode"');

  console.log('2) /a2a/agents');
  const agents = await jget('/a2a/agents');
  const ids = agents.agents.map((a) => a.name);
  console.log('   registered:', ids.join(', '));
  if (!ids.includes('pixcode-claude-code')) {
    throw new Error('claude-code adapter not registered');
  }

  console.log('3) POST /a2a/tasks');
  const submitRes = await fetch(`${baseUrl}/a2a/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      adapterId: 'claude-code',
      message: {
        messageId: 'm_smoke_1',
        role: 'user',
        parts: [{ kind: 'text', text: 'Reply with the single word: ok' }],
      },
    }),
  });
  if (!submitRes.ok) throw new Error(`submit -> ${submitRes.status}`);
  const task = await submitRes.json();
  console.log('   task.id=', task.id, 'state=', task.state);

  console.log('4) GET /a2a/tasks/:id/stream (SSE)');
  const streamRes = await fetch(`${baseUrl}/a2a/tasks/${task.id}/stream`);
  if (!streamRes.ok) throw new Error(`stream -> ${streamRes.status}`);

  const reader = streamRes.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  let terminalState = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice('data: '.length));
      console.log('   event:', event.kind ?? 'snapshot', '->', event);
      if (event.kind === 'task-state') {
        terminalState = event.state;
        if (['completed', 'canceled', 'failed'].includes(terminalState)) break;
      }
    }
    if (terminalState && ['completed', 'canceled', 'failed'].includes(terminalState)) break;
  }

  console.log('terminal state:', terminalState);
  if (terminalState !== 'completed') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(2);
});
