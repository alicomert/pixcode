import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
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
const RUN_TIMEOUT_MS = 120000;
const RUN_POLL_INTERVAL_MS = 1000;
const LOG_LIMIT = 800;
const HERMES_DIAGNOSTIC_LOG_BYTES = 120000;
const ALLOWED_GATEWAY_REQUEST_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const EXPECTED_PIXCODE_MCP_TOOLS = [
    'pixcode_list_projects',
    'pixcode_get_provider_status',
    'pixcode_open_cli_terminal',
    'pixcode_read_cli_terminal',
    'pixcode_get_hermes_gateway_status',
    'pixcode_probe_hermes_gateway',
    'pixcode_get_hermes_diagnostics',
    'pixcode_get_api_manifest',
    'pixcode_api_request',
    'pixcode_hermes_gateway_request',
    'pixcode_manage_hermes_cron',
    'pixcode_send_cli_input',
];
const PIXCODE_MANAGED_HERMES_ENV_PREFIXES = [
    'API_SERVER_',
    'BLUEBUBBLES_',
    'DINGTALK_',
    'DISCORD_',
    'EMAIL_',
    'FEISHU_',
    'MATTERMOST_',
    'MATRIX_',
    'MSGRAPH_',
    'QQ_',
    'SIGNAL_',
    'SLACK_',
    'SMS_',
    'TELEGRAM_',
    'TWILIO_',
    'WECOM_',
    'WEIXIN_',
    'WHATSAPP_',
    'YUANBAO_',
];

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSourceHermesHome(env = process.env) {
    if (env.HERMES_HOME?.trim()) {
        return path.resolve(env.HERMES_HOME);
    }

    const defaultHome = path.join(os.homedir(), '.hermes');
    try {
        const activeProfile = fs.readFileSync(path.join(defaultHome, 'active_profile'), 'utf8').trim();
        if (activeProfile && activeProfile !== 'default' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(activeProfile)) {
            return path.join(defaultHome, 'profiles', activeProfile);
        }
    } catch {
        // Default Hermes profile is fine when no sticky active profile exists.
    }

    return defaultHome;
}

function resolveHermesGatewayHome(env = process.env, options = {}) {
    const configured = options.hermesHome || env.PIXCODE_HERMES_GATEWAY_HOME;
    if (configured) {
        return path.resolve(configured);
    }

    return path.join(os.homedir(), '.hermes', 'profiles', 'pixcode');
}

function copyHermesProfileFile(sourceHome, targetHome, fileName, options = {}) {
    const source = path.join(sourceHome, fileName);
    const target = path.join(targetHome, fileName);
    if (!fs.existsSync(source)) return false;
    if (!options.overwrite && fs.existsSync(target)) return false;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return true;
}

function shouldStripManagedGatewayEnvLine(line) {
    const match = String(line || '').match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
    if (!match) return false;
    return PIXCODE_MANAGED_HERMES_ENV_PREFIXES.some((prefix) => match[1].startsWith(prefix));
}

function copyHermesProfileEnv(sourceHome, targetHome) {
    const source = path.join(sourceHome, '.env');
    const target = path.join(targetHome, '.env');
    if (!fs.existsSync(source)) return false;

    const sourceText = fs.readFileSync(source, 'utf8');
    const sanitized = sourceText
        .split(/\r?\n/)
        .filter((line) => !shouldStripManagedGatewayEnvLine(line))
        .join('\n')
        .replace(/\s*$/, '\n');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, sanitized);
    return true;
}

