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
  getPixbotCredentials,
  pixbotChatCompletion,
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
export function parseUserRouting(rawText, softDefaultAgent = null) {
  let text = String(rawText || '').trim();
  let agentType = null;
  let model = null;

  // Slash (preferred short forms): /opencode  /claude  /grok
  // Legacy still accepted: /agent-opencode  /agent:codex  /agent opencode
  const slash = text.match(
    /^\s*\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b\s*/i,
  );
  if (slash) {
    agentType = normalizeAgentType(slash[1]);
    text = text.slice(slash[0].length).trim();
  }

  // Bracket directive already handled by multi-runner; peel here for UI cleanliness
  const bracket = parseAgentDirective(text);
  if (bracket.agentType) {
    agentType = bracket.agentType;
    model = bracket.model;
    text = bracket.prompt;
  }

  // Natural language (TR / EN / mixed) — only if no explicit agent yet
  if (!agentType) {
    const nl = text.match(
      /(?:\b(?:use|with|via|run\s+on|let)\s+)?(opencode|codex|claude(?:\s*code)?|gemini|cursor|qwen|grok(?:\s*build)?)\s*(?:ile|ile\s+yap|yapsın|yapsin|yap|ki\s+yapsın|should\s+(?:do|handle)|to\s+(?:do|handle))\b/i,
    )
      || text.match(
        /^(?:bunu|şunu|sunu|this|that)?\s*(opencode|codex|claude|gemini|cursor|qwen|grok)\s*(?:ile|yapsın|yapsin)/i,
      );
    if (nl) {
      agentType = normalizeAgentType(nl[1].replace(/\s*code/i, ''));
    }
  }

  if (!agentType && softDefaultAgent && softDefaultAgent !== 'pixbot' && softDefaultAgent !== 'local') {
    agentType = normalizeAgentType(softDefaultAgent);
  }

  return {
    // No soft CLI default — PixBot API is primary; CLI only when explicitly chosen.
    agentType: agentType || 'pixbot',
    model,
    prompt: text || String(rawText || '').trim(),
    explicitAgent: Boolean(slash || bracket.agentType),
  };
}

/**
 * Detect if user wants a deferred/recurring schedule (not a normal chat turn).
 */
