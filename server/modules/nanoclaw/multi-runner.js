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
  if (value === 'claude') return 'claude-code';
  if (value === 'grok-build' || value === 'xai-grok' || value === 'spacexai') return 'grok';
  if (VALID.has(value)) return value === 'claude' ? 'claude-code' : value;
  return 'claude-code';
}

/**
 * Parse optional provider directive from prompt:
 *   [agent:codex] do the thing
 *   [provider:gemini model:xxx] ...
 */
export function parseAgentDirective(prompt) {
  const text = String(prompt || '');
  const match = text.match(/^\s*\[(?:agent|provider)\s*[:=]\s*([a-z0-9_-]+)(?:\s+model\s*[:=]\s*([^\]]+))?\]\s*/i);
  if (!match) {
    return { agentType: null, model: null, prompt: text.trim() };
  }
  return {
    agentType: normalizeAgentType(match[1]),
    model: match[2] ? match[2].trim() : null,
    prompt: text.slice(match[0].length).trim(),
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
    process.cwd(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch { /* ignore */ }
  }
  // General / non-coding assistant: use a scratch workspace
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

  const task = {
    id: `nc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    agentType,
    model,
    prompt: cleanPrompt,
    title: isScheduledTask ? `Schedule: ${cleanPrompt.slice(0, 48)}` : cleanPrompt.slice(0, 64),
    projectPath: cwd,
    projectId: groupFolder || 'general',
    role: 'fullstack',
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
