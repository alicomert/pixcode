#!/usr/bin/env node
/* eslint-disable import-x/order */
// Load environment variables before other imports execute
import './load-env.js';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawn } from 'child_process';

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

import { AppError, createNormalizedMessage } from '@/shared/utils.js';

import { findAppRoot, getModuleDir } from './utils/runtime-paths.js';



const __dirname = getModuleDir(import.meta.url);
// The server source runs from /server, while the compiled output runs from /dist-server/server.
// Resolving the app root once keeps every repo-level lookup below aligned across both layouts.
const APP_ROOT = findAppRoot(__dirname);
const require = createRequire(import.meta.url);
const MONACO_ASSETS_ROUTE = '/vendor/monaco-editor/min/vs';
const installMode = fs.existsSync(path.join(APP_ROOT, '.git')) ? 'git' : 'npm';
const SERVER_VERSION = (() => {
    try {
        const pkgRaw = fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8');
        return JSON.parse(pkgRaw).version || '0.0.0';
    } catch {
        return '0.0.0';
    }
})();
const DAEMON_COMMAND_CONTEXT = {
    appRoot: APP_ROOT,
    cliEntry: path.join(APP_ROOT, 'server', 'cli.js'),
    nodeExecPath: process.execPath,
};

function resolveMonacoAssetsPath() {
    const candidates = [
        path.join(APP_ROOT, 'node_modules', 'monaco-editor', 'min', 'vs'),
    ];

    try {
        const monacoPackagePath = require.resolve('monaco-editor/package.json', {
            paths: [APP_ROOT, __dirname],
        });
        candidates.push(path.join(path.dirname(monacoPackagePath), 'min', 'vs'));
    } catch {
        // The editor will show its normal load failure if the dependency is unavailable.
    }

    return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'loader.js'))) || null;
}

import { c } from './utils/colors.js';

console.log('SERVER_PORT from env:', process.env.SERVER_PORT);



import pty from 'node-pty';
import mime from 'mime-types';

import { getProjects, getSessions, renameProject, deleteSession, deleteProject, extractProjectDirectory, clearProjectDirectoryCache, searchConversations } from './projects.js';
import { queryClaudeSDK, abortClaudeSDKSession, isClaudeSDKSessionActive, getActiveClaudeSDKSessions, resolveToolApproval, getPendingApprovalsForSession, reconnectSessionWriter } from './claude-sdk.js';
import { spawnCursor, abortCursorSession, isCursorSessionActive, getActiveCursorSessions } from './cursor-cli.js';
import { queryCodex, abortCodexSession, isCodexSessionActive, getActiveCodexSessions } from './openai-codex.js';
import { spawnGemini, abortGeminiSession, isGeminiSessionActive, getActiveGeminiSessions } from './gemini-cli.js';
import { spawnQwen, abortQwenSession, isQwenSessionActive, getActiveQwenSessions } from './qwen-code-cli.js';
import { spawnOpencode, abortOpencodeSession, isOpencodeSessionActive, getActiveOpencodeSessions } from './opencode-cli.js';
import sessionManager from './sessionManager.js';
import gitRoutes from './routes/git.js';
import authRoutes from './routes/auth.js';
import cursorRoutes from './routes/cursor.js';
import mcpUtilsRoutes from './routes/mcp-utils.js';
import commandsRoutes from './routes/commands.js';
import settingsRoutes from './routes/settings.js';
import agentRoutes from './routes/agent.js';
import projectsRoutes, {
    WORKSPACES_ROOT,
    WORKSPACES_BASE,
    validateWorkspacePath,
    normalizeWorkspacePath,
} from './routes/projects.js';
import userRoutes from './routes/user.js';
import codexRoutes from './routes/codex.js';
import geminiRoutes from './routes/gemini.js';
import qwenRoutes from './routes/qwen.js';
import pluginsRoutes from './routes/plugins.js';
import messagesRoutes from './routes/messages.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import remoteRoutes from './routes/remote.js';
import publicApiRoutes from './routes/public-api.js';
import webhooksRoutes from './routes/webhooks.js';
import productionAgentLoopRoutes from './routes/production-agent-loop.js';
import platformizationRoutes from './routes/platformization.js';
import liveViewRoutes, { createLiveViewPublicRouter } from './routes/live-view.js';
import providerRoutes from './modules/providers/provider.routes.js';
import {
  createHermesTaskRouter,
  adapterRegistry,
  ClaudeCodeA2AAdapter,
  CodexA2AAdapter,
  CursorA2AAdapter,
  GeminiA2AAdapter,
  OpenCodeA2AAdapter,
  QwenA2AAdapter,
  JsonEventA2AAdapter,
  createPreviewProxyRouter,
  createOrchestrationTaskRouter,
  createHermesRouter,
  createWorkflowRouter,
} from './modules/orchestration/index.js';
import networkRoutes from './routes/network.js';
import telegramRoutes from './routes/telegram.js';
import { restoreRequestedTunnel } from './services/external-access.js';
import { restoreBotFromConfig } from './services/telegram/bot.js';
import { ensurePortOpen } from './utils/port-access.js';
import {
    applyAllStoredCredentialsToEnv,
} from './services/provider-credentials.js';
import { primeCliBinPath } from './services/install-jobs.js';
import { buildHermesPathEnv, primeHermesPath } from './services/hermes-install-jobs.js';
import { startEnabledPluginServers, stopAllPlugins, getPluginPort } from './utils/plugin-process-manager.js';
import { initializeDatabase, sessionNamesDb, applyCustomSessionNames, apiKeysDb } from './database/db.js';
import { setNotificationWebSocketServer } from './services/notification-orchestrator.js';
import { configureWebPush } from './services/vapid-keys.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/auth.js';
import { IS_PLATFORM } from './constants/config.js';

import { getConnectableHost } from '../shared/networkHosts.js';

import { buildDaemonCliCommand, handleDaemonCommand } from './daemon-manager.js';

const VALID_PROVIDERS = ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'];

// File system watchers for provider project/session folders
const PROVIDER_WATCH_PATHS = [
    { provider: 'claude', rootPath: path.join(os.homedir(), '.claude', 'projects') },
    { provider: 'cursor', rootPath: path.join(os.homedir(), '.cursor', 'chats') },
    { provider: 'codex', rootPath: path.join(os.homedir(), '.codex', 'sessions') },
    { provider: 'gemini', rootPath: path.join(os.homedir(), '.gemini', 'projects') },
    { provider: 'gemini_sessions', rootPath: path.join(os.homedir(), '.gemini', 'sessions') },
    { provider: 'gemini_cli', rootPath: path.join(os.homedir(), '.gemini', 'tmp') },
    // Qwen Code is a Gemini-CLI fork so its on-disk layout mirrors ~/.gemini/.
    { provider: 'qwen', rootPath: path.join(os.homedir(), '.qwen', 'projects') },
    { provider: 'qwen_sessions', rootPath: path.join(os.homedir(), '.qwen', 'sessions') },
    { provider: 'qwen_cli', rootPath: path.join(os.homedir(), '.qwen', 'tmp') },
];
const WATCHER_IGNORED_PATTERNS = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.tmp',
    '**/*.swp',
    '**/.DS_Store'
];
// Debounce chokidar events before rescanning all provider project trees.
// During an active chat, each model writes its transcript to
// ~/.<provider>/projects/<encoded>/*.jsonl in small chunks — with a 300ms
// window every few chunks triggered a full getProjects() + broadcast to
// every open tab, which shows up as mouse/UI stutter. 1500ms collapses
// a full chat reply into ~1 scan while still feeling responsive when
// the user flips to the projects list.
const WATCHER_DEBOUNCE_MS = 1500;
let projectsWatchers = [];
let projectsWatcherDebounceTimer = null;
const connectedClients = new Set();
let isGetProjectsRunning = false; // Flag to prevent reentrant calls
const STARTUP_INPUT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const STARTUP_INPUT_POLL_MS = 750;