export function detectScheduleIntent(text) {
  const t = String(text || '');
  if (!t.trim()) return null;

  // Cron-ish natural language (TR + EN)
  const daily = t.match(
    /(?:her\s+g[uü]n|every\s+day|daily|g[uü]nl[uü]k)\s*(?:saat\s*)?(\d{1,2})(?::(\d{2}))?/i,
  );
  if (daily) {
    const h = String(Number(daily[1])).padStart(2, '0');
    const m = String(Number(daily[2] || 0)).padStart(2, '0');
    return {
      schedule_type: 'cron',
      schedule_value: `${Number(m)} ${Number(h)} * * *`,
      prompt: t,
    };
  }

  const hourly = t.match(/(?:her\s+saat|every\s+hour|hourly)/i);
  if (hourly) {
    return { schedule_type: 'cron', schedule_value: '0 * * * *', prompt: t };
  }

  const everyN = t.match(/(?:her|every)\s+(\d+)\s*(dakika|minute|min|saat|hour)/i);
  if (everyN) {
    const n = Number(everyN[1]);
    const unit = everyN[2].toLowerCase();
    const ms = /saat|hour/.test(unit) ? n * 3600000 : n * 60000;
    return { schedule_type: 'interval', schedule_value: String(ms), prompt: t };
  }

  if (/\b(schedule|zamanla|planla|cron)\b/i.test(t) && /\b(\d{1,2}:\d{2}|yarın|tomorrow|hafta|week)\b/i.test(t)) {
    return { schedule_type: 'once', schedule_value: '', prompt: t };
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
  for (const rel of [...new Set(mentions)].slice(0, 12)) {
    const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(projectPath, rel);
    try {
      if (!abs.startsWith(path.resolve(projectPath)) && !path.isAbsolute(rel)) continue;
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 200_000) {
        files.push({ path: rel, note: st.isDirectory() ? 'directory' : 'too large / skip' });
        continue;
      }
      const content = fs.readFileSync(abs, 'utf8');
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

export function listConversations(projectId) {
  ensureStore();
  return Object.values(store.conversations)
    .filter((c) => !projectId || c.projectId === projectId || (projectId === 'general' && !c.projectId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(publicConversation);
}

export function getMessages(conversationId) {
  ensureStore();
  return (store.messages[conversationId] || []).map(publicMessage);
}

export function createConversation({ projectId, title, defaultAgent, defaultModel } = {}) {
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
}) {
  ensureStore();
  const raw = String(message || '').trim();
  if (!raw) {
    const err = new Error('message is required');
    err.statusCode = 400;
    throw err;
  }

  let conv = conversationId ? store.conversations[conversationId] : null;
  if (!conv || (projectId && conv.projectId !== projectId && projectId !== 'general')) {
    conv = store.conversations[createConversation({ projectId, defaultAgent: softAgent }).id];
  }

  const routing = parseUserRouting(raw, softAgent || conv.defaultAgent);
  const agentType = routing.agentType;
  const model = modelHint || routing.model || conv.defaultModel || null;
  const schedule = detectScheduleIntent(routing.prompt);
  const smallTalk = looksLikeSmallTalk(routing.prompt);
  // Explicit CLI force: /opencode … still routes multi-CLI when user asks
  const wantsCli = forceCli || routing.explicitAgent;

  const userMsg = appendMessage(conv.id, {
    role: 'user',
    content: raw,
    agentType: wantsCli ? agentType : 'pixbot',
  });

  // Explicit schedule intent → nanoclaw scheduler only (still a chat reply)
  if (schedule && scheduleTools?.toolScheduleTask && !smallTalk) {
    let schedule_value = schedule.schedule_value;
    if (schedule.schedule_type === 'once' && !schedule_value) {
      const d = new Date(Date.now() + 60_000);
      schedule_value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    }
    const result = await scheduleTools.toolScheduleTask(
      {
        prompt: routing.prompt,
        schedule_type: schedule.schedule_type,
        schedule_value,
        context_mode: 'isolated',
      },
      scheduleTools.toolContext,
    );
    const text = result?.isError
      ? (result.content?.[0]?.text || 'Could not create schedule.')
      : (result.content?.[0]?.text || `OK — scheduled (${schedule.schedule_type}).`);
    const assistantMsg = appendMessage(conv.id, {
      role: 'assistant',
      content: text,
      kind: result?.isError ? 'error' : 'system',
      agentType: 'pixbot',
      meta: { scheduled: !result?.isError, schedule },
    });
    return {
      conversation: publicConversation(store.conversations[conv.id]),
      messages: [publicMessage(userMsg), publicMessage(assistantMsg)],
      proposals: [],
      tasks: [],
      mode: 'schedule',
    };
  }

  const { text: promptWithFiles, files } = resolveFileMentions(routing.prompt, projectPath);

  // ── Primary path: OpenAI-compatible API (PixBot) ─────────────────────
  // Preferred over CLI spawn — user configures key + base URL; models from /v1/models.
  if (!wantsCli) {
    const creds = await getPixbotCredentials().catch(() => null);
    if (creds) {
      const historyMsgs = (store.messages[conv.id] || [])
        .filter((m) => m.id !== userMsg.id)
        .slice(-16)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: String(m.content || '').slice(0, 8000),
        }))
        .filter((m) => m.content);

      const llmMessages = [
        {
          role: 'system',
          content: buildPixbotSystemPrompt({ projectId: conv.projectId, projectPath }),
        },
        ...historyMsgs,
        { role: 'user', content: promptWithFiles || routing.prompt },
      ];

      try {
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
          content: `PixBot API hatası: ${apiError instanceof Error ? apiError.message : String(apiError)}\n\nSettings → PixBot LLM (API key + base URL) kontrol et. Model listesi /v1/models üzerinden gelir.`,
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

  // Explicit CLI path (/opencode, /claude, …) when user forces it
  const history = (store.messages[conv.id] || [])
    .slice(-8)
    .filter((m) => m.id !== userMsg.id && m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 500)}`)
    .join('\n');

  const fullPrompt = [
    history ? `Prior chat (brief):\n${history}\n` : '',
    promptWithFiles,
  ].filter(Boolean).join('\n\n').trim();

  const sessionId = conv.agentSessions?.[agentType] || undefined;
  const groupFolder = String(conv.projectId || 'general').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

  const run = await runPixcodeMultiAgent({
    prompt: fullPrompt || routing.prompt,
    groupFolder,
    sessionId,
    agentType,
    model,
    projectPath,
    isScheduledTask: false,
  });

  if (run.newSessionId) {
    conv.agentSessions = conv.agentSessions || {};
    conv.agentSessions[agentType] = run.newSessionId;
    conv.defaultAgent = agentType;
    conv.systemSeeded = true;
    store.conversations[conv.id] = conv;
    persist();
  }

  const replyText = run.status === 'success'
    ? (run.result || '…')
    : `CLI hata (${agentType}): ${run.error || 'unknown'}\n\nİpucu: PixBot için Settings’te API key bağla; chat API üzerinden gider. CLI sadece /opencode /claude ile zorlanır.`;

  const assistantMsg = appendMessage(conv.id, {
    role: 'assistant',
    content: replyText,
    kind: run.status === 'success' ? 'text' : 'error',
    agentType,
    meta: {
      provider: run.provider,
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
    ],
    agents: MULTI_CLI_AGENTS,
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