function seedHermesGatewayHome({ sourceHome, targetHome, gateway }) {
    fs.mkdirSync(targetHome, { recursive: true });
    if (path.resolve(sourceHome) === path.resolve(targetHome)) {
        appendGatewayLog(gateway, 'meta', `Using Hermes gateway profile at ${targetHome}\n`);
        return;
    }

    const copied = [];
    for (const file of ['config.yaml', 'SOUL.md']) {
        if (copyHermesProfileFile(sourceHome, targetHome, file, { overwrite: false })) {
            copied.push(file);
        }
    }
    if (copyHermesProfileEnv(sourceHome, targetHome)) {
        copied.push('.env (without messaging platform credentials)');
    }
    for (const file of ['auth.json']) {
        if (copyHermesProfileFile(sourceHome, targetHome, file, { overwrite: true })) {
            copied.push(file);
        }
    }

    appendGatewayLog(
        gateway,
        'meta',
        copied.length > 0
            ? `Seeded Pixcode Hermes gateway profile from ${sourceHome}: ${copied.join(', ')}\n`
            : `Using Pixcode Hermes gateway profile at ${targetHome}\n`,
    );
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

function extractRunId(body) {
    if (!body || typeof body !== 'object') return null;
    return body.run_id || body.runId || body.id || body.run?.id || null;
}

function extractRunStatus(body) {
    if (!body || typeof body !== 'object') return null;
    return body.status || body.state || body.run?.status || body.run?.state || null;
}

function extractTextFromValue(value) {
    if (typeof value === 'string') return value;
    if (!value) return null;

    if (Array.isArray(value)) {
        return value
            .map(extractTextFromValue)
            .filter(Boolean)
            .join('\n')
            .trim() || null;
    }

    if (typeof value === 'object') {
        for (const key of ['text', 'content', 'message', 'output', 'response', 'result', 'final']) {
            const text = extractTextFromValue(value[key]);
            if (text) return text;
        }
    }

    return null;
}

function extractRunOutput(body) {
    if (!body || typeof body !== 'object') return null;

    for (const key of ['output_text', 'output', 'response', 'result', 'message', 'messages', 'events', 'final']) {
        const text = extractTextFromValue(body[key]);
        if (text) return text;
    }

    return null;
}

function extractResponsesOutput(body) {
    if (!body || typeof body !== 'object') return null;

    const output = Array.isArray(body.output) ? body.output : [];
    for (const item of output) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'message' || item.role === 'assistant') {
            const text = extractTextFromValue(item.content);
            if (text) return text;
        }
        const text = extractTextFromValue(item.output_text)
            || extractTextFromValue(item.text)
            || extractTextFromValue(item.message)
            || extractTextFromValue(item.output);
        if (text) return text;
    }

    return extractTextFromValue(body.output_text)
        || extractTextFromValue(body.message)
        || extractTextFromValue(body.response)
        || null;
}

function extractChatCompletionOutput(body) {
    if (!body || typeof body !== 'object') return null;
    const choices = Array.isArray(body.choices) ? body.choices : [];
    for (const choice of choices) {
        const text = extractTextFromValue(choice?.message?.content)
            || extractTextFromValue(choice?.delta?.content)
            || extractTextFromValue(choice?.text);
        if (text) return text;
    }
    return extractTextFromValue(body.output_text)
        || extractTextFromValue(body.output)
        || extractTextFromValue(body.message)
        || extractTextFromValue(body.response)
        || null;
}

