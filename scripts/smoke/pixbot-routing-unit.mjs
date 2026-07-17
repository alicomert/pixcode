#!/usr/bin/env node
/**
 * Pure routing unit checks without loading CLI SDKs.
 * Mirrors chat-engine parseUserRouting / CLI vs HTTP / schedule strip rules.
 */
const CLI = new Set(['claude-code', 'codex', 'gemini', 'cursor', 'qwen', 'opencode', 'grok']);

function normalizeAgentType(raw) {
  const value = String(raw || 'claude-code').toLowerCase().trim();
  if (value === 'pixbot' || value === 'local') return 'claude-code';
  if (value === 'claude') return 'claude-code';
  if (value === 'grok-build' || value === 'xai-grok' || value === 'spacexai') return 'grok';
  if (CLI.has(value)) return value;
  return 'claude-code';
}

function isPixbotHttpModel(model) {
  return String(model || '').includes('::');
}

function parseUserRouting(rawText, softDefaultAgent = null) {
  let text = String(rawText || '').trim().replace(/^["'`«]+|["'`»]+$/g, '').trim();
  let agentType = null;
  let model = null;
  let nlAgent = false;
  let slashAgent = false;

  const slashRe = /(?:^|[\s"'`«»([{])\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b/i;
  const slash = text.match(slashRe);
  if (slash) {
    agentType = normalizeAgentType(slash[1]);
    slashAgent = true;
    text = text
      .replace(/(?:^|[\s"'`«»([{])\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'`«]+|["'`»]+$/g, '')
      .trim();
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

  let softUsed = false;
  if (!agentType && softDefaultAgent && softDefaultAgent !== 'pixbot' && softDefaultAgent !== 'local') {
    agentType = normalizeAgentType(softDefaultAgent);
    softUsed = true;
  }

  const agent = agentType || 'pixbot';
  const explicitAgent = Boolean(slashAgent || nlAgent);
  return { agentType: agent, model, explicitAgent, softUsed, prompt: text };
}

/** Production rule: explicit/sticky CLI always wins over HTTP picker model. */
function wantsCli(r, httpModel, { forceCli = false, actionDoIt = false, stickyCli = false } = {}) {
  const explicitCli = forceCli || r.explicitAgent || actionDoIt;
  if (explicitCli) return true;
  if (stickyCli && r.agentType !== 'pixbot' && String(r.prompt || '').length > 2) return true;
  if (httpModel) return false;
  return Boolean(r.softUsed && CLI.has(r.agentType) && r.agentType !== 'pixbot');
}

function stripScheduleIntentFromPrompt(text) {
  let t = String(text || '');
  // JS \b is ASCII-only — avoid it for Turkish letters
  t = t.replace(/(?:^|[\s,;])(?:şimdi|simdi)\s+(?:sistem\s+i[çc]in\s+)?şunu\s+diyece[gğ]im(?=[\s,;.?!]|$)/gi, ' ');
  t = t.replace(/(?:^|[\s,;])şunu\s+diyece[gğ]im(?=[\s,;.?!]|$)/gi, ' ');
  t = t.replace(/(?:^|[\s,;])sadece\s+(?:saat\s*)?\d{1,2}[:.,]\d{2}[^\n.]{0,60}/gi, ' ');
  t = t.replace(/(?:saat\s*)?\d{1,2}[:.,]\d{2}(?:\s*'?(?:da|de|te|ta)\b)?(?:\s*(?:çalış|calis)[a-zçğıöşü]*)?/gi, ' ');
  t = t.replace(/(?:çalışacak|calisacak)\s*(?:şekilde|sekilde)?/gi, ' ');
  t = t.replace(/(?:şekilde|sekilde)\s*[.?!]?/gi, ' ');
  t = t.replace(/(?:tek\s*sefer(?:lik)?|one[\s-]?time|bir\s*kez(?:lik)?|sadece\s*bir\s*(?:kez|defa))/gi, ' ');
  t = t.replace(/(?:zamanla(?:r\s*m[ıi]s[ıi]n)?|schedule(?:d)?|planla(?:r\s*m[ıi]s[ıi]n)?|hat[ıi]rlat)/gi, ' ');
  t = t.replace(/(?:yapar\s*m[ıi]s[ıi]n|yaparmisin|yap\s*m[ıi]s[ıi]n|yapabilir\s*misin)\??/gi, ' ');
  t = t.replace(/(?:her\s+g[uü]n|every\s+day|daily|g[uü]nl[uü]k|her\s+saat|every\s+hour|hourly)/gi, ' ');
  t = t.replace(/(?:her|every)\s+\d+\s*(?:dakika|minute|min|saat|hour)/gi, ' ');
  t = t.replace(/(?:grok|opencode|codex|claude|gemini|cursor|qwen)(?:\s*build)?\s+ile/gi, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^(?:ve|and|ile|için|icin|ki|şimdi|simdi)\s+/i, '');
  t = t.replace(/\s+(?:ve|and|ile|için|icin)\s*[.?!]*$/i, '');
  t = t.replace(/^[.?!,;:\s]+|[.?!,;:\s]+$/g, '').trim();
  if (t.length < 10) {
    return 'Sistemi / projeyi analiz et; nelerin değişmesi gerektiğini maddeler halinde yaz. Dosya isteme.';
  }
  return t;
}

function detectScheduleIntent(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  const turkey = /t[uü]rkiye|istanbul|europe\/istanbul|trt\b/i.test(t);
  const oneShot = /tek\s*sefer(?:lik)?|one[\s-]?time|bir\s*kez(?:lik)?|sadece\s*bir\s*(?:kez|defa)/i.test(t)
    || /sadece\s+saat\s*\d/i.test(t);
  const timeAt = t.match(/(?:saat\s*)?(\d{1,2})[:.,](\d{2})(?:\s*(?:'?da|'?de|da|de|te|ta))?/i);
  if (timeAt && (oneShot || /(?:çalış|calis|schedule|zamanla|planla|hatırlat|kontrol|analiz|yap)/i.test(t))) {
    return {
      schedule_type: 'once',
      h: Number(timeAt[1]),
      m: Number(timeAt[2]),
      turkey,
      prompt: stripScheduleIntentFromPrompt(t),
    };
  }
  const daily = t.match(/(?:her\s+g[uü]n|every\s+day|daily)\s*(?:saat\s*)?(\d{1,2})(?::(\d{2})|[,.](\d{2}))?/i);
  if (daily) {
    return {
      schedule_type: 'cron',
      h: Number(daily[1]),
      m: Number(daily[2] || daily[3] || 0),
      prompt: stripScheduleIntentFromPrompt(t),
    };
  }
  return null;
}

function parseAgentDirective(prompt) {
  let text = String(prompt || '');
  let agentType = null;
  let model = null;
  let conversationId = null;
  for (let i = 0; i < 4; i += 1) {
    const agentMatch = text.match(/^\s*\[(?:agent|provider)\s*[:=]\s*([a-z0-9_-]+)(?:\s+model\s*[:=]\s*([^\]]+))?\]\s*/i);
    if (agentMatch) {
      agentType = normalizeAgentType(agentMatch[1]);
      model = agentMatch[2] ? agentMatch[2].trim() : model;
      text = text.slice(agentMatch[0].length);
      continue;
    }
    const convMatch = text.match(/^\s*\[pixconv:([^\]]+)\]\s*/i);
    if (convMatch) {
      conversationId = convMatch[1].trim();
      text = text.slice(convMatch[0].length);
      continue;
    }
    break;
  }
  text = text.replace(/\[pixconv:[^\]]+\]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (model && String(model).includes('::')) model = null;
  return { agentType, model, conversationId, prompt: text };
}

const cases = [
  { m: '/grok analyze project', want: { agent: 'grok', wantsCli: true } },
  { m: 'urgent review /grok', want: { agent: 'grok', wantsCli: true } },
  { m: '"/grok ile çalış proje amacını sor', want: { agent: 'grok', wantsCli: true } },
  { m: 'sen degil /grok analiz edecek', want: { agent: 'grok', wantsCli: true } },
  { m: 'use grok to review', want: { agent: 'grok', wantsCli: true } },
  { m: 'grok ile projeyi analiz et', want: { agent: 'grok', wantsCli: true } },
  { m: '/opencode fix tests', want: { agent: 'opencode', wantsCli: true } },
  { m: 'opencode un deepseek v4 flash free ile analiz ettir', want: { agent: 'opencode', wantsCli: true, model: true } },
  { m: 'bunu codex ile yap', want: { agent: 'codex', wantsCli: true } },
  { m: 'hello what is this', want: { agent: 'pixbot', wantsCli: false } },
  { m: 'selam', want: { agent: 'pixbot', wantsCli: false } },
  // Sticky CLI (same chat after /grok): HTTP picker must NOT steal follow-ups
  {
    m: 'devam et, riskleri de yaz',
    softDefault: 'grok',
    stickyCli: true,
    httpModel: 'cerebras-a7b52dc1::zai-glm-4.7',
    want: { agent: 'grok', wantsCli: true },
  },
  // HTTP model + explicit /grok → still CLI
  {
    m: '/grok analyze the purpose of this project',
    httpModel: 'cerebras-a7b52dc1::zai-glm-4.7',
    want: { agent: 'grok', wantsCli: true },
  },
];

let failed = 0;
for (const c of cases) {
  const r = parseUserRouting(c.m, c.softDefault || null);
  const http = isPixbotHttpModel(c.httpModel);
  const wc = wantsCli(r, http, { stickyCli: Boolean(c.stickyCli) });
  const okAgent = c.want.agent ? r.agentType === c.want.agent : true;
  const okCli = wc === c.want.wantsCli;
  const okModel = !c.want.model || Boolean(r.model);
  const pass = okAgent && okCli && okModel;
  if (!pass) failed += 1;
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify({
    m: c.m,
    got: { agent: r.agentType, wantsCli: wc, model: r.model, explicit: r.explicitAgent },
    want: c.want,
  }));
}

const schedCases = [
  { m: 'turkiye saati 23:59 tek seferlik kontrol', want: 'once' },
  { m: 'her gun saat 9 bagimlilik', want: 'cron' },
  { m: 'schedule once at 15:56 Turkey time job', want: 'once' },
  {
    m: 'şimdi sistem için şunu diyecegim grok ile sistemi analiz etmeni neler değişmesi gerektiğini saat 17.15 te çalışacak şekilde yapar mısın ? sadece saat 17.15 te çalışsın',
    want: 'once',
    workMustNotInclude: ['17.15', 'saat', 'çalışsın', 'diyecegim'],
    workMustInclude: ['analiz'],
  },
  { m: 'just chat about weather', want: null },
];
for (const c of schedCases) {
  const s = detectScheduleIntent(c.m);
  const type = s?.schedule_type || null;
  let pass = type === c.want;
  if (pass && c.workMustNotInclude && s?.prompt) {
    const p = s.prompt.toLowerCase();
    for (const bad of c.workMustNotInclude) {
      if (p.includes(String(bad).toLowerCase())) {
        pass = false;
        console.log('  bad leftover in work prompt:', bad, '→', s.prompt);
      }
    }
  }
  if (pass && c.workMustInclude && s?.prompt) {
    const p = s.prompt.toLowerCase();
    for (const good of c.workMustInclude) {
      if (!p.includes(String(good).toLowerCase())) {
        pass = false;
        console.log('  missing expected work token:', good, '→', s.prompt);
      }
    }
  }
  if (!pass) failed += 1;
  console.log(pass ? 'PASS' : 'FAIL', 'sched', c.m.slice(0, 60), '->', type, s?.prompt ? `| work=${s.prompt.slice(0, 80)}` : '');
}

// Job prompt packaging: no HTTP model, has pixconv, specialty never applied in multi-runner
const packed = parseAgentDirective(
  '[agent:grok model:cerebras-a7b52dc1::zai-glm-4.7] [pixconv:conv-abc] sistemi analiz et',
);
const packOk = packed.agentType === 'grok'
  && packed.model == null
  && packed.conversationId === 'conv-abc'
  && packed.prompt.includes('analiz')
  && !packed.prompt.includes('pixconv')
  && !packed.prompt.includes('specialty');
if (!packOk) failed += 1;
console.log(packOk ? 'PASS' : 'FAIL', 'pack', packed);

// Specialty wrapper must never appear when chatMode true (multi-runner always chatMode now)
function buildTaskPrompt(task) {
  const base = String(task.prompt || '').trim();
  if (task?.chatMode) return base;
  const role = task.role && task.role !== 'custom' ? String(task.role) : '';
  if (!role) return base;
  return `[Task specialty=${role}] Plan and implement across the workspace end-to-end.\n\n${base}`;
}
const multiStyle = buildTaskPrompt({ prompt: 'sistemi analiz et', role: undefined, chatMode: true });
const noSpecialty = !/specialty=fullstack/i.test(multiStyle) && multiStyle === 'sistemi analiz et';
if (!noSpecialty) failed += 1;
console.log(noSpecialty ? 'PASS' : 'FAIL', 'no-specialty', multiStyle);

if (failed) {
  console.error(`ROUTING UNIT FAILED (${failed})`);
  process.exit(1);
}
console.log('ROUTING UNIT OK');