// Broadcast progress to all connected WebSocket clients
function broadcastProgress(progress) {
    const message = JSON.stringify({
        type: 'loading_progress',
        ...progress
    });
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Setup file system watchers for Claude, Cursor, and Codex project/session folders
async function setupProjectsWatcher() {
    const chokidar = (await import('chokidar')).default;

    if (projectsWatcherDebounceTimer) {
        clearTimeout(projectsWatcherDebounceTimer);
        projectsWatcherDebounceTimer = null;
    }

    await Promise.all(
        projectsWatchers.map(async (watcher) => {
            try {
                await watcher.close();
            } catch (error) {
                console.error('[WARN] Failed to close watcher:', error);
            }
        })
    );
    projectsWatchers = [];

    const debouncedUpdate = (eventType, filePath, provider, rootPath) => {
        if (projectsWatcherDebounceTimer) {
            clearTimeout(projectsWatcherDebounceTimer);
        }

        projectsWatcherDebounceTimer = setTimeout(async () => {
            // Prevent reentrant calls
            if (isGetProjectsRunning) {
                return;
            }

            try {
                isGetProjectsRunning = true;

                // Clear project directory cache when files change
                clearProjectDirectoryCache();

                // Get updated projects list
                const updatedProjects = await getProjects(broadcastProgress);

                // Notify all connected clients about the project changes
                const updateMessage = JSON.stringify({
                    type: 'projects_updated',
                    projects: updatedProjects,
                    timestamp: new Date().toISOString(),
                    changeType: eventType,
                    changedFile: path.relative(rootPath, filePath),
                    watchProvider: provider
                });

                connectedClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(updateMessage);
                    }
                });

            } catch (error) {
                console.error('[ERROR] Error handling project changes:', error);
            } finally {
                isGetProjectsRunning = false;
            }
        }, WATCHER_DEBOUNCE_MS);
    };

    for (const { provider, rootPath } of PROVIDER_WATCH_PATHS) {
        try {
            // chokidar v4 emits ENOENT via the "error" event for missing roots and will not auto-recover.
            // Ensure provider folders exist before creating the watcher so watching stays active.
            await fsPromises.mkdir(rootPath, { recursive: true });

            // Initialize chokidar watcher with optimized settings
            const watcher = chokidar.watch(rootPath, {
                ignored: WATCHER_IGNORED_PATTERNS,
                persistent: true,
                ignoreInitial: true, // Don't fire events for existing files on startup
                followSymlinks: false,
                depth: 10, // Reasonable depth limit
                awaitWriteFinish: {
                    // Raised from (100, 50) to (500, 250). The old settings
                    // had chokidar polling every 50ms per in-flight file; an
                    // active chat writes its .jsonl transcript continuously,
                    // so 50ms polls meant ~20 wakeups/sec per file. The new
                    // cadence still stabilizes reliably and cuts the wakeup
                    // count by 5x.
                    stabilityThreshold: 500,
                    pollInterval: 250
                }
            });

            // Set up event listeners
            watcher
                .on('add', (filePath) => debouncedUpdate('add', filePath, provider, rootPath))
                .on('change', (filePath) => debouncedUpdate('change', filePath, provider, rootPath))
                .on('unlink', (filePath) => debouncedUpdate('unlink', filePath, provider, rootPath))
                .on('addDir', (dirPath) => debouncedUpdate('addDir', dirPath, provider, rootPath))
                .on('unlinkDir', (dirPath) => debouncedUpdate('unlinkDir', dirPath, provider, rootPath))
                .on('error', (error) => {
                    console.error(`[ERROR] ${provider} watcher error:`, error);
                })
                .on('ready', () => {
                });

            projectsWatchers.push(watcher);
        } catch (error) {
            console.error(`[ERROR] Failed to setup ${provider} watcher for ${rootPath}:`, error);
        }
    }

    if (projectsWatchers.length === 0) {
        console.error('[ERROR] Failed to setup any provider watchers');
    }
}


const app = express();
const server = http.createServer(app);

const ptySessionsMap = new Map();
const PTY_SESSION_TIMEOUT = 30 * 60 * 1000;
const COMPLETED_PTY_SESSION_TTL = 5 * 60 * 1000;
const SHELL_URL_PARSE_BUFFER_LIMIT = 32768;
const SHELL_CLI_PROVIDERS = new Set(['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode']);
import { stripAnsiSequences, normalizeDetectedUrl, extractUrlsFromText, shouldAutoOpenUrlFromOutput } from './utils/url-detection.js';

function terminatePtySession(sessionKey, session, reason) {
    if (!session) return false;

    console.log(`\u{1F9F9} Terminating PTY session (\${reason}):`, sessionKey);
    if (session.timeoutId) {
        clearTimeout(session.timeoutId);
    }
    if (session.startupInputTimerId) {
        clearTimeout(session.startupInputTimerId);
        session.startupInputTimerId = null;
    }

    try {
        if (session.pty && session.pty.kill) {
            session.pty.kill();
        }
    } catch (error) {
        console.warn('Failed to kill PTY session:', error.message);
    }

    ptySessionsMap.delete(sessionKey);
    return true;
}

function killProviderPtySessions(projectPath, provider) {
    let killed = 0;
    for (const [sessionKey, session] of ptySessionsMap.entries()) {
        if (
            session?.projectPath === projectPath &&
            session?.provider === provider &&
            !session?.isPlainShell
        ) {
            killed += terminatePtySession(sessionKey, session, 'fresh provider session') ? 1 : 0;
        }
    }

    return killed;
}

function getLastRegexMatchIndex(text, pattern) {
    let lastIndex = -1;
    for (const match of text.matchAll(pattern)) {
        lastIndex = match.index ?? lastIndex;
    }
    return lastIndex;
}

function detectProviderTerminalState(provider, output) {
    const cleanOutput = String(output || '');
    if (!cleanOutput.trim()) {
        return {
            terminalState: 'unknown',
            isBusy: false,
            terminalStateReason: 'empty_output',
        };
    }

    if (/Process exited with code/iu.test(cleanOutput)) {
        return {
            terminalState: 'exited',
            isBusy: false,
            terminalStateReason: 'process_exit',
        };
    }

    const lastWeakBusy = getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*[\u2022*]\s*(?:Working|Running|Thinking)\b/giu);
    const lastStrongBusy = Math.max(
        getLastRegexMatchIndex(cleanOutput, /\bWorking\s*\([^)]*esc to interrupt[^)]*\)/giu),
        getLastRegexMatchIndex(cleanOutput, /\bmsg=interrupt\b/giu),
    );
    const lastBusy = Math.max(lastWeakBusy, lastStrongBusy);

    if (provider === 'codex') {
        const lastPrompt = Math.max(
            getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*\u203A(?:\s|$)/gu),
            getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*\u276F(?:\s|$)/gu),
        );

        if (lastPrompt >= 0) {
            const isBusy = lastStrongBusy > lastPrompt;
            return {
                terminalState: isBusy ? 'busy' : 'idle',
                isBusy,
                terminalStateReason: isBusy ? 'codex_strong_busy_marker_after_prompt' : 'codex_prompt_after_busy_marker',
            };
        }

        if (lastBusy >= 0) {
            return {
                terminalState: 'busy',
                isBusy: true,
                terminalStateReason: 'codex_busy_marker_without_prompt',
            };
        }
    }

    if (lastBusy >= 0) {
        return {
            terminalState: 'busy',
            isBusy: true,
            terminalStateReason: 'generic_busy_marker',
        };
    }

    return {
        terminalState: 'unknown',
        isBusy: false,
        terminalStateReason: 'no_known_marker',
    };
}

function resolveProviderTerminalState(session, provider, output) {
    if (session?.lifecycleState === 'completed' || session?.lifecycleState === 'failed' || session?.lifecycleState === 'exited') {
        const exitCode = typeof session.exitCode === 'number' ? session.exitCode : null;
        const terminalFailed = exitCode !== null ? exitCode !== 0 : Boolean(session.exitSignal);
        return {
            terminalState: terminalFailed ? 'failed' : 'completed',
            lifecycleState: session.lifecycleState,
            isBusy: false,
            terminalFailed,
            exitCode,
            exitSignal: session.exitSignal || null,
            completedAt: session.completedAt || null,
            terminalStateReason: terminalFailed ? 'pty_failed' : 'pty_completed',
        };
    }

    const detected = detectProviderTerminalState(provider, output);
    return {
        ...detected,
        lifecycleState: session?.lifecycleState || 'running',
        terminalFailed: false,
        exitCode: null,
        exitSignal: null,
        completedAt: null,
    };
}

function appendPtySessionBuffer(session, data) {
    if (!session) return;
    if (session.buffer.length < 5000) {
        session.buffer.push(data);
    } else {
        session.buffer.shift();
        session.buffer.push(data);
    }
}

