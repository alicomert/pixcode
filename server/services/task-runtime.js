import { queryClaudeSDK, abortClaudeSDKSession } from '../claude-sdk.js';
import { spawnCursor, abortCursorSession } from '../cursor-cli.js';
import { queryCodex, abortCodexSession } from '../openai-codex.js';
import { spawnGemini, abortGeminiSession } from '../gemini-cli.js';
import { spawnQwen, abortQwenSession } from '../qwen-code-cli.js';
import { spawnOpencode, abortOpencodeSession } from '../opencode-cli.js';

const activeRuns = new Map();

const RUNNERS = {
  'claude-code': queryClaudeSDK,
  cursor: spawnCursor,
  codex: queryCodex,
  gemini: spawnGemini,
  qwen: spawnQwen,
  opencode: spawnOpencode,
};

const ABORTERS = {
  'claude-code': abortClaudeSDKSession,
  cursor: abortCursorSession,
  codex: abortCodexSession,
  gemini: abortGeminiSession,
  qwen: abortQwenSession,
  opencode: abortOpencodeSession,
};

const PROVIDER_IDS = {
  'claude-code': 'claude',
  cursor: 'cursor',
  codex: 'codex',
  gemini: 'gemini',
  qwen: 'qwen',
  opencode: 'opencode',
};

function messageText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string') return message.content;
  if (typeof message.text === 'string') return message.text;
  if (typeof message.summary === 'string') return message.summary;
  return '';
}

function createTaskWriter(task, callbacks) {
  const state = {
    sessionId: task.sessionId || null,
    output: [],
    errors: [],
    tokenCount: { input: 0, output: 0 },
  };

  return {
    state,
    userId: task.userId || null,
    isWebSocketWriter: true,
    isSSEStreamWriter: false,
    send(message) {
      const nextSessionId = message?.newSessionId
        || message?.actualSessionId
        || message?.sessionId
        || message?.session_id;
      if (nextSessionId) {
        state.sessionId = nextSessionId;
        callbacks.onSession?.(nextSessionId);
      }

      const kind = message?.kind || message?.type || 'status';
      const text = messageText(message);
      if (text && (kind === 'stream_delta' || kind === 'text' || message?.role === 'assistant')) {
        state.output.push(text);
      }
      if (kind === 'error' || message?.isError) {
        const errorText = text || 'The CLI agent reported an error.';
        state.errors.push(errorText);
        callbacks.onLog?.('error', errorText);
      } else if (kind === 'tool_use') {
        callbacks.onLog?.('info', `Tool: ${message.toolName || message.name || 'unknown'}`);
      } else if (kind === 'status' && text && text !== 'token_budget') {
        callbacks.onLog?.('info', text);
      }

      if (kind === 'permission_request') {
        callbacks.onInteraction?.({
          requestId: message.requestId,
          question: `${message.toolName || 'Agent'} requires permission to continue.`,
          options: ['Allow', 'Deny'],
          type: 'permission',
        });
      }

      const budget = message?.tokenBudget;
      if (budget && Number.isFinite(budget.used)) {
        state.tokenCount.input = Number(budget.used);
      }
      callbacks.onEvent?.(message);
    },
    setSessionId(sessionId) {
      if (!sessionId) return;
      state.sessionId = sessionId;
      callbacks.onSession?.(sessionId);
    },
    getSessionId() {
      return state.sessionId;
    },
  };
}

export async function executeTaskWithProvider(task, callbacks = {}) {
  const runner = RUNNERS[task.agentType];
  if (!runner) {
    throw new Error(`Unsupported task agent: ${task.agentType}`);
  }

  const writer = createTaskWriter(task, callbacks);
  const active = {
    agentType: task.agentType,
    get sessionId() {
      return writer.state.sessionId;
    },
  };
  activeRuns.set(task.id, active);

  const permissionMode = task.permissionMode || 'acceptEdits';
  const options = {
    sessionId: task.continueSession ? task.sessionId || null : null,
    sessionSummary: task.title,
    projectPath: task.projectPath,
    projectName: task.projectId,
    cwd: task.projectPath,
    model: task.model || undefined,
    permissionMode,
    skipPermissions: permissionMode === 'bypassPermissions',
    suppressNotifications: true,
    toolsSettings: {
      allowedTools: permissionMode === 'acceptEdits'
        ? ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'WebFetch', 'WebSearch', 'Task', 'TodoRead', 'TodoWrite']
        : [],
      disallowedTools: [],
      skipPermissions: permissionMode === 'bypassPermissions',
    },
  };

  callbacks.onLog?.('info', `Starting ${PROVIDER_IDS[task.agentType] || task.agentType}${task.model ? ` with ${task.model}` : ''}.`);

  try {
    await runner(task.prompt, options, writer);
    if (writer.state.errors.length > 0) {
      throw new Error(writer.state.errors[writer.state.errors.length - 1]);
    }

    const result = writer.state.output.join('').trim();
    return {
      sessionId: writer.state.sessionId,
      result,
      summary: result ? result.slice(-4000) : 'The CLI agent completed without a text summary.',
      tokenCount: writer.state.tokenCount,
    };
  } finally {
    activeRuns.delete(task.id);
  }
}

export async function abortTaskProviderRun(taskId) {
  const active = activeRuns.get(taskId);
  if (!active) return false;
  const aborter = ABORTERS[active.agentType];
  if (!aborter || !active.sessionId) return false;
  return Boolean(await aborter(active.sessionId));
}

export function getTaskProviderId(agentType) {
  return PROVIDER_IDS[agentType] || agentType;
}
