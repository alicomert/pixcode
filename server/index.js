#!/usr/bin/env node
/* eslint-disable import-x/order */
// Load environment variables before other imports execute
import './load-env.js';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import net from 'node:net';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { spawn } from 'child_process';

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

import { AppError, createNormalizedMessage } from '@/shared/utils.js';

import { findAppRoot, getModuleDir } from './utils/runtime-paths.js';
import { securityLog, getClientIp } from './utils/security-log.js';



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
const JSONL_STREAM_LINE_MAX_CHARS = 1024 * 1024;

function resolveMonacoAssetsPath() {
    const appParent = path.dirname(APP_ROOT);
    const appGrandparent = path.dirname(appParent);
    const nodePathRoots = String(process.env.NODE_PATH || '')
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
    const candidates = [
        path.join(APP_ROOT, 'node_modules', 'monaco-editor', 'min', 'vs'),
        path.join(appParent, 'node_modules', 'monaco-editor', 'min', 'vs'),
        path.join(appParent, 'monaco-editor', 'min', 'vs'),
        path.join(appGrandparent, 'node_modules', 'monaco-editor', 'min', 'vs'),
        path.join(appGrandparent, 'monaco-editor', 'min', 'vs'),
        ...nodePathRoots.flatMap((nodePathRoot) => [
            path.join(nodePathRoot, 'monaco-editor', 'min', 'vs'),
            path.join(nodePathRoot, 'node_modules', 'monaco-editor', 'min', 'vs'),
        ]),
    ];
    const resolutionPaths = [
        APP_ROOT,
        appParent,
        appGrandparent,
        __dirname,
        process.cwd(),
        ...nodePathRoots,
    ];

    try {
        const monacoPackagePath = require.resolve('monaco-editor/package.json', {
            paths: resolutionPaths,
        });
        candidates.push(path.join(path.dirname(monacoPackagePath), 'min', 'vs'));
    } catch {
        // The editor will show its normal load failure if the dependency is unavailable.
    }

    try {
        const monacoLoaderPath = require.resolve('monaco-editor/min/vs/loader.js', {
            paths: resolutionPaths,
        });
        candidates.push(path.dirname(monacoLoaderPath));
    } catch {
        // Some package managers only expose the package root; candidates above cover that case.
    }

    return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'loader.js'))) || null;
}

import { c } from './utils/colors.js';

// Server port is logged after binding in startServer() — avoid leaking
// env configuration to stdout on every import.



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
  createWorkflowRouter,
} from './modules/orchestration/index.js';
import networkRoutes from './routes/network.js';
import telegramRoutes from './routes/telegram.js';
import { restoreRequestedTunnel } from './services/external-access.js';
import { notifyTelegramTerminalAttached, restoreBotFromConfig } from './services/telegram/bot.js';
import { ensurePortOpen } from './utils/port-access.js';
import {
    applyAllStoredCredentialsToEnv,
} from './services/provider-credentials.js';
import { primeCliBinPath } from './services/install-jobs.js';
import { startEnabledPluginServers, stopAllPlugins, getPluginPort } from './utils/plugin-process-manager.js';
import { initializeDatabase, sessionNamesDb, applyCustomSessionNames, appConfigDb, telegramLinksDb } from './database/db.js';
import { setNotificationWebSocketServer } from './services/notification-orchestrator.js';
import { configureWebPush } from './services/vapid-keys.js';
import { validateApiKey, authenticateToken, authenticateWebSocket, requireAdmin, requireApiScope } from './middleware/auth.js';
import { apiRateLimiter } from './middleware/rate-limiter.js';
import { filterFileTreeForUser, filterProjectsForUser, userHasProjectAccess, userHasProjectPathAccess } from './services/platformization.js';
import { IS_PLATFORM } from './constants/config.js';

import { getConnectableHost } from '../shared/networkHosts.js';

import { buildDaemonCliCommand, handleDaemonCommand } from './daemon-manager.js';

const VALID_PROVIDERS = ['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode'];
const SYSTEM_UPDATE_STATE_KEY = 'system_update_state';
const SESSION_OWNERSHIP_KEY = 'session_ownership';
const SYSTEM_UPDATE_LOG_LIMIT = 600;
const updateJobs = new Map();

function parseStoredJson(value, fallback = {}) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function readSystemUpdateState() {
    return parseStoredJson(appConfigDb.get(SYSTEM_UPDATE_STATE_KEY), {
        pendingRestart: null,
        lastAppliedUpdate: null,
    });
}

function writeSystemUpdateState(state) {
    appConfigDb.set(SYSTEM_UPDATE_STATE_KEY, JSON.stringify({
        pendingRestart: state?.pendingRestart || null,
        lastAppliedUpdate: state?.lastAppliedUpdate || null,
    }));
}

function readSessionOwnership() {
    return parseStoredJson(appConfigDb.get(SESSION_OWNERSHIP_KEY), {});
}

function writeSessionOwnership(ownership) {
    appConfigDb.set(SESSION_OWNERSHIP_KEY, JSON.stringify(ownership || {}));
}

function sessionOwnershipKey(provider, sessionId) {
    return `${provider || 'claude'}:${sessionId}`;
}

function recordSessionOwnership({ provider, sessionId, userId, projectName, projectPath }) {
    if (!sessionId || !userId) return;
    const ownership = readSessionOwnership();
    const key = sessionOwnershipKey(provider, sessionId);
    if (ownership[key]?.userId) return;
    ownership[key] = {
        provider: provider || 'claude',
        sessionId,
        userId,
        projectName: projectName || null,
        projectPath: projectPath || null,
        createdAt: new Date().toISOString(),
    };
    writeSessionOwnership(ownership);
}

function canUserSeeSession(user, session, provider) {
    if (['admin', 'owner'].includes(user?.role)) return true;
    const sessionId = session?.id || session?.sessionId;
    if (!sessionId) return false;
    const owner = readSessionOwnership()[sessionOwnershipKey(provider, sessionId)];
    return Boolean(owner?.userId && Number(owner.userId) === Number(user?.id ?? user?.userId));
}

function filterProjectSessionsForUser(project, user) {
    if (['admin', 'owner'].includes(user?.role)) return project;
    return {
        ...project,
        sessions: (project.sessions || []).filter((session) => canUserSeeSession(user, session, 'claude')),
        cursorSessions: (project.cursorSessions || []).filter((session) => canUserSeeSession(user, session, 'cursor')),
        codexSessions: (project.codexSessions || []).filter((session) => canUserSeeSession(user, session, 'codex')),
        geminiSessions: (project.geminiSessions || []).filter((session) => canUserSeeSession(user, session, 'gemini')),
        qwenSessions: (project.qwenSessions || []).filter((session) => canUserSeeSession(user, session, 'qwen')),
        opencodeSessions: (project.opencodeSessions || []).filter((session) => canUserSeeSession(user, session, 'opencode')),
    };
}

function reconcileAppliedUpdateStateOnBoot() {
    const state = readSystemUpdateState();
    const pending = state.pendingRestart;
    if (!pending?.toVersion || pending.toVersion !== SERVER_VERSION) {
        return;
    }

    writeSystemUpdateState({
        pendingRestart: null,
        lastAppliedUpdate: {
            ...pending,
            appliedAt: new Date().toISOString(),
            currentVersion: SERVER_VERSION,
        },
    });
}

function appendUpdateJobLog(job, stream, chunk) {
    const entry = {
        stream,
        chunk: String(chunk || ''),
        timestamp: new Date().toISOString(),
    };
    job.logs.push(entry);
    if (job.logs.length > SYSTEM_UPDATE_LOG_LIMIT) {
        job.logs.splice(0, job.logs.length - SYSTEM_UPDATE_LOG_LIMIT);
    }
    job.updatedAt = entry.timestamp;
}

function snapshotUpdateJob(job) {
    if (!job) return null;
    return {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt || null,
        fromVersion: job.fromVersion,
        toVersion: job.toVersion || null,
        installMode: job.installMode,
        runtimeDir: job.runtimeDir || null,
        alreadyLatest: Boolean(job.alreadyLatest),
        pendingRestart: Boolean(job.pendingRestart),
        error: job.error || null,
        logs: job.logs,
    };
}

function getActiveUpdateJob() {
    for (const job of updateJobs.values()) {
        if (job.status === 'running' || job.status === 'queued') {
            return job;
        }
    }
    return null;
}

function countByProvider(items) {
    return items.reduce((counts, item) => {
        const provider = item?.provider || 'unknown';
        counts[provider] = (counts[provider] || 0) + 1;
        return counts;
    }, {});
}

function getActiveProviderWorkSummary() {
    const sessions = [
        ...getActiveClaudeSDKSessions().map((id) => ({ id, provider: 'claude' })),
        ...getActiveCursorSessions().map((session) => ({ ...session, provider: 'cursor' })),
        ...getActiveCodexSessions().map((session) => ({ ...session, provider: 'codex' })),
        ...getActiveGeminiSessions().map((session) => ({ ...session, provider: 'gemini' })),
        ...getActiveQwenSessions().map((session) => ({ ...session, provider: 'qwen' })),
        ...getActiveOpencodeSessions().map((session) => ({ ...session, provider: 'opencode' })),
    ];

    return {
        total: sessions.length,
        byProvider: countByProvider(sessions),
    };
}

function getActivePtyWorkSummary() {
    const activePtys = Array.from(ptySessionsMap.values())
        .filter((session) => session?.pty && session.lifecycleState === 'running')
        .map((session) => ({
            provider: session.isPlainShell ? 'plain-shell' : (session.provider || 'unknown'),
            connected: Boolean(session.ws && session.ws.readyState === WebSocket.OPEN),
        }));

    return {
        total: activePtys.length,
        connected: activePtys.filter((session) => session.connected).length,
        detached: activePtys.filter((session) => !session.connected).length,
        byProvider: countByProvider(activePtys),
    };
}

function getActiveWorkSummary() {
    const pty = getActivePtyWorkSummary();
    const agents = getActiveProviderWorkSummary();
    const total = pty.total + agents.total;

    return {
        hasActiveWork: total > 0,
        total,
        pty,
        agents,
    };
}

async function readLatestPixcodePackageMetadata() {
    const registryRes = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode');
    if (!registryRes.ok) throw new Error(`Registry returned HTTP ${registryRes.status}`);
    const metadata = await registryRes.json();
    const latestVersion = metadata['dist-tags']?.latest;
    const latestEntry = latestVersion ? metadata.versions?.[latestVersion] : null;
    return {
        latestVersion,
        tarballUrl: latestEntry?.dist?.tarball || null,
        tarballIntegrity: latestEntry?.dist?.integrity || null,
    };
}

function isSafePackageVersion(version) {
    return typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version.trim());
}

function buildPixcodeTarballUrl(version) {
    if (!isSafePackageVersion(version)) return null;
    return `https://registry.npmjs.org/@pixelbyte-software/pixcode/-/pixcode-${version.trim()}.tgz`;
}

/**
 * Verify a downloaded tarball's integrity against the registry-provided
 * Subresource Integrity (SRI) string. Throws if the hash doesn't match.
 * @param {Buffer} buffer - The downloaded tarball bytes
 * @param {string} integrity - SRI string from npm registry (e.g. "sha512-...")
 */
function verifyTarballIntegrity(buffer, integrity) {
    if (!integrity || typeof integrity !== 'string') {
        throw new Error('Tarball integrity hash missing from registry metadata — refusing to install unverified package.');
    }
    const dashIndex = integrity.indexOf('-');
    if (dashIndex < 0) {
        throw new Error('Malformed integrity string from registry.');
    }
    const algo = integrity.slice(0, dashIndex);
    const expectedHash = integrity.slice(dashIndex + 1);
    const validAlgos = ['sha512', 'sha384', 'sha256'];
    if (!validAlgos.includes(algo)) {
        throw new Error(`Unsupported integrity algorithm: ${algo}`);
    }
    const actualHash = crypto.createHash(algo).update(buffer).digest('base64');
    if (actualHash !== expectedHash) {
        throw new Error(`Tarball integrity check failed: expected ${algo}-${expectedHash.slice(0, 16)}…, got ${algo}-${actualHash.slice(0, 16)}…`);
    }
}

async function runRuntimeDirUpdateJob(job, runtimeDir, latestVersion, tarballUrl, tarballIntegrity) {
    appendUpdateJobLog(job, 'meta', `Update mode: runtime-dir\nRuntime: ${runtimeDir}\n`);
    appendUpdateJobLog(job, 'meta', `Downloading ${tarballUrl}\n`);
    const tarballRes = await fetch(tarballUrl);
    if (!tarballRes.ok || !tarballRes.body) {
        throw new Error(`Tarball fetch failed: HTTP ${tarballRes.status}`);
    }

    // Download tarball to a buffer first so we can verify integrity before extracting.
    const tarballBuffer = Buffer.from(await tarballRes.arrayBuffer());

    // Verify integrity hash against registry-provided SRI string.
    if (tarballIntegrity) {
        try {
            verifyTarballIntegrity(tarballBuffer, tarballIntegrity);
            appendUpdateJobLog(job, 'meta', 'Tarball integrity verified.\n');
        } catch (verifyError) {
            appendUpdateJobLog(job, 'stderr', `Integrity verification failed: ${verifyError.message}\n`);
            throw verifyError;
        }
    } else {
        appendUpdateJobLog(job, 'meta', 'WARNING: No integrity hash from registry — extracting without verification.\n');
    }

    const stagingDir = path.join(runtimeDir, '.staging');
    const backupDir = path.join(runtimeDir, '.previous');
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    const { Readable } = await import('node:stream');
    const tarModule = await import('tar');
    const tarExtract = tarModule.x || tarModule.default?.x;
    if (!tarExtract) throw new Error('tar extractor not available');

    await new Promise((resolve, reject) => {
        const nodeStream = Readable.from(tarballBuffer);
        const extractor = tarExtract({ cwd: stagingDir, strip: 1 });
        nodeStream.pipe(extractor);
        extractor.on('finish', resolve);
        extractor.on('error', reject);
        nodeStream.on('error', reject);
    });

    appendUpdateJobLog(job, 'meta', 'Staging runtime update for next restart...\n');
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

    const depsChanged = (() => {
        try {
            const prevPkg = JSON.parse(fs.readFileSync(path.join(backupDir, 'package.json'), 'utf8'));
            const nextPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
            return JSON.stringify(prevPkg.dependencies || {}) !== JSON.stringify(nextPkg.dependencies || {});
        } catch {
            return true;
        }
    })();

    if (!depsChanged) return latestVersion;

    appendUpdateJobLog(job, 'meta', 'Reconciling node_modules with new package.json...\n');
    await new Promise((resolve, reject) => {
        const npmChild = spawn('npm', ['install', '--production', '--no-audit', '--no-fund', '--no-save'], {
            cwd: runtimeDir,
            env: process.env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        npmChild.stdout?.on('data', (chunk) => appendUpdateJobLog(job, 'stdout', chunk.toString()));
        npmChild.stderr?.on('data', (chunk) => appendUpdateJobLog(job, 'stderr', chunk.toString()));
        npmChild.on('error', reject);
        npmChild.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`npm install exited with code ${code}`));
        });
    });
    return latestVersion;
}

