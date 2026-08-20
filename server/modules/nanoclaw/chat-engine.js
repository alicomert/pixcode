/**
 * Pixcode NanoClaw chat engine (thin layer on top of nanoclaw-lite + multi-runner).
 *
 * Design goals:
 * - Conversation first — never treat every message as a schedule/job.
 * - Reuse nanoclaw-lite group/session storage and multi-CLI runner.
 * - Agent routing: /agent-opencode, [agent:codex], natural language (TR/EN…).
 * - @file mentions resolved into prompt context (no heavy MCP re-init per turn).
 * - Session continuity per conversation+agent (warm continueSession).
 * - Schedule only when user clearly asks for deferred/recurring work.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  MULTI_CLI_AGENTS,
  normalizeAgentType,
  parseAgentDirective,
  runPixcodeMultiAgent,
} from './multi-runner.js';
import {
  buildPixbotSystemPrompt,
  buildProjectScanContext,
  getPixbotCredentials,
  pixbotChatCompletion,
  streamPixbotChatCompletion,
} from './pixbot-llm.js';

const HOME = process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode');
const STORE_PATH = path.join(HOME, 'nanoclaw', 'pixcode-conversations.json');

/** @type {{ conversations: Record<string, any>, messages: Record<string, any[]> }} */
let store = { conversations: {}, messages: {} };
let loaded = false;

function ensureStore() {
  if (loaded) return;
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (!store.conversations) store.conversations = {};
      if (!store.messages) store.messages = {};
    }
  } catch {
    store = { conversations: {}, messages: {} };
  }
  loaded = true;
}

function persist() {
  ensureStore();
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 0), 'utf8');
  } catch (error) {
    console.warn('[nanoclaw-chat] persist failed:', error?.message || error);
  }
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Expand natural-language + slash agent routing (beyond [agent:x] tags).
 * Returns cleaned prompt + preferred agent.
 */
/** CLI agent ids that must never fall through to PixBot HTTP (Cerebras etc.). */
export const CLI_AGENT_IDS = new Set([
  'claude-code', 'codex', 'gemini', 'cursor', 'qwen', 'opencode', 'grok',
]);

export function isCliAgentType(agentType) {
  const raw = String(agentType || '').toLowerCase().trim();
  if (!raw || raw === 'pixbot' || raw === 'local') return false;
  // Do NOT call normalizeAgentType() here — it maps unknowns to claude-code.
  if (raw === 'claude' || raw === 'claude-code') return true;
  if (raw === 'grok-build' || raw === 'xai-grok' || raw === 'spacexai') return true;
  return CLI_AGENT_IDS.has(raw);
}

/**
 * PixBot multi-provider model ids look like `providerUuid::model-name`.
 * These are OpenAI-compatible HTTP models — never pass them to Claude/Grok CLI.
 */
export function isPixbotHttpModel(model) {
  const m = String(model || '').trim();
  if (!m) return false;
  if (m.includes('::')) return true;
  // provider-prefixed ids without :: (rare)
  if (/^[a-f0-9]{8,}-[a-f0-9-]+::/i.test(m)) return true;
  return false;
}

