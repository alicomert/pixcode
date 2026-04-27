/**
 * Qwen Code CLI adapter.
 *
 * Qwen Code (https://github.com/QwenLM/qwen-code) is Alibaba's fork of Google's
 * Gemini CLI. The command-line surface, stream-json output, session layout
 * (~/.qwen/tmp/<project>/...), and approval flags all mirror Gemini's. This
 * adapter is therefore a structural copy of gemini-cli.js — kept as its own
 * file so future Qwen-specific divergence (different auth flow, different
 * model list) has a clean place to land without touching Gemini's code path.
 */
import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import sessionManager from './sessionManager.js';
import QwenResponseHandler from './qwen-response-handler.js';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { buildSpawnEnv } from './services/provider-credentials.js';
import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { createNormalizedMessage } from './shared/utils.js';

// Use cross-spawn on Windows so `qwen.cmd` resolves correctly.
const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

const activeQwenProcesses = new Map();

async function spawnQwen(command, options = {}, ws) {
    const { sessionId, projectPath, cwd, toolsSettings, permissionMode, images, sessionSummary } = options;
    let capturedSessionId = sessionId;
    let sessionCreatedSent = false;
    let assistantBlocks = [];

    const settings = toolsSettings || { allowedTools: [], disallowedTools: [], skipPermissions: false };

    const args = [];
    if (command && command.trim()) {
        args.push('--prompt', command);
    }

    if (sessionId) {
        const session = sessionManager.getSession(sessionId);
        if (session && session.cliSessionId) {
            args.push('--resume', session.cliSessionId);
        }
    }

    const cleanPath = (cwd || projectPath || process.cwd()).replace(/[^\x20-\x7E]/g, '').trim();
    const workingDir = cleanPath;

    const tempImagePaths = [];
    let tempDir = null;
    if (images && images.length > 0) {
        try {
            tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
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
            }

            if (tempImagePaths.length > 0 && command && command.trim()) {
                const imageNote = `\n\n[Images given: ${tempImagePaths.length} images are located at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
                const modifiedCommand = command + imageNote;
                const promptIndex = args.indexOf('--prompt');
                if (promptIndex !== -1 && args[promptIndex + 1] === command) {
                    args[promptIndex + 1] = modifiedCommand;
                } else if (promptIndex !== -1) {
                    args[promptIndex + 1] = args[promptIndex + 1] + imageNote;
                }
            }
        } catch (error) {
            console.error('Error processing images for Qwen Code:', error);
        }
    }

    if (options.debug) {
        args.push('--debug');
    }

    // Qwen's MCP config mirrors Gemini's — per-user settings.json plus optional
    // project override. Pixcode writes to the user-scope file via the provider
    // MCP module, and Qwen Code auto-loads it, so we don't pass --mcp-config
    // explicitly. Left intentionally minimal to avoid double-loading.

    const modelToUse = options.model || 'qwen3-coder-plus';
    args.push('--model', modelToUse);
    args.push('--output-format', 'stream-json');

    if (settings.skipPermissions || options.skipPermissions || permissionMode === 'yolo') {
        args.push('--yolo');
    } else if (permissionMode === 'auto_edit') {
        args.push('--approval-mode', 'auto_edit');
    } else if (permissionMode === 'plan') {
        args.push('--approval-mode', 'plan');
    }

    if (settings.allowedTools && settings.allowedTools.length > 0) {
        args.push('--allowed-tools', settings.allowedTools.join(','));
    }

    const qwenPath = process.env.QWEN_PATH || 'qwen';
    console.log('Spawning Qwen Code CLI:', qwenPath, args.join(' '));
    console.log('Working directory:', workingDir);

    let spawnCmd = qwenPath;
    let spawnArgs = args;

    if (os.platform() !== 'win32') {
        spawnCmd = 'sh';
        spawnArgs = ['-c', 'exec "$0" "$@"', qwenPath, ...args];
    }

    // Credentials stored in ~/.pixcode/provider-credentials.json take
    // precedence over the host shell env, so an API key saved via the
    // Pixcode UI reaches the Qwen subprocess even when the user never
    // exported it in their login shell.
    const spawnEnv = await buildSpawnEnv('qwen');

    return new Promise((resolve, reject) => {
        const qwenProcess = spawnFunction(spawnCmd, spawnArgs, {
            cwd: workingDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: spawnEnv,
        });

        let terminalNotificationSent = false;
        let terminalFailureReason = null;

        const notifyTerminalState = ({ code = null, error = null } = {}) => {
            if (terminalNotificationSent) return;
            terminalNotificationSent = true;

            const finalSessionId = capturedSessionId || sessionId || processKey;
            if (code === 0 && !error) {
                notifyRunStopped({
                    userId: ws?.userId || null,
                    provider: 'qwen',
                    sessionId: finalSessionId,
                    sessionName: sessionSummary,
                    stopReason: 'completed',
                });
                return;
            }

            notifyRunFailed({
                userId: ws?.userId || null,
                provider: 'qwen',
                sessionId: finalSessionId,
                sessionName: sessionSummary,
                error: error || terminalFailureReason || `Qwen Code CLI exited with code ${code}`,
            });
        };

        qwenProcess.tempImagePaths = tempImagePaths;
        qwenProcess.tempDir = tempDir;

        const processKey = capturedSessionId || sessionId || Date.now().toString();
        activeQwenProcesses.set(processKey, qwenProcess);
        qwenProcess.sessionId = processKey;

        qwenProcess.stdin.end();

        const timeoutMs = 120000;
        let timeout;
        const startTimeout = () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);
                terminalFailureReason = `Qwen Code CLI timeout - no response received for ${timeoutMs / 1000} seconds`;
                ws.send(createNormalizedMessage({ kind: 'error', content: terminalFailureReason, sessionId: socketSessionId, provider: 'qwen' }));
                try { qwenProcess.kill('SIGTERM'); } catch { /* noop */ }
            }, timeoutMs);
        };
        startTimeout();

        if (command && capturedSessionId) {
            sessionManager.addMessage(capturedSessionId, 'user', command);
        }

        let responseHandler;
        if (ws) {
            responseHandler = new QwenResponseHandler(ws, {
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
            });
        }

        qwenProcess.stdout.on('data', (data) => {
            const rawOutput = data.toString();
            startTimeout();

            if (!sessionId && !sessionCreatedSent && !capturedSessionId) {
                capturedSessionId = `qwen_${Date.now()}`;
                sessionCreatedSent = true;

                sessionManager.createSession(capturedSessionId, cwd || process.cwd());
                if (command) {
                    sessionManager.addMessage(capturedSessionId, 'user', command);
                }
                if (processKey !== capturedSessionId) {
                    activeQwenProcesses.delete(processKey);
                    activeQwenProcesses.set(capturedSessionId, qwenProcess);
                }

                ws.setSessionId && typeof ws.setSessionId === 'function' && ws.setSessionId(capturedSessionId);
                ws.send(createNormalizedMessage({ kind: 'session_created', newSessionId: capturedSessionId, sessionId: capturedSessionId, provider: 'qwen' }));
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
                ws.send(createNormalizedMessage({ kind: 'stream_delta', content: rawOutput, sessionId: socketSessionId, provider: 'qwen' }));
            }
        });

        qwenProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString();
            if (errorMsg.includes('[DEP0040]') ||
                errorMsg.includes('DeprecationWarning') ||
                errorMsg.includes('--trace-deprecation') ||
                errorMsg.includes('Loaded cached credentials')) {
                return;
            }

            const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId);
            ws.send(createNormalizedMessage({ kind: 'error', content: errorMsg, sessionId: socketSessionId, provider: 'qwen' }));
        });

        qwenProcess.on('close', async (code) => {
            clearTimeout(timeout);

            if (responseHandler) {
                responseHandler.forceFlush();
                responseHandler.destroy();
            }

            const finalSessionId = capturedSessionId || sessionId || processKey;
            activeQwenProcesses.delete(finalSessionId);

            if (finalSessionId && assistantBlocks.length > 0) {
                sessionManager.addMessage(finalSessionId, 'assistant', assistantBlocks);
            }

            ws.send(createNormalizedMessage({ kind: 'complete', exitCode: code, isNewSession: !sessionId && !!command, sessionId: finalSessionId, provider: 'qwen' }));

            if (qwenProcess.tempImagePaths && qwenProcess.tempImagePaths.length > 0) {
                for (const imagePath of qwenProcess.tempImagePaths) {
                    await fs.unlink(imagePath).catch(() => { /* noop */ });
                }
                if (qwenProcess.tempDir) {
                    await fs.rm(qwenProcess.tempDir, { recursive: true, force: true }).catch(() => { /* noop */ });
                }
            }

            if (code === 0) {
                notifyTerminalState({ code });
                resolve();
            } else {
                if (code === 127) {
                    const installed = await providerAuthService.isProviderInstalled('qwen');
                    if (!installed) {
                        const socketSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : finalSessionId;
                        ws.send(createNormalizedMessage({
                            kind: 'error',
                            content: 'Qwen Code CLI is not installed. Install it first: npm install -g @qwen-code/qwen-code',
                            sessionId: socketSessionId,
                            provider: 'qwen',
                        }));
                    }
                }

                notifyTerminalState({
                    code,
                    error: code === null ? 'Qwen Code CLI process was terminated or timed out' : null,
                });
                reject(new Error(code === null ? 'Qwen Code CLI process was terminated or timed out' : `Qwen Code CLI exited with code ${code}`));
            }
        });

        qwenProcess.on('error', async (error) => {
            const finalSessionId = capturedSessionId || sessionId || processKey;
            activeQwenProcesses.delete(finalSessionId);

            const installed = await providerAuthService.isProviderInstalled('qwen');
            const errorContent = !installed
                ? 'Qwen Code CLI is not installed. Install it first: npm install -g @qwen-code/qwen-code'
                : (error?.message || String(error));

            const errorSessionId = typeof ws.getSessionId === 'function' ? ws.getSessionId() : finalSessionId;
            ws.send(createNormalizedMessage({ kind: 'error', content: errorContent, sessionId: errorSessionId, provider: 'qwen' }));
            // Always emit `complete` so the UI's "Processing..." state clears
            // even when spawn fails (ENOENT, EACCES) and `close` never fires.
            ws.send(createNormalizedMessage({ kind: 'complete', exitCode: 1, isNewSession: !sessionId && !!command, sessionId: errorSessionId, provider: 'qwen' }));
            notifyTerminalState({ error });

            reject(error);
        });
    });
}

function abortQwenSession(sessionId) {
    let qwenProc = activeQwenProcesses.get(sessionId);
    let processKey = sessionId;

    if (!qwenProc) {
        for (const [key, proc] of activeQwenProcesses.entries()) {
            if (proc.sessionId === sessionId) {
                qwenProc = proc;
                processKey = key;
                break;
            }
        }
    }

    if (qwenProc) {
        try {
            qwenProc.kill('SIGTERM');
            setTimeout(() => {
                if (activeQwenProcesses.has(processKey)) {
                    try { qwenProc.kill('SIGKILL'); } catch { /* noop */ }
                }
            }, 2000);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

function isQwenSessionActive(sessionId) {
    return activeQwenProcesses.has(sessionId);
}

function getActiveQwenSessions() {
    return Array.from(activeQwenProcesses.keys());
}

export {
    spawnQwen,
    abortQwenSession,
    isQwenSessionActive,
    getActiveQwenSessions,
};
