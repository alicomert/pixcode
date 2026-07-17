#!/usr/bin/env node
/**
 * Pure routing unit checks without loading CLI SDKs.
 * Mirrors chat-engine parseUserRouting / detectScheduleIntent / CLI set rules.
 */
const CLI = new Set(['claude-code', 'codex', 'gemini', 'cursor', 'qwen', 'opencode', 'grok']);

function normalizeAgentType(raw) {
  const value = String(raw || 'claude-code').toLowerCase().trim();
  if (value === 'claude') return 'claude-code';
  if (value === 'grok-build' || value === 'xai-grok' || value === 'spacexai') return 'grok';
  if (CLI.has(value) || value === 'claude') return value === 'claude' ? 'claude-code' : value;
  return 'claude-code';
}

function parseUserRouting(rawText) {
  let text = String(rawText || '').trim();
  let agentType = null;
  let model = null;
  let nlAgent = false;
  let slashAgent = false;

  const slashRe = /(?:^|\s)\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b/i;
  const slash = text.match(slashRe);
  if (slash) {
    agentType = normalizeAgentType(slash[1]);
    slashAgent = true;
    text = text.replace(slashRe, ' ').replace(/\s+/g, ' ').trim();
  }

  if (!agentType) {
    const nl = text.match(
      /(?:\b(?:use|with|via|run\s+on|let)\s+)?(opencode|codex|claude(?:\s*code)?|gemini|cursor|qwen|grok(?:\s*build)?)\s*(?:un|nun|'s)?\s*(?:ile|ile\s+yap|yapsın|yapsin|yap|ki\s+yapsın|should\s+(?:do|handle)|to\s+(?:do|handle)|ile\s+analiz|analiz\s+ettir|analiz\s+et)\b/i,
    )
      || text.match(/\b(?:use|via|with)\s+(opencode|codex|claude|gemini|cursor|qwen|grok)\b/i)
      || text.match(/\b(opencode|codex|claude|gemini|cursor|qwen|grok)\s+(?:un|nun|'s)\s+/i);
    if (nl) {
      const rawAgent = String(nl[1]).trim();
      const normalizedNl = /^claude(?:\s+code)?$/i.test(rawAgent) ? 'claude-code' : rawAgent;
      agentType = normalizeAgentType(normalizedNl);
      nlAgent = true;
    }
  }

  if (!model) {
    const modelHit = text.match(
      /\b(deepseek[\w./\-\s]{0,48}?(?:flash|chat|coder)[\w./\-\s]{0,24}?free|deepseek[-\s]?v?\d[\w./\-]{0,40})\b/i,
    );
    if (modelHit) model = modelHit[1].replace(/\s+/g, '-').replace(/-+/g, '-').toLowerCase();
  }

  const agent = agentType || 'pixbot';
  const explicitAgent = Boolean(slashAgent || nlAgent);
  const wantsCli = explicitAgent || (CLI.has(agent) && agent !== 'pixbot');
  return { agentType: agent, model, explicitAgent, wantsCli, prompt: text };
}

function detectScheduleIntent(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  const turkey = /t[uü]rkiye|istanbul|europe\/istanbul|trt\b/i.test(t);
  const oneShot = /tek\s*sefer(?:lik)?|one[\s-]?time|bir\s*kez(?:lik)?/i.test(t);
  const timeAt = t.match(/(?:saat\s*)?(\d{1,2})[:.,](\d{2})(?:\s*(?:'?da|'?de|da|de))?/i);
  if (timeAt && (oneShot || /(?:çalış|calis|schedule|zamanla|planla|hatırlat|kontrol)/i.test(t))) {
    return { schedule_type: 'once', h: Number(timeAt[1]), m: Number(timeAt[2]), turkey };
  }
  const daily = t.match(/(?:her\s+g[uü]n|every\s+day|daily)\s*(?:saat\s*)?(\d{1,2})(?::(\d{2})|[,.](\d{2}))?/i);
  if (daily) return { schedule_type: 'cron', h: Number(daily[1]), m: Number(daily[2] || daily[3] || 0) };
  return null;
}

const cases = [
  { m: '/grok analyze project', want: { agent: 'grok', wantsCli: true } },
  { m: 'urgent review /grok', want: { agent: 'grok', wantsCli: true } },
  { m: 'use grok to review', want: { agent: 'grok', wantsCli: true } },
  { m: 'grok ile projeyi analiz et', want: { agent: 'grok', wantsCli: true } },
  { m: '/opencode fix tests', want: { agent: 'opencode', wantsCli: true } },
  { m: 'opencode un deepseek v4 flash free ile analiz ettir', want: { agent: 'opencode', wantsCli: true, model: true } },
  { m: 'bunu codex ile yap', want: { agent: 'codex', wantsCli: true } },
  { m: 'hello what is this', want: { agent: 'pixbot', wantsCli: false } },
  { m: 'selam', want: { agent: 'pixbot', wantsCli: false } },
];

let failed = 0;
for (const c of cases) {
  const r = parseUserRouting(c.m);
  const okAgent = r.agentType === c.want.agent;
  const okCli = r.wantsCli === c.want.wantsCli;
  const okModel = !c.want.model || Boolean(r.model);
  const pass = okAgent && okCli && okModel;
  if (!pass) failed += 1;
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify({
    m: c.m,
    got: { agent: r.agentType, wantsCli: r.wantsCli, model: r.model, explicit: r.explicitAgent },
    want: c.want,
  }));
}

const schedCases = [
  { m: 'turkiye saati 23:59 tek seferlik kontrol', want: 'once' },
  { m: 'her gun saat 9 bagimlilik', want: 'cron' },
  { m: 'schedule once at 15:56 Turkey time job', want: 'once' },
  { m: 'just chat about weather', want: null },
];
for (const c of schedCases) {
  const s = detectScheduleIntent(c.m);
  const type = s?.schedule_type || null;
  const pass = type === c.want;
  if (!pass) failed += 1;
  console.log(pass ? 'PASS' : 'FAIL', 'sched', c.m, '->', type);
}

if (failed) {
  console.error(`ROUTING UNIT FAILED (${failed})`);
  process.exit(1);
}
console.log('ROUTING UNIT OK');