async function runCommandUpdateJob(job, updateCommand, updateCwd) {
    appendUpdateJobLog(job, 'meta', `Running: ${updateCommand}\n`);
    await new Promise((resolve, reject) => {
        const child = spawn(updateCommand, {
            cwd: updateCwd,
            env: process.env,
            shell: true,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        try { child.unref(); } catch { /* noop */ }
        child.stdout?.on('data', (data) => appendUpdateJobLog(job, 'stdout', data.toString()));
        child.stderr?.on('data', (data) => appendUpdateJobLog(job, 'stderr', data.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Update command exited with code ${code}`));
        });
    });
}

function readCurrentPackageVersion() {
    try {
        const pkgRaw = fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8');
        return JSON.parse(pkgRaw).version || SERVER_VERSION;
    } catch {
        return SERVER_VERSION;
    }
}

function createSystemUpdateJob(actorUser, options = {}) {
    const activeJob = getActiveUpdateJob();
    if (activeJob) return activeJob;

    const job = {
        id: crypto.randomUUID(),
        status: 'queued',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        fromVersion: SERVER_VERSION,
        toVersion: isSafePackageVersion(options.targetVersion) ? options.targetVersion.trim() : null,
        installMode,
        runtimeDir: process.env.PIXCODE_RUNTIME_DIR || null,
        actorUserId: actorUser?.id ?? actorUser?.userId ?? null,
        logs: [],
        alreadyLatest: false,
        pendingRestart: false,
        error: null,
    };
    updateJobs.set(job.id, job);

    void (async () => {
        job.status = 'running';
        appendUpdateJobLog(job, 'meta', `Background update job started at ${job.startedAt}\n`);
        try {
            const runtimeDir = job.runtimeDir;
            const gitUpdateScript = path.join(APP_ROOT, 'scripts', 'update-git-install.mjs');
            const latest = await readLatestPixcodePackageMetadata().catch((error) => {
                appendUpdateJobLog(job, 'stderr', `Registry precheck failed: ${error.message}\n`);
                return { latestVersion: null, tarballUrl: null, tarballIntegrity: null };
            });
            const requestedVersion = isSafePackageVersion(options.targetVersion) ? options.targetVersion.trim() : null;
            const resolvedVersion = latest.latestVersion || requestedVersion || null;
            const resolvedTarballUrl = latest.tarballUrl || buildPixcodeTarballUrl(resolvedVersion);
            job.toVersion = resolvedVersion;

            if (!IS_PLATFORM && installMode === 'npm' && latest.latestVersion && latest.latestVersion === SERVER_VERSION) {
                job.status = 'completed';
                job.alreadyLatest = true;
                job.completedAt = new Date().toISOString();
                appendUpdateJobLog(job, 'meta', `Already on ${SERVER_VERSION}.\n`);
                return;
            }

            if (runtimeDir) {
                if (!resolvedVersion || !resolvedTarballUrl) {
                    throw new Error('Registry response missing latest version or tarball URL. Try manual update or retry when registry access is available.');
                }
                if (!latest.latestVersion) {
                    appendUpdateJobLog(job, 'meta', `Using requested target version ${resolvedVersion} after registry precheck failed.\n`);
                }
                job.toVersion = await runRuntimeDirUpdateJob(job, runtimeDir, resolvedVersion, resolvedTarballUrl, latest.tarballIntegrity);
            } else {
                const updateCommand = IS_PLATFORM
                    ? 'npm run update:platform'
                    : installMode === 'git'
                        ? `${JSON.stringify(process.execPath)} ${JSON.stringify(gitUpdateScript)}`
                        : 'npm install -g @pixelbyte-software/pixcode@latest';
                const updateCwd = IS_PLATFORM || installMode === 'git' ? APP_ROOT : os.homedir();
                await runCommandUpdateJob(job, updateCommand, updateCwd);
                if (installMode === 'git') {
                    job.toVersion = readCurrentPackageVersion();
                }
            }

            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            job.pendingRestart = true;
            const state = readSystemUpdateState();
            writeSystemUpdateState({
                ...state,
                pendingRestart: {
                    jobId: job.id,
                    fromVersion: job.fromVersion,
                    toVersion: job.toVersion || latest.latestVersion || SERVER_VERSION,
                    installMode: job.installMode,
                    completedAt: job.completedAt,
                    logs: job.logs.slice(-80),
                },
            });
            appendUpdateJobLog(job, 'meta', 'Update is ready. Restart when convenient to apply it.\n');
        } catch (error) {
            job.status = 'failed';
            job.completedAt = new Date().toISOString();
            job.error = error instanceof Error ? error.message : String(error);
            appendUpdateJobLog(job, 'stderr', `Update failed: ${job.error}\n`);
        }
    })();

    return job;
}

reconcileAppliedUpdateStateOnBoot();

function requireProjectAccess(capability = 'viewFiles') {
    return (req, res, next) => {
        const projectName = req.params.projectName || req.query.project || req.body?.project;
        if (!projectName) {
            return next();
        }

        if (!userHasProjectAccess(req.user, { name: String(projectName), projectName: String(projectName) }, capability)) {
            return res.status(403).json({ error: 'Project access denied.' });
        }

        next();
    };
}

function requireProjectPathAccess(capability = 'viewFiles') {
    return (req, res, next) => {
        const projectPath = req.body?.projectPath || req.query.projectPath || os.homedir();
        const resolvedProjectPath = path.resolve(String(projectPath));
        if (!userHasProjectPathAccess(req.user, {
            fullPath: resolvedProjectPath,
            path: resolvedProjectPath,
            projectPath: resolvedProjectPath,
        }, resolvedProjectPath, capability)) {
            return res.status(403).json({ error: 'Project access denied.' });
        }

        next();
    };
}

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
    '**/dist-server/**',
    '**/build/**',
    '**/out/**',
    '**/target/**',
    '**/vendor/**',
    '**/prebuilts/**',
    '**/.repo/**',
    '**/.gradle/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.turbo/**',
    '**/.cache/**',
    '**/.venv/**',
    '**/venv/**',
    '**/coverage/**',
    '**/*.tmp',
    '**/*.swp',
    '**/*.log',
    '**/.DS_Store'
];
// Debounce chokidar events before rescanning all provider project trees.
// During an active chat, each model writes its transcript to
// ~/.<provider>/projects/<encoded>/*.jsonl in small chunks — with a 300ms
// window every few chunks triggered a full getProjects() + broadcast to
// every open tab, which shows up as mouse/UI stutter. 1500ms collapses
// a full chat reply into ~1 scan while still feeling responsive when
// the user flips to the projects list.
const WATCHER_DEBOUNCE_MS = Number.parseInt(process.env.PIXCODE_PROJECT_WATCH_DEBOUNCE_MS || '', 10) || 10000;
const PROVIDER_WATCHER_DEPTH = Number.parseInt(process.env.PIXCODE_PROVIDER_WATCH_DEPTH || '', 10) || 8;
let projectsWatchers = [];
let projectsWatcherDebounceTimer = null;
let pendingProjectsWatcherRefresh = null;
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

    const sendToOpenClient = (client, payload) => {
        if (client.readyState !== WebSocket.OPEN) {
            return false;
        }
        if (client.bufferedAmount > SHELL_WS_BACKPRESSURE_LIMIT) {
            return false;
        }
        client.send(JSON.stringify(payload));
        return true;
    };

    const debouncedUpdate = (eventType, filePath, provider, rootPath) => {
        pendingProjectsWatcherRefresh = { eventType, filePath, provider, rootPath };

        if (projectsWatcherDebounceTimer) {
            clearTimeout(projectsWatcherDebounceTimer);
        }

        projectsWatcherDebounceTimer = setTimeout(async () => {
            // Prevent reentrant calls
            if (isGetProjectsRunning) {
                projectsWatcherDebounceTimer = setTimeout(() => {
                    const pending = pendingProjectsWatcherRefresh;
                    if (pending) {
                        debouncedUpdate(pending.eventType, pending.filePath, pending.provider, pending.rootPath);
                    }
                }, WATCHER_DEBOUNCE_MS);
                return;
            }

            try {
                isGetProjectsRunning = true;
                const pending = pendingProjectsWatcherRefresh || { eventType, filePath, provider, rootPath };
                pendingProjectsWatcherRefresh = null;

                if (pending.eventType === 'addDir' || pending.eventType === 'unlinkDir') {
                    clearProjectDirectoryCache();
                }

                const updatePayload = {
                    type: 'projects_updated',
                    timestamp: new Date().toISOString(),
                    changeType: pending.eventType,
                    changedFile: path.relative(pending.rootPath, pending.filePath),
                    watchProvider: pending.provider,
                    invalidated: true,
                };

                // Notify clients that provider metadata changed. Avoid broadcasting the full
                // project/session tree from watcher events; clients can pull when needed.
                connectedClients.forEach(client => {
                    sendToOpenClient(client, updatePayload);
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
                depth: PROVIDER_WATCHER_DEPTH,
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

// ── Per-project workspace watchers (file explorer live refresh) ─────────────
// setupProjectsWatcher() above only watches provider metadata folders
// (~/.claude/projects etc.), so the file explorer never learned about changes
// inside the actual project working directory. These watchers are created on
// demand when a client sends `watch-project` over /ws and broadcast debounced
// `project_files_updated` events to subscribed clients only, letting the
// explorer refresh automatically without HTTP polling.
const WORKSPACE_WATCHER_DEBOUNCE_MS = 800;
const WORKSPACE_WATCHER_DEPTH = Number.parseInt(process.env.PIXCODE_WORKSPACE_WATCH_DEPTH || '', 10) || 5;
const WORKSPACE_WS_BACKPRESSURE_LIMIT = 2 * 1024 * 1024;
const WORKSPACE_DIFF_SNAPSHOT_MAX_BYTES = 128 * 1024;
const WORKSPACE_DIFF_SNAPSHOT_MAX_FILES = 80;
const WORKSPACE_DIFF_SNAPSHOT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const workspaceWatchers = new Map(); // projectName -> { watcher, subscribers, debounceTimer, pendingEvent, rootPath, fileSnapshots }

function getWorkspaceSnapshotBytes(content) {
    return Buffer.byteLength(String(content || ''), 'utf8');
}

function deleteWorkspaceSnapshot(entry, relativePath) {
    if (!entry?.fileSnapshots?.has(relativePath)) return;
    const previous = entry.fileSnapshots.get(relativePath);
    entry.snapshotBytes = Math.max(0, (entry.snapshotBytes || 0) - getWorkspaceSnapshotBytes(previous));
    entry.fileSnapshots.delete(relativePath);
}

function setWorkspaceSnapshot(entry, relativePath, content) {
    if (!entry || !relativePath || typeof content !== 'string') return;
    const nextBytes = getWorkspaceSnapshotBytes(content);
    if (nextBytes > WORKSPACE_DIFF_SNAPSHOT_MAX_BYTES) {
        deleteWorkspaceSnapshot(entry, relativePath);
        return;
    }

    deleteWorkspaceSnapshot(entry, relativePath);
    entry.fileSnapshots.set(relativePath, content);
    entry.snapshotBytes = (entry.snapshotBytes || 0) + nextBytes;

    while (
        entry.fileSnapshots.size > WORKSPACE_DIFF_SNAPSHOT_MAX_FILES ||
        (entry.snapshotBytes || 0) > WORKSPACE_DIFF_SNAPSHOT_MAX_TOTAL_BYTES
    ) {
        const oldestKey = entry.fileSnapshots.keys().next().value;
        if (!oldestKey) break;
        deleteWorkspaceSnapshot(entry, oldestKey);
    }
}

function runWorkspaceCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }

            reject(new Error(stderr || `${command} exited with code ${code}`));
        });
    });
}

function parseGitPorcelainZ(output) {
    const entries = [];
    const parts = String(output || '').split('\0').filter(Boolean);

    for (let index = 0; index < parts.length; index += 1) {
        const entry = parts[index];
        if (entry.length < 4) {
            continue;
        }

        const status = entry.slice(0, 2);
        const filePath = entry.slice(3).replace(/\\/g, '/');
        if (filePath) {
            entries.push(filePath);
        }

        if (status[0] === 'R' || status[0] === 'C') {
            index += 1;
        }
    }

    return entries;
}

function normalizeWorkspaceRelativePath(rootPath, filePath) {
    const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('../') || relativePath === '..' || path.isAbsolute(relativePath)) {
        return null;
    }

    return relativePath;
}

async function readWorkspaceTextSnapshot(filePath) {
    try {
        const stats = await fsPromises.stat(filePath);
        if (!stats.isFile() || stats.size > WORKSPACE_DIFF_SNAPSHOT_MAX_BYTES) {
            return null;
        }

        const buffer = await fsPromises.readFile(filePath);
        if (buffer.includes(0)) {
            return null;
        }

        return buffer.toString('utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return '';
        }

        return null;
    }
}

async function initializeWorkspaceDirtySnapshots(rootPath, entry) {
    try {
        const { stdout } = await runWorkspaceCommand('git', ['status', '--porcelain', '-z'], rootPath);
        const changedPaths = parseGitPorcelainZ(stdout).slice(0, WORKSPACE_DIFF_SNAPSHOT_MAX_FILES);

        await Promise.all(changedPaths.map(async (relativePath) => {
            const content = await readWorkspaceTextSnapshot(path.join(rootPath, relativePath));
            if (typeof content === 'string') {
                setWorkspaceSnapshot(entry, relativePath, content);
            }
        }));
    } catch {
        // Non-git workspaces still get event-time snapshots after the first change.
    }
}

async function subscribeToWorkspace(ws, projectName) {
    if (!projectName || typeof projectName !== 'string') return;
    if (!userHasProjectAccess(ws.user, { name: projectName, projectName }, 'viewFiles')) return;

    const existing = workspaceWatchers.get(projectName);
    if (existing) {
        existing.subscribers.add(ws);
        return;
    }

    let rootPath;
    try {
        rootPath = await extractProjectDirectory(projectName);
        await fsPromises.access(rootPath);
    } catch (error) {
        console.warn(`[watcher] Cannot watch workspace for ${projectName}:`, error.message);
        return;
    }

    const entry = {
        watcher: null,
        subscribers: new Set([ws]),
        debounceTimer: null,
        pendingEvent: null,
        rootPath,
        fileSnapshots: new Map(),
        snapshotBytes: 0,
    };
    workspaceWatchers.set(projectName, entry);
    await initializeWorkspaceDirtySnapshots(rootPath, entry);

    const broadcastFileUpdate = async (eventType, filePath) => {
        const relativePath = filePath ? normalizeWorkspaceRelativePath(rootPath, filePath) : null;
        const previousContent = relativePath ? entry.fileSnapshots.get(relativePath) : undefined;
        let currentContent;

        if (relativePath && !eventType.endsWith('Dir')) {
            if (eventType === 'unlink') {
                currentContent = '';
                deleteWorkspaceSnapshot(entry, relativePath);
            } else {
                const snapshot = await readWorkspaceTextSnapshot(filePath);
                if (typeof snapshot === 'string') {
                    currentContent = snapshot;
                    setWorkspaceSnapshot(entry, relativePath, snapshot);
                }
            }
        }

        const nextEvent = {
            eventType,
            filePath,
            changedFile: relativePath,
            oldContent: typeof previousContent === 'string'
                ? previousContent
                : eventType === 'add'
                    ? ''
                    : undefined,
            currentContent,
        };

        entry.pendingEvent = entry.pendingEvent?.changedFile === relativePath
            ? {
                ...nextEvent,
                oldContent: entry.pendingEvent.oldContent ?? nextEvent.oldContent,
            }
            : nextEvent;

        if (entry.debounceTimer) {
            clearTimeout(entry.debounceTimer);
        }
        entry.debounceTimer = setTimeout(() => {
            entry.debounceTimer = null;
            const pending = entry.pendingEvent || {};
            entry.pendingEvent = null;
            const hasSnapshotDiff = (
                typeof pending.oldContent === 'string'
                && typeof pending.currentContent === 'string'
                && pending.oldContent !== pending.currentContent
            );
            const message = JSON.stringify({
                type: 'project_files_updated',
                projectName,
                changeType: pending.eventType || 'change',
                changedFile: pending.changedFile ?? (pending.filePath ? path.relative(rootPath, pending.filePath) : null),
                ...(hasSnapshotDiff
                    ? {
                        oldContent: pending.oldContent,
                        currentContent: pending.currentContent,
                        diffSource: 'workspace-snapshot',
                    }
                    : {}),
                timestamp: new Date().toISOString(),
            });
            entry.subscribers.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.bufferedAmount <= WORKSPACE_WS_BACKPRESSURE_LIMIT) {
                    client.send(message);
                }
            });
        }, WORKSPACE_WATCHER_DEBOUNCE_MS);
    };

    try {
        const chokidar = (await import('chokidar')).default;
        const watcher = chokidar.watch(rootPath, {
            ignored: WATCHER_IGNORED_PATTERNS,
            persistent: true,
            ignoreInitial: true,
            followSymlinks: false,
            depth: WORKSPACE_WATCHER_DEPTH,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 250
            }
        });

        watcher
            .on('add', (filePath) => void broadcastFileUpdate('add', filePath))
            .on('change', (filePath) => void broadcastFileUpdate('change', filePath))
            .on('unlink', (filePath) => void broadcastFileUpdate('unlink', filePath))
            .on('addDir', (dirPath) => void broadcastFileUpdate('addDir', dirPath))
            .on('unlinkDir', (dirPath) => void broadcastFileUpdate('unlinkDir', dirPath))
            .on('error', (error) => {
                console.error(`[ERROR] Workspace watcher error for ${projectName}:`, error);
            });

        entry.watcher = watcher;
    } catch (error) {
        workspaceWatchers.delete(projectName);
        console.error(`[ERROR] Failed to watch workspace for ${projectName}:`, error);
    }
}

function unsubscribeFromWorkspace(ws, projectName = null) {
    const entries = projectName
        ? (workspaceWatchers.has(projectName) ? [[projectName, workspaceWatchers.get(projectName)]] : [])
        : Array.from(workspaceWatchers.entries());

    for (const [name, entry] of entries) {
        entry.subscribers.delete(ws);
        if (entry.subscribers.size === 0) {
            if (entry.debounceTimer) {
                clearTimeout(entry.debounceTimer);
            }
            workspaceWatchers.delete(name);
            entry.watcher?.close().catch((error) => {
                console.warn(`[watcher] Failed to close workspace watcher for ${name}:`, error?.message || error);
            });
        }
    }
}


const app = express();
const server = http.createServer(app);

const ptySessionsMap = new Map();
const PTY_SESSION_TIMEOUT = 30 * 60 * 1000;
const COMPLETED_PTY_SESSION_TTL = Number.parseInt(process.env.PIXCODE_COMPLETED_PTY_TTL_MS || '', 10) || 60 * 1000;
const SHELL_URL_PARSE_BUFFER_LIMIT = 32768;
const SHELL_OUTPUT_FLUSH_MAX_CHARS = 128 * 1024;
const SHELL_WS_BACKPRESSURE_LIMIT = 8 * 1024 * 1024;
const PTY_SESSION_BUFFER_MAX_BYTES = Number.parseInt(process.env.PIXCODE_PTY_BUFFER_MAX_BYTES || '', 10) || (512 * 1024);
const SHELL_INPUT_CHUNK_CHARS = 16384;
const SHELL_PENDING_INPUT_MAX_BYTES = Number.parseInt(process.env.PIXCODE_SHELL_PENDING_INPUT_MAX_BYTES || '', 10) || (256 * 1024 * 1024);
const SHELL_CLI_PROVIDERS = new Set(['claude', 'codex', 'cursor', 'gemini', 'qwen', 'opencode']);
const FILE_TREE_MAX_ITEMS = Number.parseInt(process.env.PIXCODE_FILE_TREE_MAX_ITEMS || '', 10) || 5000;
const FILE_TREE_MAX_DIRECTORIES = Number.parseInt(process.env.PIXCODE_FILE_TREE_MAX_DIRECTORIES || '', 10) || 1200;
const FILE_TREE_SCAN_MAX_MS = Number.parseInt(process.env.PIXCODE_FILE_TREE_SCAN_MAX_MS || '', 10) || 4000;
const FILE_TREE_MAX_ENTRIES_PER_DIRECTORY = Number.parseInt(process.env.PIXCODE_FILE_TREE_MAX_ENTRIES_PER_DIRECTORY || '', 10) || 1500;
const FILE_TREE_EXCLUDED_ENTRY_NAMES = new Set([
    '.cache',
    '.git',
    '.gradle',
    '.hg',
    '.next',
    '.nuxt',
    '.pnpm-store',
    '.repo',
    '.svn',
    '.svelte-kit',
    '.turbo',
    '.venv',
    'build',
    'coverage',
    'DerivedData',
    'dist',
    'dist-server',
    'node_modules',
    'out',
    'Pods',
    'prebuilts',
    'target',
    'vendor',
    'venv',
]);
import { stripAnsiSequences, normalizeDetectedUrl, extractUrlsFromText, shouldAutoOpenUrlFromOutput } from './utils/url-detection.js';

function terminatePtySession(sessionKey, session, reason) {
    if (!session) return false;

    console.log(`🧹 Terminating PTY session (${reason}):`, sessionKey);
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

function killProviderPtySessions(projectPath, provider, userId = null) {
    let killed = 0;
    for (const [sessionKey, session] of ptySessionsMap.entries()) {
        if (
            session?.projectPath === projectPath &&
            session?.provider === provider &&
            (!userId || session?.userId === userId) &&
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

    const lastWeakBusy = getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*[•*]\s*(?:Working|Running|Thinking)\b/giu);
    const lastStrongBusy = Math.max(
        getLastRegexMatchIndex(cleanOutput, /\bWorking\s*\([^)]*esc to interrupt[^)]*\)/giu),
        getLastRegexMatchIndex(cleanOutput, /\bmsg=interrupt\b/giu),
    );
    const lastBusy = Math.max(lastWeakBusy, lastStrongBusy);

    if (provider === 'codex') {
        const lastPrompt = Math.max(
            getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*›(?:\s|$)/gu),
            getLastRegexMatchIndex(cleanOutput, /(?:^|\n)\s*❯(?:\s|$)/gu),
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
    let value = String(data || '');
    if (!value) return;

    let valueBytes = Buffer.byteLength(value, 'utf8');
    if (valueBytes > PTY_SESSION_BUFFER_MAX_BYTES) {
        value = value.slice(-PTY_SESSION_BUFFER_MAX_BYTES);
        valueBytes = Buffer.byteLength(value, 'utf8');
    }

    session.totalOutputBytes = (session.totalOutputBytes || 0) + valueBytes;
    session.buffer.push(value);
    session.bufferBytes = (session.bufferBytes || 0) + valueBytes;

    while (session.buffer.length > 0 && session.bufferBytes > PTY_SESSION_BUFFER_MAX_BYTES) {
        const removed = session.buffer.shift();
        session.bufferBytes -= Buffer.byteLength(String(removed || ''), 'utf8');
    }
    if (session.bufferBytes < 0) session.bufferBytes = 0;
}

function readPtySessionBufferedOutput(session, { maxChars = 12000, sinceCursor = null } = {}) {
    const rawBuffer = (session?.buffer || []).join('');
    const bufferBytes = session?.bufferBytes || Buffer.byteLength(rawBuffer, 'utf8');
    const outputCursor = session?.totalOutputBytes || bufferBytes;
    const bufferStartCursor = Math.max(0, outputCursor - bufferBytes);
    let rawOutput = rawBuffer;

    if (Number.isFinite(sinceCursor)) {
        const skipBytes = Math.max(0, sinceCursor - bufferStartCursor);
        if (skipBytes > 0) {
            rawOutput = Buffer.from(rawBuffer, 'utf8').slice(skipBytes).toString('utf8');
        }
    }

    if (rawOutput.length > maxChars) {
        rawOutput = rawOutput.slice(-maxChars);
    }

    return {
        rawOutput,
        outputCursor,
        bufferStartCursor,
    };
}

function normalizeTerminalStartupInput(input) {
    return `\x15${String(input || '').replace(/(?:\r\n|\r|\n)+$/u, '')}\r`;
}

function normalizeTerminalBufferedInput(input) {
    return `\x15${String(input || '').replace(/(?:\r\n|\r|\n)+$/u, '')}`;
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
            const message = `\r\n\x1b[33m[Pixcode] Startup input was not sent because ${session.provider} is still ${readiness.terminalState || 'unavailable'}.\x1b[0m\r\n`;
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
        console.log(`⌨️  Submitted startup input to visible PTY (${item.reason})`);
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

function splitTerminalInput(data) {
    const value = String(data || '');
    if (!value) return [];
    const chunks = [];
    for (let index = 0; index < value.length; index += SHELL_INPUT_CHUNK_CHARS) {
        chunks.push(value.slice(index, index + SHELL_INPUT_CHUNK_CHARS));
    }
    return chunks;
}

function writeTerminalInputChunks(ptyProcess, data) {
    if (!ptyProcess?.write) return false;
    const chunks = splitTerminalInput(data);
    if (chunks.length === 0) return false;
    for (const chunk of chunks) {
        ptyProcess.write(chunk);
    }
    return true;
}

function resizeTerminalPty(ptyProcess, cols, rows, context = 'resize') {
    if (!ptyProcess || typeof ptyProcess.resize !== 'function') return false;
    const nextCols = Number.parseInt(cols, 10);
    const nextRows = Number.parseInt(rows, 10);
    if (!Number.isFinite(nextCols) || !Number.isFinite(nextRows) || nextCols < 2 || nextRows < 1) {
        return false;
    }

    try {
        ptyProcess.resize(nextCols, nextRows);
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/already exited/i.test(message)) {
            console.warn(`Terminal ${context} failed:`, message);
        }
        return false;
    }
}

function readPtyTarget(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function findProviderPtySession({
    provider,
    projectPath,
    user,
    tabId = null,
    sessionId = null,
    requireRunning = false,
    requirePty = false,
}) {
    const requestedProjectPath = projectPath ? path.resolve(projectPath) : null;
    const requestUserId = user?.id ?? user?.userId ?? null;
    const canUseAnyShellSession = ['admin', 'owner'].includes(user?.role);
    const requestedTabId = readPtyTarget(tabId);
    const requestedSessionId = readPtyTarget(sessionId);
    const candidates = [];

    for (const session of ptySessionsMap.values()) {
        if (session?.provider !== provider || session?.isPlainShell) continue;
        if (requirePty && !session?.pty) continue;
        if (requireRunning && session?.lifecycleState !== 'running') continue;
        if (!canUseAnyShellSession && session?.userId !== requestUserId) continue;
        if (requestedProjectPath && path.resolve(session.projectPath || os.homedir()) !== requestedProjectPath) continue;
        if (requestedTabId && session.tabId !== requestedTabId) continue;
        if (requestedSessionId && session.sessionId !== requestedSessionId) continue;
        candidates.push(session);
    }

    if (candidates.length === 0) {
        return {
            status: 'missing',
            session: null,
            candidates,
            requestedProjectPath,
        };
    }

    if ((requestedTabId || requestedSessionId) && candidates.length > 1) {
        return {
            status: 'ambiguous',
            session: null,
            candidates,
            requestedProjectPath,
        };
    }

    const session = candidates.reduce((latest, candidate) => (
        !latest || (candidate.updatedAt || 0) > (latest.updatedAt || 0) ? candidate : latest
    ), null);

    if (!requestedTabId && !requestedSessionId && candidates.length > 1) {
        return {
            status: 'legacy-latest',
            session,
            candidates,
            requestedProjectPath,
        };
    }

    return {
        status: 'matched',
        session,
        candidates,
        requestedProjectPath,
    };
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
    return flags.length > 0 ? `${command} ${flags.join(' ')}` : command;
}

function hideProviderApprovalChoiceLines(output) {
    const approvalChoicePattern = /(?:^|\s)(?:[0-9]+[.)]\s*)?(?:yes,?\s+proceed|yes,?\s+and\s+don['’]?t|no,?\s+and\s+(?:tell|keep|cancel)|no,?\s+do\s+not)/iu;
    return String(output || '')
        .split(/(\r\n|\n|\r)/u)
        .reduce((parts, part, index, chunks) => {
            if (part === '\r\n' || part === '\n' || part === '\r') {
                const previousWasHidden = chunks[index - 1] && approvalChoicePattern.test(stripAnsiSequences(chunks[index - 1]));
                if (!previousWasHidden) parts.push(part);
                return parts;
            }

            if (!approvalChoicePattern.test(stripAnsiSequences(part))) {
                parts.push(part);
            }
            return parts;
        }, [])
        .join('');
}

function resolvePublicBaseUrl(request) {
    const headers = request?.headers || {};
    const forwardedProto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || (request?.socket?.encrypted ? 'https' : 'http');
    const host = headers['x-forwarded-host'] || headers.host || `127.0.0.1:${process.env.SERVER_PORT || process.env.PORT || '3001'}`;
    return `${proto}://${String(host).split(',')[0].trim()}`;
}

function quoteBashArg(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function quotePowerShellArg(value) {
    return `"${String(value).replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"')}"`;
}

function quoteShellArgForPlatform(value) {
    return os.platform() === 'win32' ? quotePowerShellArg(value) : quoteBashArg(value);
}

// Single WebSocket server that handles both paths
const wss = new WebSocketServer({
    server,
    verifyClient: (info) => {
        console.log('WebSocket connection attempt to:', info.req.url);

        const platformBypassUser = IS_PLATFORM ? authenticateWebSocket(null) : null;
        if (platformBypassUser) {
            const user = platformBypassUser;
            info.req.user = user;
            console.log('[OK] Platform mode WebSocket authenticated via explicit bypass for user:', user.username);
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

// ── Security hardening ──────────────────────────────────────────────
// Disable the X-Powered-By header so the framework isn't advertised.
app.disable('x-powered-by');
// Trust the first proxy hop so X-Forwarded-* headers are respected when
// running behind nginx/Caddy/etc. (needed for correct protocol detection
// in resolvePublicBaseUrl and for rate-limiting middleware if added later).
app.set('trust proxy', 1);

// CORS: self-hosted tool accessed from various IPs/hostnames.
// Reflect the requesting origin so IP-based access (e.g. http://85.235.74.198:3001)
// works without configuration. Credentials needed for auth header passthrough.
app.use(cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Refreshed-Token'],
}));

// Security headers middleware (replaces helmet which isn't installed).
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Strict-Transport-Security only makes sense over HTTPS; skip for plain HTTP
    // so local dev doesn't pin an HSTS policy on localhost.
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // CSP for the SPA shell — relaxed for self-hosted tool accessed from
    // various IPs/hostnames. 'unsafe-inline' + 'unsafe-eval' needed for Vite.
    // ws:/wss: in connect-src allows WebSocket from any origin (IP access).
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: http: https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; '));
    next();
});

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
    const updateState = readSystemUpdateState();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        installMode,
        version: SERVER_VERSION,
        pendingRestart: updateState.pendingRestart,
        lastAppliedUpdate: updateState.lastAppliedUpdate,
    });
});

// Optional API key validation (if configured) + rate limiting for all API routes
app.use('/api', validateApiKey);
app.use('/api', apiRateLimiter);

app.post('/api/shell/sessions/terminate', authenticateToken, requireProjectPathAccess('useShell'), (req, res) => {
    const provider = req.body?.provider || 'claude';
    const projectPath = req.body?.projectPath || os.homedir();

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const killedSessions = killProviderPtySessions(
        projectPath,
        provider,
        ['admin', 'owner'].includes(req.user?.role) ? null : (req.user?.id ?? req.user?.userId ?? null),
    );
    res.json({ success: true, killedSessions });
});

app.get('/api/shell/sessions/provider-output', authenticateToken, requireProjectPathAccess('useShell'), (req, res) => {
    const provider = String(req.query.provider || 'claude');
    const projectPath = typeof req.query.projectPath === 'string' && req.query.projectPath.trim()
        ? req.query.projectPath.trim()
        : null;
    const tabId = readPtyTarget(req.query.tabId);
    const sessionId = readPtyTarget(req.query.sessionId);
    const maxChars = Math.min(
        20000,
        Math.max(1000, Number.parseInt(String(req.query.maxChars || '12000'), 10) || 12000)
    );
    const sinceCursorRaw = Number.parseInt(String(req.query.sinceCursor ?? ''), 10);
    const sinceCursor = Number.isFinite(sinceCursorRaw) ? Math.max(0, sinceCursorRaw) : null;

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const match = findProviderPtySession({ provider, projectPath, user: req.user, tabId, sessionId });

    if (!match.session) {
        if (match.status === 'ambiguous') {
            return res.status(409).json({
                active: false,
                provider,
                projectPath: match.requestedProjectPath,
                tabId,
                sessionId,
                output: '',
                outputCursor: 0,
                bufferStartCursor: 0,
                message: 'Multiple provider terminal sessions match this target. Pick a specific tab.',
            });
        }
        return res.json({
            active: false,
            provider,
            projectPath: match.requestedProjectPath,
            tabId,
            sessionId,
            output: '',
            outputCursor: 0,
            bufferStartCursor: 0,
            message: 'No active provider terminal session found for this project.',
        });
    }

    const matchedSession = match.session;
    const {
        rawOutput,
        outputCursor,
        bufferStartCursor,
    } = readPtySessionBufferedOutput(matchedSession, { maxChars, sinceCursor });
    const output = stripAnsiSequences(rawOutput);
    const fullOutput = readSessionOutputForState(matchedSession);
    const terminalState = resolveProviderTerminalState(matchedSession, provider, fullOutput);
    res.json({
        active: true,
        provider,
        projectPath: path.resolve(matchedSession.projectPath || os.homedir()),
        sessionId: matchedSession.sessionId || null,
        tabId: matchedSession.tabId || null,
        updatedAt: matchedSession.updatedAt || null,
        matchStatus: match.status,
        ...terminalState,
        output,
        outputCursor,
        bufferStartCursor,
        sinceCursor,
    });
});

app.post('/api/shell/sessions/provider-input', authenticateToken, requireProjectPathAccess('useShell'), (req, res) => {
    const provider = String(req.body?.provider || 'claude');
    const projectPath = typeof req.body?.projectPath === 'string' && req.body.projectPath.trim()
        ? req.body.projectPath.trim()
        : null;
    const tabId = readPtyTarget(req.body?.tabId);
    const sessionId = readPtyTarget(req.body?.sessionId);
    const input = typeof req.body?.input === 'string' ? req.body.input : '';
    const submit = req.body?.submit !== false;
    const submitMode = req.body?.submitMode === 'deferred-enter' ? 'deferred-enter' : 'inline';

    if (!SHELL_CLI_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    const match = findProviderPtySession({
        provider,
        projectPath,
        user: req.user,
        tabId,
        sessionId,
        requireRunning: true,
        requirePty: true,
    });

    if (!match.session?.pty) {
        if (match.status === 'ambiguous') {
            return res.status(409).json({
                ok: false,
                provider,
                projectPath: match.requestedProjectPath,
                tabId,
                sessionId,
                wrote: false,
                message: 'Multiple running provider terminal sessions match this target. Pick a specific tab.',
            });
        }
        return res.status(404).json({
            ok: false,
            provider,
            projectPath: match.requestedProjectPath,
            tabId,
            sessionId,
            wrote: false,
            message: 'No running provider terminal session found for this project.',
        });
    }

    const matchedSession = match.session;
    const data = submit
        ? (submitMode === 'deferred-enter' ? normalizeTerminalBufferedInput(input) : normalizeTerminalStartupInput(input))
        : input;
    const outputCursorBefore = matchedSession.totalOutputBytes || matchedSession.bufferBytes || 0;
    try {
        writeTerminalInputChunks(matchedSession.pty, data);
        if (submit && submitMode === 'deferred-enter') {
            setTimeout(() => {
                const currentSession = findProviderPtySession({
                    provider,
                    projectPath,
                    user: req.user,
                    tabId,
                    sessionId,
                    requireRunning: true,
                    requirePty: true,
                }).session;
                try {
                    writeTerminalInputChunks(currentSession?.pty, '\r');
                    if (currentSession) currentSession.updatedAt = Date.now();
                } catch (error) {
                    console.warn('Deferred terminal submit failed:', error?.message || error);
                }
            }, 120);
        }
        matchedSession.updatedAt = Date.now();
        res.json({
            ok: true,
            provider,
            projectPath: path.resolve(matchedSession.projectPath || os.homedir()),
            sessionId: matchedSession.sessionId || null,
            tabId: matchedSession.tabId || null,
            wrote: true,
            submitted: submit,
            submitMode,
            bytes: Buffer.byteLength(data),
            matchStatus: match.status,
            outputCursorBefore,
            outputCursorAfter: matchedSession.totalOutputBytes || matchedSession.bufferBytes || 0,
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

const sanitizeTelegramActiveString = (value, maxLength = 240) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
};

function requireVerifiedTelegramLink(req, res) {
    const link = telegramLinksDb.getByUserId(req.user.id);
    if (!link?.chat_id || !link?.verified_at) {
        res.status(409).json({ error: 'Telegram is not paired for this user.' });
        return null;
    }
    return link;
}

// Bind the paired Telegram chat to an already running provider terminal tab.
// This route lives next to the PTY registry so it can verify the target is live.
app.post('/api/telegram/active-terminal', authenticateToken, requireProjectPathAccess('useShell'), async (req, res) => {
    try {
        const link = requireVerifiedTelegramLink(req, res);
        if (!link) return;

        const provider = sanitizeTelegramActiveString(req.body?.provider, 40);
        const projectPathRaw = sanitizeTelegramActiveString(req.body?.projectPath, 2000);
        if (!provider || !SHELL_CLI_PROVIDERS.has(provider) || !projectPathRaw) {
            return res.status(400).json({ error: 'A supported provider and projectPath are required.' });
        }

        const projectPath = path.resolve(projectPathRaw);
        const projectName = sanitizeTelegramActiveString(req.body?.projectName) || path.basename(projectPath);
        const tabId = sanitizeTelegramActiveString(req.body?.tabId, 160);
        const sessionId = sanitizeTelegramActiveString(req.body?.sessionId, 240);

        const match = findProviderPtySession({
            provider,
            projectPath,
            user: req.user,
            tabId,
            sessionId,
            requireRunning: true,
            requirePty: true,
        });

        if (!match.session?.pty) {
            if (match.status === 'ambiguous') {
                return res.status(409).json({
                    error: 'Multiple running provider terminal sessions match this target. Pick a specific tab.',
                    candidates: match.candidates.map((session) => ({
                        sessionId: session.sessionId || null,
                        tabId: session.tabId || null,
                        projectPath: path.resolve(session.projectPath || os.homedir()),
                        updatedAt: session.updatedAt || null,
                    })),
                });
            }
            return res.status(404).json({
                error: 'No running provider terminal session found for this project.',
            });
        }

        const matchedSession = match.session;
        const resolvedMatchedProjectPath = path.resolve(matchedSession.projectPath || projectPath);
        const activeTerminal = {
            provider,
            projectPath: resolvedMatchedProjectPath,
            projectName,
            projectLabel: sanitizeTelegramActiveString(req.body?.projectLabel) || projectName,
            sessionId: matchedSession.sessionId || sessionId || null,
            tabId: matchedSession.tabId || tabId || null,
            attachedAt: new Date().toISOString(),
        };
        const control = telegramLinksDb.updateControlState(req.user.id, {
            activeTerminal,
            selectedProvider: provider,
            selectedProjectName: projectName,
            selectedProjectPath: resolvedMatchedProjectPath,
        });
        notifyTelegramTerminalAttached({
            userId: req.user.id,
            terminal: control.activeTerminal,
        }).then((telegramNotice) => {
            if (telegramNotice?.ok === false) {
                console.warn('[telegram] terminal attach notice not delivered:', telegramNotice.reason);
            }
        }).catch((error) => {
            console.warn('[telegram] terminal attach notice failed:', error?.message || error);
        });

        res.json({ success: true, activeTerminal: control.activeTerminal, control, matchStatus: match.status, telegramNotice: { queued: true } });
    } catch (error) {
        console.error('telegram/active-terminal failed:', error);
        res.status(500).json({ error: 'Failed to attach Telegram to this terminal.' });
    }
});

// Return Telegram text input to the normal AI router.
app.delete('/api/telegram/active-terminal', authenticateToken, (req, res) => {
    try {
        const link = requireVerifiedTelegramLink(req, res);
        if (!link) return;
        const control = telegramLinksDb.updateControlState(req.user.id, { activeTerminal: null });
        res.json({ success: true, control });
    } catch (error) {
        console.error('telegram/active-terminal delete failed:', error);
        res.status(500).json({ error: 'Failed to detach Telegram terminal.' });
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

// Platform control plane APIs (admin-only)
app.use('/api/platformization', authenticateToken, requireAdmin, platformizationRoutes);

// Project Live View (protected control API + public share proxy)
app.use('/api/live-view', authenticateToken, liveViewRoutes);

// Unified provider MCP routes (protected)
app.use('/api/providers', authenticateToken, providerRoutes);

adapterRegistry.register(new ClaudeCodeA2AAdapter());
adapterRegistry.register(new CodexA2AAdapter());
adapterRegistry.register(new CursorA2AAdapter());
adapterRegistry.register(new GeminiA2AAdapter());
adapterRegistry.register(new QwenA2AAdapter());
adapterRegistry.register(new OpenCodeA2AAdapter());
adapterRegistry.register(new JsonEventA2AAdapter());
app.use('/preview', authenticateToken, requireAdmin, createPreviewProxyRouter());
app.use('/api/orchestration', authenticateToken, requireAdmin, createOrchestrationTaskRouter());
app.use('/api/orchestration', authenticateToken, requireAdmin, createWorkflowRouter());
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
    console.log('[monaco] Local Monaco assets not found; code editor loader may fail.');
}

app.use(express.static(path.join(APP_ROOT, 'dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            // Prevent HTML caching to avoid service worker issues after builds
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
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

app.get('/api/system/update-state', authenticateToken, (req, res) => {
    res.json({
        success: true,
        state: readSystemUpdateState(),
        activeJob: snapshotUpdateJob(getActiveUpdateJob()),
        activeWork: getActiveWorkSummary(),
        currentVersion: SERVER_VERSION,
        installMode,
        capabilities: {
            canBackgroundUpdate: true,
            canRestart: true,
            startupUpdateDefault: false,
        },
    });
});

app.post('/api/system/update-jobs', authenticateToken, requireAdmin, requireApiScope('system:update'), (req, res) => {
    securityLog('system_update_initiated', {
        ip: getClientIp(req),
        userId: req.user?.id,
        username: req.user?.username,
        endpoint: req.path,
    });
    const job = createSystemUpdateJob(req.user, {
        targetVersion: req.body?.targetVersion || req.body?.latestVersion,
    });
    res.status(job.status === 'queued' ? 202 : 200).json({
        success: true,
        job: snapshotUpdateJob(job),
    });
});

app.get('/api/system/update-jobs/:jobId', authenticateToken, requireAdmin, requireApiScope('system:update'), (req, res) => {
    const job = updateJobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ success: false, error: 'Update job not found' });
    }

    res.json({ success: true, job: snapshotUpdateJob(job) });
});

// System update endpoint — streams live output via Server-Sent Events so the
// UI sees npm/git progress in real time instead of waiting ~2 minutes for the
// buffered response.
//
// Three update modes, picked in order of specificity:
//   1. PIXCODE_RUNTIME_DIR set → "desktop wrapper" path. Pulls the latest
//      npm tarball, extracts it to the writable runtime dir, and triggers
//      a server restart so the Electron wrapper respawns with new code.
//      ~4 MB download, ~10 s; no npm/git/shell required on the host.
//   2. installMode === 'git' → safe git updater script. It stashes dirty
//      checkout state before pulling so source installs do not fail on local
//      modified files left by older releases or manual edits.
//   3. fallback → `npm install -g …` (classic npm-distributed install).
app.post('/api/system/update', authenticateToken, requireAdmin, requireApiScope('system:update'), async (req, res) => {
    const projectRoot = APP_ROOT;
    console.log('Starting system update from directory:', projectRoot);

    const runtimeDir = process.env.PIXCODE_RUNTIME_DIR || null;
    const gitUpdateScript = path.join(projectRoot, 'scripts', 'update-git-install.mjs');

    const updateCommand = IS_PLATFORM
        ? 'npm run update:platform'
        : installMode === 'git'
            ? `${JSON.stringify(process.execPath)} ${JSON.stringify(gitUpdateScript)}`
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
    // guard both would try to write a `done` event + call res.end(), which
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
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Heartbeat keeps intermediate proxies from closing an idle connection
    // during long npm installs. Declared before spawn so the handlers below
    // can reference it, and guarded against writes after end.
    const heartbeat = setInterval(() => {
        if (ended) return;
        res.write(': ping\n\n');
    }, 15000);

    // ────────────────────────────────────────────────────────────────
    // Runtime-dir mode — the desktop wrapper (pixcode-desktop) sets
    // PIXCODE_RUNTIME_DIR to a writable directory it owns and forks this
    // server from there. Updates download the npm tarball directly and
    // swap it in-place, which is ~4 MB vs. ~85 MB for a full installer
    // re-download. No shell, npm, or git required on the host.
    // ────────────────────────────────────────────────────────────────
    if (runtimeDir) {
        send('log', { stream: 'meta', chunk: `Update mode: runtime-dir\n` });
        send('log', { stream: 'meta', chunk: `Runtime: ${runtimeDir}\n` });

        try {
            // 1. Resolve the latest version from the npm registry.
            send('log', { stream: 'meta', chunk: 'Querying registry for latest version…\n' });
            const registryRes = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode');
            if (!registryRes.ok) throw new Error(`Registry returned HTTP ${registryRes.status}`);
            const metadata = await registryRes.json();
            const latestVersion = metadata['dist-tags']?.latest;
            const latestEntry = latestVersion ? metadata.versions?.[latestVersion] : null;
            const tarballUrl = latestEntry?.dist?.tarball;
            const tarballIntegrity = latestEntry?.dist?.integrity;
            if (!latestVersion || !tarballUrl) throw new Error('Registry response missing latest/tarball');

            send('log', { stream: 'meta', chunk: `Current: ${SERVER_VERSION} → Latest: ${latestVersion}\n` });

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

            // 2. Download the tarball to a buffer so we can verify integrity
            //    before extracting. Doing the extract under `.staging` first
            //    means the live runtime stays intact if the download fails.
            send('log', { stream: 'meta', chunk: `Downloading ${tarballUrl}\n` });
            const tarballRes = await fetch(tarballUrl);
            if (!tarballRes.ok || !tarballRes.body) {
                throw new Error(`Tarball fetch failed: HTTP ${tarballRes.status}`);
            }

            const tarballBuffer = Buffer.from(await tarballRes.arrayBuffer());

            // Verify integrity hash against registry-provided SRI string.
            if (tarballIntegrity) {
                try {
                    verifyTarballIntegrity(tarballBuffer, tarballIntegrity);
                    send('log', { stream: 'meta', chunk: 'Tarball integrity verified.\n' });
                } catch (verifyError) {
                    send('log', { stream: 'stderr', chunk: `Integrity verification failed: ${verifyError.message}\n` });
                    throw verifyError;
                }
            } else {
                send('log', { stream: 'meta', chunk: 'WARNING: No integrity hash from registry — extracting without verification.\n' });
            }

            const stagingDir = path.join(runtimeDir, '.staging');
            const backupDir = path.join(runtimeDir, '.previous');
            fs.rmSync(stagingDir, { recursive: true, force: true });
            fs.mkdirSync(stagingDir, { recursive: true });

            const { Readable } = await import('node:stream');
            const tarModule = await import('tar');
            const tarExtract = tarModule.x || tarModule.default?.x;
            if (!tarExtract) throw new Error('tar extractor not available');

            // npm tarballs always root at `package/` — strip:1 lifts the
            // contents to the staging dir directly so paths match the
            // existing runtime layout.
            await new Promise((resolve, reject) => {
                const nodeStream = Readable.from(tarballBuffer);
                const extractor = tarExtract({ cwd: stagingDir, strip: 1 });
                nodeStream.pipe(extractor);
                extractor.on('finish', resolve);
                extractor.on('error', reject);
                nodeStream.on('error', reject);
            });

            send('log', { stream: 'meta', chunk: 'Swapping runtime…\n' });

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
            //     if this release changed `dependencies` (e.g. bcrypt →
            //     bcryptjs in 1.32.0) the runtime dir now has new code
            //     importing packages that aren't installed. We fix that
            //     by running `npm install --production` in-place.
            //     Skipped when the NEW package.json's dependency set is
            //     identical to the .previous/ one — no need to pay the
            //     10-30 sec cost for pure-code updates.
            const depsChanged = (() => {
                try {
                    const prevPkg = JSON.parse(fs.readFileSync(path.join(backupDir, 'package.json'), 'utf8'));
                    const nextPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
                    const prevDeps = JSON.stringify(prevPkg.dependencies || {});
                    const nextDeps = JSON.stringify(nextPkg.dependencies || {});
                    return prevDeps !== nextDeps;
                } catch {
                    // Can't read either side — reconcile to be safe.
                    return true;
                }
            })();

            if (depsChanged) {
                send('log', { stream: 'meta', chunk: 'Reconciling node_modules with new package.json…\n' });
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
                        send('log', { stream: 'meta', chunk: `npm install spawn failed: ${err.message}\n` });
                        resolveInstall(false);
                    });
                    npmChild.on('close', (code) => {
                        if (code === 0) {
                            send('log', { stream: 'meta', chunk: 'node_modules reconciled.\n' });
                            resolveInstall(true);
                        } else {
                            send('log', { stream: 'meta', chunk: `npm install exited with code ${code}\n` });
                            resolveInstall(false);
                        }
                    });
                });
                if (!npmOk) {
                    // The swap already happened — rolling back is expensive
                    // and leaves node_modules in an uncertain state either
                    // way. Report failure with a clear remediation hint so
                    // the user knows what to do next (quit + run npm install
                    // manually, or reinstall from the .exe/.dmg/.deb).
                    send('done', {
                        success: false,
                        error: `Update downloaded to ${latestVersion} but \`npm install\` failed — node_modules may be missing packages. Quit Pixcode and run "npm install --production" in ${runtimeDir}, or reinstall from the latest installer.`,
                    });
                    endStream();
                    return;
                }
            }

            send('done', {
                success: true,
                version: latestVersion,
                // `selfRestarting` tells the UI "don't POST /restart —
                // we're about to exit on our own, just poll /health until
                // the wrapper brings us back". Without this flag the
                // client sees the server disappear, gets a connection
                // refused on /restart, and shows the user a spurious
                // "Restart request failed" error — even though the
                // update actually succeeded.
                selfRestarting: true,
                message: `Updated to ${latestVersion}. Restarting automatically…`,
            });
            endStream();

            // 4. Self-exit so the Electron wrapper respawns the server
            //    against the freshly-extracted files. 500 ms gives the
            //    SSE stream time to flush the done event + arrive at
            //    the client across slow loopback / virtual adapters.
            setTimeout(() => {
                // Exit code 42 is a convention the wrapper watches for —
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
            send('log', { stream: 'meta', chunk: 'Querying registry for latest version…\n' });
            const registryRes = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode');
            if (registryRes.ok) {
                const metadata = await registryRes.json();
                const latestVersion = metadata['dist-tags']?.latest;
                if (latestVersion && latestVersion === SERVER_VERSION) {
                    send('log', { stream: 'meta', chunk: `Already on ${SERVER_VERSION} — nothing to do.\n` });
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
            // Registry unreachable — fall through to the install attempt
            // rather than block the user. Log and continue.
            console.warn('[update] Registry precheck failed:', (err && err.message) || err);
        }
    }

    send('log', { stream: 'meta', chunk: `Running: ${updateCommandLabel}\n` });

    // Cross-platform shell invocation. `detached: true` + `unref()` below
    // means the install child survives if this server process gets killed
    // mid-install (which is common on Linux when `npm install -g`
    // overwrites the running package's own files — the running process
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
    // child's lifetime to ours — we want it to outlive a daemon restart.
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
                error: `Update command exited with code ${code}`,
            });
        }
        endStream();
    });
});

// Restart endpoint — exits the current process so an external wrapper
// (systemd/pm2/daemon manager) can bring the server back on the new code.
// Foreground installs without a wrapper will simply stop; the UI reports this.
app.post('/api/system/restart', authenticateToken, requireAdmin, requireApiScope('system:restart'), (req, res) => {
    securityLog('system_restart_requested', {
        ip: getClientIp(req),
        userId: req.user?.id,
        username: req.user?.username,
    });
    const forceRestart = req.body?.force === true || req.query.force === 'true';
    const activeWork = getActiveWorkSummary();
    if (!forceRestart && activeWork.hasActiveWork) {
        return res.status(409).json({
            success: false,
            error: 'Active terminal or agent sessions are running. Confirm restart to interrupt them.',
            activeWork,
        });
    }

    res.json({
        success: true,
        version: SERVER_VERSION,
        message: 'Server is shutting down for restart. Reconnecting...'
    });

    // Give the response time to flush before we exit.
    setTimeout(() => {
        console.log('Restart requested via /api/system/restart — exiting process.');
        process.exit(0);
    }, 250);
});

app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await getProjects(broadcastProgress);
        res.json(filterProjectsForUser(projects, req.user).map((project) => filterProjectSessionsForUser(project, req.user)));
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/api/projects/:projectName/sessions', authenticateToken, requireProjectAccess('viewFiles'), async (req, res) => {
    try {
        const { limit = 5, offset = 0 } = req.query;
        const result = await getSessions(req.params.projectName, parseInt(limit), parseInt(offset));
        if (!['admin', 'owner'].includes(req.user?.role)) {
            result.sessions = (result.sessions || []).filter((session) => canUserSeeSession(req.user, session, 'claude'));
        }
        applyCustomSessionNames(result.sessions, 'claude');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// Rename project endpoint
app.put('/api/projects/:projectName/rename', authenticateToken, requireProjectAccess('manageProjectSettings'), async (req, res) => {
    try {
        const { displayName } = req.body;
        await renameProject(req.params.projectName, displayName);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete session endpoint
app.delete('/api/projects/:projectName/sessions/:sessionId', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
    try {
        const { projectName, sessionId } = req.params;
        console.log(`[API] Deleting session: ${sessionId} from project: ${projectName}`);
        await deleteSession(projectName, sessionId);
        sessionNamesDb.deleteName(sessionId, 'claude');
        console.log(`[API] Session ${sessionId} deleted successfully`);
        res.json({ success: true });
    } catch (error) {
        console.error(`[API] Error deleting session ${req.params.sessionId}:`, error);
        res.status(500).json({ error: "Internal server error" });
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
            return res.status(400).json({ error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
        }
        sessionNamesDb.setName(safeSessionId, provider, summary.trim());
        res.json({ success: true });
    } catch (error) {
        console.error(`[API] Error renaming session ${req.params.sessionId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete project endpoint
// force=true to allow removal even when sessions exist
// deleteData=true to also delete session/memory files on disk (destructive)
app.delete('/api/projects/:projectName', authenticateToken, requireProjectAccess('manageProjectSettings'), async (req, res) => {
    try {
        const { projectName } = req.params;
        const force = req.query.force === 'true';
        const deleteData = req.query.deleteData === 'true';
        await deleteProject(projectName, force, deleteData);
        res.json({ success: true });
    } catch (error) {
        // "Cannot delete project with existing sessions" is a precondition
        // failure, not a server fault — surface it as 409 so clients can
        // catch it and prompt the user to pass `?force=true` (or clean
        // sessions first) instead of treating it like a crash.
        const conflict = typeof error?.message === 'string' && error.message.includes('existing sessions');
        res.status(conflict ? 409 : 500).json({ error: conflict ? error.message : 'Internal server error' });
    }
});

// Search conversations content (SSE streaming)
app.get('/api/search/conversations', authenticateToken, requireAdmin, async (req, res) => {
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
                res.write(`event: result\ndata: ${JSON.stringify({ projectResult, totalMatches, scannedProjects, totalProjects })}\n\n`);
            } else {
                res.write(`event: progress\ndata: ${JSON.stringify({ totalMatches, scannedProjects, totalProjects })}\n\n`);
            }
        }, abortController.signal);
        if (!closed) {
            res.write(`event: done\ndata: {}\n\n`);
        }
    } catch (error) {
        console.error('Error searching conversations:', error);
        if (!closed) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: 'Search failed' })}\n\n`);
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
// WORKSPACES_BASE-centric one above. The workspace-base treatment of `~`
// is right for NEW project creation (users say "my-app" and get it under
// ~/pixcode/projects/my-app) but wrong for browsing — users want to pick
// any folder on their disk, not be trapped inside the default base.
const expandBrowsePath = (inputPath) => {
    if (!inputPath) return os.homedir();
    const trimmed = String(inputPath).trim();
    if (!trimmed || trimmed === '~') return os.homedir();
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
        return path.join(os.homedir(), trimmed.slice(2));
    }
    return path.resolve(trimmed);
};

// Browse filesystem endpoint for project suggestions - uses existing getFileTree
app.get('/api/browse-filesystem', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { path: dirPath } = req.query;

        console.log('[API] Browse filesystem request for path:', dirPath);
        console.log('[API] WORKSPACES_ROOT is:', WORKSPACES_ROOT);
        console.log('[API] WORKSPACES_BASE is:', WORKSPACES_BASE);
        // Default to the user's home directory so the picker feels natural
        // — users can reach arbitrary drives/folders from there. The
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

app.post('/api/create-folder', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/projects/:projectName/file', authenticateToken, requireProjectAccess('viewFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolved, 'viewFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
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
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Serve raw file bytes for previews and downloads.
app.get('/api/projects/:projectName/files/content', authenticateToken, requireProjectAccess('viewFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolved, 'viewFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
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
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Save file content endpoint
app.put('/api/projects/:projectName/file', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolved, 'editFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
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
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

app.get('/api/projects/:projectName/files', authenticateToken, requireProjectAccess('viewFiles'), async (req, res) => {
    try {

        // Using fsPromises from import

        // Use extractProjectDirectory to get the actual project path
        let actualPath;
        try {
            actualPath = await extractProjectDirectory(req.params.projectName);
        } catch (error) {
            console.error('Error extracting project directory:', error);
            // Do NOT fall back to projectName.replace(/-/g, '/') here: on Windows the
            // dash-encoded name ("C--Users-...") decodes to a garbage path ("C//Users/...")
            // that can never exist, so the old fallback just produced a confusing 404
            // with a fabricated path. extractProjectDirectory already handles the
            // POSIX-style decode internally; if it throws, the project is unknown.
            return res.status(404).json({ error: `Project not found: ${req.params.projectName}` });
        }

        // Check if path exists
        try {
            await fsPromises.access(actualPath);
        } catch (e) {
            return res.status(404).json({ error: `Project path not found: ${actualPath}` });
        }

        const files = await getFileTree(actualPath, 10, 0, true);
        res.json(filterFileTreeForUser(files, req.user, {
            name: req.params.projectName,
            projectName: req.params.projectName,
            fullPath: actualPath,
            path: actualPath,
        }, 'viewFiles'));
    } catch (error) {
        console.error('[ERROR] File tree error:', error.message);
        res.status(500).json({ error: "Internal server error" });
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
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(name)) {
        return { valid: false, error: 'Filename contains invalid characters' };
    }
    // Check for reserved names (Windows)
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reserved.test(name)) {
        return { valid: false, error: 'Filename is a reserved name' };
    }
    // Check for dots only
    if (/^\.+$/.test(name)) {
        return { valid: false, error: 'Filename cannot be only dots' };
    }
    return { valid: true };
}

// POST /api/projects/:projectName/files/create - Create new file or directory
app.post('/api/projects/:projectName/files/create', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolvedPath, 'editFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
        }

        // Check if already exists
        try {
            await fsPromises.access(resolvedPath);
            return res.status(409).json({ error: `${type === 'file' ? 'File' : 'Directory'} already exists` });
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
            message: `${type === 'file' ? 'File' : 'Directory'} created successfully`
        });
    } catch (error) {
        console.error('Error creating file/directory:', error);
        if (error.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied' });
        } else if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Parent directory not found' });
        } else {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// PUT /api/projects/:projectName/files/rename - Rename file or directory
app.put('/api/projects/:projectName/files/rename', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolvedOldPath, 'editFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
        }

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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolvedNewPath, 'editFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
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
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// DELETE /api/projects/:projectName/files - Delete file or directory
app.delete('/api/projects/:projectName/files', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
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
        if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolvedPath, 'editFiles')) {
            return res.status(403).json({ error: 'Folder access denied' });
        }

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
            res.status(500).json({ error: "Internal server error" });
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
                const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
                // For temp file, just use a safe unique name without the path
                cb(null, `upload-${uniqueSuffix}`);
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
            if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, resolvedTargetDir, 'editFiles')) {
                return res.status(403).json({ error: 'Folder access denied' });
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
                if (!userHasProjectPathAccess(req.user, { name: projectName, projectName, fullPath: projectRoot, path: projectRoot }, destPath, 'editFiles')) {
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
                message: `Uploaded ${uploadedFiles.length} file(s) successfully`
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
                res.status(500).json({ error: "Internal server error" });
            }
        }
    });
};

app.post('/api/projects/:projectName/files/upload', authenticateToken, requireProjectAccess('editFiles'), uploadFilesHandler);

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

    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    upstream.on('open', () => {
        console.log(`[Plugins] WS proxy connected to "${pluginName}" on port ${port}`);
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
        console.error(`[Plugins] WS proxy error for "${pluginName}":`, err.message);
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
 * Provider files use `createNormalizedMessage()` from `shared/utils.js` and
 * adapter `normalizeMessage()` to produce unified NormalizedMessage events.
 * The writer simply serialises and sends.
 */
class WebSocketWriter {
    constructor(ws, userId = null) {
        this.ws = ws;
        this.sessionId = null;
        this.userId = userId;
        this.provider = 'claude';
        this.projectName = null;
        this.projectPath = null;
        this.isWebSocketWriter = true;  // Marker for transport detection
    }

    send(data) {
        const nextSessionId = data?.sessionId || data?.session_id || data?.session?.id;
        if (nextSessionId) {
            this.setSessionId(nextSessionId);
            recordSessionOwnership({
                provider: data.provider || this.provider,
                sessionId: nextSessionId,
                userId: this.userId,
                projectName: this.projectName,
                projectPath: this.projectPath,
            });
        }
        if (this.ws.readyState === 1) { // WebSocket.OPEN
            this.ws.send(JSON.stringify(data));
        }
    }

    setContext({ provider, projectName, projectPath } = {}) {
        if (provider) this.provider = provider;
        if (projectName) this.projectName = projectName;
        if (projectPath) this.projectPath = projectPath;
    }

    updateWebSocket(newRawWs) {
        this.ws = newRawWs;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    getSessionId() {
        return this.sessionId;
    }
}

// Handle chat WebSocket connections
function handleChatConnection(ws, request) {
    console.log('[INFO] Chat WebSocket connected');

    // Add to connected clients for project updates
    ws.userId = request?.user?.id ?? request?.user?.userId ?? null;
    ws.user = request?.user ?? null;
    connectedClients.add(ws);

    // Wrap WebSocket with writer for consistent interface with SSEStreamWriter
    const writer = new WebSocketWriter(ws, request?.user?.id ?? request?.user?.userId ?? null);
    const isAdminChatUser = () => ['admin', 'owner'].includes(request?.user?.role);
    const requireAdminChatAction = (action) => {
        if (!isAdminChatUser()) {
            throw new Error(`${action} requires admin access until session ownership metadata is available.`);
        }
    };
    const assertChatCommandAccess = (data) => {
        const options = data?.options || {};
        if ((options.permissionMode === 'bypassPermissions' || options.skipPermissions === true) && !isAdminChatUser()) {
            throw new Error('Bypass/skip permission modes require admin access.');
        }

        const projectName = typeof options.projectName === 'string' ? options.projectName : '';
        const projectPath = typeof options.projectPath === 'string'
            ? options.projectPath
            : (typeof options.cwd === 'string' ? options.cwd : '');
        const projectRef = projectName
            ? { name: projectName, projectName }
            : (projectPath ? { fullPath: path.resolve(projectPath), path: path.resolve(projectPath), projectPath: path.resolve(projectPath) } : null);

        if (!projectRef) {
            if (isAdminChatUser()) return;
            throw new Error('Project context is required for agent commands.');
        }

        if (!userHasProjectAccess(request.user, projectRef, 'chatAgents')) {
            throw new Error('Project access denied.');
        }
    };
    const setWriterCommandContext = (provider, data) => {
        const options = data?.options || {};
        writer.setContext({
            provider,
            projectName: typeof options.projectName === 'string' ? options.projectName : null,
            projectPath: typeof options.projectPath === 'string'
                ? options.projectPath
                : (typeof options.cwd === 'string' ? options.cwd : null),
        });
    };

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // Per-submission logs removed from hot paths — gate behind
            // CHAT_DEBUG so production stdout stays clean. Each keypress
            // that triggers a submit was costing 4 synchronous writes.
            const chatDebug = process.env.CHAT_DEBUG
                ? (provider, d) => console.log(`[${provider}]`,
                    d.command?.slice(0, 60) || '[resume]',
                    d.options?.projectPath || d.options?.cwd || '',
                    d.options?.sessionId ? 'resume' : 'new')
                : () => {};

            if (data.type === 'claude-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('claude', data);
                chatDebug('claude', data);
                // Use Claude Agents SDK
                await queryClaudeSDK(data.command, data.options, writer);
            } else if (data.type === 'cursor-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('cursor', data);
                chatDebug('cursor', data);
                await spawnCursor(data.command, data.options, writer);
            } else if (data.type === 'codex-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('codex', data);
                chatDebug('codex', data);
                await queryCodex(data.command, data.options, writer);
            } else if (data.type === 'gemini-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('gemini', data);
                chatDebug('gemini', data);
                await spawnGemini(data.command, data.options, writer);
            } else if (data.type === 'qwen-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('qwen', data);
                chatDebug('qwen', data);
                await spawnQwen(data.command, data.options, writer);
            } else if (data.type === 'opencode-command') {
                assertChatCommandAccess(data);
                setWriterCommandContext('opencode', data);
                chatDebug('opencode', data);
                await spawnOpencode(data.command, data.options, writer);
            } else if (data.type === 'cursor-resume') {
                assertChatCommandAccess({ options: { cwd: data.options?.cwd } });
                // Backward compatibility: treat as cursor-command with resume and no prompt
                console.log('[DEBUG] Cursor resume session (compat):', data.sessionId);
                await spawnCursor('', {
                    sessionId: data.sessionId,
                    resume: true,
                    cwd: data.options?.cwd
                }, writer);
            } else if (data.type === 'abort-session') {
                requireAdminChatAction('Aborting sessions');
                console.log('[DEBUG] Abort session request:', data.sessionId);
                const provider = data.provider || 'claude';
                let success;

                if (provider === 'cursor') {
                    success = abortCursorSession(data.sessionId);
                } else if (provider === 'codex') {
                    success = abortCodexSession(data.sessionId);
                } else if (provider === 'gemini') {
                    success = abortGeminiSession(data.sessionId);
                } else if (provider === 'qwen') {
                    success = abortQwenSession(data.sessionId);
                } else if (provider === 'opencode') {
                    success = abortOpencodeSession(data.sessionId);
                } else {
                    // Use Claude Agents SDK
                    success = await abortClaudeSDKSession(data.sessionId);
                }

                writer.send(createNormalizedMessage({ kind: 'complete', exitCode: success ? 0 : 1, aborted: true, success, sessionId: data.sessionId, provider }));
            } else if (data.type === 'claude-permission-response') {
                requireAdminChatAction('Resolving tool approvals');
                // Relay UI approval decisions back into the SDK control flow.
                // This does not persist permissions; it only resolves the in-flight request,
                // introduced so the SDK can resume once the user clicks Allow/Deny.
                if (data.requestId) {
                    resolveToolApproval(data.requestId, {
                        allow: Boolean(data.allow),
                        updatedInput: data.updatedInput,
                        message: data.message,
                        rememberEntry: data.rememberEntry
                    });
                }
            } else if (data.type === 'cursor-abort') {
                requireAdminChatAction('Aborting sessions');
                console.log('[DEBUG] Abort Cursor session:', data.sessionId);
                const success = abortCursorSession(data.sessionId);
                writer.send(createNormalizedMessage({ kind: 'complete', exitCode: success ? 0 : 1, aborted: true, success, sessionId: data.sessionId, provider: 'cursor' }));
            } else if (data.type === 'check-session-status') {
                requireAdminChatAction('Checking global session status');
                // Check if a specific session is currently processing
                const provider = data.provider || 'claude';
                const sessionId = data.sessionId;
                let isActive;

                if (provider === 'cursor') {
                    isActive = isCursorSessionActive(sessionId);
                } else if (provider === 'codex') {
                    isActive = isCodexSessionActive(sessionId);
                } else if (provider === 'gemini') {
                    isActive = isGeminiSessionActive(sessionId);
                } else if (provider === 'qwen') {
                    isActive = isQwenSessionActive(sessionId);
                } else if (provider === 'opencode') {
                    isActive = isOpencodeSessionActive(sessionId);
                } else {
                    // Use Claude Agents SDK
                    isActive = isClaudeSDKSessionActive(sessionId);
                    if (isActive) {
                        // Reconnect the session's writer to the new WebSocket so
                        // subsequent SDK output flows to the refreshed client.
                        reconnectSessionWriter(sessionId, ws);
                    }
                }

                writer.send({
                    type: 'session-status',
                    sessionId,
                    provider,
                    isProcessing: isActive
                });
            } else if (data.type === 'get-pending-permissions') {
                requireAdminChatAction('Reading pending permissions');
                // Return pending permission requests for a session
                const sessionId = data.sessionId;
                if (sessionId && isClaudeSDKSessionActive(sessionId)) {
                    const pending = getPendingApprovalsForSession(sessionId);
                    writer.send({
                        type: 'pending-permissions-response',
                        sessionId,
                        data: pending
                    });
                }
            } else if (data.type === 'watch-project') {
                // Subscribe this client to live file-tree updates for a project
                // workspace. The server pushes debounced `project_files_updated`
                // events so the explorer refreshes without HTTP polling.
                await subscribeToWorkspace(ws, data.projectName);
            } else if (data.type === 'unwatch-project') {
                unsubscribeFromWorkspace(ws, data.projectName || null);
            } else if (data.type === 'get-active-sessions') {
                requireAdminChatAction('Listing active sessions');
                // Get all currently active sessions
                const activeSessions = {
                    claude: getActiveClaudeSDKSessions(),
                    cursor: getActiveCursorSessions(),
                    codex: getActiveCodexSessions(),
                    gemini: getActiveGeminiSessions(),
                    qwen: getActiveQwenSessions(),
                    opencode: getActiveOpencodeSessions()
                };
                writer.send({
                    type: 'active-sessions',
                    sessions: activeSessions
                });
            }
        } catch (error) {
            console.error('[ERROR] Chat WebSocket error:', error?.message || error);
            securityLog('ws_chat_error', {
                userId: request?.user?.id,
                username: request?.user?.username,
                reason: error?.name || 'UnknownError',
            });
            writer.send({
                type: 'error',
                error: 'An error occurred while processing your request.'
            });
        }
    });

    ws.on('close', () => {
        console.log('🔌 Chat client disconnected');
        // Remove from connected clients
        connectedClients.delete(ws);
        // Drop any workspace watcher subscriptions held by this socket
        unsubscribeFromWorkspace(ws);
    });
}

// Handle shell WebSocket connections
function handleShellConnection(ws, request) {
    console.log('🐚 Shell client connected');
    let shellProcess = null;
    let ptySessionKey = null;
    let urlDetectionBuffer = '';
    let outputBuffer = '';
    let outputFlushTimer = null;
    let inputFlushTimer = null;
    let pendingInputBytes = 0;
    const pendingInputQueue = [];
    const announcedAuthUrls = new Set();

    function getActiveShellPty() {
        const session = ptySessionKey ? ptySessionsMap.get(ptySessionKey) : null;
        return session?.pty || shellProcess;
    }

    function scheduleInputFlush(delayMs = 0) {
        if (inputFlushTimer) return;
        inputFlushTimer = setTimeout(flushPendingInput, delayMs);
    }

    function flushPendingInput() {
        inputFlushTimer = null;
        if (pendingInputQueue.length === 0) return;

        const activePty = getActiveShellPty();
        if (!activePty?.write) {
            scheduleInputFlush(100);
            return;
        }

        const chunk = pendingInputQueue.shift();
        pendingInputBytes = Math.max(0, pendingInputBytes - Buffer.byteLength(chunk, 'utf8'));
        try {
            activePty.write(chunk);
        } catch (error) {
            console.error('Error writing to shell:', error);
            pendingInputQueue.length = 0;
            pendingInputBytes = 0;
            return;
        }

        if (pendingInputQueue.length > 0) scheduleInputFlush(1);
    }

    function enqueueShellInput(data) {
        const chunks = splitTerminalInput(data);
        if (chunks.length === 0) return;

        for (const chunk of chunks) {
            // Filter terminal-generated response sequences that xterm.js sends back
            // via onData. Without this, DA2/mouse/DSR responses get echoed by the PTY,
            // xterm.js interprets the echo as a new query, and an infinite loop starts.
            // This is the server-side guard complementing the frontend sanitizer.
            const filteredChunk = chunk
                .replace(/\x1b\[>\d+[;:\d]*c/g, '')      // DA2 response (self-looping)
                .replace(/\x1b\[\?\d+[;:\d]*c/g, '')      // DA1 response
                .replace(/\x1b\[\d+;\d+R/g, '')            // DSR cursor
                .replace(/\x1b\[\?\d+;\d+R/g, '')          // DSR private cursor
                .replace(/\x1b\[\d+n/g, '')                // DSR status
                .replace(/\x1b\[M[\s\S]{3}/g, '')          // Mouse report (default)
                .replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '')    // Mouse report (SGR)
                .replace(/\x1b\[IO]/g, '')                 // Focus events
                .replace(/\x1b\[\d+;\d+;\d+t/g, '')        // Window size report
                .replace(/\x1b\[\d+;\d+\$y/g, '');         // DECRQM response
            if (!filteredChunk) continue;

            const chunkBytes = Buffer.byteLength(filteredChunk, 'utf8');
            if (pendingInputBytes + chunkBytes > SHELL_PENDING_INPUT_MAX_BYTES) {
                // Drop only the oldest queued chunk to make room, not the new one.
                // This prevents the queue from growing unbounded without silently
                // discarding the user's latest paste.
                while (pendingInputQueue.length > 0 && pendingInputBytes + chunkBytes > SHELL_PENDING_INPUT_MAX_BYTES) {
                    const dropped = pendingInputQueue.shift();
                    pendingInputBytes = Math.max(0, pendingInputBytes - Buffer.byteLength(dropped, 'utf8'));
                }
            }
            pendingInputQueue.push(filteredChunk);
            pendingInputBytes += chunkBytes;
        }

        scheduleInputFlush();
    }

    function flushOutputBuffer() {
        if (!outputBuffer || !ptySessionKey) {
            outputFlushTimer = null;
            return;
        }
        const rawData = outputBuffer;
        outputBuffer = '';
        outputFlushTimer = null;

        const session = ptySessionsMap.get(ptySessionKey);
        if (!session) return;
        session.updatedAt = Date.now();

        appendPtySessionBuffer(session, rawData);

        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            if (session.ws.bufferedAmount > SHELL_WS_BACKPRESSURE_LIMIT) {
                session.droppedOutputBytes = (session.droppedOutputBytes || 0) + Buffer.byteLength(rawData, 'utf8');
                return;
            }

            const droppedOutputBytes = session.droppedOutputBytes || 0;
            session.droppedOutputBytes = 0;
            let outputData = rawData;
            if (droppedOutputBytes > 0) {
                outputData = `\r\n\x1b[33m[Pixcode] ${droppedOutputBytes} bytes of terminal output were skipped because the browser connection was backpressured.\x1b[0m\r\n${outputData}`;
            }

            const cleanChunk = stripAnsiSequences(rawData);
            urlDetectionBuffer = `${urlDetectionBuffer}${cleanChunk}`.slice(-SHELL_URL_PARSE_BUFFER_LIMIT);

            outputData = outputData.replace(
                /OPEN_URL:\s*(https?:\/\/[^\s\x1b\x07]+)/g,
                '[INFO] Opening in browser: $1'
            );
            outputData = hideProviderApprovalChoiceLines(outputData);

            const emitAuthUrl = (detectedUrl, autoOpen = false) => {
                const normalizedUrl = normalizeDetectedUrl(detectedUrl);
                if (!normalizedUrl) return;

                const isNewUrl = !announcedAuthUrls.has(normalizedUrl);
                if (isNewUrl) {
                    announcedAuthUrls.add(normalizedUrl);
                    session.ws.send(JSON.stringify({
                        type: 'auth_url',
                        url: normalizedUrl,
                        autoOpen
                    }));
                }
            };

            const normalizedDetectedUrls = extractUrlsFromText(urlDetectionBuffer)
                .map((url) => normalizeDetectedUrl(url))
                .filter(Boolean);

            const dedupedDetectedUrls = Array.from(new Set(normalizedDetectedUrls)).filter((url, _, urls) =>
                !urls.some((otherUrl) => otherUrl !== url && otherUrl.startsWith(url))
            );

            dedupedDetectedUrls.forEach((url) => emitAuthUrl(url, false));

            if (shouldAutoOpenUrlFromOutput(cleanChunk) && dedupedDetectedUrls.length > 0) {
                const bestUrl = dedupedDetectedUrls.reduce((longest, current) =>
                    current.length > longest.length ? current : longest
                );
                emitAuthUrl(bestUrl, true);
            }

            if (outputData) {
                session.ws.send(JSON.stringify({
                    type: 'output',
                    data: outputData
                }));
            }
        }
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            // Per-message log would fire once per keystroke — gate behind
            // SHELL_DEBUG so stdout isn't flooded during normal typing.
            if (process.env.SHELL_DEBUG) {
                console.log('[shell]', data.type);
            }

            if (data.type === 'init') {
                // Fallback to the user's home directory (not process.cwd()).
                // In the Electron wrapper, process.cwd() is the runtime dir
                // under %APPDATA%\pixcode-desktop\pixcode-runtime — spawning a
                // login terminal there shows the user a confusing path and
                // sometimes trips up CLIs that expect a "normal" location
                // (e.g. codex login exited 1 because the runtime dir is
                // read-only-feeling / non-writable for cache paths). home
                // is writable, has a git-friendly cwd, and matches where
                // every provider already stores its config (~/.codex etc.).
                const projectPath = data.projectPath || os.homedir();
                const requestedProjectPath = path.resolve(projectPath);
                if (!userHasProjectPathAccess(request.user, {
                    fullPath: requestedProjectPath,
                    path: requestedProjectPath,
                    projectPath: requestedProjectPath,
                }, requestedProjectPath, 'useShell')) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Shell access denied for this project' }));
                    return;
                }
                const sessionId = data.sessionId;
                const hasSession = data.hasSession;
                const provider = data.provider || 'claude';
                const initialCommand = data.initialCommand;
                const startupInput = typeof data.startupInput === 'string' && data.startupInput.trim()
                    ? data.startupInput.trim()
                    : null;
                const startupInputDelivery = data.startupInputDelivery === 'terminal' ? 'terminal' : 'command';
                const commandStartupInput = startupInputDelivery === 'command' ? startupInput : null;
                const terminalStartupInput = startupInputDelivery === 'terminal' ? startupInput : null;
                const isPlainShell = data.isPlainShell || (!!initialCommand && !hasSession) || provider === 'plain-shell';
                const forceNewSession = Boolean(data.forceNewSession);
                const shellPermissionMode = normalizeShellPermissionMode(data.permissionMode);
                const shellSkipPermissions = Boolean(data.skipPermissions);
                const shellPermissionFlags = buildProviderShellPermissionFlags(provider, shellPermissionMode, shellSkipPermissions);
                urlDetectionBuffer = '';
                announcedAuthUrls.clear();

                // Login commands should never reuse cached sessions — each login
                // is a fresh OAuth handshake with a new callback URL. Missing
                // entries here used to cause "Process exited with code 1" on
                // the second login attempt because the cached PTY from the
                // first attempt was still alive and the CLI refused to
                // re-bind its localhost callback port.
                const isLoginCommand = initialCommand && (
                    initialCommand.includes('setup-token') ||
                    initialCommand.includes('cursor-agent login') ||
                    initialCommand.includes('codex login') ||
                    initialCommand.includes('qwen auth') ||
                    initialCommand.includes('auth login')
                );

                // Every UI shell instance gets a unique tabId. This guarantees that
                // multiple tabs of the same provider (e.g. two OpenCode windows) do
                // not share or overwrite the same PTY session. If the client does not
                // send a tabId (legacy callers), generate one on the backend so the
                // key is still unique for this connection.
                const tabId = typeof data.tabId === 'string' && data.tabId.trim()
                    ? data.tabId.trim()
                    : `tab_${crypto.randomUUID()}`;
                const providerKey = isPlainShell ? 'plain' : provider;
                const ownerUserId = request.user?.id ?? request.user?.userId ?? 'anonymous';
                ptySessionKey = `${ownerUserId}_${projectPath}_${providerKey}_${tabId}_${sessionId || 'new'}`;

                // Kill any existing login session before starting fresh
                if (isLoginCommand) {
                    const oldSession = ptySessionsMap.get(ptySessionKey);
                    if (oldSession) {
                        terminatePtySession(ptySessionKey, oldSession, 'fresh login');
                    }
                } else if (forceNewSession) {
                    // Only terminate the PTY that belongs to this exact tabId, not
                    // every session for the same provider. This lets users run
                    // multiple OpenCode/Claude/etc. instances side-by-side.
                    const oldSession = ptySessionsMap.get(ptySessionKey);
                    if (oldSession) {
                        terminatePtySession(ptySessionKey, oldSession, `fresh ${isPlainShell ? 'plain shell' : provider} session`);
                    }
                }

                const existingSession = (isLoginCommand || forceNewSession) ? null : ptySessionsMap.get(ptySessionKey);
                if (existingSession) {
                    if (!existingSession.pty || existingSession.lifecycleState === 'completed' || existingSession.lifecycleState === 'failed') {
                        ptySessionsMap.delete(ptySessionKey);
                    } else {
                        console.log('♻️  Reconnecting to existing PTY session:', ptySessionKey);
                        shellProcess = existingSession.pty;
                        resizeTerminalPty(shellProcess, data.cols, data.rows, 'reconnect resize');

                        clearTimeout(existingSession.timeoutId);

                        ws.send(JSON.stringify({
                            type: 'output',
                            data: `\x1b[36m[Reconnected to existing session]\x1b[0m\r\n`
                        }));

                        if (existingSession.buffer && existingSession.buffer.length > 0) {
                            console.log(`📜 Sending ${existingSession.buffer.length} buffered messages`);
                            existingSession.buffer.forEach(bufferedData => {
                                if (ws.bufferedAmount > SHELL_WS_BACKPRESSURE_LIMIT) {
                                    existingSession.droppedOutputBytes = (existingSession.droppedOutputBytes || 0) + Buffer.byteLength(String(bufferedData || ''), 'utf8');
                                    return;
                                }
                                ws.send(JSON.stringify({
                                    type: 'output',
                                    data: bufferedData
                                }));
                            });
                            if ((existingSession.droppedOutputBytes || 0) > 0 && ws.bufferedAmount <= SHELL_WS_BACKPRESSURE_LIMIT) {
                                ws.send(JSON.stringify({
                                    type: 'output',
                                    data: `\r\n\x1b[33m[Pixcode] ${existingSession.droppedOutputBytes} bytes of buffered terminal output were skipped because the browser connection was backpressured.\x1b[0m\r\n`,
                                }));
                                existingSession.droppedOutputBytes = 0;
                            }
                        }

                        existingSession.ws = ws;
                        existingSession.updatedAt = Date.now();
                        if (terminalStartupInput && !isPlainShell) {
                            writeTerminalStartupInput(existingSession, terminalStartupInput, 'reused provider session', 350);
                        }

                        return;
                    }
                }

                console.log('[INFO] Starting shell in:', projectPath);
                console.log('📋 Session info:', hasSession ? `Resume session ${sessionId}` : (isPlainShell ? 'Plain shell mode' : 'New session'));
                console.log('🤖 Provider:', isPlainShell ? 'plain-shell' : provider);
                if (initialCommand) {
                    console.log('⚡ Initial command:', initialCommand || 'interactive shell');
                }

                // First send a welcome message
                let welcomeMsg;
                if (isPlainShell) {
                    welcomeMsg = `\x1b[36mStarting terminal in: ${projectPath}\x1b[0m\r\n`;
                } else {
                    const providerName = provider === 'cursor' ? 'Cursor'
                        : provider === 'codex' ? 'Codex'
                        : provider === 'gemini' ? 'Gemini'
                        : provider === 'qwen' ? 'Qwen Code'
                        : provider === 'opencode' ? 'OpenCode'
                        : 'Claude';
                    welcomeMsg = hasSession ?
                        `\x1b[36mResuming ${providerName} session ${sessionId} in: ${projectPath}\x1b[0m\r\n` :
                        `\x1b[36mStarting new ${providerName} session in: ${projectPath}\x1b[0m\r\n`;
                }

                ws.send(JSON.stringify({
                    type: 'output',
                    data: welcomeMsg
                }));

                try {
                    // Validate projectPath — resolve to absolute and verify it exists
                    const resolvedProjectPath = requestedProjectPath;
                    try {
                        const stats = fs.statSync(resolvedProjectPath);
                        if (!stats.isDirectory()) {
                            throw new Error('Not a directory');
                        }
                    } catch (pathErr) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid project path' }));
                        return;
                    }

                    // Validate sessionId — only allow safe characters
                    const safeSessionIdPattern = /^[a-zA-Z0-9_.\-:]+$/;
                    if (sessionId && !safeSessionIdPattern.test(sessionId)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid session ID' }));
                        return;
                    }

                    // Build shell command — use cwd for project path (never interpolate into shell string)
                    let shellCommand;
                    if (isPlainShell) {
                        // Plain shell mode without an initial command must stay interactive.
                        shellCommand = initialCommand || null;
                    } else if (provider === 'cursor') {
                        const command = buildProviderShellCommand('cursor-agent', shellPermissionFlags);
                        if (hasSession && sessionId) {
                            shellCommand = `${command} --resume="${sessionId}"`;
                        } else {
                            shellCommand = command;
                        }
                    } else if (provider === 'codex') {
                        // Use codex command; attempt to resume and fall back to a new session when the resume fails.
                        const command = buildProviderShellCommand('codex', shellPermissionFlags);
                        if (hasSession && sessionId) {
                            if (os.platform() === 'win32') {
                                // PowerShell syntax for fallback
                                shellCommand = `${command} resume "${sessionId}"; if ($LASTEXITCODE -ne 0) { ${command} }`;
                            } else {
                                shellCommand = `${command} resume "${sessionId}" || ${command}`;
                            }
                        } else if (commandStartupInput) {
                            shellCommand = `${command} ${quoteShellArgForPlatform(commandStartupInput)}`;
                        } else {
                            shellCommand = command;
                        }
                    } else if (provider === 'gemini') {
                        const command = buildProviderShellCommand(initialCommand || 'gemini', shellPermissionFlags);
                        let resumeId = sessionId;
                        if (hasSession && sessionId) {
                            try {
                                // Gemini CLI enforces its own native session IDs, unlike other agents that accept arbitrary string names.
                                // The UI only knows about its internal generated `sessionId` (e.g. gemini_1234).
                                // We must fetch the mapping from the backend session manager to pass the native `cliSessionId` to the shell.
                                const sess = sessionManager.getSession(sessionId);
                                if (sess && sess.cliSessionId) {
                                    resumeId = sess.cliSessionId;
                                    // Validate the looked-up CLI session ID too
                                    if (!safeSessionIdPattern.test(resumeId)) {
                                        resumeId = null;
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to get Gemini CLI session ID:', err);
                            }
                        }

                        if (hasSession && resumeId) {
                            shellCommand = `${command} --resume "${resumeId}"`;
                        } else {
                            shellCommand = command;
                        }
                    } else if (provider === 'qwen') {
                        // Qwen Code shares Gemini CLI's --resume semantics (it's a fork),
                        // so the resume path resolves the backend-tracked cliSessionId the
                        // same way. Falls back to a fresh session when the ID can't be found.
                        const command = buildProviderShellCommand(initialCommand || 'qwen', shellPermissionFlags);
                        let resumeId = sessionId;
                        if (hasSession && sessionId) {
                            try {
                                const sess = sessionManager.getSession(sessionId);
                                if (sess && sess.cliSessionId) {
                                    resumeId = sess.cliSessionId;
                                    if (!safeSessionIdPattern.test(resumeId)) {
                                        resumeId = null;
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to get Qwen Code CLI session ID:', err);
                            }
                        }

                        if (hasSession && resumeId) {
                            shellCommand = `${command} --resume "${resumeId}"`;
                        } else {
                            shellCommand = command;
                        }
                    } else if (provider === 'opencode') {
                        // OpenCode uses `--session <id>` for resumption per the
                        // 2026 CLI docs. The session IDs the TUI creates match
                        // our `safeSessionIdPattern` regex (ulid/nanoid), so
                        // we pass them straight through without a cliSessionId
                        // mapping layer — OpenCode doesn't renumber IDs the way
                        // Gemini does.
                        const command = buildProviderShellCommand(initialCommand || 'opencode', shellPermissionFlags);
                        if (hasSession && sessionId && safeSessionIdPattern.test(sessionId)) {
                            shellCommand = `${command} --session "${sessionId}"`;
                        } else {
                            shellCommand = command;
                        }
                    } else {
                        // Claude (default provider)
                        const command = buildProviderShellCommand(initialCommand || 'claude', shellPermissionFlags);
                        if (hasSession && sessionId) {
                            if (os.platform() === 'win32') {
                                shellCommand = `${command} --resume "${sessionId}"; if ($LASTEXITCODE -ne 0) { ${command} }`;
                            } else {
                                shellCommand = `${command} --resume "${sessionId}" || ${command}`;
                            }
                        } else {
                            shellCommand = command;
                        }
                    }

                    console.log('🔧 Executing shell command:', shellCommand || 'interactive shell');

                    // Use appropriate shell based on platform
                    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
                    const shellArgs = isPlainShell && !initialCommand
                        ? (os.platform() === 'win32' ? ['-NoLogo'] : ['-l'])
                        : (os.platform() === 'win32' ? ['-Command', shellCommand] : ['-c', shellCommand]);

                    // Use terminal dimensions from client if provided, otherwise use defaults
                    const termCols = data.cols || 80;
                    const termRows = data.rows || 24;
                    console.log('📐 Using terminal dimensions:', termCols, 'x', termRows);
                    const isRunningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
                    const shellEnv = {
                        ...process.env,
                        TERM: 'xterm-256color',
                        COLORTERM: 'truecolor',
                        FORCE_COLOR: '3',
                        // When running as root, Claude CLI refuses --dangerously-skip-permissions
                        // for security reasons. Setting IS_SANDBOX=1 tells it the environment is
                        // already sandboxed, so the flag is safe to use.
                        ...(isRunningAsRoot ? { IS_SANDBOX: '1' } : {}),
                    };

                    shellProcess = pty.spawn(shell, shellArgs, {
                        name: 'xterm-256color',
                        cols: termCols,
                        rows: termRows,
                        cwd: resolvedProjectPath,
                        env: shellEnv,
                    });

                    console.log('🟢 Shell process started with PTY, PID:', shellProcess.pid);

                    ptySessionsMap.set(ptySessionKey, {
                        pty: shellProcess,
                        ws: ws,
                        buffer: [],
                        bufferBytes: 0,
                        totalOutputBytes: 0,
                        droppedOutputBytes: 0,
                        timeoutId: null,
                        userId: ownerUserId,
                        projectPath,
                        sessionId,
                        tabId,
                        provider,
                        isPlainShell,
                        lifecycleState: 'running',
                        exitCode: null,
                        exitSignal: null,
                        completedAt: null,
                        keepAliveUntilExit: false,
                        pendingStartupInputs: [],
                        startupInputTimerId: null,
                        updatedAt: Date.now(),
                    });
                    const createdSession = ptySessionsMap.get(ptySessionKey);
                    if (terminalStartupInput && !isPlainShell) {
                        writeTerminalStartupInput(createdSession, terminalStartupInput, 'new provider session', 4500);
                    }
                    scheduleInputFlush();

                    // Handle data output — batch rapid chunks so high-volume CLI
                    // output does not flood the WebSocket with one JSON frame per
                    // keystroke-sized chunk.
                    shellProcess.onData((data) => {
                        outputBuffer += data;
                        if (outputBuffer.length >= SHELL_OUTPUT_FLUSH_MAX_CHARS) {
                            if (outputFlushTimer) {
                                clearTimeout(outputFlushTimer);
                                outputFlushTimer = null;
                            }
                            flushOutputBuffer();
                            return;
                        }
                        if (!outputFlushTimer) {
                            outputFlushTimer = setTimeout(flushOutputBuffer, 8);
                        }
                    });

                    // Handle process exit
                    shellProcess.onExit((exitCode) => {
                        const cleanShellExit = exitCode.exitCode === 0;
                        const normalizedExitSignal = cleanShellExit ? null : (exitCode.signal || null);
                        console.log('🔚 Shell process exited with code:', exitCode.exitCode, 'signal:', normalizedExitSignal);
                        if (outputFlushTimer) {
                            clearTimeout(outputFlushTimer);
                            outputFlushTimer = null;
                        }
                        flushOutputBuffer();
                        const session = ptySessionsMap.get(ptySessionKey);
                        if (session?.pty && session.pty !== shellProcess) {
                            console.log('↩️  Ignoring stale PTY exit for replacement session:', ptySessionKey);
                            return;
                        }

                        const exitMessage = `\r\n\x1b[33mProcess exited with code ${exitCode.exitCode}${normalizedExitSignal ? ` (${normalizedExitSignal})` : ''}\x1b[0m\r\n`;
                        if (session) {
                            session.lifecycleState = cleanShellExit ? 'completed' : 'failed';
                            session.exitCode = typeof exitCode.exitCode === 'number' ? exitCode.exitCode : null;
                            session.exitSignal = normalizedExitSignal;
                            session.completedAt = new Date().toISOString();
                            session.updatedAt = Date.now();
                            if (session.startupInputTimerId) {
                                clearTimeout(session.startupInputTimerId);
                                session.startupInputTimerId = null;
                            }
                            session.pendingStartupInputs = [];
                            session.pty = null;
                            appendPtySessionBuffer(session, exitMessage);
                        }
                        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
                            session.ws.send(JSON.stringify({
                                type: 'output',
                                data: exitMessage
                            }));
                        }
                        if (session && session.timeoutId) {
                            clearTimeout(session.timeoutId);
                        }
                        if (session) {
                            session.ws = null;
                            session.timeoutId = setTimeout(() => {
                                const current = ptySessionsMap.get(ptySessionKey);
                                if (current && current.lifecycleState !== 'running') {
                                    ptySessionsMap.delete(ptySessionKey);
                                }
                            }, COMPLETED_PTY_SESSION_TTL);
                        } else {
                            ptySessionsMap.delete(ptySessionKey);
                        }
                        shellProcess = null;
                    });

                } catch (spawnError) {
                    console.error('[ERROR] Error spawning process:', spawnError);
                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\r\n\x1b[31mError: Failed to start terminal process.\x1b[0m\r\n`
                    }));
                }

            } else if (data.type === 'input') {
                enqueueShellInput(data.data);
            } else if (data.type === 'resize') {
                // Handle terminal resize
                const session = ptySessionKey ? ptySessionsMap.get(ptySessionKey) : null;
                const activePty = session?.pty || shellProcess;
                if (activePty && typeof activePty.resize === 'function' && session?.lifecycleState !== 'completed' && session?.lifecycleState !== 'failed') {
                    resizeTerminalPty(activePty, data.cols, data.rows);
                }
            }
        } catch (error) {
            console.error('[ERROR] Shell WebSocket error:', error?.message || error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'output',
                    data: `\r\n\x1b[31mError: An internal error occurred.\x1b[0m\r\n`
                }));
            }
        }
    });

    ws.on('close', () => {
        console.log('🔌 Shell client disconnected');

        if (outputFlushTimer) {
            clearTimeout(outputFlushTimer);
            outputFlushTimer = null;
        }
        if (inputFlushTimer) {
            clearTimeout(inputFlushTimer);
            inputFlushTimer = null;
        }
        pendingInputQueue.length = 0;
        pendingInputBytes = 0;

        if (ptySessionKey) {
            const session = ptySessionsMap.get(ptySessionKey);
            if (session) {
                if (session.keepAliveUntilExit) {
                    console.log('⏳ PTY session kept alive until process exit:', ptySessionKey);
                    session.ws = null;
                    return;
                }

                console.log('⏳ PTY session kept alive, will timeout in 30 minutes:', ptySessionKey);
                session.ws = null;

                session.timeoutId = setTimeout(() => {
                    console.log('⏰ PTY session timeout, killing process:', ptySessionKey);
                    if (session.pty && session.pty.kill) {
                        session.pty.kill();
                    }
                    ptySessionsMap.delete(ptySessionKey);
                }, PTY_SESSION_TIMEOUT);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('[ERROR] Shell WebSocket error:', error);
    });
}
// Image upload endpoint
app.post('/api/projects/:projectName/upload-images', authenticateToken, requireProjectAccess('editFiles'), async (req, res) => {
    try {
        const multer = (await import('multer')).default;
        const path = (await import('path')).default;
        const fs = (await import('fs')).promises;
        const os = (await import('os')).default;

        // Configure multer for image uploads
        const storage = multer.diskStorage({
            destination: async (req, file, cb) => {
                const uploadDir = path.join(os.tmpdir(), 'claude-ui-uploads', String(req.user.id));
                await fs.mkdir(uploadDir, { recursive: true });
                cb(null, uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
                const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                cb(null, uniqueSuffix + '-' + sanitizedName);
            }
        });

        const fileFilter = (req, file, cb) => {
            const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
            if (allowedMimes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
            }
        };

        const upload = multer({
            storage,
            fileFilter,
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB
                files: 5
            }
        });

        // Handle multipart form data
        upload.array('images', 5)(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No image files provided' });
            }

            try {
                // Process uploaded images
                const processedImages = await Promise.all(
                    req.files.map(async (file) => {
                        // Read file and convert to base64
                        const buffer = await fs.readFile(file.path);
                        const base64 = buffer.toString('base64');
                        const mimeType = file.mimetype;

                        // Clean up temp file immediately
                        await fs.unlink(file.path);

                        return {
                            name: file.originalname,
                            data: `data:${mimeType};base64,${base64}`,
                            size: file.size,
                            mimeType: mimeType
                        };
                    })
                );

                res.json({ images: processedImages });
            } catch (error) {
                console.error('Error processing images:', error);
                // Clean up any remaining files
                await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => { })));
                res.status(500).json({ error: 'Failed to process images' });
            }
        });
    } catch (error) {
        console.error('Error in image upload endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get token usage for a specific session
app.get('/api/projects/:projectName/sessions/:sessionId/token-usage', authenticateToken, requireProjectAccess('viewFiles'), async (req, res) => {
    try {
        const { projectName, sessionId } = req.params;
        const { provider = 'claude' } = req.query;
        const homeDir = os.homedir();

        // Allow only safe characters in sessionId
        const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safeSessionId || safeSessionId !== String(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId' });
        }

        // Handle Cursor sessions - they use SQLite and don't have token usage info
        if (provider === 'cursor') {
            return res.json({
                used: 0,
                total: 0,
                breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
                unsupported: true,
                message: 'Token usage tracking not available for Cursor sessions'
            });
        }

        // Handle Gemini sessions - they are raw logs in our current setup
        if (provider === 'gemini') {
            return res.json({
                used: 0,
                total: 0,
                breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
                unsupported: true,
                message: 'Token usage tracking not available for Gemini sessions'
            });
        }

        // Qwen Code is a Gemini CLI fork and doesn't expose per-session token
        // accounting either; treat it the same way.
        if (provider === 'qwen') {
            return res.json({
                used: 0,
                total: 0,
                breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
                unsupported: true,
                message: 'Token usage tracking not available for Qwen Code sessions'
            });
        }

        // Handle Codex sessions
        if (provider === 'codex') {
            const codexSessionsDir = path.join(homeDir, '.codex', 'sessions');

            // Find the session file by searching for the session ID without
            // materializing every directory entry in memory.
            const findSessionFile = async (dir) => {
                const pendingDirs = [dir];
                let visitedDirs = 0;
                let visitedFiles = 0;
                const maxDirs = 2500;
                const maxFiles = 10000;

                while (pendingDirs.length > 0 && visitedDirs < maxDirs && visitedFiles < maxFiles) {
                    const currentDir = pendingDirs.pop();
                    visitedDirs += 1;

                    try {
                        const dirHandle = await fsPromises.opendir(currentDir);
                        try {
                            for await (const entry of dirHandle) {
                                const fullPath = path.join(currentDir, entry.name);
                                if (entry.isDirectory()) {
                                    if (visitedDirs + pendingDirs.length < maxDirs) {
                                        pendingDirs.push(fullPath);
                                    }
                                } else {
                                    visitedFiles += 1;
                                    if (entry.name.includes(safeSessionId) && entry.name.endsWith('.jsonl')) {
                                        return fullPath;
                                    }
                                    if (visitedFiles >= maxFiles) {
                                        break;
                                    }
                                }
                            }
                        } finally {
                            await dirHandle.close().catch(() => undefined);
                        }
                    } catch (error) {
                        // Skip directories we can't read
                    }
                }

                return null;
            };

            const sessionFilePath = await findSessionFile(codexSessionsDir);

            if (!sessionFilePath) {
                return res.status(404).json({ error: 'Codex session file not found', sessionId: safeSessionId });
            }

            // Stream and parse the Codex JSONL file. Keeping only the latest
            // token_count event avoids loading very large session logs.
            try {
                await fsPromises.access(sessionFilePath);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return res.status(404).json({ error: 'Session file not found', path: sessionFilePath });
                }
                throw error;
            }
            const fileStream = fs.createReadStream(sessionFilePath, { encoding: 'utf8' });
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity,
            });
            let totalTokens = 0;
            let contextWindow = 200000; // Default for Codex/OpenAI

            for await (const line of rl) {
                if (!line.trim() || line.length > JSONL_STREAM_LINE_MAX_CHARS) {
                    continue;
                }

                try {
                    const entry = JSON.parse(line);

                    // Codex stores token info in event_msg with type: "token_count"
                    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count' && entry.payload?.info) {
                        const tokenInfo = entry.payload.info;
                        if (tokenInfo.total_token_usage) {
                            totalTokens = tokenInfo.total_token_usage.total_tokens || 0;
                        }
                        if (tokenInfo.model_context_window) {
                            contextWindow = tokenInfo.model_context_window;
                        }
                    }
                } catch (parseError) {
                    // Skip lines that can't be parsed
                    continue;
                }
            }

            return res.json({
                used: totalTokens,
                total: contextWindow
            });
        }

        // Handle Claude sessions (default)
        // Extract actual project path
        let projectPath;
        try {
            projectPath = await extractProjectDirectory(projectName);
        } catch (error) {
            console.error('Error extracting project directory:', error);
            return res.status(500).json({ error: 'Failed to determine project path' });
        }

        // Construct the JSONL file path
        // Claude stores session files in ~/.claude/projects/[encoded-project-path]/[session-id].jsonl
        // The encoding replaces any non-alphanumeric character (except -) with -
        const encodedPath = projectPath.replace(/[^a-zA-Z0-9-]/g, '-');
        const projectDir = path.join(homeDir, '.claude', 'projects', encodedPath);

        const jsonlPath = path.join(projectDir, `${safeSessionId}.jsonl`);

        // Constrain to projectDir
        const rel = path.relative(path.resolve(projectDir), path.resolve(jsonlPath));
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        // Stream and parse the JSONL file. Keeping only the latest assistant
        // usage object avoids loading very large session logs.
        try {
            await fsPromises.access(jsonlPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Session file not found', path: jsonlPath });
            }
            throw error; // Re-throw other errors to be caught by outer try-catch
        }
        const fileStream = fs.createReadStream(jsonlPath, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        const parsedContextWindow = parseInt(process.env.CONTEXT_WINDOW, 10);
        const contextWindow = Number.isFinite(parsedContextWindow) ? parsedContextWindow : 160000;
        let inputTokens = 0;
        let cacheCreationTokens = 0;
        let cacheReadTokens = 0;

        for await (const line of rl) {
            if (!line.trim() || line.length > JSONL_STREAM_LINE_MAX_CHARS) {
                continue;
            }

            try {
                const entry = JSON.parse(line);

                // Only count assistant messages which have usage data
                if (entry.type === 'assistant' && entry.message?.usage) {
                    const usage = entry.message.usage;

                    // Use token counts from latest assistant message only
                    inputTokens = usage.input_tokens || 0;
                    cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                    cacheReadTokens = usage.cache_read_input_tokens || 0;
                }
            } catch (parseError) {
                // Skip lines that can't be parsed
                continue;
            }
        }

        // Calculate total context usage (excluding output_tokens, as per ccusage)
        const totalUsed = inputTokens + cacheCreationTokens + cacheReadTokens;

        res.json({
            used: totalUsed,
            total: contextWindow,
            breakdown: {
                input: inputTokens,
                cacheCreation: cacheCreationTokens,
                cacheRead: cacheReadTokens
            }
        });
    } catch (error) {
        console.error('Error reading session token usage:', error);
        res.status(500).json({ error: 'Failed to read session token usage' });
    }
});

// Serve React app for all other routes (excluding static files).
// Regex instead of the string '*' because path-to-regexp v8 rejects the
// bare wildcard with "Missing parameter name at index 0". /.*/ works on
// every version and does exactly what the old `'*'` used to do: match
// everything that didn't hit a more specific route above.
app.get(/.*/, (req, res) => {
    // Skip requests for static assets (files with extensions)
    if (path.extname(req.path)) {
        return res.status(404).send('Not found');
    }

    // Never serve index.html for unmatched API / WS routes — returning HTML
    // there gives the frontend a bogus 200 + `<!doctype ...` body, which
    // then explodes `res.json()` as "Unexpected token '<'". Sending a real
    // JSON 404 here means missing endpoints surface as a clear HTTP error
    // instead of a misleading parse failure. Fixes the Settings → Agents →
    // Configuration tab on hosts still running an older backend that
    // predates `/api/providers/:p/config-files`.
    if (req.path.startsWith('/api/') || req.path === '/api' ||
        req.path.startsWith('/ws') || req.path.startsWith('/shell') ||
        req.path === '/health') {
        return res.status(404).json({
            success: false,
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: `No handler for ${req.method} ${req.path}. The backend may be an older build — restart the server after an update.`,
            },
        });
    }

    // Only serve index.html for HTML routes, not for static assets
    // Static assets should already be handled by express.static middleware above
    const indexPath = path.join(APP_ROOT, 'dist', 'index.html');

    // Check if dist/index.html exists (production build available)
    if (fs.existsSync(indexPath)) {
        // Set no-cache headers for HTML to prevent service worker issues
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(indexPath);
    } else {
        // No dist — typically a mid-update swap window (the runtime-dir
        // update endpoint moves dist/ under .previous/ and back). Instead
        // of bouncing the browser to :5173 (the Vite dev port, which
        // production users never have running), show a graceful "updating
        // — will reload automatically" page with a short retry. Fixes the
        // "page suddenly redirected to 5173" bug users hit mid-update.
        res.status(503);
        res.setHeader('Retry-After', '2');
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(
            '<!doctype html><html><head><meta charset="utf-8"><title>Pixcode</title>'
            + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0d1a;color:#e8ecf7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;padding:40px}h2{margin:0 0 8px;font-weight:600;letter-spacing:-.01em}p{color:#9aa3bf;font-size:14px;margin:0}.s{width:24px;height:24px;border:2px solid rgba(255,255,255,.14);border-top-color:#4f7bff;border-radius:50%;animation:r .9s linear infinite;margin:20px auto 0}@keyframes r{to{transform:rotate(360deg)}}</style>'
            + '<meta http-equiv="refresh" content="2">'
            + '</head><body><div><h2>Pixcode is finishing an update…</h2><p>This page will reload automatically.</p><div class="s"></div></div></body></html>'
        );
    }
});

// global error middleware must be last
app.use((err, req, res, _next) => {
  if (err instanceof AppError) {
    securityLog('app_error', {
      ip: getClientIp(req),
      endpoint: req.path,
      method: req.method,
      statusCode: err.statusCode,
      userId: req.user?.id,
      reason: err.code,
    });
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Log the error internally but never expose stack traces, file paths,
  // or internal IPs to the client.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds size limit.',
      },
    });
  }

  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.parse.failed.utf8') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    });
  }

  console.error('[UNHANDLED ERROR]', err?.message || err);
  securityLog('unhandled_error', {
    ip: getClientIp(req),
    endpoint: req.path,
    method: req.method,
    statusCode: 500,
    userId: req.user?.id,
    reason: err?.name || 'UnknownError',
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

// Helper function to convert permissions to rwx format
function permToRwx(perm) {
    const r = perm & 4 ? 'r' : '-';
    const w = perm & 2 ? 'w' : '-';
    const x = perm & 1 ? 'x' : '-';
    return r + w + x;
}

function createFileTreeScanContext() {
    return {
        startedAt: Date.now(),
        itemCount: 0,
        directoryCount: 0,
        limitReached: false,
    };
}

function hasFileTreeBudget(context) {
    if (!context || context.limitReached) {
        return false;
    }

    if (context.itemCount >= FILE_TREE_MAX_ITEMS || context.directoryCount >= FILE_TREE_MAX_DIRECTORIES) {
        context.limitReached = true;
        return false;
    }

    if (Date.now() - context.startedAt > FILE_TREE_SCAN_MAX_MS) {
        context.limitReached = true;
        return false;
    }

    return true;
}

function shouldSkipFileTreeEntry(entryName, showHidden) {
    if (!showHidden && entryName.startsWith('.')) {
        return true;
    }

    return FILE_TREE_EXCLUDED_ENTRY_NAMES.has(entryName)
        || entryName.endsWith('.log')
        || entryName === '.DS_Store';
}

async function readDirectoryEntriesBounded(dirPath, context) {
    const entries = [];

    try {
        const dir = await fsPromises.opendir(dirPath);
        try {
            for await (const entry of dir) {
                if (!hasFileTreeBudget(context) || entries.length >= FILE_TREE_MAX_ENTRIES_PER_DIRECTORY) {
                    context.limitReached = true;
                    break;
                }

                entries.push(entry);
            }
        } finally {
            await dir.close().catch(() => undefined);
        }
    } catch (error) {
        if (error.code !== 'EACCES' && error.code !== 'EPERM' && error.code !== 'ENOENT') {
            console.error('Error reading directory:', error);
        }
    }

    return entries;
}

async function getFileTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = true, scanContext = null) {
    const context = scanContext || createFileTreeScanContext();
    const items = [];

    if (!hasFileTreeBudget(context)) {
        return items;
    }

    context.directoryCount += 1;
    const entries = await readDirectoryEntriesBounded(dirPath, context);

    for (const entry of entries) {
        if (!hasFileTreeBudget(context) || shouldSkipFileTreeEntry(entry.name, showHidden)) {
            continue;
        }

        const itemPath = path.join(dirPath, entry.name);
        const item = {
            name: entry.name,
            path: itemPath,
            type: entry.isDirectory() ? 'directory' : 'file'
        };

        try {
            const stats = await fsPromises.stat(itemPath);
            item.size = stats.size;
            item.modified = stats.mtime.toISOString();

            const mode = stats.mode;
            const ownerPerm = (mode >> 6) & 7;
            const groupPerm = (mode >> 3) & 7;
            const otherPerm = mode & 7;
            item.permissions = ((mode >> 6) & 7).toString() + ((mode >> 3) & 7).toString() + (mode & 7).toString();
            item.permissionsRwx = permToRwx(ownerPerm) + permToRwx(groupPerm) + permToRwx(otherPerm);
        } catch {
            item.size = 0;
            item.modified = null;
            item.permissions = '000';
            item.permissionsRwx = '---------';
        }

        context.itemCount += 1;

        if (entry.isDirectory() && currentDepth < maxDepth && hasFileTreeBudget(context)) {
            try {
                await fsPromises.access(item.path, fs.constants.R_OK);
                item.children = await getFileTree(item.path, maxDepth, currentDepth + 1, showHidden, context);
            } catch {
                item.children = [];
            }
        }

        items.push(item);
    }

    return items.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}

const SERVER_PORT = process.env.SERVER_PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const DISPLAY_HOST = getConnectableHost(HOST);
const VITE_PORT = process.env.VITE_PORT || 5173;
const SEPARATE_FRONTEND = process.env.PIXCODE_SEPARATE_FRONTEND === '1';

async function isPortOpen(port, timeoutMs = 800) {
    return await new Promise((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });
}

async function waitForPortOpen(port, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(port)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}

function printSystemDaemonActiveNotice(port) {
    const effectivePort = Number(port) || 3001;
    const statusCommand = buildDaemonCliCommand(
        { subcommand: 'status', mode: 'system' },
        DAEMON_COMMAND_CONTEXT
    );
    const stopCommand = buildDaemonCliCommand(
        { subcommand: 'stop', mode: 'system' },
        DAEMON_COMMAND_CONTEXT
    );
    const logsCommand = buildDaemonCliCommand(
        { subcommand: 'logs', mode: 'system' },
        DAEMON_COMMAND_CONTEXT
    );
    console.log(`${c.ok('[OK]')} System daemon is active and managing Pixcode.`);
    console.log(`${c.info('[INFO]')} Health URL: ${c.bright(`http://localhost:${effectivePort}/health`)}`);
    console.log(`${c.info('[INFO]')} Status: ${c.bright(statusCommand)}`);
    console.log(`${c.info('[INFO]')} Stop: ${c.bright(stopCommand)}`);
    console.log(`${c.info('[INFO]')} Logs: ${c.bright(logsCommand)}`);
}

function daemonFrontendArgs() {
    return SEPARATE_FRONTEND
        ? ['--frontend-port', String(VITE_PORT)]
        : ['--single-port'];
}

function daemonInstallArgs(mode) {
    return ['install', '--mode', mode, '--port', String(SERVER_PORT), ...daemonFrontendArgs()];
}

function printUserDaemonActiveNotice(port, frontendPort, frontendEnabled = SEPARATE_FRONTEND) {
    const effectivePort = Number(port) || 3001;
    const effectiveFrontendPort = Number(frontendPort) || 5173;
    const statusCommand = buildDaemonCliCommand(
        { subcommand: 'status', mode: 'user' },
        DAEMON_COMMAND_CONTEXT
    );
    const stopCommand = buildDaemonCliCommand(
        { subcommand: 'stop', mode: 'user' },
        DAEMON_COMMAND_CONTEXT
    );
    const logsCommand = buildDaemonCliCommand(
        { subcommand: 'logs', mode: 'user' },
        DAEMON_COMMAND_CONTEXT
    );
    console.log(`${c.ok('[OK]')} User daemon is active for this account.`);
    console.log(`${c.info('[INFO]')} App URL: ${c.bright(`http://localhost:${effectivePort}`)}`);
    if (frontendEnabled) {
        console.log(`${c.info('[INFO]')} Frontend: ${c.bright(`http://localhost:${effectiveFrontendPort}`)}`);
    }
    console.log(`${c.info('[INFO]')} Status: ${c.bright(statusCommand)}`);
    console.log(`${c.info('[INFO]')} Stop: ${c.bright(stopCommand)}`);
    console.log(`${c.info('[INFO]')} Logs: ${c.bright(logsCommand)}`);
    console.log(`${c.tip('[TIP]')} For login/reboot persistence, enable linger once: ${c.bright(`sudo loginctl enable-linger ${os.userInfo().username}`)}`);
}

function isSystemPermissionError(error) {
    const message = String(error?.message || error || '');
    return /(access denied|permission denied|must be root|interactive authentication required|not permitted|failed to connect to bus|operation not permitted|authentication is required|polkit)/i.test(message);
}

async function maybeAutoDaemonBootstrapFromIndex() {
    if (process.platform !== 'linux') return false;
    if (process.env.PIXCODE_DAEMON_MANAGED === '1') return false;
    if (process.env.PIXCODE_NO_DAEMON === '1') return false;
    if (process.env.PIXCODE_DAEMON_ATTEMPTED === '1') return false;

    process.env.PIXCODE_DAEMON_ATTEMPTED = '1';

    const systemArgs = daemonInstallArgs('system');
    const userArgs = daemonInstallArgs('user');

    try {
        console.log(`${c.info('[INFO]')} Linux detected. Enforcing system daemon mode for Pixcode...`);
        await handleDaemonCommand(systemArgs, {
            appRoot: APP_ROOT,
            defaultPort: String(SERVER_PORT),
            color: c,
            cliEntry: path.join(APP_ROOT, 'server', 'cli.js'),
        });
        return true;
    } catch (systemError) {
        const healthySoon = await waitForPortOpen(SERVER_PORT);
        if (healthySoon) {
            console.log(`${c.warn('[WARN]')} System daemon health check was delayed, but port ${SERVER_PORT} is now reachable.`);
            printSystemDaemonActiveNotice(SERVER_PORT);
            return true;
        }

        if (!isSystemPermissionError(systemError)) {
            const installSystemCommand = buildDaemonCliCommand(
                {
                    subcommand: 'install',
                    mode: 'system',
                    extraArgs: ['--port', String(SERVER_PORT), ...daemonFrontendArgs()],
                },
                DAEMON_COMMAND_CONTEXT
            );
            throw new Error(
                `System daemon bootstrap failed.\n` +
                `${systemError.message}\n` +
                `Run with privileges: ${installSystemCommand}`
            );
        }

        console.log(`${c.warn('[WARN]')} System daemon setup requires elevated privileges for this user.`);
        console.log(`${c.info('[INFO]')} Falling back to user daemon mode for account "${os.userInfo().username}"...`);

        try {
            await handleDaemonCommand(userArgs, {
                appRoot: APP_ROOT,
                defaultPort: String(SERVER_PORT),
                color: c,
                cliEntry: path.join(APP_ROOT, 'server', 'cli.js'),
            });
            printUserDaemonActiveNotice(SERVER_PORT, VITE_PORT);
            return true;
        } catch (userError) {
            const userHealthySoon = await waitForPortOpen(SERVER_PORT);
            if (userHealthySoon) {
                console.log(`${c.warn('[WARN]')} User daemon health check was delayed, but port ${SERVER_PORT} is now reachable.`);
                printUserDaemonActiveNotice(SERVER_PORT, VITE_PORT);
                return true;
            }
            const installSystemCommand = buildDaemonCliCommand(
                {
                    subcommand: 'install',
                    mode: 'system',
                    extraArgs: ['--port', String(SERVER_PORT), ...daemonFrontendArgs()],
                },
                DAEMON_COMMAND_CONTEXT
            );
            const installUserCommand = buildDaemonCliCommand(
                {
                    subcommand: 'install',
                    mode: 'user',
                    extraArgs: ['--port', String(SERVER_PORT), ...daemonFrontendArgs()],
                },
                DAEMON_COMMAND_CONTEXT
            );
            throw new Error(
                `System daemon bootstrap failed.\n` +
                `${systemError.message}\n\n` +
                `User daemon fallback also failed.\n` +
                `${userError.message}\n` +
                `Try one of:\n` +
                `1) ${installSystemCommand}\n` +
                `2) ${installUserCommand}`
            );
        }
    }
}

// Process-level error handlers to prevent silent crashes and log security events.
// These catch errors that escape Express's own error middleware (e.g. from
// timers, WebSocket handlers, or un-awaited promises in route handlers).
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled promise rejection:', reason);
    securityLog('unhandled_rejection', {
        reason: reason instanceof Error ? reason.name : String(reason).slice(0, 200),
    });
});

process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error?.message || error);
    securityLog('uncaught_exception', {
        reason: error?.name || 'UnknownError',
    });
    // Give the security log time to flush, then exit. A clean exit lets the
    // daemon manager (systemd/pm2) restart the server automatically.
    setTimeout(() => process.exit(1), 100);
});

// Initialize database and start server
async function startServer() {
    try {
        if (await maybeAutoDaemonBootstrapFromIndex()) {
            return;
        }

        // Initialize authentication database
        await initializeDatabase();

        // Configure Web Push (VAPID keys)
        configureWebPush();

        // Load any provider API keys saved through the UI into process.env so
        // the Claude/Codex SDKs pick them up automatically. Spawn-based
        // adapters (Gemini, Qwen) layer their own env on top via buildSpawnEnv.
        try {
            await applyAllStoredCredentialsToEnv();
        } catch (err) {
            console.warn('[provider-credentials] Failed to apply stored credentials:', err?.message || err);
        }

        // Prepend the pixcode-managed CLI sandbox
        // (~/.pixcode/cli-bin/node_modules/.bin) to PATH so any provider CLI
        // installed via the in-app installer is instantly resolvable by
        // cross-spawn calls in the provider adapters — no server restart
        // required, no need to touch the user's shell PATH.
        try {
            primeCliBinPath();
        } catch (err) {
            console.warn('[install-jobs] Failed to prime CLI bin path:', err?.message || err);
        }

        // Restore any previously-configured Telegram bot. This is best-effort:
        // a bad token or network blip should warn, not crash the server.
        restoreBotFromConfig().catch((err) => {
            console.warn('[telegram] restore failed:', err?.message || err);
        });

        // Check if running in production mode (dist folder exists)
        const distIndexPath = path.join(APP_ROOT, 'dist', 'index.html');
        const isProduction = fs.existsSync(distIndexPath);

        // Log Claude implementation mode
        console.log(`${c.info('[INFO]')} Using Claude Agents SDK for Claude integration`);
        console.log('');

        if (isProduction) {
            console.log(`${c.info('[INFO]')} To run in production mode, go to http://${DISPLAY_HOST}:${SERVER_PORT}`);            
        }

        if (SEPARATE_FRONTEND) {
            console.log(`${c.info('[INFO]')} To run in development mode with hot-module replacement, go to http://${DISPLAY_HOST}:${VITE_PORT}`);
        }
   
        server.listen(SERVER_PORT, HOST, async () => {
            const appInstallPath = APP_ROOT;

            console.log('');
            console.log(c.dim('═'.repeat(63)));
            console.log(`  ${c.bright('Pixcode Server - Ready')}`);
            console.log(c.dim('═'.repeat(63)));
            console.log('');
            console.log(`${c.info('[INFO]')} Server URL:  ${c.bright('http://' + DISPLAY_HOST + ':' + SERVER_PORT)}`);
            console.log(`${c.info('[INFO]')} Installed at: ${c.dim(appInstallPath)}`);

            // Print LAN IP + open inbound firewall port (Linux auto, Windows/Mac
            // ask interactively once, then persist the decision). Non-fatal on
            // any error — LAN access often works without a rule anyway.
            try {
                await ensurePortOpen(Number(SERVER_PORT));
            } catch (err) {
                console.log(`${c.dim('[INFO]')} Port-access helper failed: ${err?.message || err}`);
            }

            restoreRequestedTunnel({ port: Number(SERVER_PORT) }).catch((err) => {
                console.warn('[external-access] tunnel restore failed:', err?.message || err);
            });

            // Auto-open browser unless explicitly disabled
            if (process.env.PIXCODE_NO_BROWSER !== '1') {
                const openUrl = `http://${DISPLAY_HOST}:${SERVER_PORT}`;
                try {
                    // Use spawn with an argument array instead of exec with a
                    // shell string to prevent command injection through the
                    // host/port values (which come from env vars).
                    const { spawn: spawnBrowser } = await import('node:child_process');
                    const browserBin = process.platform === 'darwin' ? 'open'
                        : process.platform === 'win32' ? 'cmd'
                        : 'xdg-open';
                    const browserArgs = process.platform === 'win32'
                        ? ['/c', 'start', '', openUrl]
                        : [openUrl];
                    spawnBrowser(browserBin, browserArgs, { stdio: 'ignore', timeout: 3000, detached: true, shell: false }).unref();
                    console.log(`${c.ok('[OK]')}   Opening browser at ${c.bright(openUrl)}`);
                } catch {
                    console.log(`${c.tip('[TIP]')}  Open ${c.bright(openUrl)} in your browser to start using Pixcode.`);
                }
            }

            console.log(`${c.tip('[TIP]')}  Run "pixcode status" for full configuration details`);
            console.log('');

            // Start watching the projects folder for changes
            await setupProjectsWatcher();

            // Start server-side plugin processes for enabled plugins
            startEnabledPluginServers().catch(err => {
                console.error('[Plugins] Error during startup:', err.message);
            });
        });

        // Clean up plugin processes on shutdown
        const shutdownPlugins = async () => {
            await stopAllPlugins();
            process.exit(0);
        };
        process.on('SIGTERM', () => void shutdownPlugins());
        process.on('SIGINT', () => void shutdownPlugins());
    } catch (error) {
        console.error('[ERROR] Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
