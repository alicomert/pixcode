import { randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import {
    buildHermesPathEnv,
    readHermesInstallStatus,
} from './hermes-install-jobs.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8642;
const PORT_SCAN_LIMIT = 80;
const STARTUP_TIMEOUT_MS = 30000;
const FETCH_TIMEOUT_MS = 5000;
const LOG_LIMIT = 800;

const gateways = new Map();

function nowIso() {
    return new Date().toISOString();
}

function normalizeProjectPath(projectPath) {
    return path.resolve(projectPath || os.homedir());
}

function appendGatewayLog(gateway, stream, chunk) {
    const entry = { stream, chunk: String(chunk || ''), at: Date.now() };
    gateway.logs.push(entry);
    if (gateway.logs.length > LOG_LIMIT) {
        gateway.logs.splice(0, gateway.logs.length - LOG_LIMIT);
    }
}

function isGatewayRunning(gateway) {
    return Boolean(gateway?.child && gateway.exitCode === null && gateway.exitSignal === null);
}

function gatewayBaseUrl(host, port) {
    return `http://${host}:${port}`;
}

function makeApiServerKey() {
    return `pixcode-hermes-${randomBytes(24).toString('hex')}`;
}

export function buildHermesGatewayEnv(baseEnv = process.env, options = {}) {
    const host = options.host || DEFAULT_HOST;
    const port = String(options.port || DEFAULT_PORT);
    return buildHermesPathEnv(baseEnv, {
        API_SERVER_ENABLED: 'true',
        API_SERVER_HOST: host,
        API_SERVER_PORT: port,
        API_SERVER_KEY: options.apiServerKey || makeApiServerKey(),
        API_SERVER_CORS_ORIGINS: options.corsOrigins || options.pixcodeBaseUrl || '',
        PIXCODE_BASE_URL: options.pixcodeBaseUrl || '',
        PIXCODE_API_KEY: options.pixcodeApiKey || '',
        PIXCODE_APP_ROOT: options.appRoot || process.cwd(),
        HERMES_HOME: options.hermesHome || '',
        HERMES_INSTALL_DIR: options.installDir || '',
    });
}

function isPortAvailable(port, host) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, host);
    });
}

async function findAvailablePort(preferredPort, host) {
    const start = Number.isFinite(preferredPort) ? preferredPort : DEFAULT_PORT;
    for (let offset = 0; offset < PORT_SCAN_LIMIT; offset += 1) {
        const port = start + offset;
        if (await isPortAvailable(port, host)) {
            return port;
        }
    }
    throw new Error(`No available Hermes API server port found from ${start} to ${start + PORT_SCAN_LIMIT - 1}.`);
}

function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            accept: 'application/json',
            ...(options.headers || {}),
        },
    }).then(async (response) => {
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }

        return {
            ok: response.ok,
            status: response.status,
            body,
        };
    }).finally(() => clearTimeout(timeout));
}

async function callGateway(gateway, endpoint, options = {}) {
    return fetchJson(`${gateway.baseUrl}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${gateway.apiServerKey}`,
            'content-type': 'application/json',
            ...(options.headers || {}),
        },
    });
}

