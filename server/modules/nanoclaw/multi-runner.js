/**
 * Pixcode multi-CLI runner for NanoClaw schedules/agents.
 * When embedded, NanoClaw can route work to Claude SDK (default) OR any
 * Pixcode provider: claude-code, codex, gemini, cursor, qwen, opencode, grok.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import {
  executeTaskWithProvider,
  getTaskProviderId,
} from '../../services/task-runtime.js';

const VALID = new Set([
  'claude-code',
  'claude',
  'codex',
  'gemini',
  'cursor',
  'qwen',
  'opencode',
  'grok',
  'grok-build',
]);

export function normalizeAgentType(raw) {
  const value = String(raw || 'claude-code').toLowerCase().trim();
  // HTTP chat brand — never treat as a CLI binary
  if (value === 'pixbot' || value === 'local') return 'claude-code';
  if (value === 'claude') return 'claude-code';
  if (value === 'grok-build' || value === 'xai-grok' || value === 'spacexai') return 'grok';
  if (VALID.has(value)) return value === 'claude' ? 'claude-code' : value;
  return 'claude-code';
}

/**
 * Parse optional provider directive from prompt:
 *   [agent:codex] do the thing
 *   [provider:gemini model:xxx] ...
 *   /opencode do the thing   (preferred short form)
 *   /claude  /codex  /grok
 *   /agent-opencode …        (legacy)
 */
export function parseAgentDirective(prompt) {
  let text = String(prompt || '');
  let agentType = null;
  let model = null;
  let conversationId = null;

  const slash = text.match(
    /^\s*\/(?:agent[-:\s]+)?(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b(?:\s+model[:=](\S+))?\s*/i,
  );
  if (slash) {
    agentType = normalizeAgentType(slash[1]);
    model = slash[2] ? slash[2].trim() : null;
    text = text.slice(slash[0].length);
  }

  // Multiple leading bracket tags: [agent:…] [pixconv:…]
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
  // Strip stray pixconv tags mid-prompt
  text = text.replace(/\[pixconv:[^\]]+\]/gi, ' ').replace(/\s+/g, ' ').trim();

  // Never pass HTTP composite models into CLI runners
  if (model && String(model).includes('::')) model = null;

  if (!agentType && !conversationId) {
    return { agentType: null, model: null, conversationId: null, prompt: text.trim() };
  }
  return {
    agentType,
    model,
    conversationId,
    prompt: text.trim(),
  };
}

function resolveCwd(groupFolder, projectPathHint) {
  if (projectPathHint && fs.existsSync(projectPathHint)) return projectPathHint;
  // NanoClaw group folder may be a project name — try common roots
  const home = os.homedir();
  const candidates = [
    projectPathHint,
    path.join(home, 'pixcode', 'projects', groupFolder),
    path.join(home, groupFolder),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch { /* ignore */ }
  }
  // General / non-coding assistant: use a scratch workspace. Never fall back
  // to process.cwd(): in a daemon this is the Pixcode server checkout, which
  // would let a missing/expired project path execute an agent against the
  // host application itself.
  const general = path.join(
    process.env.PIXCODE_HOME || path.join(home, '.pixcode'),
    'nanoclaw',
    'workspaces',
    groupFolder || 'general',
  );
  fs.mkdirSync(general, { recursive: true });
  return general;
}

/**
 * Run a NanoClaw scheduled/agent prompt via Pixcode multi-CLI runtime.
 * @returns {{ status, result, newSessionId?, error? }}
 */
export async function runPixcodeMultiAgent({
  prompt,
  groupFolder,
  sessionId,
  agentType: agentTypeHint,
  model: modelHint,
  projectPath,
  isScheduledTask,
  onLog,
}) {
  const parsed = parseAgentDirective(prompt);
  const agentType = normalizeAgentType(agentTypeHint || parsed.agentType || 'claude-code');
  const model = modelHint || parsed.model || undefined;
  const cleanPrompt = parsed.prompt || prompt;
  const cwd = resolveCwd(groupFolder, projectPath);

  // Strip HTTP composite models (provider::model) — they are for PixBot API only,
  // never for CLI agents. Scheduled jobs often wrongly stored the chat picker model.
  const cliSafeModel = model && !String(model).includes('::') ? model : undefined;

  // Never inject "[Task specialty=fullstack] Plan and implement…" for NanoClaw.
  // That prefix made scheduled jobs re-run the raw schedule sentence as a "fullstack"
  // implement task instead of the user's real instruction (analyze / fix / etc.).
  const task = {
    id: `nc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    agentType,
    model: cliSafeModel,
    prompt: cleanPrompt,
    title: isScheduledTask ? `Schedule: ${cleanPrompt.slice(0, 48)}` : cleanPrompt.slice(0, 64),
    projectPath: cwd,
    projectId: groupFolder || 'general',
    role: undefined,
    chatMode: true,
    permissionMode: 'acceptEdits',
    continueSession: Boolean(sessionId),
    sessionId: sessionId || undefined,
  };

  try {
    const result = await executeTaskWithProvider(task, {
      onLog: (level, message) => onLog?.(level, message),
      onSession: () => {},
    });
    return {
      status: 'success',
      result: result.summary || result.result || 'Done.',
      newSessionId: result.sessionId || undefined,
      model: result.model,
      provider: getTaskProviderId(agentType),
      cwd,
    };
  } catch (error) {
    return {
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : String(error),
      cwd,
    };
  }
}

export const MULTI_CLI_AGENTS = [
  { value: 'claude-code', label: 'Claude Code (SDK/CLI)' },
  { value: 'codex', label: 'OpenAI Codex' },
  { value: 'gemini', label: 'Gemini CLI' },
  { value: 'cursor', label: 'Cursor CLI' },
  { value: 'qwen', label: 'Qwen Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'grok', label: 'Grok Build (xAI)' },
];