export function parseUserRouting(rawText, softDefaultAgent = null) {
  // Strip wrapping quotes users often type: "/grok …" or '/grok …'
  let text = String(rawText || '').trim().replace(/^["'`«]+|["'`»]+$/g, '').trim();
  let agentType = null;
  let model = null;
  let nlAgent = false;
  let slashAgent = false;

  // Slash agents anywhere: start, mid, after quotes — "/grok", … /grok, sen degil /grok …
  // Preferred: /opencode  /claude  /grok
  // Legacy: /agent-opencode  /agent:codex
  const slashRe = /(?:^|[\s"'`«»([{])\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b/i;
  const slash = text.match(slashRe);
  if (slash) {
    agentType = normalizeAgentType(slash[1]);
    slashAgent = true;
    // Strip only the /agent token, keep surrounding words ("ile çalış …")
    text = text
      .replace(/(?:^|[\s"'`«»([{])\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'`«]+|["'`»]+$/g, '')
      .trim();
  }

  // Leading-only strip leftovers if still present
  text = text.replace(
    /^\s*\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b\s*/i,
    '',
  ).trim();

  // Bracket directive already handled by multi-runner; peel here for UI cleanliness
  const bracket = parseAgentDirective(text);
  if (bracket.agentType) {
    agentType = bracket.agentType;
    model = bracket.model;
    text = bracket.prompt;
  }

  // Natural language (TR / EN / mixed) — only if no explicit agent yet
  // Covers: "opencode ile", "opencode un deepseek…", "grok ile analiz", "bunu codex ile yap"
  if (!agentType) {
    const nl = text.match(
      /(?:\b(?:use|with|via|run\s+on|let)\s+)?(opencode|codex|claude(?:\s*code)?|gemini|cursor|qwen|grok(?:\s*build)?)\s*(?:un|nun|'s)?\s*(?:ile|ile\s+yap|yapsın|yapsin|yap|ki\s+yapsın|should\s+(?:do|handle)|to\s+(?:do|handle)|ile\s+analiz|analiz\s+ettir|analiz\s+et)\b/i,
    )
      || text.match(
        /^(?:bunu|şunu|sunu|this|that)?\s*(opencode|codex|claude|gemini|cursor|qwen|grok)\s*(?:un|nun|'s|ile|yapsın|yapsin)/i,
      )
      || text.match(
        /\b(opencode|codex|claude|gemini|cursor|qwen|grok)\s+(?:un|nun|'s)\s+/i,
      )
      || text.match(
        /\b(?:use|via|with)\s+(opencode|codex|claude|gemini|cursor|qwen|grok)\b/i,
      );
    if (nl) {
      // Never use /\s*code/ on the whole token — it turns "codex"→"x" and "opencode"→"open".
      const rawAgent = String(nl[1]).trim();
      const normalizedNl = /^claude(?:\s+code)?$/i.test(rawAgent) ? 'claude-code' : rawAgent;
      agentType = normalizeAgentType(normalizedNl);
      nlAgent = true;
    }
  }

  // Model hint from free text (opencode zen free models, etc.)
  if (!model) {
    const modelHit = text.match(
      /\b(deepseek[\w./\-\s]{0,48}?(?:flash|chat|coder)[\w./\-\s]{0,24}?free|deepseek[-\s]?v?\d[\w./\-]{0,40}|opencode\/[\w./\-]+|google\/[\w./\-]+|anthropic\/[\w./\-]+)\b/i,
    );
    if (modelHit) {
      model = modelHit[1].replace(/\s+/g, '-').replace(/-+/g, '-').toLowerCase();
    }
  }

  let softUsed = false;
  if (!agentType && softDefaultAgent && softDefaultAgent !== 'pixbot' && softDefaultAgent !== 'local') {
    agentType = normalizeAgentType(softDefaultAgent);
    softUsed = true;
  }

  return {
    // No soft CLI default — PixBot API is primary; CLI only when explicitly chosen.
    agentType: agentType || 'pixbot',
    model,
    prompt: text || String(rawText || '').trim(),
    // Slash / bracket / natural-language agent MUST count as explicit so we never
    // answer via PixBot HTTP (Cerebras) when user asked for /grok or "grok ile".
    explicitAgent: Boolean(slashAgent || bracket.agentType || nlAgent),
    softUsed,
  };
}

/**
 * Auto-attach key project files for analysis turns so CLI agents don't ask the user to paste.
 */
export function autoAttachProjectContext(projectPath, { maxFiles = 8, budget = 60_000 } = {}) {
  if (!projectPath || !fs.existsSync(projectPath)) return { text: '', files: [] };
  const candidates = [
    'composer.json',
    'package.json',
    'DESIGN.md',
    'DESIGN-news.md',
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'app/Config/Routes.php',
    'app/Config/App.php',
    'spark',
    'Procfile',
  ];
  const existing = [];
  for (const rel of candidates) {
    const abs = path.join(projectPath, rel);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) existing.push(rel);
    } catch { /* ignore */ }
    if (existing.length >= maxFiles) break;
  }
  if (!existing.length) return { text: '', files: [] };
  // Reuse @mention resolver
  return resolveFileMentions(existing.map((r) => `@${r}`).join(' '), projectPath);
}

/**
 * Wall-clock once schedule: next occurrence of HH:MM in server local time
 * (or Europe/Istanbul if message mentions Türkiye/Istanbul).
 */
export function nextOnceScheduleValue(hour, minute, { turkey = false } = {}) {
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const m = Math.max(0, Math.min(59, Number(minute) || 0));

  if (turkey) {
    // Build next Europe/Istanbul wall time as a local ISO-like string.
    // NanoClaw "once" expects YYYY-MM-DDTHH:mm:ss without TZ.
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const y = Number(get('year'));
    const mo = Number(get('month'));
    const d = Number(get('day'));
    const curH = Number(get('hour'));
    const curM = Number(get('minute'));
    let dayOffset = 0;
    if (curH > h || (curH === h && curM >= m)) dayOffset = 1;
    // Noon UTC anchor avoids DST edge when stepping days
    const anchor = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() + dayOffset);
    const y2 = anchor.getUTCFullYear();
    const mo2 = String(anchor.getUTCMonth() + 1).padStart(2, '0');
    const d2 = String(anchor.getUTCDate()).padStart(2, '0');
    return `${y2}-${mo2}-${d2}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  const target = new Date();
  target.setSeconds(0, 0);
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/**
 * Detect if user wants a deferred/recurring schedule (not a normal chat turn).
 */
/**
 * Strip scheduling meta-language so the job prompt is the actual work instruction.
 * Without this, once-tasks re-ran "saat 17.15 te çalışsın" as the agent task body.
 */
export function stripScheduleIntentFromPrompt(text) {
  let t = String(text || '');
  // JS \b is ASCII-only — avoid it for Turkish letters (ş, ğ, ı, …)
  // Filler: "şimdi sistem için şunu diyeceğim/diyecegim"
  t = t.replace(/(?:^|[\s,;])(?:şimdi|simdi)\s+(?:sistem\s+i[çc]in\s+)?şunu\s+diyece[gğ]im(?=[\s,;.?!]|$)/gi, ' ');
  t = t.replace(/(?:^|[\s,;])şunu\s+diyece[gğ]im(?=[\s,;.?!]|$)/gi, ' ');
  // Times + "çalışacak şekilde" / "sadece saat X"
  t = t.replace(/(?:^|[\s,;])sadece\s+(?:saat\s*)?\d{1,2}[:.,]\d{2}[^\n.]{0,60}/gi, ' ');
  // Time tokens only — do not eat the "te" in "tek seferlik"
  t = t.replace(/(?:saat\s*)?\d{1,2}[:.,]\d{2}(?:\s*'?(?:da|de|te|ta)\b)?(?:\s*(?:çalış|calis)[a-zçğıöşü]*)?/gi, ' ');
  t = t.replace(/(?:çalışacak|calisacak)\s*(?:şekilde|sekilde)?/gi, ' ');
  t = t.replace(/(?:şekilde|sekilde)\s*[.?!]?/gi, ' ');
  t = t.replace(/(?:tek\s*sefer(?:lik)?|one[\s-]?time|bir\s*kez(?:lik)?|sadece\s*bir\s*(?:kez|defa))/gi, ' ');
  t = t.replace(/(?:zamanla(?:r\s*m[ıi]s[ıi]n)?|schedule(?:d)?|planla(?:r\s*m[ıi]s[ıi]n)?|hat[ıi]rlat)/gi, ' ');
  t = t.replace(/(?:yapar\s*m[ıi]s[ıi]n|yaparmisin|yap\s*m[ıi]s[ıi]n|yapabilir\s*misin)\??/gi, ' ');
  t = t.replace(/(?:her\s+g[uü]n|every\s+day|daily|g[uü]nl[uü]k|her\s+saat|every\s+hour|hourly)/gi, ' ');
  t = t.replace(/(?:her|every)\s+\d+\s*(?:dakika|minute|min|saat|hour)/gi, ' ');
  // Agent names left as "X ile" after routing strip
  t = t.replace(/(?:grok|opencode|codex|claude|gemini|cursor|qwen)(?:\s*build)?\s+ile/gi, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  // Trailing glue / punctuation leftovers
  t = t.replace(/^(?:ve|and|ile|için|icin|ki|şimdi|simdi)\s+/i, '');
  t = t.replace(/\s+(?:ve|and|ile|için|icin)\s*[.?!]*$/i, '');
  t = t.replace(/^[.?!,;:\s]+|[.?!,;:\s]+$/g, '').trim();
  if (t.length < 10) {
    return 'Sistemi / projeyi analiz et; nelerin değişmesi gerektiğini maddeler halinde yaz. Dosya isteme.';
  }
  return t;
}

export function detectScheduleIntent(text) {
  const t = String(text || '');
  if (!t.trim()) return null;

  const turkey = /t[uü]rkiye|istanbul|europe\/istanbul|trt\b/i.test(t);
  const oneShot = /tek\s*sefer(?:lik)?|one[\s-]?time|bir\s*kez(?:lik)?|sadece\s*bir\s*(?:kez|defa)/i.test(t)
    || /sadece\s+saat\s*\d/i.test(t);
  // "saat 15.56", "15:56'da", "15.56 da çalışacak" — \b so "te" in "tek" is not eaten
  const timeAt = t.match(/(?:saat\s*)?(\d{1,2})[:.,](\d{2})(?:\s*'?(?:da|de|te|ta)\b)?/i);

  // One-shot at HH:MM (highest priority for "tek seferlik … 15.56")
  if (timeAt && (oneShot || /(?:çalış|calis|schedule|zamanla|planla|hatırlat|kontrol|analiz|yap)/i.test(t))) {
    return {
      schedule_type: 'once',
      schedule_value: nextOnceScheduleValue(timeAt[1], timeAt[2], { turkey }),
      prompt: stripScheduleIntentFromPrompt(t),
      rawPrompt: t,
      oneShot: true,
    };
  }

  // Cron-ish natural language (TR + EN)
  const daily = t.match(
    /(?:her\s+g[uü]n|every\s+day|daily|g[uü]nl[uü]k)\s*(?:saat\s*)?(\d{1,2})(?::(\d{2})|[,.](\d{2}))?/i,
  );
  if (daily) {
    const h = Number(daily[1]);
    const m = Number(daily[2] || daily[3] || 0);
    return {
      schedule_type: 'cron',
      schedule_value: `${m} ${h} * * *`,
      prompt: stripScheduleIntentFromPrompt(t),
      rawPrompt: t,
    };
  }

  const hourly = t.match(/(?:her\s+saat|every\s+hour|hourly)/i);
  if (hourly) {
    return {
      schedule_type: 'cron',
      schedule_value: '0 * * * *',
      prompt: stripScheduleIntentFromPrompt(t),
      rawPrompt: t,
    };
  }

  const everyN = t.match(/(?:her|every)\s+(\d+)\s*(dakika|minute|min|saat|hour)/i);
  if (everyN) {
    const n = Number(everyN[1]);
    const unit = everyN[2].toLowerCase();
    const ms = /saat|hour/.test(unit) ? n * 3600000 : n * 60000;
    return {
      schedule_type: 'interval',
      schedule_value: String(ms),
      prompt: stripScheduleIntentFromPrompt(t),
      rawPrompt: t,
    };
  }

  if (/\b(schedule|zamanla|planla|cron)\b/i.test(t) && /\b(\d{1,2}[:.,]\d{2}|yarın|tomorrow|hafta|week)\b/i.test(t)) {
    if (timeAt) {
      return {
        schedule_type: 'once',
        schedule_value: nextOnceScheduleValue(timeAt[1], timeAt[2], { turkey }),
        prompt: stripScheduleIntentFromPrompt(t),
        rawPrompt: t,
      };
    }
    return {
      schedule_type: 'once',
      schedule_value: '',
      prompt: stripScheduleIntentFromPrompt(t),
      rawPrompt: t,
    };
  }

  return null;
}

/** Lightweight greeting / small-talk — answered locally, never spawns a CLI. */
export function looksLikeSmallTalk(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 160) return false;
  // Pure short greetings, optional filler ("kanka selam", "hey there")
  if (/^(?:kanka|bro|abi|lan|ya|hey|hi|yo)?\s*(selam|merhaba|hello|hi|hey|salaam|salam|مرحبا|你好|hola|bonjour|nasılsın|nasilsin|ne haber|naber|thanks|teşekkür|tesekkur|sağol|sagol|ok|tamam|günaydın|iyi akşamlar|iyi geceler)(?:\s+kanka)?[\s!?.]*$/i.test(t)) {
    return true;
  }
  // Very short single-token greetings
  return /^(selam+|merhaba+|hello+|hi+|hey+)\W*$/i.test(t);
}

function canonicalMentionPath(inputPath) {
  const resolved = path.resolve(String(inputPath || ''));
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    // A project may be created just after the request arrives. Walk up to the
    // nearest existing parent so a symlinked workspace root is still checked
    // against its real location.
    const suffix = [];
    let cursor = resolved;
    while (cursor && cursor !== path.dirname(cursor)) {
      suffix.unshift(path.basename(cursor));
      cursor = path.dirname(cursor);
      try {
        return path.join(fs.realpathSync.native(cursor), ...suffix);
      } catch {
        // Continue toward the filesystem root.
      }
    }
    return resolved;
  }
}

/**
 * Resolve @file or @path mentions relative to project root.
 * Mentions stay as text; contents of small files are inlined (budgeted).
 */
export function resolveFileMentions(text, projectPath) {
  const mentions = [];
  const re = /@([^\s@]+)/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    const raw = match[1].replace(/[.,;:!?)]+$/, '');
    if (!raw || raw.startsWith('http')) continue;
    mentions.push(raw);
  }

  if (!mentions.length || !projectPath) {
    return { text: String(text || ''), files: [] };
  }

  const files = [];
  let budget = 48_000;
  const projectRoot = canonicalMentionPath(projectPath);
  for (const rel of [...new Set(mentions)].slice(0, 12)) {
    const absoluteMention = path.isAbsolute(rel)
      || path.win32.isAbsolute(rel)
      || /^[A-Za-z]:[\\/]/.test(rel)
      || rel.startsWith('\\\\');
    const abs = absoluteMention ? path.resolve(rel) : path.resolve(projectRoot, rel);
    try {
      // `path.resolve` is lexical and therefore treats a symlink inside the
      // workspace as if it were still inside it. Canonicalize the existing
      // target before the containment check so @link/to/secret cannot escape
      // the project through a directory or file symlink.
      const canonicalTarget = fs.realpathSync.native(abs);
      const relative = path.relative(projectRoot, canonicalTarget);
      const insideProject = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
      // Absolute mentions are never allowed to escape the active project.
      // Previously the containment check was skipped for absolute paths,
      // allowing @/etc/passwd (or a Windows drive path) into model prompts.
      if (!insideProject) {
        files.push({ path: rel, note: 'outside project / skip' });
        continue;
      }
      const st = fs.statSync(canonicalTarget);
      if (!st.isFile() || st.size > 200_000) {
        files.push({ path: rel, note: st.isDirectory() ? 'directory' : 'too large / skip' });
        continue;
      }
      const content = fs.readFileSync(canonicalTarget, 'utf8');
      const slice = content.slice(0, Math.min(content.length, budget));
      budget -= slice.length;
      files.push({ path: rel, content: slice, truncated: slice.length < content.length });
      if (budget <= 0) break;
    } catch {
      files.push({ path: rel, note: 'not found' });
    }
  }

  if (!files.some((f) => f.content)) {
    return { text: String(text || ''), files };
  }

  const blocks = files
    .filter((f) => f.content)
    .map((f) => `--- file: ${f.path}${f.truncated ? ' (truncated)' : ''} ---\n${f.content}`)
    .join('\n\n');

  return {
    text: `${String(text || '').trim()}\n\n<attached_files>\n${blocks}\n</attached_files>`,
    files: files.map(({ path: p, note, truncated }) => ({ path: p, note, truncated })),
  };
}

function buildSystemPreamble({ projectId, projectPath, agentType, isSmallTalk }) {
  const agents = MULTI_CLI_AGENTS.map((a) => a.value).join(', ');
  return [
    'You are NanoClaw inside Pixcode — a conversational coding agent control room.',
    'Reply in the same language the user writes (Turkish, Arabic, Chinese, English, …).',
    'You are NOT a ticket system. Do not invent "task scheduled" or job IDs unless the user explicitly asked to schedule deferred work.',
    isSmallTalk
      ? 'This message is casual/small-talk. Reply briefly and warmly. No tools, no file edits, no schedules.'
      : 'Help with coding, planning, and Pixcode (projects, CLI agents, files, git, shell). Be concrete.',
    `Active multi-CLI agents: ${agents}.`,
    'User may switch agents with /opencode, /claude, /grok, or natural phrases like "bunu opencode ile yap".',
    'File mentions use @path (already resolved into <attached_files> when present).',
    projectId ? `Workspace projectId: ${projectId}` : 'Workspace: general (no coding project bound).',
    projectPath ? `Project path: ${projectPath}` : '',
    `Preferred agent this turn: ${agentType}`,
    'Keep answers useful. If you need a long coding run, just do the work and summarize.',
  ].filter(Boolean).join('\n');
}

function publicConversation(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    agentType: row.defaultAgent || 'pixbot',
    defaultModel: row.defaultModel || null,
    ownerUserId: row.ownerUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    kind: row.kind || 'text',
    agentType: row.agentType || null,
    createdAt: row.createdAt,
    meta: row.meta || undefined,
  };
}

export function listConversations(projectId, ownerUserId = null) {
  ensureStore();
  return Object.values(store.conversations)
    .filter((c) => (!projectId || c.projectId === projectId || (projectId === 'general' && !c.projectId))
      && (!ownerUserId || Number(c.ownerUserId) === Number(ownerUserId)))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(publicConversation);
}

export function getMessages(conversationId, ownerUserId = null) {
  ensureStore();
  const conversation = store.conversations[conversationId];
  if (ownerUserId && (!conversation || Number(conversation.ownerUserId) !== Number(ownerUserId))) return [];
  return (store.messages[conversationId] || []).map(publicMessage);
}

export function createConversation({ projectId, title, defaultAgent, defaultModel, ownerUserId = null } = {}) {
  ensureStore();
  const id = uid('conv');
  const row = {
    id,
    projectId: projectId || 'general',
    title: title || 'New chat',
    // pixbot = OpenAI-compatible API path (default). CLI agents only when user forces /opencode etc.
    defaultAgent: defaultAgent === 'pixbot' || !defaultAgent
      ? 'pixbot'
      : normalizeAgentType(defaultAgent),
    defaultModel: defaultModel || null,
    ownerUserId: ownerUserId ?? null,
    agentSessions: {}, // agentType → sessionId (warm reuse — no MCP re-bootstrap each turn)
    systemSeeded: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.conversations[id] = row;
  store.messages[id] = [];
  persist();
  return publicConversation(row);
}

function appendMessage(conversationId, partial) {
  ensureStore();
  const row = {
    id: uid('msg'),
    conversationId,
    role: partial.role,
    content: partial.content,
    kind: partial.kind || 'text',
    agentType: partial.agentType || null,
    createdAt: nowIso(),
    meta: partial.meta,
  };
  if (!store.messages[conversationId]) store.messages[conversationId] = [];
  store.messages[conversationId].push(row);
  const conv = store.conversations[conversationId];
  if (conv) {
    conv.updatedAt = row.createdAt;
    if (partial.role === 'user' && (!conv.title || conv.title === 'New chat')) {
      conv.title = String(partial.content || '').replace(/\s+/g, ' ').slice(0, 72) || conv.title;
    }
  }
  persist();
  return row;
}

/**
 * Streaming chat turn for PixBot API path.
 * Emits SSE-shaped events via onEvent({ type, ... }).
 * Types: user | delta | status | done | error
 */
export async function handleChatTurnStream({
  projectId = 'general',
  conversationId = null,
  message,
  agentType: softAgent = null,
  model: modelHint = null,
  projectPath = null,
  forceCli = false,
  scheduleTools = null,
  ownerUserId = null,
  onEvent,
}) {
  const emit = (payload) => {
    try { onEvent?.(payload); } catch { /* ignore listener errors */ }
  };

  ensureStore();
  const raw = String(message || '').trim();
  if (!raw) {
    const err = new Error('message is required');
    err.statusCode = 400;
    throw err;
  }

  let conv = conversationId ? store.conversations[conversationId] : null;
  if (ownerUserId && (!conv || Number(conv.ownerUserId) !== Number(ownerUserId))) conv = null;
  if (!conv || (projectId && conv.projectId !== projectId && projectId !== 'general')) {
    conv = store.conversations[createConversation({ projectId, defaultAgent: softAgent, ownerUserId }).id];
  }

  const routing = parseUserRouting(raw, softAgent || conv.defaultAgent);
  const model = modelHint || routing.model || conv.defaultModel || null;
  const schedule = detectScheduleIntent(routing.prompt);
  const smallTalk = looksLikeSmallTalk(routing.prompt);
  const httpModel = isPixbotHttpModel(model) || isPixbotHttpModel(modelHint);
  const actionDoIt = /\b(sen\s+yap|otomatik(?:\s+yap)?|kendin\s+yap|dosyay[ıi]\s+oluştur|dosyayi\s+olustur|uygula|implement|just\s+do\s+it|do\s+it\s+yourself|apply\s+(?:it|this)|write\s+the\s+file)\b/i.test(raw)
    || /kanka\s+bunu\s+sen|bunu\s+sen\s+yap/i.test(raw);
  let streamAgent = routing.agentType;
  // Badge / body agentType wins when client forced CLI
  if (forceCli && softAgent && isCliAgentType(softAgent)) {
    streamAgent = normalizeAgentType(softAgent);
  }
  if ((actionDoIt || forceCli) && !isCliAgentType(streamAgent)) {
    const fallback = (softAgent && isCliAgentType(softAgent) && softAgent)
      || (conv.defaultAgent && isCliAgentType(conv.defaultAgent) && conv.defaultAgent)
      || 'opencode';
    streamAgent = normalizeAgentType(fallback);
  }
  // Explicit /grok / badge / sticky CLI ALWAYS CLI — never blocked by HTTP model picker
  const stickyCli = Boolean(
    conv.defaultAgent
    && isCliAgentType(conv.defaultAgent)
    && conv.defaultAgent !== 'pixbot'
    && conv.defaultAgent !== 'local',
  );
  if (stickyCli && !isCliAgentType(streamAgent) && !smallTalk) {
    streamAgent = normalizeAgentType(conv.defaultAgent);
  }
  const explicitCli = forceCli || routing.explicitAgent || actionDoIt;
  const wantsCli = explicitCli
    || (stickyCli && !smallTalk && String(routing.prompt || '').length > 2)
    || (!httpModel && Boolean(routing.softUsed) && isCliAgentType(streamAgent) && !smallTalk && String(routing.prompt || '').length > 6);

  // CLI or real schedule → full non-stream turn (creates NanoClaw job / spawns CLI)
  if (wantsCli || schedule) {
    const cliAgent = isCliAgentType(streamAgent)
      ? streamAgent
      : (isCliAgentType(routing.agentType) ? routing.agentType : (isCliAgentType(softAgent) ? softAgent : (stickyCli ? conv.defaultAgent : 'opencode')));
    emit({ type: 'status', status: wantsCli ? `cli:${cliAgent}` : 'schedule' });
    const full = await handleChatTurn({
      projectId,
      conversationId: conv.id,
      message: raw,
      agentType: wantsCli ? cliAgent : softAgent,
      // Never feed provider::model composite ids into CLI spawns
      model: wantsCli ? null : (model || modelHint),
      projectPath,
      forceCli: wantsCli,
      scheduleTools,
    });
    const user = (full.messages || []).find((m) => m.role === 'user');
    if (user) {
      emit({ type: 'user', conversation: full.conversation, message: user });
    }
    // Stream any assistant text as one delta so UI still shows progress
    const assistant = (full.messages || []).find((m) => m.role === 'assistant');
    if (assistant?.content) {
      emit({ type: 'assistant_start', messageId: assistant.id, conversationId: conv.id });
      emit({ type: 'delta', messageId: assistant.id, conversationId: conv.id, delta: assistant.content });
    }
    emit({ type: 'done', conversation: full.conversation, messages: full.messages, mode: full.mode });
    return full;
  }

  const userMsg = appendMessage(conv.id, {
    role: 'user',
    content: raw,
    agentType: 'pixbot',
  });
  emit({
    type: 'user',
    conversation: publicConversation(store.conversations[conv.id]),
    message: publicMessage(userMsg),
  });

  const { text: promptWithFiles, files } = resolveFileMentions(routing.prompt, projectPath);
  const creds = await getPixbotCredentials().catch(() => null);
  if (!creds) {
    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: 'Provider yok. Provider ekle (API key opsiyonel) — modeller otomatik çekilir.',
      kind: 'error',
      agentType: 'pixbot',
    });
    const payload = {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      mode: 'error',
    };
    emit({ type: 'done', ...payload });
    return payload;
  }

  emit({ type: 'status', status: 'thinking', provider: creds.name || creds.source });

  const historyMsgs = (store.messages[conv.id] || [])
    .filter((m) => m.id !== userMsg.id)
    .slice(-20)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: String(m.content || '').slice(0, 8000),
    }))
    .filter((m) => m.content);

  let scanContext = '';
  if (projectPath) {
    try { scanContext = await buildProjectScanContext(projectPath); } catch { /* ignore */ }
  }

  const llmMessages = [
    {
      role: 'system',
      content: buildPixbotSystemPrompt({
        projectId: conv.projectId,
        projectPath,
        scanContext,
      }),
    },
    ...historyMsgs,
    { role: 'user', content: promptWithFiles || routing.prompt },
  ];

  const streamMsgId = `stream-${crypto.randomUUID()}`;
  emit({
    type: 'assistant_start',
    messageId: streamMsgId,
    conversationId: conv.id,
  });

  try {
    const completion = await streamPixbotChatCompletion({
      messages: llmMessages,
      model: model || conv.defaultModel || undefined,
      onDelta: (chunk) => {
        emit({
          type: 'delta',
          messageId: streamMsgId,
          conversationId: conv.id,
          delta: chunk,
        });
      },
    });

    if (model) {
      conv.defaultModel = model;
      store.conversations[conv.id] = conv;
      persist();
    }

    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: completion.content,
      kind: 'text',
      agentType: 'pixbot',
      meta: {
        model: completion.model,
        usage: completion.usage,
        files: files?.length ? files : undefined,
        mode: 'api',
        scanned: Boolean(scanContext),
        providerId: completion.providerId,
        providerName: completion.providerName,
      },
    });

    const payload = {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      mode: 'api',
      agentType: 'pixbot',
      model: completion.model,
    };
    emit({ type: 'done', ...payload, messageId: streamMsgId });
    return payload;
  } catch (apiError) {
    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: `PixBot API hatası: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
      kind: 'error',
      agentType: 'pixbot',
    });
    const payload = {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      mode: 'error',
    };
    emit({ type: 'error', error: apiError instanceof Error ? apiError.message : String(apiError), ...payload });
    return payload;
  }
}

/**
 * Main chat turn. Returns UI-shaped payload (conversation + new messages).
 */
export async function handleChatTurn({
  projectId = 'general',
  conversationId = null,
  message,
  agentType: softAgent = null,
  model: modelHint = null,
  projectPath = null,
  scheduleTools = null, // optional { toolScheduleTask, toolContext }
  forceCli = false,
  ownerUserId = null,
}) {
  ensureStore();
  const raw = String(message || '').trim();
  if (!raw) {
    const err = new Error('message is required');
    err.statusCode = 400;
    throw err;
  }

  let conv = conversationId ? store.conversations[conversationId] : null;
  if (ownerUserId && (!conv || Number(conv.ownerUserId) !== Number(ownerUserId))) conv = null;
  if (!conv || (projectId && conv.projectId !== projectId && projectId !== 'general')) {
    conv = store.conversations[createConversation({ projectId, defaultAgent: softAgent, ownerUserId }).id];
  }

  const routing = parseUserRouting(raw, softAgent || conv.defaultAgent);
  let agentType = routing.agentType;
  // Prefer body agentType when client forced a CLI agent (composer badge)
  if (forceCli && softAgent && isCliAgentType(softAgent)) {
    agentType = normalizeAgentType(softAgent);
  }
  const model = modelHint || routing.model || conv.defaultModel || null;
  const schedule = detectScheduleIntent(routing.prompt);
  const smallTalk = looksLikeSmallTalk(routing.prompt);
  // Dropdown models like `cerebras-xxx::zai-glm-4.7` are HTTP picker ids.
  // They must NOT block an explicit /grok or badge request — only soft follow-ups.
  const httpModel = isPixbotHttpModel(model) || isPixbotHttpModel(modelHint);
  // "sen yap / otomatik yap / dosyayı oluştur" → must run a real agent, not paste instructions
  const actionDoIt = /\b(sen\s+yap|otomatik(?:\s+yap)?|kendin\s+yap|dosyay[ıi]\s+oluştur|dosyayi\s+olustur|uygula|implement|just\s+do\s+it|do\s+it\s+yourself|apply\s+(?:it|this)|write\s+the\s+file)\b/i.test(raw)
    || /kanka\s+bunu\s+sen|bunu\s+sen\s+yap/i.test(raw);
  const explicitCli = forceCli || routing.explicitAgent || actionDoIt;
  if ((actionDoIt || forceCli) && (!agentType || agentType === 'pixbot' || agentType === 'local')) {
    // Only fall back to a real CLI agent name — never "pixbot"
    const fallback = (softAgent && isCliAgentType(softAgent) && softAgent)
      || (conv.defaultAgent && isCliAgentType(conv.defaultAgent) && conv.defaultAgent)
      || 'opencode';
    agentType = normalizeAgentType(fallback);
  }
  // Sticky CLI: once user used /grok (or any CLI) in this chat, keep that agent
  // for follow-ups until they explicitly switch agent.
  const stickyCli = Boolean(
    conv.defaultAgent
    && isCliAgentType(conv.defaultAgent)
    && conv.defaultAgent !== 'pixbot'
    && conv.defaultAgent !== 'local',
  );
  if (stickyCli && (!agentType || agentType === 'pixbot' || agentType === 'local') && !smallTalk) {
    agentType = normalizeAgentType(conv.defaultAgent);
  }

  // Explicit / badge / forceCli / sticky CLI ALWAYS CLI.
  // HTTP picker model must NEVER block an explicit or sticky CLI agent.
  const wantsCli = explicitCli
    || (stickyCli && !smallTalk && String(routing.prompt || '').length > 2)
    || (!httpModel && Boolean(routing.softUsed) && isCliAgentType(agentType) && !smallTalk && String(routing.prompt || '').length > 6);

  // Remember last explicit/sticky CLI agent for follow-ups ("devam et", "şimdi şunu yap")
  if ((routing.explicitAgent || wantsCli) && agentType && agentType !== 'pixbot' && isCliAgentType(agentType)) {
    conv.defaultAgent = agentType;
    // Only store CLI-native model ids — never provider::model
    if (model && !isPixbotHttpModel(model)) conv.defaultModel = model;
    else if (isPixbotHttpModel(conv.defaultModel)) conv.defaultModel = null;
    store.conversations[conv.id] = conv;
    persist();
  }
  // Persist HTTP model only for pure PixBot API turns (no CLI this turn)
  if (!wantsCli && httpModel && model) {
    conv.defaultModel = model;
    if (!stickyCli) conv.defaultAgent = 'pixbot';
    store.conversations[conv.id] = conv;
    persist();
  }

  const userMsg = appendMessage(conv.id, {
    role: 'user',
    content: raw,
    agentType: wantsCli ? agentType : 'pixbot',
  });

  // Explicit schedule intent → real NanoClaw schedule (not a fake chat reply)
  if (schedule && scheduleTools?.toolScheduleTask && !smallTalk) {
    let schedule_value = schedule.schedule_value;
    if (schedule.schedule_type === 'once' && !schedule_value) {
      const d = new Date(Date.now() + 60_000);
      schedule_value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    }
    // Work body: schedule-stripped prompt (never the full "saat 17.15 te çalışsın" sentence)
    const workBody = stripScheduleIntentFromPrompt(schedule.prompt || routing.prompt || raw);
    // Embed CLI agent only. NEVER embed HTTP provider::model into the job.
    const agentForJob = (wantsCli || (agentType && agentType !== 'pixbot' && isCliAgentType(agentType)))
      ? normalizeAgentType(agentType)
      : (stickyCli ? normalizeAgentType(conv.defaultAgent) : null);
    const cliModel = model && !isPixbotHttpModel(model) ? model : null;
    // Tag originating conversation so result posts back here — not new spam chats
    const schedulePrompt = [
      agentForJob ? `[agent:${agentForJob}${cliModel ? ` model:${cliModel}` : ''}]` : null,
      `[pixconv:${conv.id}]`,
      workBody,
    ].filter(Boolean).join(' ');

    const result = await scheduleTools.toolScheduleTask(
      {
        prompt: schedulePrompt,
        schedule_type: schedule.schedule_type,
        schedule_value,
        context_mode: 'isolated',
      },
      scheduleTools.toolContext,
    );
    const ok = !result?.isError;
    const detail = result?.content?.[0]?.text || '';
    const taskIdMatch = String(detail).match(/Task\s+(task-[\w-]+)/i);
    const scheduledTaskId = taskIdMatch?.[1] || null;
    const text = ok
      ? [
          `✅ **Zamanlandı** (${schedule.schedule_type})`,
          schedule_value ? `- **Ne zaman:** \`${schedule_value}\`` : null,
          agentForJob ? `- **Agent:** \`${agentForJob}\`${cliModel ? ` · model \`${cliModel}\`` : ' · CLI default'}` : null,
          `- **İş:** ${workBody.slice(0, 160)}${workBody.length > 160 ? '…' : ''}`,
          scheduledTaskId ? `- **Görev ID:** \`${scheduledTaskId}\`` : null,
          '',
          '_Görev kaydedildi. **Görevler** panelinden izle. Tek seferlik bitince arşivlenir; sonuç bu sohbete düşer._',
        ].filter(Boolean).join('\n')
      : (detail || 'Schedule oluşturulamadı.');
    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: text,
      kind: ok ? 'system' : 'error',
      agentType: agentForJob || 'pixbot',
      meta: {
        scheduled: ok,
        taskId: scheduledTaskId,
        schedule: {
          ...schedule,
          schedule_value,
          agent: agentForJob,
          model: cliModel,
          workPrompt: workBody,
          conversationId: conv.id,
        },
      },
    });
    return {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      proposals: [],
      tasks: scheduledTaskId ? [{ id: scheduledTaskId }] : [],
      mode: 'schedule',
    };
  }

  let { text: promptWithFiles, files } = resolveFileMentions(routing.prompt, projectPath);

  // CLI analysis: auto-attach composer.json / DESIGN.md / README so agent never asks to paste
  if (wantsCli && projectPath) {
    const needsContext = /analiz|analyze|review|tara|scan|incele|mimar|structure|proje/i.test(routing.prompt)
      || !files?.some((f) => f.content);
    if (needsContext) {
      const auto = autoAttachProjectContext(projectPath);
      if (auto.files?.length) {
        files = [...(files || []), ...auto.files];
        const extra = auto.text.includes('<attached_files>')
          ? auto.text.slice(auto.text.indexOf('<attached_files>'))
          : '';
        if (extra) {
          promptWithFiles = `${promptWithFiles || routing.prompt}\n\n${extra}`;
        }
      }
    }
  }

  // ── Primary path: OpenAI-compatible API (PixBot) ─────────────────────
  // Only when user did NOT request a CLI agent. /grok /opencode must never hit Cerebras.
  if (!wantsCli) {
    const creds = await getPixbotCredentials().catch(() => null);
    if (creds) {
      const historyMsgs = (store.messages[conv.id] || [])
        .filter((m) => m.id !== userMsg.id)
        .slice(-20)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: String(m.content || '').slice(0, 8000),
        }))
        .filter((m) => m.content);

      try {
        // Auto project scan for ChatGPT-like workspace awareness (dirs, package.json, README).
        let scanContext = '';
        if (!smallTalk && projectPath) {
          try {
            scanContext = await buildProjectScanContext(projectPath);
          } catch { /* ignore */ }
        }

        const llmMessages = [
          {
            role: 'system',
            content: buildPixbotSystemPrompt({
              projectId: conv.projectId,
              projectPath,
              scanContext,
            }),
          },
          ...historyMsgs,
          { role: 'user', content: promptWithFiles || routing.prompt },
        ];

        const completion = await pixbotChatCompletion({
          messages: llmMessages,
          model: model || conv.defaultModel || undefined,
        });
        if (model) {
          conv.defaultModel = model;
          store.conversations[conv.id] = conv;
          persist();
        }
        const assistantMsg = appendMessage(conv.id, {
          role: 'assistant',
          content: completion.content,
          kind: 'text',
          agentType: 'pixbot',
          meta: {
            model: completion.model,
            usage: completion.usage,
            files: files?.length ? files : undefined,
            mode: 'api',
            scanned: Boolean(scanContext),
          },
        });
        return {
          conversation: publicConversation(store.conversations[conv.id]),
          messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
          proposals: [],
          tasks: [],
          mode: 'api',
          agentType: 'pixbot',
          model: completion.model,
        };
      } catch (apiError) {
        // Fall through to local smalltalk / CLI only if API hard-fails and no explicit CLI
        if (smallTalk) {
          const reply = localSmallTalkReply(routing.prompt, 'pixbot');
          const assistantMsg = appendMessage(conv.id, {
            role: 'assistant',
            content: `${reply}\n\n_(API: ${apiError instanceof Error ? apiError.message : String(apiError)})_`,
            kind: 'text',
            agentType: 'pixbot',
          });
          return {
            conversation: publicConversation(store.conversations[conv.id]),
            messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
            proposals: [],
            tasks: [],
            mode: 'chat',
            agentType: 'pixbot',
          };
        }
        const assistantMsg = appendMessage(conv.id, {
          role: 'assistant',
          content: `PixBot API hatası: ${apiError instanceof Error ? apiError.message : String(apiError)}\n\nProvider (Custom / catalog) ve model seçimini kontrol et. API key yerel sunucularda zorunlu değil.`,
          kind: 'error',
          agentType: 'pixbot',
        });
        return {
          conversation: publicConversation(store.conversations[conv.id]),
          messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
          proposals: [],
          tasks: [],
          mode: 'error',
          agentType: 'pixbot',
        };
      }
    }
  }

  // Casual chat without API key — local only
  if (smallTalk && !wantsCli) {
    const reply = localSmallTalkReply(routing.prompt, agentType);
    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: `${reply}\n\n_API key yoksa Settings → PixBot LLM ile OpenAI-uyumlu endpoint bağla (key + base URL). Sonra modeller /v1/models ile gelir._`,
      kind: 'text',
      agentType: 'local',
      meta: { mode: 'smalltalk' },
    });
    return {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      proposals: [],
      tasks: [],
      mode: 'chat',
      agentType: 'local',
    };
  }

  // Explicit CLI path (/opencode, /claude, /grok, badge chip + forceCli, …)
  // IMPORTANT: never fall back to PixBot HTTP here. HTTP recovery was incorrectly
  // triggered when the UI model picker still held a provider::model id, so /grok
  // and agent badges answered via Cerebras instead of spawning the CLI.
  if (!isCliAgentType(agentType) || agentType === 'pixbot') {
    if (softAgent && isCliAgentType(softAgent)) {
      agentType = normalizeAgentType(softAgent);
    } else if (conv.defaultAgent && isCliAgentType(conv.defaultAgent)) {
      agentType = normalizeAgentType(conv.defaultAgent);
    } else if (routing.agentType && isCliAgentType(routing.agentType)) {
      agentType = normalizeAgentType(routing.agentType);
    } else {
      agentType = 'opencode';
    }
  }

  const history = (store.messages[conv.id] || [])
    .slice(-8)
    .filter((m) => m.id !== userMsg.id && m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 500)}`)
    .join('\n');

  let scanContext = '';
  if (projectPath) {
    try {
      const { buildProjectScanContext } = await import('./pixbot-llm.js');
      scanContext = await buildProjectScanContext(projectPath);
    } catch { /* ignore */ }
  }

  const preamble = buildSystemPreamble({
    projectId: conv.projectId,
    projectPath,
    agentType,
    isSmallTalk: false,
  });

  const fullPrompt = [
    preamble,
    '',
    'CRITICAL: Do real work. Do NOT ask the user to paste composer.json / DESIGN.md / file contents.',
    'Workspace context is already attached below when available. Read it and answer concretely.',
    'If you can run tools/shell, use them. Prefer implementing over instructing.',
    '',
    history ? `Prior chat (brief):\n${history}\n` : '',
    scanContext || '',
    promptWithFiles || routing.prompt,
  ].filter(Boolean).join('\n\n').trim();

  const sessionId = conv.agentSessions?.[agentType] || undefined;
  const groupFolder = String(conv.projectId || 'general').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

  // CLI runners only accept native model ids — never provider::model composites
  const cliModel = isPixbotHttpModel(model) ? undefined : (model || undefined);

  const run = await runPixcodeMultiAgent({
    prompt: fullPrompt || routing.prompt,
    groupFolder,
    sessionId,
    agentType,
    model: cliModel,
    projectPath,
    isScheduledTask: false,
  });

  if (run.newSessionId || isCliAgentType(agentType)) {
    conv.agentSessions = conv.agentSessions || {};
    if (run.newSessionId) conv.agentSessions[agentType] = run.newSessionId;
    conv.defaultAgent = agentType;
    conv.systemSeeded = true;
    store.conversations[conv.id] = conv;
    persist();
  }

  const replyText = run.status === 'success'
    ? (run.result || '…')
    : [
        `CLI hata (**${agentType}**): ${run.error || 'unknown'}`,
        '',
        agentType === 'grok'
          ? 'Grok CLI yoksa: https://x.ai/cli  (`curl -fsSL https://x.ai/cli/install.sh | bash`)'
          : 'CLI kurulu mu kontrol et. PixBot HTTP sohbeti için `/grok` kullanma — o yol agent spawn eder.',
        run.cwd ? `cwd: \`${run.cwd}\`` : null,
      ].filter(Boolean).join('\n');

  const assistantMsg = appendMessage(conv.id, {
    role: 'assistant',
    content: replyText,
    kind: run.status === 'success' ? 'text' : 'error',
    agentType,
    meta: {
      provider: run.provider || agentType,
      model: run.model || model,
      cwd: run.cwd,
      files: files?.length ? files : undefined,
      sessionContinued: Boolean(sessionId),
      mode: 'cli',
    },
  });

  return {
    conversation: publicConversation(store.conversations[conv.id]),
    messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
    proposals: [],
    tasks: [],
    mode: 'cli',
    agentType,
  };
}