async function waitForGatewayReady(gateway) {
    const started = Date.now();
    let lastError = null;

    while (Date.now() - started < STARTUP_TIMEOUT_MS) {
        if (!isGatewayRunning(gateway)) {
            throw new Error(gateway.error || `Hermes gateway exited with code ${gateway.exitCode ?? 'unknown'}.`);
        }

        try {
            const probe = await probeHermesGateway(gateway.projectPath, { requireRunning: true });
            if (probe.ok) {
                return probe;
            }
            lastError = probe.error || 'Gateway probe failed.';
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Hermes gateway did not become ready within ${STARTUP_TIMEOUT_MS / 1000}s: ${lastError || 'no response'}`);
}

function runProcess(command, args, options, onData) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        child.stdout?.on('data', (buf) => onData?.('stdout', buf.toString()));
        child.stderr?.on('data', (buf) => onData?.('stderr', buf.toString()));
        child.on('error', reject);
        child.on('close', (code, signal) => {
            if (signal) {
                reject(new Error(`${command} killed by ${signal}`));
                return;
            }
            resolve(code ?? 0);
        });
    });
}

async function configurePixcodeMcp({ appRoot, env, gateway }) {
    const configureScript = path.join(appRoot, 'scripts', 'hermes', 'configure-pixcode-mcp.mjs');
    const code = await runProcess(process.execPath, [configureScript], {
        cwd: appRoot,
        env,
    }, (stream, chunk) => appendGatewayLog(gateway, stream, chunk));

    if (code !== 0) {
        throw new Error(`Pixcode MCP configuration exited with code ${code}`);
    }
}

function snapshotGateway(gateway) {
    if (!gateway) {
        return {
            running: false,
            projectPath: null,
            baseUrl: null,
            host: null,
            port: null,
            pid: null,
            startedAt: null,
            exitedAt: null,
            exitCode: null,
            exitSignal: null,
            error: null,
            lastProbe: null,
            logs: [],
        };
    }

    return {
        running: isGatewayRunning(gateway),
        projectPath: gateway.projectPath,
        baseUrl: gateway.baseUrl,
        host: gateway.host,
        port: gateway.port,
        pid: gateway.child?.pid ?? null,
        startedAt: gateway.startedAt,
        exitedAt: gateway.exitedAt,
        exitCode: gateway.exitCode,
        exitSignal: gateway.exitSignal,
        error: gateway.error,
        lastProbe: gateway.lastProbe,
        logs: gateway.logs.slice(-80),
    };
}

export function getHermesGatewayStatus(projectPath) {
    if (projectPath) {
        return snapshotGateway(gateways.get(normalizeProjectPath(projectPath)));
    }

    const active = Array.from(gateways.values()).filter(isGatewayRunning);
    return {
        running: active.length > 0,
        gateways: Array.from(gateways.values()).map(snapshotGateway),
    };
}

export async function ensureHermesGateway(options = {}) {
    const projectPath = normalizeProjectPath(options.projectPath);
    const existing = gateways.get(projectPath);
    if (isGatewayRunning(existing)) {
        const probe = await probeHermesGateway(projectPath, { requireRunning: true }).catch((error) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }));
        if (probe.ok) {
            return {
                ...snapshotGateway(existing),
                probe,
            };
        }
        stopHermesGateway(projectPath);
    }

    const host = options.host || DEFAULT_HOST;
    const port = await findAvailablePort(Number(options.port || process.env.HERMES_API_SERVER_PORT || DEFAULT_PORT), host);
    const apiServerKey = options.apiServerKey || makeApiServerKey();
    const appRoot = options.appRoot || process.cwd();
    const env = buildHermesGatewayEnv(process.env, {
        ...options,
        host,
        port,
        apiServerKey,
        appRoot,
    });
    const installStatus = readHermesInstallStatus(env);
    if (!installStatus.installed || !installStatus.command) {
        throw new Error(installStatus.error || 'Hermes Agent CLI is not installed.');
    }

    const gateway = {
        id: `${projectPath}:${port}`,
        projectPath,
        host,
        port,
        baseUrl: gatewayBaseUrl(host, port),
        apiServerKey,
        command: installStatus.command,
        child: null,
        startedAt: nowIso(),
        exitedAt: null,
        exitCode: null,
        exitSignal: null,
        error: null,
        lastProbe: null,
        logs: [],
    };
    gateways.set(projectPath, gateway);

    await configurePixcodeMcp({ appRoot, env, gateway });

    const child = spawn(installStatus.command, ['gateway'], {
        cwd: projectPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    gateway.child = child;
    appendGatewayLog(gateway, 'meta', `$ ${installStatus.command} gateway\n`);

    child.stdout?.on('data', (buf) => appendGatewayLog(gateway, 'stdout', buf.toString()));
    child.stderr?.on('data', (buf) => appendGatewayLog(gateway, 'stderr', buf.toString()));
    child.on('error', (error) => {
        gateway.error = error instanceof Error ? error.message : String(error);
        appendGatewayLog(gateway, 'stderr', `${gateway.error}\n`);
    });
    child.on('exit', (code, signal) => {
        gateway.exitCode = code;
        gateway.exitSignal = signal;
        gateway.exitedAt = nowIso();
        appendGatewayLog(gateway, 'meta', `Hermes gateway exited with code ${code}${signal ? ` (${signal})` : ''}\n`);
    });

    const probe = await waitForGatewayReady(gateway);
    return {
        ...snapshotGateway(gateway),
        probe,
    };
}

export async function probeHermesGateway(projectPath, options = {}) {
    const gateway = projectPath
        ? gateways.get(normalizeProjectPath(projectPath))
        : Array.from(gateways.values()).find(isGatewayRunning);

    if (!isGatewayRunning(gateway)) {
        const result = {
            ok: false,
            error: 'Hermes gateway is not running.',
            projectPath: projectPath ? normalizeProjectPath(projectPath) : null,
            baseUrl: null,
            checks: {},
        };
        if (options.requireRunning) return result;
        return result;
    }

    const checks = {};
    try {
        checks.health = await fetchJson(`${gateway.baseUrl}/health`);
    } catch (error) {
        checks.health = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }

    try {
        checks.capabilities = await callGateway(gateway, '/v1/capabilities');
    } catch (error) {
        checks.capabilities = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }

    try {
        checks.models = await callGateway(gateway, '/v1/models');
    } catch (error) {
        checks.models = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }

    if (typeof options.input === 'string' && options.input.trim()) {
        try {
            checks.run = await callGateway(gateway, '/v1/runs', {
                method: 'POST',
                body: JSON.stringify({
                    input: options.input.trim(),
                    session_id: options.sessionId || `pixcode-${Date.now()}`,
                    instructions: options.instructions || 'Respond briefly for a Pixcode REST integration check.',
                }),
                timeoutMs: options.runTimeoutMs || 15000,
            });
        } catch (error) {
            checks.run = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
        }
    }

    const ok = Boolean(
        checks.health?.ok &&
        checks.capabilities?.ok &&
        checks.models?.ok &&
        (!checks.run || checks.run.ok),
    );
    const result = {
        ok,
        projectPath: gateway.projectPath,
        baseUrl: gateway.baseUrl,
        checkedAt: nowIso(),
        checks,
        error: ok ? null : 'One or more Hermes REST checks failed.',
    };
    gateway.lastProbe = result;
    return result;
}

export function stopHermesGateway(projectPath) {
    const targets = projectPath
        ? [gateways.get(normalizeProjectPath(projectPath))].filter(Boolean)
        : Array.from(gateways.values());
    let stopped = 0;
    for (const gateway of targets) {
        if (!isGatewayRunning(gateway)) continue;
        try {
            gateway.child.kill();
            stopped += 1;
        } catch (error) {
            gateway.error = error instanceof Error ? error.message : String(error);
        }
    }
    return { stopped };
}