function recentGatewayLogText(gateway) {
    if (!gateway?.logs?.length) return '';
    return gateway.logs
        .slice(-16)
        .map((entry) => String(entry.chunk || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
}

function readFileTail(filePath, maxBytes = HERMES_DIAGNOSTIC_LOG_BYTES) {
    try {
        const stat = fs.statSync(filePath);
        const length = Math.min(maxBytes, stat.size);
        const buffer = Buffer.alloc(length);
        const fd = fs.openSync(filePath, 'r');
        try {
            fs.readSync(fd, buffer, 0, length, stat.size - length);
        } finally {
            fs.closeSync(fd);
        }
        return buffer.toString('utf8');
    } catch {
        return '';
    }
}

function readJsonFileSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function redactDiagnosticText(text) {
    return String(text || '')
        .replace(/\b(px_|ck_|sk-|ghp_|npm_)[A-Za-z0-9._-]+/gu, '$1[redacted]')
        .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu, '$1[redacted]')
        .replace(/((?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|token)\s*[:=]\s*["']?)[^"',\s}]+/giu, '$1[redacted]');
}

function findRootBlockEnd(lines, startIndex) {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (/^\S[^:]*:\s*(?:#.*)?$/u.test(lines[index])) {
            return index;
        }
    }
    return lines.length;
}

function readRootList(text, key) {
    const lines = String(text || '').split(/\r?\n/);
    const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*(?:#.*)?$`, 'u').test(line));
    if (start === -1) return [];
    const end = findRootBlockEnd(lines, start);
    const values = [];
    for (let index = start + 1; index < end; index += 1) {
        const match = lines[index].match(/^\s*-\s*([^#\s][^#]*?)(?:\s+#.*)?$/u);
        if (match) values.push(match[1].trim().replace(/^['"]|['"]$/gu, ''));
    }
    return values;
}

function readRootMap(text, key) {
    const lines = String(text || '').split(/\r?\n/);
    const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*(?:#.*)?$`, 'u').test(line));
    if (start === -1) return {};
    const end = findRootBlockEnd(lines, start);
    const values = {};
    for (let index = start + 1; index < end; index += 1) {
        const match = lines[index].match(/^\s+([A-Za-z0-9_.-]+):\s*(.*?)(?:\s+#.*)?$/u);
        if (!match) continue;
        values[match[1]] = match[2].trim().replace(/^['"]|['"]$/gu, '');
    }
    return values;
}

function readPixcodeMcpTools(text) {
    return Array.from(new Set(
        Array.from(String(text || '').matchAll(/^\s*-\s*(pixcode_[A-Za-z0-9_]+)\s*$/gmu))
            .map((match) => match[1]),
    ));
}

function readApiServerToolset(text) {
    const platformText = String(text || '');
    return {
        hasHermesApiServer: /^\s*-\s*hermes-api-server\s*$/gmu.test(platformText),
        hasPixcodePlatform: /^\s*-\s*pixcode\s*$/gmu.test(platformText),
    };
}

function summarizeHermesConfig(hermesHome) {
    const configPath = path.join(hermesHome, 'config.yaml');
    const text = readFileTail(configPath, HERMES_DIAGNOSTIC_LOG_BYTES);
    const toolsets = readRootList(text, 'toolsets');
    const pixcodeTools = readPixcodeMcpTools(text);
    const missingPixcodeTools = EXPECTED_PIXCODE_MCP_TOOLS.filter((tool) => !pixcodeTools.includes(tool));
    return {
        path: configPath,
        exists: Boolean(text),
        model: readRootMap(text, 'model'),
        toolsets,
        platformToolsets: readApiServerToolset(text),
        pixcodeMcp: {
            configured: /mcp_servers:[\s\S]*^\s+pixcode:\s*$/mu.test(text),
            enabled: /mcp_servers:[\s\S]*^\s+pixcode:[\s\S]*^\s+enabled:\s*true\s*$/mu.test(text),
            toolCount: pixcodeTools.length,
            tools: pixcodeTools,
            missingTools: missingPixcodeTools,
        },
        staleToolsetConfig: toolsets.includes('mcp-pixcode') && !toolsets.includes('hermes-cli'),
    };
}

function summarizeHermesAuth(hermesHome, provider) {
    const authPath = path.join(hermesHome, 'auth.json');
    const auth = readJsonFileSafe(authPath);
    const providers = auth && typeof auth === 'object' && auth.providers && typeof auth.providers === 'object'
        ? Object.keys(auth.providers)
        : [];
    const pools = auth && typeof auth === 'object' && auth.credential_pool && typeof auth.credential_pool === 'object'
        ? auth.credential_pool
        : {};
    const selectedProvider = provider || auth?.active_provider || null;
    const providerEntry = selectedProvider && auth?.providers && typeof auth.providers === 'object'
        ? auth.providers[selectedProvider]
        : null;
    return {
        path: authPath,
        exists: Boolean(auth),
        activeProvider: auth?.active_provider || null,
        providers,
        selectedProvider,
        selectedProviderConfigured: Boolean(providerEntry),
        selectedProviderLastRefresh: providerEntry?.last_refresh || null,
        selectedProviderAuthMode: providerEntry?.auth_mode || null,
        selectedProviderPoolSize: selectedProvider && Array.isArray(pools?.[selectedProvider])
            ? pools[selectedProvider].length
            : 0,
    };
}

function summarizeHermesLogs(hermesHomes) {
    const files = [];
    const seen = new Set();
    for (const home of hermesHomes.filter(Boolean)) {
        for (const name of ['errors.log', 'agent.log']) {
            const filePath = path.join(home, 'logs', name);
            if (seen.has(filePath)) continue;
            seen.add(filePath);
            const text = redactDiagnosticText(readFileTail(filePath));
            if (!text) continue;
            files.push({
                path: filePath,
                name,
                recent: text.split(/\r?\n/).filter(Boolean).slice(-80),
            });
        }
    }
    const combined = files.flatMap((file) => file.recent).join('\n');
    return {
        files,
        signals: {
            codexNoneType: /NoneType' object is not iterable|NoneType object is not iterable/iu.test(combined),
            codexOauthMissing: /openai-codex requested but no Codex OAuth .*found/iu.test(combined),
            mcpTimeout: /MCP call timed out|pixcode_open_cli_terminal call failed/iu.test(combined),
            stalePixcodeMcpToolCount: /MCP server 'pixcode'.*registered\s+[0-9]\s+tool\(s\)/iu.test(combined)
                && !/registered\s+1[0-9]\s+tool\(s\)/iu.test(combined),
        },
    };
}

function gatewayExitMessage(gateway, fallback = 'Hermes gateway is not running.') {
    if (!gateway) return fallback;
    const exit = gateway.exitSignal
        ? `Hermes gateway exited with signal ${gateway.exitSignal}.`
        : `Hermes gateway exited with code ${gateway.exitCode ?? 'unknown'}.`;
    const logs = recentGatewayLogText(gateway);
    return logs ? `${exit}\n${logs}` : (gateway.error || exit);
}

function normalizeGatewayEndpoint(endpoint) {
    const value = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!value) {
        throw new Error('Hermes gateway endpoint is required.');
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value) || value.startsWith('//')) {
        throw new Error('Hermes gateway endpoint must be local; external URLs are not allowed.');
    }
    if (!value.startsWith('/')) {
        throw new Error('Hermes gateway endpoint must start with /.');
    }
    if (
        value !== '/health' &&
        value !== '/health/detailed' &&
        !value.startsWith('/v1/') &&
        !value.startsWith('/api/')
    ) {
        throw new Error('Hermes gateway endpoint must be /health, /v1/..., or /api/....');
    }
    return value;
}

function normalizeGatewayRequestMethod(method) {
    const value = String(method || 'GET').trim().toUpperCase();
    if (!ALLOWED_GATEWAY_REQUEST_METHODS.has(value)) {
        throw new Error(`Unsupported Hermes gateway HTTP method: ${value || '(empty)'}`);
    }
    return value;
}

function makeRunRequest(options) {
    const input = String(options.input || '').trim();
    return {
        session_id: options.sessionId || `pixcode-hermes-chat-${Date.now()}-${randomBytes(4).toString('hex')}`,
        input,
        instructions: options.instructions || [
            'You are Hermes Agent running inside Pixcode.',
            'Use Pixcode MCP tools when they help inspect projects, launch CLIs, or perform workspace actions.',
            'Keep answers concise and include concrete next steps when work is blocked.',
        ].join(' '),
    };
}

function makeChatCompletionRequest(options) {
    const input = String(options.input || '').trim();
    const messages = Array.isArray(options.messages) ? options.messages : [
        {
            role: 'system',
            content: options.instructions || [
                'You are Hermes Agent running inside Pixcode.',
                'Use Pixcode MCP tools when they help inspect projects, launch CLIs, or perform workspace actions.',
                'Keep answers concise and include concrete next steps when work is blocked.',
            ].join(' '),
        },
        {
            role: 'user',
            content: input,
        },
    ];
    return {
        model: options.model || 'hermes-agent',
        messages,
        stream: false,
    };
}

function makeResponsesRequest(options) {
    const input = String(options.input || '').trim();
    return {
        model: options.model || 'hermes-agent',
        input,
        instructions: options.instructions || [
            'You are Hermes Agent running inside Pixcode.',
            'Use Pixcode MCP tools when they help inspect projects, launch CLIs, or perform workspace actions.',
            'Keep answers concise and include concrete next steps when work is blocked.',
        ].join(' '),
        conversation: options.sessionId || undefined,
        store: true,
    };
}

async function waitForGatewayReady(gateway) {
    const started = Date.now();
    let lastError = null;

    while (Date.now() - started < STARTUP_TIMEOUT_MS) {
        if (!isGatewayRunning(gateway)) {
            throw new Error(gatewayExitMessage(gateway));
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
            hermesHome: null,
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
        hermesHome: gateway.hermesHome,
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
        if (options.probeExisting !== true) {
            return {
                ...snapshotGateway(existing),
                probe: existing.lastProbe,
            };
        }

        const probe = await probeHermesGateway(projectPath, { requireRunning: true }).catch((error) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }));
        if (probe.ok || options.replaceUnhealthy !== true) {
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
    const sourceHermesHome = options.sourceHermesHome || resolveSourceHermesHome(process.env);
    const hermesHome = resolveHermesGatewayHome(process.env, options);
    const env = buildHermesGatewayEnv(process.env, {
        ...options,
        host,
        port,
        apiServerKey,
        appRoot,
        hermesHome,
    });
    const installStatus = readHermesInstallStatus(env, {
        allowSmokeHermes: options.allowSmokeHermes === true,
        repairLaunchers: options.repairLaunchers !== false,
    });
    if (!installStatus.installed || !installStatus.command) {
        throw new Error(installStatus.error || 'Hermes Agent CLI is not installed.');
    }

    const gateway = {
        id: `${projectPath}:${port}`,
        projectPath,
        host,
        port,
        baseUrl: gatewayBaseUrl(host, port),
        hermesHome,
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

    seedHermesGatewayHome({ sourceHome: sourceHermesHome, targetHome: hermesHome, gateway });
    await configurePixcodeMcp({ appRoot, env, gateway });

    const gatewayArgs = options.gatewayArgs || ['gateway', 'run', '--replace'];
    const child = spawn(installStatus.command, gatewayArgs, {
        cwd: projectPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    gateway.child = child;
    appendGatewayLog(gateway, 'meta', `$ ${installStatus.command} ${gatewayArgs.join(' ')}\n`);

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
            const run = await runHermesGatewayPrompt(gateway.projectPath, {
                input: options.input.trim(),
                sessionId: options.sessionId || `pixcode-probe-${Date.now()}`,
                instructions: options.instructions || 'Respond briefly for a Pixcode REST integration check.',
                timeoutMs: options.runTimeoutMs || 30000,
            });
            checks.run = {
                ok: run.ok,
                status: run.httpStatus || 200,
                body: run,
                error: run.error || null,
            };
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

export async function runHermesGatewayPrompt(projectPath, options = {}) {
    const gateway = projectPath
        ? gateways.get(normalizeProjectPath(projectPath))
        : Array.from(gateways.values()).find(isGatewayRunning);

    if (!isGatewayRunning(gateway)) {
        throw new Error('Hermes gateway is not running.');
    }

    const input = String(options.input || '').trim();
    if (!input) {
        throw new Error('Hermes prompt is required.');
    }

    const responsesRequest = makeResponsesRequest({ ...options, input });
    const responseRun = await callGateway(gateway, '/v1/responses', {
        method: 'POST',
        body: JSON.stringify(responsesRequest),
        timeoutMs: options.responsesTimeoutMs || options.timeoutMs || RUN_TIMEOUT_MS,
    }).catch((error) => {
        if (!isGatewayRunning(gateway)) {
            throw new Error(gatewayExitMessage(gateway));
        }
        throw error;
    });

    if (!isGatewayRunning(gateway)) {
        throw new Error(gatewayExitMessage(gateway));
    }

    if (responseRun.ok) {
        const status = extractRunStatus(responseRun.body) || 'completed';
        const message = extractResponsesOutput(responseRun.body);
        return {
            ok: status === 'completed' || status === 'succeeded',
            projectPath: gateway.projectPath,
            baseUrl: gateway.baseUrl,
            sessionId: options.sessionId || responsesRequest.conversation || null,
            runId: null,
            responseId: responseRun.body?.id || null,
            status,
            message,
            error: (status === 'completed' || status === 'succeeded') ? null : extractTextFromValue(responseRun.body?.error) || message || 'Hermes response failed.',
            raw: responseRun.body,
            transport: 'responses',
            endpoint: '/v1/responses',
            httpStatus: responseRun.status,
        };
    }

    if (responseRun.status && responseRun.status !== 404 && responseRun.status !== 405) {
        throw new Error(`Hermes /v1/responses failed with HTTP ${responseRun.status}: ${JSON.stringify(responseRun.body)}`);
    }

    const chatRequest = makeChatCompletionRequest({ ...options, input });
    const chat = await callGateway(gateway, '/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(chatRequest),
        timeoutMs: options.chatTimeoutMs || options.timeoutMs || RUN_TIMEOUT_MS,
    }).catch((error) => {
        if (!isGatewayRunning(gateway)) {
            throw new Error(gatewayExitMessage(gateway));
        }
        throw error;
    });

    if (!isGatewayRunning(gateway)) {
        throw new Error(gatewayExitMessage(gateway));
    }

    if (chat.ok) {
        const message = extractChatCompletionOutput(chat.body);
        return {
            ok: true,
            projectPath: gateway.projectPath,
            baseUrl: gateway.baseUrl,
            sessionId: options.sessionId || null,
            runId: null,
            status: 'completed',
            message,
            raw: chat.body,
            transport: 'chat.completions',
            endpoint: '/v1/chat/completions',
            httpStatus: chat.status,
        };
    }

    if (chat.status && chat.status !== 404 && chat.status !== 405) {
        throw new Error(`Hermes /v1/chat/completions failed with HTTP ${chat.status}: ${JSON.stringify(chat.body)}`);
    }

    const request = makeRunRequest({ ...options, input });
    const create = await callGateway(gateway, '/v1/runs', {
        method: 'POST',
        body: JSON.stringify(request),
        timeoutMs: options.createTimeoutMs || 15000,
    }).catch((error) => {
        if (!isGatewayRunning(gateway)) {
            throw new Error(gatewayExitMessage(gateway));
        }
        throw error;
    });

    if (!isGatewayRunning(gateway)) {
        throw new Error(gatewayExitMessage(gateway));
    }

    if (!create.ok) {
        throw new Error(`Hermes /v1/runs failed with HTTP ${create.status}: ${JSON.stringify(create.body)}`);
    }

    const runId = extractRunId(create.body);
    const initialStatus = extractRunStatus(create.body);
    if (!runId) {
        return {
            ok: true,
            projectPath: gateway.projectPath,
            baseUrl: gateway.baseUrl,
            sessionId: request.session_id,
            runId: null,
            status: initialStatus || 'completed',
            message: extractRunOutput(create.body),
            raw: create.body,
            transport: 'runs',
            endpoint: '/v1/runs',
            httpStatus: create.status,
        };
    }

    const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'canceled']);
    const started = Date.now();
    let latest = create.body;
    let status = initialStatus || 'queued';

    while (!terminalStatuses.has(String(status)) && Date.now() - started < (options.timeoutMs || RUN_TIMEOUT_MS)) {
        await sleep(options.pollIntervalMs || RUN_POLL_INTERVAL_MS);
        const poll = await callGateway(gateway, `/v1/runs/${encodeURIComponent(runId)}`, {
            timeoutMs: options.pollTimeoutMs || 15000,
        });
        if (!poll.ok) {
            throw new Error(`Hermes /v1/runs/${runId} failed with HTTP ${poll.status}: ${JSON.stringify(poll.body)}`);
        }
        if (!isGatewayRunning(gateway)) {
            throw new Error(gatewayExitMessage(gateway));
        }
        latest = poll.body;
        status = extractRunStatus(latest) || status;
    }

    if (!terminalStatuses.has(String(status))) {
        throw new Error(`Hermes run did not finish within ${Math.round((options.timeoutMs || RUN_TIMEOUT_MS) / 1000)}s: ${runId}`);
    }

    const message = extractRunOutput(latest);
    return {
        ok: status === 'completed',
        projectPath: gateway.projectPath,
        baseUrl: gateway.baseUrl,
        sessionId: request.session_id,
        runId,
        status,
        message,
        error: status === 'completed' ? null : extractTextFromValue(latest?.error) || message || 'Hermes run failed.',
        raw: latest,
        transport: 'runs',
        endpoint: '/v1/runs',
        httpStatus: create.status,
    };
}

export async function requestHermesGateway(projectPath, options = {}) {
    const gateway = projectPath
        ? gateways.get(normalizeProjectPath(projectPath))
        : Array.from(gateways.values()).find(isGatewayRunning);

    if (!isGatewayRunning(gateway)) {
        throw new Error('Hermes gateway is not running.');
    }

    const endpoint = normalizeGatewayEndpoint(options.endpoint || options.path);
    const method = normalizeGatewayRequestMethod(options.method);
    const requestOptions = {
        method,
        timeoutMs: options.timeoutMs || FETCH_TIMEOUT_MS,
    };
    if (typeof options.body !== 'undefined' && options.body !== null && method !== 'GET') {
        requestOptions.body = JSON.stringify(options.body);
    }

    const response = await callGateway(gateway, endpoint, requestOptions);
    return {
        ok: response.ok,
        status: response.status,
        projectPath: gateway.projectPath,
        baseUrl: gateway.baseUrl,
        endpoint,
        method,
        body: response.body,
        error: response.ok ? null : `Hermes gateway ${method} ${endpoint} failed with HTTP ${response.status}.`,
    };
}

export async function readHermesDiagnostics(options = {}) {
    const projectPath = options.projectPath ? normalizeProjectPath(options.projectPath) : null;
    const gateway = projectPath
        ? gateways.get(projectPath)
        : Array.from(gateways.values()).find(isGatewayRunning) || null;
    const sourceHermesHome = resolveSourceHermesHome(process.env);
    const gatewayHermesHome = resolveHermesGatewayHome(process.env, options);
    const installStatus = readHermesInstallStatus(process.env, {
        allowSmokeHermes: options.allowSmokeHermes === true,
        repairLaunchers: options.repairLaunchers !== false,
    });
    const sourceConfig = summarizeHermesConfig(sourceHermesHome);
    const gatewayConfig = summarizeHermesConfig(gatewayHermesHome);
    const activeConfig = gatewayConfig.exists ? gatewayConfig : sourceConfig;
    const provider = activeConfig.model.provider || sourceConfig.model.provider || null;
    const sourceAuth = summarizeHermesAuth(sourceHermesHome, provider);
    const gatewayAuth = summarizeHermesAuth(gatewayHermesHome, provider);
    const activeAuth = gatewayAuth.exists ? gatewayAuth : sourceAuth;
    const logs = summarizeHermesLogs([sourceHermesHome, gatewayHermesHome]);
    const issues = [];

    if (!installStatus.installed) {
        issues.push({
            severity: 'error',
            code: 'HERMES_NOT_INSTALLED',
            message: installStatus.error || 'Hermes Agent CLI is not installed.',
        });
    }
    if (!activeConfig.toolsets.includes('hermes-cli')) {
        issues.push({
            severity: 'error',
            code: 'HERMES_CLI_TOOLSET_MISSING',
            message: 'Hermes CLI toolset is not enabled; cron, file, terminal, skills, and native tools are unavailable.',
        });
    }
    if (!activeConfig.toolsets.includes('mcp-pixcode')) {
        issues.push({
            severity: 'error',
            code: 'PIXCODE_MCP_TOOLSET_MISSING',
            message: 'Pixcode MCP toolset is not enabled in Hermes config.',
        });
    }
    if (activeConfig.pixcodeMcp.missingTools.length > 0) {
        issues.push({
            severity: 'warning',
            code: 'PIXCODE_MCP_TOOLS_STALE',
            message: `Pixcode MCP config is missing ${activeConfig.pixcodeMcp.missingTools.length} current tool(s). Restart Hermes from Pixcode to rewrite the config.`,
            tools: activeConfig.pixcodeMcp.missingTools,
        });
    }
    if (provider === 'openai-codex' && !activeAuth.selectedProviderConfigured) {
        issues.push({
            severity: 'error',
            code: 'OPENAI_CODEX_AUTH_MISSING',
            message: 'Hermes is configured for OpenAI Codex, but Hermes auth.json does not contain an OpenAI Codex OAuth session.',
        });
    }
    if (logs.signals.codexNoneType) {
        issues.push({
            severity: 'error',
            code: 'OPENAI_CODEX_PROVIDER_FAILURE',
            message: 'Recent Hermes logs show OpenAI Codex provider failing with "NoneType object is not iterable" before Pixcode MCP tools run.',
        });
    }
    if (logs.signals.codexOauthMissing) {
        issues.push({
            severity: 'warning',
            code: 'OPENAI_CODEX_OAUTH_WARNING',
            message: 'Recent Hermes logs reported a missing OpenAI Codex OAuth token. Run Hermes model/auth from Settings if prompts fail.',
        });
    }
    if (logs.signals.mcpTimeout) {
        issues.push({
            severity: 'warning',
            code: 'PIXCODE_MCP_TIMEOUT',
            message: 'Recent Hermes logs include Pixcode MCP terminal timeouts; visible CLI readback may still be waiting for provider completion.',
        });
    }

    const cron = {
        toolsetAvailable: activeConfig.toolsets.includes('hermes-cli'),
        gatewayJobsApi: null,
    };
    if (isGatewayRunning(gateway)) {
        try {
            const jobs = await callGateway(gateway, '/api/jobs', { timeoutMs: 3000 });
            cron.gatewayJobsApi = {
                ok: jobs.ok,
                status: jobs.status,
                body: jobs.body,
            };
        } catch (error) {
            cron.gatewayJobsApi = {
                ok: false,
                status: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    const recommendedActions = [];
    if (issues.some((issue) => issue.code === 'HERMES_CLI_TOOLSET_MISSING' || issue.code === 'PIXCODE_MCP_TOOLS_STALE')) {
        recommendedActions.push('Restart Hermes from Pixcode so configure-pixcode-mcp.mjs rewrites toolsets to hermes-cli + mcp-pixcode and registers all tools.');
    }
    if (issues.some((issue) => issue.code === 'OPENAI_CODEX_AUTH_MISSING' || issue.code === 'OPENAI_CODEX_PROVIDER_FAILURE')) {
        recommendedActions.push('Open Settings > Hermes Agent > Model and provider, reselect OpenAI Codex or another provider, then run Test REST with a short prompt.');
    }
    if (!isGatewayRunning(gateway)) {
        recommendedActions.push('Start REST in Settings > Hermes Agent to enable /v1 and /api/jobs gateway checks for this workspace.');
    }

    return {
        ok: installStatus.installed && !issues.some((issue) => issue.severity === 'error'),
        generatedAt: nowIso(),
        install: installStatus,
        hermesHome: {
            source: sourceHermesHome,
            gateway: gatewayHermesHome,
        },
        model: {
            provider,
            default: activeConfig.model.default || null,
            baseUrl: activeConfig.model.base_url || null,
        },
        config: {
            source: sourceConfig,
            gateway: gatewayConfig,
            active: activeConfig,
            activePath: activeConfig.path,
        },
        auth: {
            source: sourceAuth,
            gateway: gatewayAuth,
            active: activeAuth,
        },
        gateway: snapshotGateway(gateway),
        cron,
        logs,
        issues,
        recommendedActions,
    };
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
