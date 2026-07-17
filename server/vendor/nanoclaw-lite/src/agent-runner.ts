/**
 * NanoClaw In-Process Agent Runner
 * Runs claude-agent-sdk directly in the main process (no container)
 */

import fs from 'fs';
import path from 'path';
import {
  query,
  HookCallback,
  PreCompactHookInput,
} from '@anthropic-ai/claude-agent-sdk';
import { logger } from './logger.js';

// Prevent "cannot launch inside another Claude Code session" error
// when NanoClaw is started from within a Claude Code / Amp session.
delete process.env.CLAUDECODE;
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { RegisteredGroup } from './types.js';

export interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

const IPC_INPUT_DIR_SUFFIX = '/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL_NAME = '_close';
const IPC_POLL_MS = 500;

/**
 * Push-based async iterable for streaming user messages to the SDK.
 */
class MessageStream {
  private queue: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    });
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>((r) => {
        this.waiting = r;
      });
      this.waiting = null;
    }
  }
}

function getSessionSummary(
  sessionId: string,
  transcriptPath: string,
): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(
  assistantName?: string,
  groupFolder?: string,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const groupDir = groupFolder
        ? resolveGroupFolderPath(groupFolder)
        : process.cwd();
      const conversationsDir = path.join(groupDir, 'conversations');
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(
        messages,
        summary,
        assistantName,
      );
      fs.writeFileSync(filePath, markdown);

      logger.debug({ groupFolder, filePath }, 'Archived conversation');
    } catch (err) {
      logger.warn({ groupFolder, error: err }, 'Failed to archive transcript');
    }

    return {};
  };
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text =
          typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content
                .map((c: { text?: string }) => c.text || '')
                .join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
      // Ignore
    }
  }

  return messages;
}

function formatTranscriptMarkdown(
  messages: ParsedMessage[],
  title?: string | null,
  assistantName?: string,
): string {
  const formatDateTime = (d: Date) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(new Date())}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : assistantName || 'Assistant';
    const content =
      msg.content.length > 2000
        ? msg.content.slice(0, 2000) + '...'
        : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check for _close sentinel.
 */
