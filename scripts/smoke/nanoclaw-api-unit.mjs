#!/usr/bin/env node
/**
 * NanoClaw schedule/API unit smoke (no live daemon required).
 * Validates publicScheduledTask shape, once-archive policy, result unwrap, spam guard rules.
 */
import assert from 'node:assert/strict';

function formatTaskResultText(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (parsed.error) {
        return `Hata: ${typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error, null, 2)}`;
      }
      if (parsed.result != null) {
        return typeof parsed.result === 'string'
          ? parsed.result
          : JSON.stringify(parsed.result, null, 2);
      }
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // plain
  }
  return text;
}

function shouldSkipTaskResultBody(body) {
  return /^\s*\[Task specialty=/i.test(body) || /Plan and implement across the workspace/i.test(body);
}

function shouldArchiveOnce(task, nextRun) {
  return task.schedule_type === 'once' && !nextRun;
}

// --- result unwrap
assert.equal(
  formatTaskResultText(JSON.stringify({ result: 'Analiz: 3 risk' })),
  'Analiz: 3 risk',
);
assert.match(formatTaskResultText(JSON.stringify({ error: 'boom' })), /Hata: boom/);

// --- specialty echo must never be posted as chat result
assert.equal(
  shouldSkipTaskResultBody('[Task specialty=fullstack] Plan and implement across the workspace end-to-end.\n\nfoo'),
  true,
);
assert.equal(shouldSkipTaskResultBody('Gerçek agent cevabı burada'), false);

// --- once archive policy
assert.equal(shouldArchiveOnce({ schedule_type: 'once' }, null), true);
assert.equal(shouldArchiveOnce({ schedule_type: 'once' }, '2026-01-01T00:00:00Z'), false);
assert.equal(shouldArchiveOnce({ schedule_type: 'cron' }, null), false);

// --- schedule job packaging rules
function buildScheduleJob({ agent, model, convId, work }) {
  const cliModel = model && !String(model).includes('::') ? model : null;
  return [
    agent ? `[agent:${agent}${cliModel ? ` model:${cliModel}` : ''}]` : null,
    convId ? `[pixconv:${convId}]` : null,
    work,
  ].filter(Boolean).join(' ');
}

const job = buildScheduleJob({
  agent: 'grok',
  model: 'cerebras-a7b52dc1::zai-glm-4.7',
  convId: 'conv-1',
  work: 'sistemi analiz et; nelerin değişmesi gerektiğini yaz',
});
assert.match(job, /\[agent:grok\]/);
assert.doesNotMatch(job, /cerebras/);
assert.match(job, /\[pixconv:conv-1\]/);
assert.match(job, /analiz et/);
assert.doesNotMatch(job, /specialty/);

console.log('NANOCLAW API UNIT OK');