export function chatHelpHints() {
  return {
    tips: [
      'Normal chat — write anything; reply is conversational (any language).',
      'Agent switch: /opencode  /claude  /grok  — or “bunu codex ile yap”',
      'Files: @src/app.ts  (contents attached when under project root)',
      'Schedule only when you ask: “her gün saat 9 bağımlılık kontrolü”',
      'Sessions stay warm per conversation+agent (no re-bootstrap each message).',
      'Scheduled task output: Görevler panel → Biten → open task (Sonuç), and also posted into this chat.',
    ],
    agents: MULTI_CLI_AGENTS,
  };
}

/**
 * Deliver a finished scheduled-task result into ONE existing PixBot conversation.
 * Never spawns extra chats. Prefer [pixconv:id] from the job prompt, else latest for project.
 */
export function postScheduledTaskResult({
  projectId = 'general',
  jid = null,
  text = '',
  taskId = null,
  agentType = null,
  conversationId = null,
  prompt = null,
  // Non-admin NanoClaw task groups are namespaced as `u<userId>_<project>`.
  // The scheduler callback can therefore carry the task owner's identity so
  // a user-supplied [pixconv:<id>] tag cannot redirect output into another
  // user's conversation.
  ownerUserId = null,
} = {}) {
  ensureStore();
  let body = String(text || '').trim();
  if (!body) return null;

  // Ignore echoes of the job prompt / specialty junk (bad historical runs)
  if (/^\s*\[Task specialty=/i.test(body) || /Plan and implement across the workspace/i.test(body)) {
    return { conversation: null, message: null, deduped: true, skipped: 'specialty_echo' };
  }

  // Resolve conversation from tag in job prompt if present
  let convId = conversationId;
  if (!convId && prompt) {
    const m = String(prompt).match(/\[pixconv:([^\]]+)\]/i);
    if (m) convId = m[1].trim();
  }
  // Also allow body to carry the tag (strip it)
  const bodyConv = body.match(/\[pixconv:([^\]]+)\]/i);
  if (bodyConv) {
    if (!convId) convId = bodyConv[1].trim();
    body = body.replace(/\[pixconv:[^\]]+\]/gi, '').trim();
  }

  const ownerScopeProvided = ownerUserId !== null && ownerUserId !== undefined;
  const normalizedOwnerUserId = Number.isSafeInteger(Number(ownerUserId)) && Number(ownerUserId) > 0
    ? Number(ownerUserId)
    : null;
  let conv = convId ? store.conversations[convId] : null;

  // A conversation id is not an authorization token.  Scheduled jobs may
  // contain user-authored prompt text, so always enforce the owner carried by
  // the task's namespaced group before appending a result.
  if (conv && (
    (normalizedOwnerUserId === null && ownerScopeProvided)
    || (normalizedOwnerUserId !== null && Number(conv.ownerUserId) !== normalizedOwnerUserId)
  )) {
    conv = null;
  }

  if (!conv) {
    let pid = projectId;
    if ((!pid || pid === 'general') && jid && String(jid).startsWith('pixcode:project:')) {
      pid = String(jid).slice('pixcode:project:'.length) || 'general';
    }
    const folder = String(pid).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
    conv = Object.values(store.conversations)
      .filter((c) => {
        const cPid = String(c.projectId || 'general');
        const cFolder = cPid.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
        const ownerMatches = normalizedOwnerUserId !== null
          ? Number(c.ownerUserId) === normalizedOwnerUserId
          : !ownerScopeProvided;
        return ownerMatches && (cPid === pid || cFolder === folder || cPid === folder);
      })
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
  }

  // CRITICAL: never open a new chat for task results (was creating 3–4 spam threads)
  if (!conv) {
    console.warn('[pixbot] task result dropped — no existing conversation for project', projectId || jid);
    return { conversation: null, message: null, deduped: true, skipped: 'no_conversation' };
  }

  const header = taskId
    ? `✅ **Zamanlanmış görev bitti** (\`${taskId}\`)`
    : '✅ **Zamanlanmış görev bitti**';
  const content = `${header}\n\n${body}\n\n_Detay: **Görevler** → Biten (tek seferlik arşivlenir)._`;

  // Dedupe by taskId or identical body (scheduler may emit result more than once)
  const recent = (store.messages[conv.id] || []).slice(-12);
  const already = recent.some((m) => {
    if (m.role !== 'assistant' || m.kind !== 'task_result') return false;
    if (taskId && m.meta?.taskId === taskId) return true;
    return String(m.content || '').includes(body.slice(0, 80));
  });
  if (already) {
    return {
      conversation: publicConversation(conv),
      message: null,
      deduped: true,
    };
  }

  const row = appendMessage(conv.id, {
    role: 'assistant',
    content,
    kind: 'task_result',
    agentType: agentType || 'pixbot',
    meta: {
      scheduledResult: true,
      taskId: taskId || undefined,
      jid: jid || undefined,
    },
  });

  return {
    conversation: publicConversation(store.conversations[conv.id]),
    message: publicMessage(row),
    deduped: false,
  };
}

/** Instant local reply for greetings — no CLI spawn, no API keys. */
function localSmallTalkReply(text, agentType) {
  const t = String(text || '').trim().toLowerCase();
  if (/teşekkür|tesekkur|thanks|thank you|sağol|sagol/.test(t)) {
    return 'Rica ederim! Kod, dosya veya plan için yazman yeterli.';
  }
  if (/günaydın|iyi akşamlar|iyi geceler|good morning|good evening|good night/.test(t)) {
    return 'Sana da! Ne üzerinde çalışalım?';
  }
  if (/nasılsın|nasilsin|how are you|ne haber/.test(t)) {
    return 'İyiyim, hazırım. İstersen bir dosyaya bakayım, bug fix yapayım veya plan çıkarayım — ne diyorsun?';
  }
  // Default greeting
  const agentHint = agentType && agentType !== 'claude-code'
    ? ` (tercih: ${agentType} — /opencode /claude /grok ile değiştirebilirsin)`
    : '';
  return `Selam! Ben NanoClaw${agentHint}. Kısa sohbet veya doğrudan iş: “@src/app.ts şunu düzelt”, “/opencode test yaz”, “her gün 9’da audit” — nasıl istersen.`;
}
