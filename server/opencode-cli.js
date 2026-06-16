/**
 * OpenCode CLI adapter.
 *
 * OpenCode (https://opencode.ai, npm package: `opencode-ai`, binary: `opencode`)
 * is a multi-provider terminal coding agent. Unlike Claude/Codex/Gemini/Qwen it
 * uses XDG paths (`~/.config/opencode/` for config, `~/.local/share/opencode/`
 * for data) on Linux/macOS/Windows alike — the literal `~/.config` and
 * `~/.local/share` folders under the user profile, NOT %APPDATA% on Windows.
 *
 * Headless invocation:
 *   opencode run \
 *     --agent <build|plan>          # build (default) or plan (read-only) mode
 *     --model <provider/model>       # e.g. anthropic/claude-sonnet-4-5
 *     --format json                  # NDJSON event stream
 *     [-s <id>]                      # resume a session by id
 *     [--dangerously-skip-permissions]
 *     -- "<prompt>"
 *
 * Mirrors the structure of qwen-code-cli.js so the dispatch path in
 * server/index.js is uniform across all five spawn-based providers.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import crossSpawn from 'cross-spawn';

import sessionManager from './sessionManager.js';
import OpencodeResponseHandler from './opencode-response-handler.js';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { buildSpawnEnv } from './services/provider-credentials.js';
import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { createNormalizedMessage } from './shared/utils.js';

// `opencode.cmd` shim on Windows — cross-spawn handles the .cmd resolution.
const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

const activeOpencodeProcesses = new Map();
const DEFAULT_CLI_IDLE_TIMEOUT_MS = 600000;

function readCliIdleTimeoutMs() {
    const configured = Number.parseInt(process.env.PIXCODE_CLI_IDLE_TIMEOUT_MS || '', 10);
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CLI_IDLE_TIMEOUT_MS;
}

function mapPermissionModeToArgs(permissionMode, skipPermissions) {
    // OpenCode's permission model is per-tool/per-pattern (see opencode.json
    // "permission" key). For chat-message routing we only need the high-level
    // toggle: build (normal) vs plan (read-only) vs skip-everything.
    if (skipPermissions || permissionMode === 'bypassPermissions' || permissionMode === 'acceptEdits') {
        return { agent: 'build', dangerously: true };
    }
    if (permissionMode === 'plan') {
        return { agent: 'plan', dangerously: false };
    }
    return { agent: 'build', dangerously: false };
}

// Pixcode stores OpenCode permissions as two flat lists (`allowPatterns`,
// `denyPatterns`) in `opencode-settings` localStorage; the backend collapses
// them into the JSON shape OpenCode reads from `opencode.json`. We pass the
// merged config inline via `OPENCODE_CONFIG_CONTENT` (a documented OpenCode
// env var) instead of writing to disk — that way Pixcode's intent doesn't
// pollute the user's project tree, and project-local opencode.json overrides
// still take precedence per OpenCode's own precedence rules.
function buildOpencodePermissionConfig(settings) {
    const allow = Array.isArray(settings?.allowPatterns) ? settings.allowPatterns.filter(Boolean) : [];
    const deny = Array.isArray(settings?.denyPatterns) ? settings.denyPatterns.filter(Boolean) : [];
    if (!allow.length && !deny.length) return null;

    const bash = {};
    // Deny rules win when patterns collide — apply allow first so deny
    // overwrites duplicates.
    for (const pattern of allow) bash[pattern] = 'allow';
    for (const pattern of deny) bash[pattern] = 'deny';

    return { permission: { bash } };
}

async function spawnOpencode(command, options = {}, ws) {
    const { sessionId, projectPath, cwd, toolsSettings, permissionMode, images, sessionSummary, agent: agentOverride, suppressNotifications = false } = options;
    let capturedSessionId = sessionId;
    let sessionCreatedSent = false;
    let assistantBlocks = [];

    const settings = toolsSettings || { allowPatterns: [], denyPatterns: [], skipPermissions: false };

    const safeSessionIdPattern = /^[a-zA-Z0-9_.\-:]+$/;
    const args = ['run', '--format', 'json'];

    const { agent, dangerously } = mapPermissionModeToArgs(permissionMode, settings.skipPermissions || options.skipPermissions);
    const effectiveAgent = agentOverride || agent;
    if (effectiveAgent) {
        args.push('--agent', effectiveAgent);
    }
    if (dangerously) {
        args.push('--dangerously-skip-permissions');
    }

    if (sessionId) {
        const session = sessionManager.getSession(sessionId);
        const cliId = session?.cliSessionId || sessionId;
        // OpenCode CLI requires session IDs to start with 'ses' (e.g. ses_22d6…).
        // Pixcode's internal IDs (opencode_xxxxx) must NOT be passed to -s,
        // otherwise the CLI exits with "Invalid session ID: must start with 'ses'".
        if (cliId && safeSessionIdPattern.test(cliId) && cliId.startsWith('ses')) {
            args.push('-s', cliId);
        }
    }

    const modelToUse = options.model;
    if (modelToUse) {
        args.push('--model', modelToUse);
    }

    const cleanPath = (cwd || projectPath || process.cwd()).replace(/[^\x20-\x7E]/g, '').trim();
    const workingDir = cleanPath;

    // Image attachments: OpenCode accepts repeated `-f <path>` flags. We dump
    // base64 attachments to a tmp dir under the project root and pass each path.
    const tempImagePaths = [];
    let tempDir = null;
    if (images && images.length > 0) {
        try {
            tempDir = path.join(workingDir, '.tmp', 'opencode-images', Date.now().toString());
            await fs.mkdir(tempDir, { recursive: true });

            for (const [index, image] of images.entries()) {
                const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) continue;
                const [, mimeType, base64Data] = matches;
                const extension = mimeType.split('/')[1] || 'png';
                const filename = `image_${index}.${extension}`;
                const filepath = path.join(tempDir, filename);
                await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
                tempImagePaths.push(filepath);
                args.push('-f', filepath);
            }
        } catch (error) {
            console.error('Error processing images for OpenCode:', error);
        }
    }

    // Prompt is the trailing positional. Use `--` to be safe against prompts
    // that start with a `-`.
    if (command && command.trim()) {
        args.push('--', command);
    }

    // OPENCODE_CLI_PATH is exported by primeCliBinPath() during boot. Falls
    // back to the bare binary name (resolved via PATH) when unset.
    const opencodePath = process.env.OPENCODE_CLI_PATH || 'opencode';
    console.log('Spawning OpenCode CLI:', opencodePath, args.join(' '));
    console.log('Working directory:', workingDir);

    let spawnCmd = opencodePath;
    let spawnArgs = args;

    if (os.platform() !== 'win32') {
        // Force `exec` so the child replaces the wrapper shell — keeps SIGTERM
        // delivery clean when we abort the session. Same trick as qwen-cli.
        spawnCmd = 'sh';
        spawnArgs = ['-c', 'exec "$0" "$@"', opencodePath, ...args];
    }

    const spawnEnv = await buildSpawnEnv('opencode');

    // Inject Pixcode's permission allow/deny patterns as inline OpenCode config.
    // Skipped when `--dangerously-skip-permissions` is on (the flag overrides
    // the config anyway) and when both lists are empty (avoid clobbering a
    // project-local opencode.json the user has hand-tuned).
    if (!dangerously) {
        const permConfig = buildOpencodePermissionConfig(settings);
        if (permConfig) {
            try {
                spawnEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify(permConfig);
            } catch (error) {
                console.warn('[opencode] Failed to serialize permission config:', error?.message || error);
            }
        }
    }

    return new Promise((resolve, reject) => {
        const opencodeProcess = spawnFunction(spawnCmd, spawnArgs, {
            cwd: workingDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: spawnEnv,
        });

        let terminalNotificationSent = false;
        let terminalFailureReason = null;
        let terminalFailurePersisted = false;

        const persistTerminalFailure = (message) => {
            const content = typeof message === 'string' && message.trim()
                ? message.trim()
                : null;
            if (!content || terminalFailurePersisted) return;

            const finalSessionId = capturedSessionId || sessionId || processKey;
            if (!finalSessionId) return;

            sessionManager.addMessage(finalSessionId, 'assistant', content);
            terminalFailurePersisted = true;
        };

        const notifyTerminalState = ({ code = null, error = null } = {}) => {
            if (terminalNotificationSent) return;
            terminalNotificationSent = true;

            const finalSessionId = capturedSessionId || sessionId || processKey;
            if (code === 0 && !error) {
                if (!suppressNotifications) notifyRunStopped({
                    userId: ws?.userId || null,
                    provider: 'opencode',
                    sessionId: finalSessionId,
                    sessionName: sessionSummary,
                    stopReason: 'completed',
                });
                return;
            }

            if (!suppressNotifications) notifyRunFailed({
                userId: ws?.userId || null,
                provider: 'opencode',
                sessionId: finalSessionId,
                sessionName: sessionSummary,
                error: error || terminalFailureReason || `OpenCode CLI exited with code ${code}`,
            });
        };

        opencodeProcess.tempImagePaths = tempImagePaths;
        opencodeProcess.tempDir = tempDir;

        const processKey = capturedSessionId || sessionId || `opencode_${Date.now()}`;
        activeOpencodeProcesses.set(processKey, opencodeProcess);
        opencodeProcess.sessionId = processKey;

        opencodeProcess.stdin.end();

        const timeoutMs = readCliIdleTimeoutMs();
        let timeout;
        const startTimeout = () => {
            if (timeout) clearTimeout(timeout);
            if (timeoutMs === 0) return;
            timeout = setTimeout(() => {
                const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);
                terminalFailureReason = `OpenCode CLI timeout - no response received for ${timeoutMs / 1000} seconds`;
                ws.send(createNormalizedMessage({ kind: 'error', content: terminalFailureReason, sessionId: socketSessionId, provider: 'opencode' }));
                try { opencodeProcess.kill('SIGTERM'); } catch { /* noop */ }
            }, timeoutMs);
        };
        startTimeout();

        if (command && capturedSessionId) {
            sessionManager.addMessage(capturedSessionId, 'user', command);
        }

        let responseHandler;
        if (ws) {
            responseHandler = new OpencodeResponseHandler(ws, {
                onContentFragment: (content) => {
                    if (assistantBlocks.length > 0 && assistantBlocks[assistantBlocks.length - 1].type === 'text') {
                        assistantBlocks[assistantBlocks.length - 1].text += content;
                    } else {
                        assistantBlocks.push({ type: 'text', text: content });
                    }
                },
                onToolUse: (event) => {
                    assistantBlocks.push({
                        type: 'tool_use',
                        id: event.tool_id,
                        name: event.tool_name,
                        input: event.parameters,
                    });
                },
                onToolResult: (event) => {
                    if (capturedSessionId) {
                        if (assistantBlocks.length > 0) {
                            sessionManager.addMessage(capturedSessionId, 'assistant', [...assistantBlocks]);
                            assistantBlocks = [];
                        }
                        sessionManager.addMessage(capturedSessionId, 'user', [{
                            type: 'tool_result',
                            tool_use_id: event.tool_id,
                            content: event.output === undefined ? null : event.output,
                            is_error: event.status === 'error',
                        }]);
                    }
                },
                onInit: (event) => {
                    if (capturedSessionId) {
                        const sess = sessionManager.getSession(capturedSessionId);
                        if (sess && !sess.cliSessionId) {
                            sess.cliSessionId = event.session_id;
                            sessionManager.saveSession(capturedSessionId);
                        }
                    }
                },
                onError: (content) => {
                    terminalFailureReason = content || 'OpenCode streaming error';
                },
            });
        }

        opencodeProcess.stdout.on('data', (data) => {
            const rawOutput = data.toString();
            startTimeout();

            if (!sessionId && !sessionCreatedSent && !capturedSessionId) {
                capturedSessionId = `opencode_${Date.now()}`;
                sessionCreatedSent = true;

                sessionManager.createSession(capturedSessionId, cwd || process.cwd());
                if (command) {
                    sessionManager.addMessage(capturedSessionId, 'user', command);
                }
                if (processKey !== capturedSessionId) {
                    activeOpencodeProcesses.delete(processKey);
                    activeOpencodeProcesses.set(capturedSessionId, opencodeProcess);
                }

                ws.setSessionId && typeof ws.setSessionId === 'function' && ws.setSessionId(capturedSessionId);
                ws.send(createNormalizedMessage({ kind: 'session_created', newSessionId: capturedSessionId, sessionId: capturedSessionId, provider: 'opencode' }));
            }

            if (responseHandler) {
                responseHandler.processData(rawOutput);
            } else if (rawOutput) {
                if (assistantBlocks.length > 0 && assistantBlocks[assistantBlocks.length - 1].type === 'text') {
                    assistantBlocks[assistantBlocks.length - 1].text += rawOutput;
                } else {
                    assistantBlocks.push({ type: 'text', text: rawOutput });
                }
                const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId);
                ws.send(createNormalizedMessage({ kind: 'stream_delta', content: rawOutput, sessionId: socketSessionId, provider: 'opencode' }));
            }
        });

        opencodeProcess.stderr.on('data', (data) => {
            const rawMsg = data.toString();
            startTimeout();
            // Suppress known cosmetic noise.
            if (rawMsg.includes('[DEP0040]') ||
                rawMsg.includes('DeprecationWarning') ||
                rawMsg.includes('--trace-deprecation') ||
                rawMsg.includes('punycode')) {
                return;
            }

            // Pre-stream validation errors land on stderr as plain text BEFORE
            // the JSON event stream opens (e.g. "Model must be in the format
            // provider/model"). Map the common ones to actionable copy.
            let friendly = rawMsg.trim();
            if (/Model must be in the format/i.test(friendly)) {
                friendly = 'Model id must use the `provider/model` format (e.g. `opencode/big-pickle` or `anthropic/claude-sonnet-4-5`). Pick one from Settings → Agents → OpenCode → Model.';
            } else if (/ProviderModelNotFoundError/.test(friendly)) {
                friendly = 'OpenCode does not recognize the selected model. Run `opencode models --refresh` or pick a different model from the picker.';
            } else if (/ProviderInitError/.test(friendly)) {
                friendly = 'OpenCode provider config is invalid. Try `opencode auth login`, or clear `~/.local/share/opencode/auth.json` and re-authenticate.';
            } else if (/AI_APICallError/.test(friendly)) {
                friendly = 'OpenCode upstream call failed. Clearing `~/.cache/opencode` and retrying usually resolves this.';
            }

            terminalFailureReason = friendly;
            const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId);
            ws.send(createNormalizedMessage({ kind: 'error', content: friendly, sessionId: socketSessionId, provider: 'opencode' }));
        });

        opencodeProcess.on('close', async (code) => {
            clearTimeout(timeout);

            if (responseHandler) {
                responseHandler.forceFlush();
                responseHandler.destroy();
            }

            const finalSessionId = capturedSessionId || sessionId || processKey;
            activeOpencodeProcesses.delete(finalSessionId);

            if (finalSessionId && assistantBlocks.length > 0) {
                sessionManager.addMessage(finalSessionId, 'assistant', assistantBlocks);
            } else if (terminalFailureReason) {
                persistTerminalFailure(terminalFailureReason);
            }

            ws.send(createNormalizedMessage({ kind: 'complete', exitCode: code, isNewSession: !sessionId && !!command, sessionId: finalSessionId, provider: 'opencode' }));

            if (opencodeProcess.tempImagePaths && opencodeProcess.tempImagePaths.length > 0) {
                for (const imagePath of opencodeProcess.tempImagePaths) {
                    await fs.unlink(imagePath).catch(() => { /* noop */ });
                }
                if (opencodeProcess.tempDir) {
                    await fs.rm(opencodeProcess.tempDir, { recursive: true, force: true }).catch(() => { /* noop */ });
                }
            }

            if (code === 0) {
                notifyTerminalState({ code });
                resolve();
            } else {
                if (code === 127) {
                    const installed = await providerAuthService.isProviderInstalled('opencode');
                    if (!installed) {
                        const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : finalSessionId;
                        const installMessage = 'OpenCode CLI is not installed. Install it from the Settings → Agents → OpenCode tab, or run: npm install -g opencode-ai';
                        terminalFailureReason = installMessage;
                        ws.send(createNormalizedMessage({
                            kind: 'error',
                            content: installMessage,
                            sessionId: socketSessionId,
                            provider: 'opencode',
                        }));
                    }
                }

                notifyTerminalState({
                    code,
                    error: code === null ? 'OpenCode CLI process was terminated or timed out' : null,
                });
                reject(new Error(code === null ? 'OpenCode CLI process was terminated or timed out' : `OpenCode CLI exited with code ${code}`));
            }
        });

        opencodeProcess.on('error', async (error) => {
            const finalSessionId = capturedSessionId || sessionId || processKey;
            activeOpencodeProcesses.delete(finalSessionId);

            const installed = await providerAuthService.isProviderInstalled('opencode');
            const errorContent = !installed
                ? 'OpenCode CLI is not installed. Install it from the Settings → Agents → OpenCode tab, or run: npm install -g opencode-ai'
                : (error?.message || String(error));

            const errorSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : finalSessionId;
            ws.send(createNormalizedMessage({ kind: 'error', content: errorContent, sessionId: errorSessionId, provider: 'opencode' }));
            persistTerminalFailure(errorContent);
            // Always emit `complete` so the UI's "Processing..." state clears
            // even when spawn fails (ENOENT, EACCES) and `close` never fires.
            ws.send(createNormalizedMessage({ kind: 'complete', exitCode: 1, isNewSession: !sessionId && !!command, sessionId: errorSessionId, provider: 'opencode' }));
            notifyTerminalState({ error });

            reject(error);
        });
    });
}

function abortOpencodeSession(sessionId) {
    let opencodeProc = activeOpencodeProcesses.get(sessionId);
    let processKey = sessionId;

    if (!opencodeProc) {
        for (const [key, proc] of activeOpencodeProcesses.entries()) {
            if (proc.sessionId === sessionId) {
                opencodeProc = proc;
                processKey = key;
                break;
            }
        }
    }

    if (opencodeProc) {
        try {
            opencodeProc.kill('SIGTERM');
            setTimeout(() => {
                if (activeOpencodeProcesses.has(processKey)) {
                    try { opencodeProc.kill('SIGKILL'); } catch { /* noop */ }
                }
            }, 2000);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

function isOpencodeSessionActive(sessionId) {
    return activeOpencodeProcesses.has(sessionId);
}

function getActiveOpencodeSessions() {
    return Array.from(activeOpencodeProcesses.keys());
}

export {
    spawnOpencode,
    abortOpencodeSession,
    isOpencodeSessionActive,
    getActiveOpencodeSessions,
};