function normalizeTerminalStartupInput(input) {
    return \`\\x15\${String(input || '').replace(/(?:\\r\\n|\\r|\\n)+$/u, '')}\\r\`;
}

function readSessionOutputForState(session, maxChars = 12000) {
    return stripAnsiSequences((session?.buffer || []).join('').slice(-maxChars));
}

function shouldWaitForProviderIdle(provider) {
    return provider === 'codex';
}

function isTerminalReadyForStartupInput(session) {
    if (!session?.pty || session.lifecycleState !== 'running') {
        return { ready: false, retry: false, terminalState: 'exited' };
    }

    const output = readSessionOutputForState(session);
    const state = resolveProviderTerminalState(session, session.provider, output);
    if (state.terminalState === 'busy') {
        return { ready: false, retry: true, terminalState: state.terminalState };
    }

    if (state.terminalState === 'idle') {
        return { ready: true, retry: false, terminalState: state.terminalState };
    }

    if (shouldWaitForProviderIdle(session.provider)) {
        return { ready: false, retry: true, terminalState: state.terminalState };
    }

    return { ready: true, retry: false, terminalState: state.terminalState };
}

function processTerminalStartupInputQueue(session) {
    if (!session?.pendingStartupInputs?.length) {
        session.startupInputTimerId = null;
        return;
    }

    const item = session.pendingStartupInputs[0];
    const readiness = isTerminalReadyForStartupInput(session);
    if (!readiness.ready) {
        if (!readiness.retry || Date.now() - item.queuedAt > STARTUP_INPUT_READY_TIMEOUT_MS) {
            session.pendingStartupInputs.shift();
            session.startupInputTimerId = null;
            const message = \`\\r\\n\\x1b[33m[Pixcode] Startup input was not sent because \${session.provider} is still \${readiness.terminalState || 'unavailable'}.\\x1b[0m\\r\\n\`;
            try {
                session.ws?.send?.(JSON.stringify({ type: 'output', data: message }));
            } catch { /* websocket gone */ }
            if (session.pendingStartupInputs.length > 0) {
                session.startupInputTimerId = setTimeout(() => processTerminalStartupInputQueue(session), STARTUP_INPUT_POLL_MS);
            }
            return;
        }

        session.startupInputTimerId = setTimeout(() => processTerminalStartupInputQueue(session), STARTUP_INPUT_POLL_MS);
        return;
    }

    session.pendingStartupInputs.shift();
    session.startupInputTimerId = null;
    try {
        session.pty.write(normalizeTerminalStartupInput(item.startupInput));
        session.updatedAt = Date.now();
        console.log(\`\u2328\uFE0F  Submitted startup input to visible PTY (\${item.reason})\`);
    } catch (error) {
        console.warn('Failed to submit startup input to visible PTY:', error?.message || error);
    }

    if (session.pendingStartupInputs.length > 0) {
        session.startupInputTimerId = setTimeout(() => processTerminalStartupInputQueue(session), STARTUP_INPUT_POLL_MS);
    }
}

function queueTerminalStartupInput(session, startupInput, reason, delayMs = 500) {
    if (!session?.pty || !startupInput) return;
    if (!Array.isArray(session.pendingStartupInputs)) {
        session.pendingStartupInputs = [];
    }
    session.pendingStartupInputs.push({
        startupInput,
        reason,
        queuedAt: Date.now(),
    });

    if (session.startupInputTimerId) return;
    session.startupInputTimerId = setTimeout(() => processTerminalStartupInputQueue(session), delayMs);
}

function writeTerminalStartupInput(session, startupInput, reason, delayMs = 500) {
    queueTerminalStartupInput(session, startupInput, reason, delayMs);
}

function normalizeShellPermissionMode(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function shouldBypassShellPermissions(permissionMode, skipPermissions) {
    return Boolean(skipPermissions) || permissionMode === 'bypassPermissions' || permissionMode === 'acceptEdits' || permissionMode === 'yolo';
}

function buildProviderShellPermissionFlags(provider, permissionMode, skipPermissions) {
    const mode = normalizeShellPermissionMode(permissionMode);
    const bypass = shouldBypassShellPermissions(mode, skipPermissions);

    if (provider === 'codex') {
        if (mode === 'bypassPermissions' || mode === 'yolo') {
            return ['--dangerously-bypass-approvals-and-sandbox'];
        }
        if (mode === 'acceptEdits' || mode === 'auto_edit' || bypass) {
            return ['--sandbox', 'workspace-write', '--ask-for-approval', 'never'];
        }
        return [];
    }

    if (provider === 'gemini' || provider === 'qwen') {
        if (bypass) {
            return ['--yolo'];
        }
        if (mode === 'auto_edit') {
            return ['--approval-mode', 'auto_edit'];
        }
        if (mode === 'plan') {
            return ['--approval-mode', 'plan'];
        }
        return [];
    }

    if (provider === 'cursor') {
        return bypass ? ['-f'] : [];
    }

    if (provider === 'opencode') {
        if (mode === 'plan') {
            return ['--agent', 'plan'];
        }
        // OpenCode's interactive TUI rejects the headless run-only bypass
        // option; passing it makes the CLI print help and exit before opening.
        return [];
    }

    if (provider === 'claude') {
        return bypass ? ['--dangerously-skip-permissions'] : [];
    }

    return [];
}

function buildProviderShellCommand(command, permissionFlags = []) {
    const flags = Array.isArray(permissionFlags) ? permissionFlags.filter(Boolean) : [];
    return flags.length > 0 ? \`\${command} \${flags.join(' ')}\` : command;
}

function resolvePublicBaseUrl(request) {
    const headers = request?.headers || {};
    const forwardedProto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || (request?.socket?.encrypted ? 'https' : 'http');
    const host = headers['x-forwarded-host'] || headers.host || \`127.0.0.1:\${process.env.SERVER_PORT || process.env.PORT || '3001'}\`;
    return \`\${proto}://\${String(host).split(',')[0].trim()}\`;
}

function resolveHermesMcpBaseUrl() {
    const configured = process.env.PIXCODE_INTERNAL_BASE_URL || process.env.PIXCODE_HERMES_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');

    return \`http://127.0.0.1:\${process.env.SERVER_PORT || process.env.PORT || '3001'}\`;
}

function quoteBashArg(value) {
    return \`'\${String(value).replace(/'/g, "'\\\\''")}'\`;
}

function quotePowerShellArg(value) {
    return \`"\${String(value).replace(/\`/g, '\`\`').replace(/\\$/g, '\`$').replace(/"/g, '\`"')}"\`;
}

function quoteShellArgForPlatform(value) {
    return os.platform() === 'win32' ? quotePowerShellArg(value) : quoteBashArg(value);
}

const HERMES_CLI_COMMAND_PATTERN = /^hermes(?:\\s+[A-Za-z0-9._:/=@+-]+)*\\s*$/;
const HERMES_AGENT_API_SCOPES = [
    'auth:read',
    'auth:write',
    'diagnostics:read',
    'files:read',
    'files:write',
    'git:read',
    'git:write',
    'hermes:mcp',
    'hermes:gateway',
    'notifications:read',
    'notifications:write',
    'orchestration:read',
    'orchestration:write',
    'plugins:read',
    'plugins:write',
    'projects:read',
    'projects:write',
    'providers:read',
    'providers:write',
    'remote:read',
    'remote:write',
    'sessions:read',
    'sessions:write',
    'settings:read',
    'settings:write',
    'telegram:read',
    'telegram:write',
    'terminal:launch',
    'updates:read',
    'updates:write',
    'webhooks:read',
    'webhooks:write',
];

function isHermesCliCommand(command) {
    return typeof command === 'string' && HERMES_CLI_COMMAND_PATTERN.test(command.trim());
}

function buildHermesCliCommand(command) {
    const hermesCommand = typeof command === 'string' && command.trim() ? command.trim() : 'hermes';
    const configureScript = path.join(APP_ROOT, 'scripts', 'hermes', 'configure-pixcode-mcp.mjs');
    if (os.platform() === 'win32') {
        return \`& \${quotePowerShellArg(process.execPath)} \${quotePowerShellArg(configureScript)} *> $null; \${hermesCommand}\`;
    }

    return \`\${quoteBashArg(process.execPath)} \${quoteBashArg(configureScript)} >/dev/null 2>&1; exec \${hermesCommand}\`;
}

function getOrCreateHermesApiKey(userId) {
    if (!userId) return null;

    const existing = apiKeysDb
        .getApiKeys(userId)
        .find((key) => key.key_name === 'Hermes Agent MCP' && key.is_active);
    if (existing?.api_key) {
        const existingScopes = Array.isArray(existing.scopes) ? existing.scopes : [];
        const missingScopes = HERMES_AGENT_API_SCOPES.filter((scope) => !existingScopes.includes(scope));
        if (missingScopes.length > 0 && existing.id) {
            apiKeysDb.updateApiKeyScopes(userId, existing.id, [...existingScopes, ...missingScopes]);
        }
        return existing.api_key;
    }

    return apiKeysDb.createApiKey(userId, 'Hermes Agent MCP', HERMES_AGENT_API_SCOPES).apiKey;
}

// Single WebSocket server that handles both paths
const wss = new WebSocketServer({
    server,
    verifyClient: (info) => {
        console.log('WebSocket connection attempt to:', info.req.url);

        // Platform mode: always allow connection
        if (IS_PLATFORM) {
            const user = authenticateWebSocket(null); // Will return first user
            if (!user) {
                console.log('[WARN] Platform mode: No user found in database');
                return false;
            }
            info.req.user = user;
            console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
            return true;
        }

        // Normal mode: verify token
        // Extract token from query parameters or headers
        const url = new URL(info.req.url, 'http://localhost');
        const token = url.searchParams.get('token') ||
            info.req.headers.authorization?.split(' ')[1];

        // Verify token
        const user = authenticateWebSocket(token);
        if (!user) {
            console.log('[WARN] WebSocket authentication failed');
            return false;
        }

        // Store user info in the request for later use
        info.req.user = user;
        console.log('[OK] WebSocket authenticated for user:', user.username);
        return true;
    }
});

// Make WebSocket server available to routes
app.locals.wss = wss;
app.locals.installMode = installMode;
app.locals.serverVersion = SERVER_VERSION;
setNotificationWebSocketServer(wss);

app.use(cors({ exposedHeaders: ['X-Refreshed-Token'] }));
app.use(express.json({
    limit: '50mb',
    type: (req) => {
        // Skip multipart/form-data requests (for file uploads like images)
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            return false;
        }
        return contentType.includes('json');
    }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Public health check endpoint (no authentication required)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        installMode,
        version: SERVER_VERSION
    });
});

// Optional API key validation (if configured)
app.use('/api', validateApiKey);

app.post('/api/shell/sessions/terminate', authenticateToken, (req, res) => {
    const provider = req.body?.provider || 'claude';
    const projectPath = req.body?.projectPath || os.homedir();

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const killedSessions = killProviderPtySessions(projectPath, provider);
    res.json({ success: true, killedSessions });
});

app.get('/api/shell/sessions/provider-output', authenticateToken, (req, res) => {
    const provider = String(req.query.provider || 'claude');
    const projectPath = typeof req.query.projectPath === 'string' && req.query.projectPath.trim()
        ? req.query.projectPath.trim()
        : null;
    const launchId = Number.parseInt(String(req.query.launchId || ''), 10);
    const requestedLaunchId = Number.isFinite(launchId) && launchId > 0 ? launchId : null;
    const maxChars = Math.min(
        20000,
        Math.max(1000, Number.parseInt(String(req.query.maxChars || '12000'), 10) || 12000)
    );

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const requestedProjectPath = projectPath ? path.resolve(projectPath) : null;
    let matchedSession = null;
    for (const session of ptySessionsMap.values()) {
        if (
            session?.provider === provider &&
            !session?.isPlainShell &&
            (!requestedProjectPath || path.resolve(session.projectPath || os.homedir()) === requestedProjectPath) &&
            (!requestedLaunchId || session.hermesLaunchId === requestedLaunchId)
        ) {
            if (!matchedSession || (session.updatedAt || 0) > (matchedSession.updatedAt || 0)) {
                matchedSession = session;
            }
        }
    }

    if (!matchedSession) {
        return res.json({
            active: false,
            provider,
            projectPath: requestedProjectPath,
            launchId: requestedLaunchId,
            output: '',
            message: 'No active provider terminal session found for this project.',
        });
    }

    const rawOutput = matchedSession.buffer.join('').slice(-maxChars);
    const output = stripAnsiSequences(rawOutput);
    const terminalState = resolveProviderTerminalState(matchedSession, provider, output);
    res.json({
        active: true,
        provider,
        projectPath: path.resolve(matchedSession.projectPath || os.homedir()),
        sessionId: matchedSession.sessionId || null,
        launchId: matchedSession.hermesLaunchId || null,
        updatedAt: matchedSession.updatedAt || null,
        ...terminalState,
        output,
    });
});

app.post('/api/shell/sessions/provider-input', authenticateToken, (req, res) => {
    const provider = String(req.body?.provider || 'claude');
    const projectPath = typeof req.body?.projectPath === 'string' && req.body.projectPath.trim()
        ? req.body.projectPath.trim()
        : null;
    const launchId = Number.parseInt(String(req.body?.launchId || ''), 10);
    const requestedLaunchId = Number.isFinite(launchId) && launchId > 0 ? launchId : null;
    const input = typeof req.body?.input === 'string' ? req.body.input : '';
    const submit = req.body?.submit !== false;

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const requestedProjectPath = projectPath ? path.resolve(projectPath) : null;
    let matchedSession = null;
    for (const session of ptySessionsMap.values()) {
        if (
            session?.provider === provider &&
            !session?.isPlainShell &&
            session?.pty &&
            session.lifecycleState === 'running' &&
            (!requestedProjectPath || path.resolve(session.projectPath || os.homedir()) === requestedProjectPath) &&
            (!requestedLaunchId || session.hermesLaunchId === requestedLaunchId)
        ) {
            if (!matchedSession || (session.updatedAt || 0) > (matchedSession.updatedAt || 0)) {
                matchedSession = session;
            }
        }
    }

    if (!matchedSession?.pty) {
        return res.status(404).json({
            ok: false,
            provider,
            projectPath: requestedProjectPath,
            launchId: requestedLaunchId,
            wrote: false,
            message: 'No running provider terminal session found for this project.',
        });
    }

    const data = submit ? normalizeTerminalStartupInput(input) : input;
    try {
        matchedSession.pty.write(data);
        matchedSession.updatedAt = Date.now();
        res.json({
            ok: true,
            provider,
            projectPath: path.resolve(matchedSession.projectPath || os.homedir()),
            sessionId: matchedSession.sessionId || null,
            launchId: matchedSession.hermesLaunchId || null,
            wrote: true,
            submitted: submit,
            bytes: Buffer.byteLength(data),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            provider,
            wrote: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Projects API Routes (protected)
app.use('/api/projects', authenticateToken, projectsRoutes);

// Git API Routes (protected)
app.use('/api/git', authenticateToken, gitRoutes);

// Cursor API Routes (protected)
app.use('/api/cursor', authenticateToken, cursorRoutes);

// MCP utilities
app.use('/api/mcp-utils', authenticateToken, mcpUtilsRoutes);

// Commands API Routes (protected)
app.use('/api/commands', authenticateToken, commandsRoutes);

// Settings API Routes (protected)
app.use('/api/settings', authenticateToken, settingsRoutes);

// User API Routes (protected)
app.use('/api/user', authenticateToken, userRoutes);

// Codex API Routes (protected)
app.use('/api/codex', authenticateToken, codexRoutes);

// Gemini API Routes (protected)
app.use('/api/gemini', authenticateToken, geminiRoutes);

// Qwen Code API Routes (protected)
app.use('/api/qwen', authenticateToken, qwenRoutes);

// Plugins API Routes (protected)
app.use('/api/plugins', authenticateToken, pluginsRoutes);

// Unified session messages route (protected)
app.use('/api/sessions', authenticateToken, messagesRoutes);

// Diagnostics API Routes (protected)
app.use('/api/diagnostics', authenticateToken, diagnosticsRoutes);

// Remote connection API Routes (protected)
app.use('/api/remote', authenticateToken, remoteRoutes);

// Public automation manifest (protected so private host details only go to signed-in clients)
app.use('/api/public', authenticateToken, publicApiRoutes);

// Outbound webhook automation (protected)
app.use('/api/webhooks', authenticateToken, webhooksRoutes);

// Production agent loop APIs (protected)
app.use('/api/production-agent-loop', authenticateToken, productionAgentLoopRoutes);

// Platform control plane APIs (protected)
app.use('/api/platformization', authenticateToken, platformizationRoutes);

// Project Live View (protected control API + public share proxy)
app.use('/api/live-view', authenticateToken, liveViewRoutes);

// Unified provider MCP routes (protected)
app.use('/api/providers', authenticateToken, providerRoutes);

// Hermes internal task router has its own localhost/auth middleware; do not wrap with authenticateToken.
adapterRegistry.register(new ClaudeCodeA2AAdapter());
adapterRegistry.register(new CodexA2AAdapter());
adapterRegistry.register(new CursorA2AAdapter());
adapterRegistry.register(new GeminiA2AAdapter());
adapterRegistry.register(new QwenA2AAdapter());
adapterRegistry.register(new OpenCodeA2AAdapter());
adapterRegistry.register(new JsonEventA2AAdapter());
app.use('/hermes', createHermesTaskRouter());
app.use('/preview', authenticateToken, createPreviewProxyRouter());
app.use('/api/orchestration', authenticateToken, createOrchestrationTaskRouter());
app.use('/api/orchestration/hermes', authenticateToken, createHermesRouter({
    appRoot: APP_ROOT,
    createHermesApiKey: getOrCreateHermesApiKey,
    resolvePublicBaseUrl,
}));
app.use('/api/orchestration', authenticateToken, createWorkflowRouter());
app.use('/live', createLiveViewPublicRouter());

// Network discovery / QR endpoints (protected)
app.use('/api/network', authenticateToken, networkRoutes);

// Telegram integration (protected)
app.use('/api/telegram', authenticateToken, telegramRoutes);

// Agent API Routes (uses API key authentication)
app.use('/api/agent', agentRoutes);

// Static app files served after API routes. Keep dist before public so
// / and /index.html always resolve to the Pixcode app, not the GitHub Pages
// landing page that also lives in public/index.html.
const monacoAssetsPath = resolveMonacoAssetsPath();
if (monacoAssetsPath) {
    app.use(MONACO_ASSETS_ROUTE, express.static(monacoAssetsPath, {
        index: false,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }));
} else {
    console.warn('[monaco] Local Monaco assets not found; code editor loader may fail.');
}

app.use(express.static(path.join(APP_ROOT, 'dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            // Prevent HTML caching to avoid service worker issues after builds
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.match(/\\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
            // Cache static assets for 1 year (they have hashed names)
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Serve extra public files (api-docs.html, llms.txt, landing pages) without
// letting public/index.html shadow the production app root.
app.use(express.static(path.join(APP_ROOT, 'public'), {
    index: false,
}));

// API Routes (protected)
// /api/config endpoint removed - no longer needed
// Frontend now uses window.location for WebSocket URLs

// System update endpoint \u2014 streams live output via Server-Sent Events so the
// UI sees npm/git progress in real time instead of waiting ~2 minutes for the
// buffered response.
//
// Three update modes, picked in order of specificity:
//   1. PIXCODE_RUNTIME_DIR set \u2192 "desktop wrapper" path. Pulls the latest
//      npm tarball, extracts it to the writable runtime dir, and triggers
//      a server restart so the Electron wrapper respawns with new code.
//      ~4 MB download, ~10 s; no npm/git/shell required on the host.
//   2. installMode === 'git' \u2192 safe git updater script. It stashes dirty
//      checkout state before pulling so source installs do not fail on local
//      modified files left by older releases or manual edits.
//   3. fallback \u2192 \`npm install -g \u2026\` (classic npm-distributed install).
app.post('/api/system/update', authenticateToken, async (req, res) => {
    const projectRoot = APP_ROOT;
    console.log('Starting system update from directory:', projectRoot);

    const runtimeDir = process.env.PIXCODE_RUNTIME_DIR || null;
    const gitUpdateScript = path.join(projectRoot, 'scripts', 'update-git-install.mjs');

    const updateCommand = IS_PLATFORM
        ? 'npm run update:platform'
        : installMode === 'git'
            ? \`\${JSON.stringify(process.execPath)} \${JSON.stringify(gitUpdateScript)}\`
            : 'npm install -g @pixelbyte-software/pixcode@latest';
    const updateCommandLabel = IS_PLATFORM
        ? 'Pixcode platform update'
        : installMode === 'git'
            ? 'Pixcode source update'
            : 'pixcode update';

    const updateCwd = IS_PLATFORM || installMode === 'git'
        ? projectRoot
        : os.homedir();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }
    // Disable Nagle's buffering on the underlying socket so the done
    // event arrives at the client with no TCP coalescing delay. Without
    // this the runtime-dir self-exit path can race the OS flush (esp. on
    // Windows loopback), the client sees a clean close without a done
    // frame, and our strict post-review logic throws "stream ended
    // without completion event" even though the swap actually succeeded.
    if (res.socket && typeof res.socket.setNoDelay === 'function') {
        try { res.socket.setNoDelay(true); } catch { /* non-fatal */ }
    }

    // Single-source end guard. When spawn() fails with ENOENT both the
    // 'error' and 'close' handlers can fire on the child, and before this
    // guard both would try to write a \`done\` event + call res.end(), which
    // crashed the process with ERR_HTTP_HEADERS_SENT.
    let ended = false;
    const endStream = () => {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        res.end();
    };

    const send = (event, payload) => {
        if (ended) return;
        res.write(\`event: \${event}\\n\`);
        res.write(\`data: \${JSON.stringify(payload)}\\n\\n\`);
    };

    // Heartbeat keeps intermediate proxies from closing an idle connection
    // during long npm installs. Declared before spawn so the handlers below
    // can reference it, and guarded against writes after end.
    const heartbeat = setInterval(() => {
        if (ended) return;
        res.write(': ping\\n\\n');
    }, 15000);

    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Runtime-dir mode \u2014 the desktop wrapper (pixcode-desktop) sets
    // PIXCODE_RUNTIME_DIR to a writable directory it owns and forks this
    // server from there. Updates download the npm tarball directly and
    // swap it in-place, which is ~4 MB vs. ~85 MB for a full installer
    // re-download. No shell, npm, or git required on the host.
    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (runtimeDir) {
        send('log', { stream: 'meta', chunk: \`Update mode: runtime-dir\\n\` });
        send('log', { stream: 'meta', chunk: \`Runtime: \${runtimeDir}\\n\` });

        try {
            // 1. Resolve the latest version from the npm registry.
            send('log', { stream: 'meta', chunk: 'Querying registry for latest version\u2026\\n' });
            const registryRes = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode');
            if (!registryRes.ok) throw new Error(\`Registry returned HTTP \${registryRes.status}\`);
            const metadata = await registryRes.json();
            const latestVersion = metadata['dist-tags']?.latest;
            const latestEntry = latestVersion ? metadata.versions?.[latestVersion] : null;
            const tarballUrl = latestEntry?.dist?.tarball;
            if (!latestVersion || !tarballUrl) throw new Error('Registry response missing latest/tarball');

            send('log', { stream: 'meta', chunk: \`Current: \${SERVER_VERSION} \u2192 Latest: \${latestVersion}\\n\` });

            if (latestVersion === SERVER_VERSION) {
                send('done', {
                    success: true,
                    version: SERVER_VERSION,
                    alreadyLatest: true,
                    message: 'Already on the latest version.',
                });
                endStream();
                return;
            }

            // 2. Download the tarball stream and pipe it through tar's
            //    extractor into a staging directory. Doing the extract
            //    under \`.staging\` first means the live runtime stays
            //    intact if the download fails partway through.
            send('log', { stream: 'meta', chunk: \`Downloading \${tarballUrl}\\n\` });
            const tarballRes = await fetch(tarballUrl);
            if (!tarballRes.ok || !tarballRes.body) {
                throw new Error(\`Tarball fetch failed: HTTP \${tarballRes.status}\`);
            }

            const stagingDir = path.join(runtimeDir, '.staging');
            const backupDir = path.join(runtimeDir, '.previous');
            fs.rmSync(stagingDir, { recursive: true, force: true });
            fs.mkdirSync(stagingDir, { recursive: true });

            const { Readable } = await import('node:stream');
            const tarModule = await import('tar');
            const tarExtract = tarModule.x || tarModule.default?.x;
            if (!tarExtract) throw new Error('tar extractor not available');

            // npm tarballs always root at \`package/\` \u2014 strip:1 lifts the
            // contents to the staging dir directly so paths match the
            // existing runtime layout.
            await new Promise((resolve, reject) => {
                const webStream = tarballRes.body;
                const nodeStream = typeof Readable.fromWeb === 'function' && webStream?.getReader
                    ? Readable.fromWeb(webStream)
                    : webStream;
                const extractor = tarExtract({ cwd: stagingDir, strip: 1 });
                nodeStream.pipe(extractor);
                extractor.on('finish', resolve);
                extractor.on('error', reject);
                nodeStream.on('error', reject);
            });

            send('log', { stream: 'meta', chunk: 'Swapping runtime\u2026\\n' });

            // 3. Atomic swap: move every top-level entry from staging into
            //    the runtime, keeping a .previous snapshot for rollback.
            //    We don't blow away the whole runtime because userData
            //    may contain wrapper-managed files (auth DB cache, etc.)
            //    that we don't want to touch.
            fs.rmSync(backupDir, { recursive: true, force: true });
            fs.mkdirSync(backupDir, { recursive: true });
            for (const entry of fs.readdirSync(stagingDir)) {
                const src = path.join(stagingDir, entry);
                const dst = path.join(runtimeDir, entry);
                if (fs.existsSync(dst)) {
                    fs.renameSync(dst, path.join(backupDir, entry));
                }
                fs.renameSync(src, dst);
            }
            fs.rmSync(stagingDir, { recursive: true, force: true });

            // 3a. Reconcile node_modules with the NEW package.json.
            //     npm tarballs intentionally ship WITHOUT node_modules, so
            //     if this release changed \`dependencies\` (e.g. bcrypt \u2192
            //     bcryptjs in 1.32.0) the runtime dir now has new code
            //     importing packages that aren't installed. We fix that
            //     by running \`npm install --production\` in-place.
            //     Skipped when the NEW package.json's dependency set is
            //     identical to the .previous/ one \u2014 no need to pay the
            //     10-30 sec cost for pure-code updates.
            const depsChanged = (() => {
                try {
                    const prevPkg = JSON.parse(fs.readFileSync(path.join(backupDir, 'package.json'), 'utf8'));
                    const nextPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
                    const prevDeps = JSON.stringify(prevPkg.dependencies || {});
                    const nextDeps = JSON.stringify(nextPkg.dependencies || {});
                    return prevDeps !== nextDeps;
                } catch {
                    // Can't read either side \u2014 reconcile to be safe.
                    return true;
                }
            })();

            if (depsChanged) {
                send('log', { stream: 'meta', chunk: 'Reconciling node_modules with new package.json\u2026\\n' });
                const npmOk = await new Promise((resolveInstall) => {
                    const npmChild = spawn('npm', ['install', '--production', '--no-audit', '--no-fund', '--no-save'], {
                        cwd: runtimeDir,
                        env: process.env,
                        shell: true,
                    });
                    // Stream output so the user sees progress (and so
                    // a mid-install hang is obvious rather than silent).
                    npmChild.stdout?.on('data', (chunk) => {
                        send('log', { stream: 'stdout', chunk: chunk.toString() });
                    });
                    npmChild.stderr?.on('data', (chunk) => {
                        // npm writes warnings to stderr even on success, so
                        // we surface them but don't treat them as failure.
                        send('log', { stream: 'stderr', chunk: chunk.toString() });
                    });
                    npmChild.on('error', (err) => {
                        send('log', { stream: 'meta', chunk: \`npm install spawn failed: \${err.message}\\n\` });
                        resolveInstall(false);
                    });
                    npmChild.on('close', (code) => {
                        if (code === 0) {
                            send('log', { stream: 'meta', chunk: 'node_modules reconciled.\\n' });
                            resolveInstall(true);
                        } else {
                            send('log', { stream: 'meta', chunk: \`npm install exited with code \${code}\\n\` });
                            resolveInstall(false);
                        }
                    });
                });
                if (!npmOk) {
                    // The swap already happened \u2014 rolling back is expensive
                    // and leaves node_modules in an uncertain state either
                    // way. Report failure with a clear remediation hint so
                    // the user knows what to do next (quit + run npm install
                    // manually, or reinstall from the .exe/.dmg/.deb).
                    send('done', {
                        success: false,
                        error: \`Update downloaded to \${latestVersion} but \\\`npm install\\\` failed \u2014 node_modules may be missing packages. Quit Pixcode and run "npm install --production" in \${runtimeDir}, or reinstall from the latest installer.\`,
                    });
                    endStream();
                    return;
                }
            }

            send('done', {
                success: true,
                version: latestVersion,
                // \`selfRestarting\` tells the UI "don't POST /restart \u2014
                // we're about to exit on our own, just poll /health until
                // the wrapper brings us back". Without this flag the
                // client sees the server disappear, gets a connection
                // refused on /restart, and shows the user a spurious
                // "Restart request failed" error \u2014 even though the
                // update actually succeeded.
                selfRestarting: true,
                message: \`Updated to \${latestVersion}. Restarting automatically\u2026\`,
            });
            endStream();

            // 4. Self-exit so the Electron wrapper respawns the server
            //    against the freshly-extracted files. 500 ms gives the
            //    SSE stream time to flush the done event + arrive at
            //    the client across slow loopback / virtual adapters.
            setTimeout(() => {
                // Exit code 42 is a convention the wrapper watches for \u2014
                // it means "clean update restart, please respawn".
                console.log('[update] Restarting for runtime-dir update');
                process.exit(42);
            }, 500);
            return;
        } catch (error) {
            console.error('Runtime-dir update failed:', error);
            send('done', { success: false, error: error?.message || String(error) });
            endStream();
            return;
        }
    }

    // Short-circuit for "already on latest" in the npm-global path so
    // users don't accidentally crash their own daemon by clicking Update
    // while already up to date. The runtime-dir branch above already has
    // this guard (line ~504); replicate it for npm mode. Git mode still
    // runs because users may be on the latest package version but behind
    // the source branch or have a dirty checkout that needs normalization.
    if (!IS_PLATFORM && installMode === 'npm') {
        try {
            send('log', { stream: 'meta', chunk: 'Querying registry for latest version\u2026\\n' });
            const registryRes = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode');
            if (registryRes.ok) {
                const metadata = await registryRes.json();
                const latestVersion = metadata['dist-tags']?.latest;
                if (latestVersion && latestVersion === SERVER_VERSION) {
                    send('log', { stream: 'meta', chunk: \`Already on \${SERVER_VERSION} \u2014 nothing to do.\\n\` });
                    send('done', {
                        success: true,
                        version: SERVER_VERSION,
                        alreadyLatest: true,
                        message: 'Already on the latest version.',
                    });
                    endStream();
                    return;
                }
            }
        } catch (err) {
            // Registry unreachable \u2014 fall through to the install attempt
            // rather than block the user. Log and continue.
            console.warn('[update] Registry precheck failed:', (err && err.message) || err);
        }
    }

    send('log', { stream: 'meta', chunk: \`Running: \${updateCommandLabel}\\n\` });

    // Cross-platform shell invocation. \`detached: true\` + \`unref()\` below
    // means the install child survives if this server process gets killed
    // mid-install (which is common on Linux when \`npm install -g\`
    // overwrites the running package's own files \u2014 the running process
    // can segfault or the supervisor kills it). Without detachment, a
    // killed parent tears down the npm child too and users end up with
    // a half-installed package and no server at all.
    const child = spawn(updateCommand, {
        cwd: updateCwd,
        env: process.env,
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Don't hold a reference that keeps the event loop alive or ties the
    // child's lifetime to ours \u2014 we want it to outlive a daemon restart.
    try { child.unref(); } catch { /* noop */ }

    let clientAborted = false;
    req.on('close', () => {
        if (!res.writableEnded) {
            clientAborted = true;
            try { child.kill(); } catch { /* noop */ }
        }
    });

    child.stdout?.on('data', (data) => {
        send('log', { stream: 'stdout', chunk: data.toString() });
    });

    child.stderr?.on('data', (data) => {
        send('log', { stream: 'stderr', chunk: data.toString() });
    });

    child.on('error', (error) => {
        if (ended) return;
        console.error('Update process error:', error);
        send('done', { success: false, error: error.message });
        endStream();
    });

    child.on('close', (code) => {
        if (ended) return;
        if (clientAborted) {
            endStream();
            return;
        }
        if (code === 0) {
            send('done', {
                success: true,
                version: SERVER_VERSION,
                message: 'Update completed. Restart the server to apply changes.',
            });
        } else {
            send('done', {
                success: false,
                error: \`Update command exited with code \${code}\`,
            });
        }
        endStream();
    });
});

// Restart endpoint \u2014 exits the current process so an external wrapper
// (systemd/pm2/daemon manager) can bring the server back on the new code.
// Foreground installs without a wrapper will simply stop; the UI reports this.
app.post('/api/system/restart', authenticateToken, (req, res) => {
    res.json({
        success: true,
        version: SERVER_VERSION,
        message: 'Server is shutting down for restart. Reconnecting...'
    });

    // Give the response time to flush before we exit.
    setTimeout(() => {
        console.log('Restart requested via /api/system/restart \u2014 exiting process.');
        process.exit(0);
    }, 250);
});

app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await getProjects(broadcastProgress);
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/projects/:projectName/sessions', authenticateToken, async (req, res) => {
    try {
        const { limit = 5, offset = 0 } = req.query;
        const result = await getSessions(req.params.projectName, parseInt(limit), parseInt(offset));
        applyCustomSessionNames(result.sessions, 'claude');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rename project endpoint
app.put('/api/projects/:projectName/rename', authenticateToken, async (req, res) => {
    try {
        const { displayName } = req.body;
        await renameProject(req.params.projectName, displayName);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete session endpoint
app.delete('/api/projects/:projectName/sessions/:sessionId', authenticateToken, async (req, res) => {
    try {
        const { projectName, sessionId } = req.params;
        console.log(\`[API] Deleting session: \${sessionId} from project: \${projectName}\`);
        await deleteSession(projectName, sessionId);
        sessionNamesDb.deleteName(sessionId, 'claude');
        console.log(\`[API] Session \${sessionId} deleted successfully\`);
        res.json({ success: true });
    } catch (error) {
        console.error(\`[API] Error deleting session \${req.params.sessionId}:\`, error);
        res.status(500).json({ error: error.message });
    }
});

// Rename session endpoint
app.put('/api/sessions/:sessionId/rename', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safeSessionId || safeSessionId !== String(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId' });
        }
        const { summary, provider } = req.body;
        if (!summary || typeof summary !== 'string' || summary.trim() === '') {
            return res.status(400).json({ error: 'Summary is required' });
        }
        if (summary.trim().length > 500) {
            return res.status(400).json({ error: 'Summary must not exceed 500 characters' });
        }
        if (!provider || !VALID_PROVIDERS.includes(provider)) {
            return res.status(400).json({ error: \`Provider must be one of: \${VALID_PROVIDERS.join(', ')}\` });
        }
        sessionNamesDb.setName(safeSessionId, provider, summary.trim());
        res.json({ success: true });
    } catch (error) {
        console.error(\`[API] Error renaming session \${req.params.sessionId}:\`, error);
        res.status(500).json({ error: error.message });
    }
});

// Delete project endpoint
// force=true to allow removal even when sessions exist
// deleteData=true to also delete session/memory files on disk (destructive)
app.delete('/api/projects/:projectName', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const force = req.query.force === 'true';
        const deleteData = req.query.deleteData === 'true';
        await deleteProject(projectName, force, deleteData);
        res.json({ success: true });
    } catch (error) {
        // "Cannot delete project with existing sessions" is a precondition
        // failure, not a server fault \u2014 surface it as 409 so clients can
        // catch it and prompt the user to pass \`?force=true\` (or clean
        // sessions first) instead of treating it like a crash.
        const conflict = typeof error?.message === 'string' && error.message.includes('existing sessions');
        res.status(conflict ? 409 : 500).json({ error: error.message });
    }
});

// Search conversations content (SSE streaming)
app.get('/api/search/conversations', authenticateToken, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const parsedLimit = Number.parseInt(String(req.query.limit), 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 100));

    if (query.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const abortController = new AbortController();
    req.on('close', () => { closed = true; abortController.abort(); });

    try {
        await searchConversations(query, limit, ({ projectResult, totalMatches, scannedProjects, totalProjects }) => {
            if (closed) return;
            if (projectResult) {
                res.write(\`event: result\\ndata: \${JSON.stringify({ projectResult, totalMatches, scannedProjects, totalProjects })}\\n\\n\`);
            } else {
                res.write(\`event: progress\\ndata: \${JSON.stringify({ totalMatches, scannedProjects, totalProjects })}\\n\\n\`);
            }
        }, abortController.signal);
        if (!closed) {
            res.write(\`event: done\\ndata: {}\\n\\n\`);
        }
    } catch (error) {
        console.error('Error searching conversations:', error);
        if (!closed) {
            res.write(\`event: error\\ndata: \${JSON.stringify({ error: 'Search failed' })}\\n\\n\`);
        }
    } finally {
        if (!closed) {
            res.end();
        }
    }
});

const expandWorkspacePath = (inputPath) => {
    if (!inputPath) return WORKSPACES_BASE;
    return normalizeWorkspacePath(inputPath);
};

// Filesystem browser uses a home-centric expansion rather than the
// WORKSPACES_BASE-centric one above. The workspace-base treatment of \`~\`
// is right for NEW project creation (users say "my-app" and get it under
// ~/pixcode/projects/my-app) but wrong for browsing \u2014 users want to pick
// any folder on their disk, not be trapped inside the default base.
const expandBrowsePath = (inputPath) => {
    if (!inputPath) return os.homedir();
    const trimmed = String(inputPath).trim();
    if (!trimmed || trimmed === '~') return os.homedir();
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\\\')) {
        return path.join(os.homedir(), trimmed.slice(2));
    }
    return path.resolve(trimmed);
};

// Browse filesystem endpoint for project suggestions - uses existing getFileTree
app.get('/api/browse-filesystem', authenticateToken, async (req, res) => {
    try {
        const { path: dirPath } = req.query;

        console.log('[API] Browse filesystem request for path:', dirPath);
        console.log('[API] WORKSPACES_ROOT is:', WORKSPACES_ROOT);
        console.log('[API] WORKSPACES_BASE is:', WORKSPACES_BASE);
        // Default to the user's home directory so the picker feels natural
        // \u2014 users can reach arbitrary drives/folders from there. The
        // ~/pixcode/projects shortcut stays available as a suggestion.
        const defaultRoot = os.homedir();
        let targetPath = dirPath ? expandBrowsePath(dirPath) : defaultRoot;

        // Security check - ensure path is within allowed workspace root
        let validation = await validateWorkspacePath(targetPath);
        if (!validation.valid) {
            // Keep the browser functional by returning to the safe base on invalid navigation.
            const fallbackValidation = await validateWorkspacePath(defaultRoot);
            if (!fallbackValidation.valid) {
                return res.status(403).json({ error: validation.error });
            }
            validation = fallbackValidation;
        }
        const resolvedPath = validation.resolvedPath || targetPath;

        // Security check - ensure path is accessible
        try {
            if (resolvedPath === defaultRoot) {
                await fs.promises.mkdir(resolvedPath, { recursive: true });
            }
            await fs.promises.access(resolvedPath);
            const stats = await fs.promises.stat(resolvedPath);

            if (!stats.isDirectory()) {
                return res.status(400).json({ error: 'Path is not a directory' });
            }
        } catch (err) {
            return res.status(404).json({ error: 'Directory not accessible' });
        }

        // Use existing getFileTree function with shallow depth (only direct children)
        const fileTree = await getFileTree(resolvedPath, 1, 0, false); // maxDepth=1, showHidden=false

        // Filter only directories and format for suggestions
        const directories = fileTree
            .filter(item => item.type === 'directory')
            .map(item => ({
                path: item.path,
                name: item.name,
                type: 'directory'
            }))
            .sort((a, b) => {
                const aHidden = a.name.startsWith('.');
                const bHidden = b.name.startsWith('.');
                if (aHidden && !bHidden) return 1;
                if (!aHidden && bHidden) return -1;
                return a.name.localeCompare(b.name);
            });

        // Add common directories if browsing home directory
        const suggestions = [];
        let resolvedWorkspaceBase = defaultRoot;
        try {
            resolvedWorkspaceBase = await fsPromises.realpath(defaultRoot);
        } catch (error) {
            // Use default root as-is if realpath fails
        }
        if (resolvedPath === resolvedWorkspaceBase) {
            const commonDirs = ['Desktop', 'Documents', 'Projects', 'Development', 'Dev', 'Code', 'workspace'];
            const existingCommon = directories.filter(dir => commonDirs.includes(dir.name));
            const otherDirs = directories.filter(dir => !commonDirs.includes(dir.name));

            suggestions.push(...existingCommon, ...otherDirs);
        } else {
            suggestions.push(...directories);
        }

        res.json({
            path: resolvedPath,
            rootPath: resolvedWorkspaceBase,
            suggestions: suggestions
        });

    } catch (error) {
        console.error('Error browsing filesystem:', error);
        res.status(500).json({ error: 'Failed to browse filesystem' });
    }
});

app.post('/api/create-folder', authenticateToken, async (req, res) => {
    try {
        const { path: folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ error: 'Path is required' });
        }
        const expandedPath = expandWorkspacePath(folderPath);
        const resolvedInput = path.resolve(expandedPath);
        const validation = await validateWorkspacePath(resolvedInput);
        if (!validation.valid) {
            return res.status(403).json({ error: validation.error });
        }
        const targetPath = validation.resolvedPath || resolvedInput;
        const parentDir = path.dirname(targetPath);
        try {
            await fs.promises.access(parentDir);
        } catch (err) {
            return res.status(404).json({ error: 'Parent directory does not exist' });
        }
        try {
            await fs.promises.access(targetPath);
            return res.status(409).json({ error: 'Folder already exists' });
        } catch (err) {
            // Folder doesn't exist, which is what we want
        }
        try {
            await fs.promises.mkdir(targetPath, { recursive: false });
            res.json({ success: true, path: targetPath });
        } catch (mkdirError) {
            if (mkdirError.code === 'EEXIST') {
                return res.status(409).json({ error: 'Folder already exists' });
            }
            throw mkdirError;
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Read file content endpoint
app.get('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { filePath } = req.query;


        // Security: ensure the requested path is inside the project root
        if (!filePath) {
            return res.status(400).json({ error: 'Invalid file path' });
        }

        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Handle both absolute and relative paths
        const resolved = path.isAbsolute(filePath)
            ? path.resolve(filePath)
            : path.resolve(projectRoot, filePath);
        const normalizedRoot = path.resolve(projectRoot) + path.sep;
        if (!resolved.startsWith(normalizedRoot)) {
            return res.status(403).json({ error: 'Path must be under project root' });
        }

        const content = await fsPromises.readFile(resolved, 'utf8');
        res.json({ content, path: resolved });
    } catch (error) {
        console.error('Error reading file:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'File not found' });
        } else if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Serve raw file bytes for previews and downloads.
app.get('/api/projects/:projectName/files/content', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { path: filePath } = req.query;


        // Security: ensure the requested path is inside the project root
        if (!filePath) {
            return res.status(400).json({ error: 'Invalid file path' });
        }

        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Match the text reader endpoint so callers can pass either project-relative
        // or absolute paths without changing how the bytes are served.
        const resolved = path.isAbsolute(filePath)
            ? path.resolve(filePath)
            : path.resolve(projectRoot, filePath);
        const normalizedRoot = path.resolve(projectRoot) + path.sep;
        if (!resolved.startsWith(normalizedRoot)) {
            return res.status(403).json({ error: 'Path must be under project root' });
        }

        // Check if file exists
        try {
            await fsPromises.access(resolved);
        } catch (error) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get file extension and set appropriate content type
        const mimeType = mime.lookup(resolved) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);

        // Stream the file
        const fileStream = fs.createReadStream(resolved);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('Error streaming file:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error reading file' });
            }
        });

    } catch (error) {
        console.error('Error serving binary file:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Save file content endpoint
app.put('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { filePath, content } = req.body;


        // Security: ensure the requested path is inside the project root
        if (!filePath) {
            return res.status(400).json({ error: 'Invalid file path' });
        }

        if (content === undefined) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Handle both absolute and relative paths
        const resolved = path.isAbsolute(filePath)
            ? path.resolve(filePath)
            : path.resolve(projectRoot, filePath);
        const normalizedRoot = path.resolve(projectRoot) + path.sep;
        if (!resolved.startsWith(normalizedRoot)) {
            return res.status(403).json({ error: 'Path must be under project root' });
        }

        // Write the new content
        await fsPromises.writeFile(resolved, content, 'utf8');

        res.json({
            success: true,
            path: resolved,
            message: 'File saved successfully'
        });
    } catch (error) {
        console.error('Error saving file:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'File or directory not found' });
        } else if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.get('/api/projects/:projectName/files', authenticateToken, async (req, res) => {
    try {

        // Using fsPromises from import

        // Use extractProjectDirectory to get the actual project path
        let actualPath;
        try {
            actualPath = await extractProjectDirectory(req.params.projectName);
        } catch (error) {
            console.error('Error extracting project directory:', error);
            // Fallback to simple dash replacement
            actualPath = req.params.projectName.replace(/-/g, '/');
        }

        // Check if path exists
        try {
            await fsPromises.access(actualPath);
        } catch (e) {
            return res.status(404).json({ error: \`Project path not found: \${actualPath}\` });
        }

        const files = await getFileTree(actualPath, 10, 0, true);
        res.json(files);
    } catch (error) {
        console.error('[ERROR] File tree error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// FILE OPERATIONS API ENDPOINTS
// ============================================================================

/**
 * Validate that a path is within the project root
 * @param {string} projectRoot - The project root path
 * @param {string} targetPath - The path to validate
 * @returns {{ valid: boolean, resolved?: string, error?: string }}
 */
function validatePathInProject(projectRoot, targetPath) {
    const resolved = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(projectRoot, targetPath);
    const normalizedRoot = path.resolve(projectRoot) + path.sep;
    if (!resolved.startsWith(normalizedRoot)) {
        return { valid: false, error: 'Path must be under project root' };
    }
    return { valid: true, resolved };
}

/**
 * Validate filename - check for invalid characters
 * @param {string} name - The filename to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFilename(name) {
    if (!name || !name.trim()) {
        return { valid: false, error: 'Filename cannot be empty' };
    }
    // Check for invalid characters (Windows + Unix)
    const invalidChars = /[<>:"/\\\\|?*\\x00-\\x1f]/;
    if (invalidChars.test(name)) {
        return { valid: false, error: 'Filename contains invalid characters' };
    }
    // Check for reserved names (Windows)
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reserved.test(name)) {
        return { valid: false, error: 'Filename is a reserved name' };
    }
    // Check for dots only
    if (/^\\.+$/.test(name)) {
        return { valid: false, error: 'Filename cannot be only dots' };
    }
    return { valid: true };
}

// POST /api/projects/:projectName/files/create - Create new file or directory
app.post('/api/projects/:projectName/files/create', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { path: parentPath, type, name } = req.body;

        // Validate input
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        if (!['file', 'directory'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "file" or "directory"' });
        }

        const nameValidation = validateFilename(name);
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }

        // Get project root
        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Build and validate target path
        const targetDir = parentPath || '';
        const targetPath = targetDir ? path.join(targetDir, name) : name;
        const validation = validatePathInProject(projectRoot, targetPath);
        if (!validation.valid) {
            return res.status(403).json({ error: validation.error });
        }

        const resolvedPath = validation.resolved;

        // Check if already exists
        try {
            await fsPromises.access(resolvedPath);
            return res.status(409).json({ error: \`\${type === 'file' ? 'File' : 'Directory'} already exists\` });
        } catch {
            // Doesn't exist, which is what we want
        }

        // Create file or directory
        if (type === 'directory') {
            await fsPromises.mkdir(resolvedPath, { recursive: false });
        } else {
            // Ensure parent directory exists
            const parentDir = path.dirname(resolvedPath);
            try {
                await fsPromises.access(parentDir);
            } catch {
                await fsPromises.mkdir(parentDir, { recursive: true });
            }
            await fsPromises.writeFile(resolvedPath, '', 'utf8');
        }

        res.json({
            success: true,
            path: resolvedPath,
            name,
            type,
            message: \`\${type === 'file' ? 'File' : 'Directory'} created successfully\`
        });
    } catch (error) {
        console.error('Error creating file/directory:', error);
        if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Parent directory not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// PUT /api/projects/:projectName/files/rename - Rename file or directory
app.put('/api/projects/:projectName/files/rename', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { oldPath, newName } = req.body;

        // Validate input
        if (!oldPath || !newName) {
            return res.status(400).json({ error: 'oldPath and newName are required' });
        }

        const nameValidation = validateFilename(newName);
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }

        // Get project root
        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Validate old path
        const oldValidation = validatePathInProject(projectRoot, oldPath);
        if (!oldValidation.valid) {
            return res.status(403).json({ error: oldValidation.error });
        }

        const resolvedOldPath = oldValidation.resolved;

        // Check if old path exists
        try {
            await fsPromises.access(resolvedOldPath);
        } catch {
            return res.status(404).json({ error: 'File or directory not found' });
        }

        // Build and validate new path
        const parentDir = path.dirname(resolvedOldPath);
        const resolvedNewPath = path.join(parentDir, newName);
        const newValidation = validatePathInProject(projectRoot, resolvedNewPath);
        if (!newValidation.valid) {
            return res.status(403).json({ error: newValidation.error });
        }

        // Check if new path already exists
        try {
            await fsPromises.access(resolvedNewPath);
            return res.status(409).json({ error: 'A file or directory with this name already exists' });
        } catch {
            // Doesn't exist, which is what we want
        }

        // Rename
        await fsPromises.rename(resolvedOldPath, resolvedNewPath);

        res.json({
            success: true,
            oldPath: resolvedOldPath,
            newPath: resolvedNewPath,
            newName,
            message: 'Renamed successfully'
        });
    } catch (error) {
        console.error('Error renaming file/directory:', error);
        if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'File or directory not found' });
        } else if (error.code === 'EXDEV') {
            res.status(400).json({ error: 'Cannot move across different filesystems' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// DELETE /api/projects/:projectName/files - Delete file or directory
app.delete('/api/projects/:projectName/files', authenticateToken, async (req, res) => {
    try {
        const { projectName } = req.params;
        const { path: targetPath, type } = req.body;

        // Validate input
        if (!targetPath) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Get project root
        const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
        if (!projectRoot) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Validate path
        const validation = validatePathInProject(projectRoot, targetPath);
        if (!validation.valid) {
            return res.status(403).json({ error: validation.error });
        }

        const resolvedPath = validation.resolved;

        // Check if path exists and get stats
        let stats;
        try {
            stats = await fsPromises.stat(resolvedPath);
        } catch {
            return res.status(404).json({ error: 'File or directory not found' });
        }

        // Prevent deleting the project root itself
        if (resolvedPath === path.resolve(projectRoot)) {
            return res.status(403).json({ error: 'Cannot delete project root directory' });
        }

        // Delete based on type
        if (stats.isDirectory()) {
            await fsPromises.rm(resolvedPath, { recursive: true, force: true });
        } else {
            await fsPromises.unlink(resolvedPath);
        }

        res.json({
            success: true,
            path: resolvedPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            message: 'Deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting file/directory:', error);
        if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'File or directory not found' });
        } else if (error.code === 'ENOTEMPTY') {
            res.status(400).json({ error: 'Directory is not empty' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// POST /api/projects/:projectName/files/upload - Upload files
// Dynamic import of multer for file uploads
const uploadFilesHandler = async (req, res) => {
    // Dynamic import of multer
    const multer = (await import('multer')).default;

    const uploadMiddleware = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, os.tmpdir());
            },
            filename: (req, file, cb) => {
                // Use a unique temp name, but preserve original name in file.originalname
                // Note: file.originalname may contain path separators for folder uploads
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                // For temp file, just use a safe unique name without the path
                cb(null, \`upload-\${uniqueSuffix}\`);
            }
        }),
        limits: {
            fileSize: 50 * 1024 * 1024, // 50MB limit
            files: 20 // Max 20 files at once
        }
    });

    // Use multer middleware
    uploadMiddleware.array('files', 20)(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
            }
            return res.status(500).json({ error: err.message });
        }

        try {
            const { projectName } = req.params;
            const { targetPath, relativePaths } = req.body;

            // Parse relative paths if provided (for folder uploads)
            let filePaths = [];
            if (relativePaths) {
                try {
                    filePaths = JSON.parse(relativePaths);
                } catch (e) {
                    console.log('[DEBUG] Failed to parse relativePaths:', relativePaths);
                }
            }

            console.log('[DEBUG] File upload request:', {
                projectName,
                targetPath: JSON.stringify(targetPath),
                targetPathType: typeof targetPath,
                filesCount: req.files?.length,
                relativePaths: filePaths
            });

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files provided' });
            }

            // Get project root
            const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
            if (!projectRoot) {
                return res.status(404).json({ error: 'Project not found' });
            }

            console.log('[DEBUG] Project root:', projectRoot);

            // Validate and resolve target path
            // If targetPath is empty or '.', use project root directly
            const targetDir = targetPath || '';
            let resolvedTargetDir;

            console.log('[DEBUG] Target dir:', JSON.stringify(targetDir));

            if (!targetDir || targetDir === '.' || targetDir === './') {
                // Empty path means upload to project root
                resolvedTargetDir = path.resolve(projectRoot);
                console.log('[DEBUG] Using project root as target:', resolvedTargetDir);
            } else {
                const validation = validatePathInProject(projectRoot, targetDir);
                if (!validation.valid) {
                    console.log('[DEBUG] Path validation failed:', validation.error);
                    return res.status(403).json({ error: validation.error });
                }
                resolvedTargetDir = validation.resolved;
                console.log('[DEBUG] Resolved target dir:', resolvedTargetDir);
            }

            // Ensure target directory exists
            try {
                await fsPromises.access(resolvedTargetDir);
            } catch {
                await fsPromises.mkdir(resolvedTargetDir, { recursive: true });
            }

            // Move uploaded files from temp to target directory
            const uploadedFiles = [];
            console.log('[DEBUG] Processing files:', req.files.map(f => ({ originalname: f.originalname, path: f.path })));
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                // Use relative path if provided (for folder uploads), otherwise use originalname
                const fileName = (filePaths && filePaths[i]) ? filePaths[i] : file.originalname;
                console.log('[DEBUG] Processing file:', fileName, '(originalname:', file.originalname + ')');
                const destPath = path.join(resolvedTargetDir, fileName);

                // Validate destination path
                const destValidation = validatePathInProject(projectRoot, destPath);
                if (!destValidation.valid) {
                    console.log('[DEBUG] Destination validation failed for:', destPath);
                    // Clean up temp file
                    await fsPromises.unlink(file.path).catch(() => {});
                    continue;
                }

                // Ensure parent directory exists (for nested files from folder upload)
                const parentDir = path.dirname(destPath);
                try {
                    await fsPromises.access(parentDir);
                } catch {
                    await fsPromises.mkdir(parentDir, { recursive: true });
                }

                // Move file (copy + unlink to handle cross-device scenarios)
                await fsPromises.copyFile(file.path, destPath);
                await fsPromises.unlink(file.path);

                uploadedFiles.push({
                    name: fileName,
                    path: destPath,
                    size: file.size,
                    mimeType: file.mimetype
                });
            }

            res.json({
                success: true,
                files: uploadedFiles,
                targetPath: resolvedTargetDir,
                message: \`Uploaded \${uploadedFiles.length} file(s) successfully\`
            });
        } catch (error) {
            console.error('Error uploading files:', error);
            // Clean up any remaining temp files
            if (req.files) {
                for (const file of req.files) {
                    await fsPromises.unlink(file.path).catch(() => {});
                }
            }
            if (error.code === 'EACCES') {
                res.status(403).json({ error: 'Permission denied' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    });
};

app.post('/api/projects/:projectName/files/upload', authenticateToken, uploadFilesHandler);

/**
 * Proxy an authenticated client WebSocket to a plugin's internal WS server.
 * Auth is enforced by verifyClient before this function is reached.
 */
function handlePluginWsProxy(clientWs, pathname) {
    const pluginName = pathname.replace('/plugin-ws/', '');
    if (!pluginName || /[^a-zA-Z0-9_-]/.test(pluginName)) {
        clientWs.close(4400, 'Invalid plugin name');
        return;
    }

    const port = getPluginPort(pluginName);
    if (!port) {
        clientWs.close(4404, 'Plugin not running');
        return;
    }

    const upstream = new WebSocket(\`ws://127.0.0.1:\${port}/ws\`);

    upstream.on('open', () => {
        console.log(\`[Plugins] WS proxy connected to "\${pluginName}" on port \${port}\`);
    });

    // Relay messages bidirectionally
    upstream.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });
    clientWs.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });

    // Propagate close in both directions
    upstream.on('close', () => { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); });
    clientWs.on('close', () => { if (upstream.readyState === WebSocket.OPEN) upstream.close(); });

    upstream.on('error', (err) => {
        console.error(\`[Plugins] WS proxy error for "\${pluginName}":\`, err.message);
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close(4502, 'Upstream error');
    });
    clientWs.on('error', () => {
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });
}

// WebSocket connection handler that routes based on URL path
wss.on('connection', (ws, request) => {
    const url = request.url;
    console.log('[INFO] Client connected to:', url);

    // Parse URL to get pathname without query parameters
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/shell') {
        handleShellConnection(ws, request);
    } else if (pathname === '/ws') {
        handleChatConnection(ws, request);
    } else if (pathname.startsWith('/plugin-ws/')) {
        handlePluginWsProxy(ws, pathname);
    } else {
        console.log('[WARN] Unknown WebSocket path:', pathname);
        ws.close();
    }
});

/**
 * WebSocket Writer - Wrapper for WebSocket to match SSEStreamWriter interface
 *
 * Provider files use \`createNormalizedMessage()\` from \`shared/utils.js\` and
 * adapter \`normalizeMessage()\` to produce unified NormalizedMessage events.
 * The writer simply serialises and sends.
 */
class WebSocketWriter {
    constructor(ws, userId = null) {
        this.ws = ws;
        this.sessionId = null;
        this.userId = userId;
        this.isWebSocketWriter = true;  // Marker for transport detection
    }

    send(data) {
        if (this.ws.readyState === 1) { // WebSocket.OPEN
            this.ws.send(JSON.stringify(data));
        }
    }

    updateWebSocket(newRawWs) {
        this.ws = newRawWs;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
}