function shouldClose(ipcInputDir: string): boolean {
  const sentinelPath = path.join(ipcInputDir, IPC_INPUT_CLOSE_SENTINEL_NAME);
  if (fs.existsSync(sentinelPath)) {
    try {
      fs.unlinkSync(sentinelPath);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 */
function drainIpcInput(ipcInputDir: string): string[] {
  try {
    fs.mkdirSync(ipcInputDir, { recursive: true });
    const files = fs
      .readdirSync(ipcInputDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(ipcInputDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        logger.warn({ file, error: err }, 'Failed to process IPC input file');
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch (err) {
    logger.warn({ error: err }, 'IPC drain error');
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 */
function waitForIpcMessage(ipcInputDir: string): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose(ipcInputDir)) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput(ipcInputDir);
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Run a single query with streaming results callback.
 */
async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  agentInput: AgentInput,
  onOutput: (output: AgentOutput) => void,
  resumeAt?: string,
): Promise<{
  newSessionId?: string;
  lastAssistantUuid?: string;
  closedDuringQuery: boolean;
}> {
  const stream = new MessageStream();
  stream.push(prompt);

  const ipcInputDir =
    resolveGroupIpcPath(agentInput.groupFolder) + IPC_INPUT_DIR_SUFFIX;

  // Poll IPC for follow-up messages during the query
  let ipcPolling = true;
  let closedDuringQuery = false;
  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose(ipcInputDir)) {
      logger.debug(
        { groupFolder: agentInput.groupFolder },
        'Close sentinel detected during query',
      );
      closedDuringQuery = true;
      stream.end();
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput(ipcInputDir);
    for (const text of messages) {
      logger.debug(
        { groupFolder: agentInput.groupFolder, length: text.length },
        'Piping IPC message into query',
      );
      stream.push(text);
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  const groupDir = resolveGroupFolderPath(agentInput.groupFolder);

  // Load global CLAUDE.md for non-main groups
  const globalClaudeMdPath = path.join(
    process.cwd(),
    'groups',
    'global',
    'CLAUDE.md',
  );
  let globalClaudeMd: string | undefined;
  if (!agentInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf8');
  }

  // Build a clean env without CLAUDECODE to avoid nested-session rejection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const queryIterable = query({
    prompt: stream,
    options: {
      cwd: groupDir,
      env: cleanEnv,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      stderr: (data: string) => {
        logger.debug(
          { groupFolder: agentInput.groupFolder },
          `Agent stderr: ${data.trim()}`,
        );
      },
      systemPrompt: globalClaudeMd
        ? {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: globalClaudeMd,
          }
        : undefined,
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'Task',
        'TaskOutput',
        'TaskStop',
        'TeamCreate',
        'TeamDelete',
        'SendMessage',
        'TodoWrite',
        'ToolSearch',
        'Skill',
        'NotebookEdit',
      ],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      hooks: {
        PreCompact: [
          {
            hooks: [
              createPreCompactHook(
                agentInput.assistantName,
                agentInput.groupFolder,
              ),
            ],
          },
        ],
      },
    },
  });

  try {
    for await (const message of queryIterable) {
      messageCount++;

      if (message.type === 'assistant' && 'uuid' in message) {
        lastAssistantUuid = (message as { uuid: string }).uuid;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        logger.debug(
          { groupFolder: agentInput.groupFolder, sessionId: newSessionId },
          'Session initialized',
        );
      }

      if (message.type === 'result') {
        resultCount++;
        const textResult =
          'result' in message ? (message as { result?: string }).result : null;
        logger.debug(
          {
            groupFolder: agentInput.groupFolder,
            resultCount,
            resultLength: textResult?.length,
          },
          'Agent result',
        );
        onOutput({
          status: 'success',
          result: textResult || null,
          newSessionId,
        });
      }
    }
  } catch (err) {
    // The SDK throws "process exited with code 1" after yielding results
    // when the Claude CLI process exits non-zero (e.g., stale session resume).
    // If we already got results, treat this as success — the work was done.
    const msg = err instanceof Error ? err.message : String(err);
    if (resultCount > 0) {
      logger.warn(
        { groupFolder: agentInput.groupFolder, resultCount, error: msg },
        'Agent process exited non-zero after producing results, treating as success',
      );
    } else {
      // No results were produced — this is a real failure, re-throw
      throw err;
    }
  }

  ipcPolling = false;
  return { newSessionId, lastAssistantUuid, closedDuringQuery };
}

/**
 * Run the agent with query loop for follow-up messages.
 */
export async function runAgent(
  group: RegisteredGroup,
  input: AgentInput,
  onOutput: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const startTime = Date.now();

  const ipcInputDir = resolveGroupIpcPath(group.folder) + IPC_INPUT_DIR_SUFFIX;
  fs.mkdirSync(ipcInputDir, { recursive: true });

  // Clean up stale _close sentinel
  const sentinelPath = path.join(ipcInputDir, IPC_INPUT_CLOSE_SENTINEL_NAME);
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    /* ignore */
  }

  // Build initial prompt
  let prompt = input.prompt;
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }

  // Drain any pending IPC messages
  const pending = drainIpcInput(ipcInputDir);
  if (pending.length > 0) {
    logger.debug(
      { groupFolder: group.folder, count: pending.length },
      'Draining pending IPC messages',
    );
    prompt += '\n' + pending.join('\n');
  }

  let sessionId = input.sessionId;
  let resumeAt: string | undefined;

  try {
    while (true) {
      logger.debug(
        { groupFolder: group.folder, sessionId: sessionId || 'new' },
        'Starting agent query',
      );

      const queryResult = await runQuery(
        prompt,
        sessionId,
        input,
        (output) => {
          onOutput(output).catch((err) => {
            logger.warn(
              { groupFolder: group.folder, error: err },
              'Failed to send output',
            );
          });
        },
        resumeAt,
      );

      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }
      if (queryResult.lastAssistantUuid) {
        resumeAt = queryResult.lastAssistantUuid;
      }

      if (queryResult.closedDuringQuery) {
        logger.debug(
          { groupFolder: group.folder },
          'Close sentinel consumed during query, exiting',
        );
        break;
      }

      // Emit session update
      onOutput({
        status: 'success',
        result: null,
        newSessionId: sessionId,
      }).catch((err) => {
        logger.warn(
          { groupFolder: group.folder, error: err },
          'Failed to send session update',
        );
      });

      // Wait for next message or _close
      const nextMessage = await waitForIpcMessage(ipcInputDir);
      if (nextMessage === null) {
        logger.debug(
          { groupFolder: group.folder },
          'Close sentinel received, exiting',
        );
        break;
      }

      logger.debug(
        { groupFolder: group.folder, length: nextMessage.length },
        'Got next IPC message',
      );
      prompt = nextMessage;
    }

    const duration = Date.now() - startTime;
    logger.info(
      { groupFolder: group.folder, duration, sessionId },
      'Agent completed',
    );

    return {
      status: 'success',
      result: null,
      newSessionId: sessionId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    const errorDetails =
      err instanceof Error
        ? {
            message: err.message,
            stack: err.stack,
            name: err.name,
            ...Object.fromEntries(Object.entries(err)),
          }
        : { raw: String(err) };
    logger.error(
      { groupFolder: group.folder, errorDetails },
      `Agent error: ${errorMessage}`,
    );

    return {
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage,
    };
  }
}
