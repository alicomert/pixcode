import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import { buildCliSpawnEnv, findExecutableOnPath } from './install-jobs.js';

const POSIX_INSTALLER_URL = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh';
const WINDOWS_INSTALLER_URL = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1';
const FINISHED_TTL_MS = 10 * 60 * 1000;
const HARD_TIMEOUT_MS = 20 * 60 * 1000;
const jobs = new Map();

function pathSeparator() {
    return process.platform === 'win32' ? ';' : ':';
}

function splitPathList(value) {
    return String(value || '').split(pathSeparator()).map((entry) => entry.trim()).filter(Boolean);
}

function mergePathEntries(env, preferredEntries) {
    const existing = splitPathList(env.PATH || env.Path || '');
    const seen = new Set();
    const merged = [];

    for (const entry of [...preferredEntries, ...existing]) {
        if (!entry) continue;
        const key = path.resolve(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
    }

    const nextPath = merged.join(pathSeparator());
    env.PATH = nextPath;
    if ('Path' in env || process.platform === 'win32') env.Path = nextPath;
    return env;
}

function knownHermesBinDirs(env = process.env) {
    const home = os.homedir();
    if (process.platform === 'win32') {
        const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        return [
            ...(env.HERMES_INSTALL_DIR ? [
                path.join(env.HERMES_INSTALL_DIR, 'venv', 'Scripts'),
                path.join(env.HERMES_INSTALL_DIR, '.venv', 'Scripts'),
                env.HERMES_INSTALL_DIR,
            ] : []),
            ...(env.HERMES_HOME ? [
                path.join(env.HERMES_HOME, 'hermes-agent', 'venv', 'Scripts'),
                path.join(env.HERMES_HOME, 'hermes-agent', '.venv', 'Scripts'),
                path.join(env.HERMES_HOME, 'hermes-agent'),
            ] : []),
            path.join(localAppData, 'hermes', 'bin'),
            path.join(localAppData, 'hermes', 'hermes-agent'),
            path.join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts'),
            path.join(localAppData, 'hermes', 'hermes-agent', '.venv', 'Scripts'),
        ];
    }

    return [
        ...(env.HERMES_INSTALL_DIR ? [
            path.join(env.HERMES_INSTALL_DIR, 'venv', 'bin'),
            path.join(env.HERMES_INSTALL_DIR, '.venv', 'bin'),
        ] : []),
        ...(env.HERMES_HOME ? [
            path.join(env.HERMES_HOME, 'hermes-agent', 'venv', 'bin'),
            path.join(env.HERMES_HOME, 'hermes-agent', '.venv', 'bin'),
        ] : []),
        path.join(home, '.local', 'bin'),
        path.join(home, '.hermes', 'hermes-agent', 'venv', 'bin'),
        path.join(home, '.hermes', 'hermes-agent', '.venv', 'bin'),
        '/usr/local/bin',
        '/usr/local/lib/hermes-agent/venv/bin',
    ];
}

function buildHermesEnv(baseEnv = process.env, extras = {}) {
    const env = mergePathEntries(buildCliSpawnEnv(baseEnv), knownHermesBinDirs(baseEnv));
    for (const [key, value] of Object.entries(extras)) {
        if (typeof value === 'string' && value.length > 0) {
            env[key] = value;
        }
    }
    delete env.PYTHONPATH;
    delete env.PYTHONHOME;
    return env;
}

export function primeHermesPath(env = process.env) {
    const next = buildHermesEnv(env);
    env.PATH = next.PATH;
    if ('Path' in env || next.Path) env.Path = next.Path || next.PATH;
}

export function hermesCommandCandidates(env = process.env) {
    const candidates = [];
    const hermesEnv = buildHermesEnv(env);
    const resolved = findExecutableOnPath('hermes', hermesEnv);

    if (env.HERMES_CLI_PATH) candidates.push(env.HERMES_CLI_PATH);
    if (resolved) candidates.push(resolved);
    candidates.push('hermes');

    if (process.platform === 'win32') {
        const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        candidates.push(
            ...(env.HERMES_INSTALL_DIR ? [
                path.join(env.HERMES_INSTALL_DIR, 'venv', 'Scripts', 'hermes.exe'),
                path.join(env.HERMES_INSTALL_DIR, '.venv', 'Scripts', 'hermes.exe'),
                path.join(env.HERMES_INSTALL_DIR, 'hermes.exe'),
            ] : []),
            ...(env.HERMES_HOME ? [
                path.join(env.HERMES_HOME, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
                path.join(env.HERMES_HOME, 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
                path.join(env.HERMES_HOME, 'hermes-agent', 'hermes.exe'),
            ] : []),
            path.join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
            path.join(localAppData, 'hermes', 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
            path.join(localAppData, 'hermes', 'hermes-agent', 'hermes.exe'),
        );
    } else {
        candidates.push(
            ...(env.HERMES_INSTALL_DIR ? [
                path.join(env.HERMES_INSTALL_DIR, 'venv', 'bin', 'hermes'),
                path.join(env.HERMES_INSTALL_DIR, '.venv', 'bin', 'hermes'),
            ] : []),
            ...(env.HERMES_HOME ? [
                path.join(env.HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'hermes'),
                path.join(env.HERMES_HOME, 'hermes-agent', '.venv', 'bin', 'hermes'),
            ] : []),
            path.join(os.homedir(), '.local', 'bin', 'hermes'),
            path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
            path.join(os.homedir(), '.hermes', 'hermes-agent', '.venv', 'bin', 'hermes'),
            '/usr/local/bin/hermes',
            '/usr/local/lib/hermes-agent/venv/bin/hermes',
        );
    }

    return [...new Set(candidates.filter(Boolean))];
}

export function readHermesInstallStatus(env = process.env) {
    const hermesEnv = buildHermesEnv(env);

    for (const candidate of hermesCommandCandidates(hermesEnv)) {
        const isBareCommand = candidate === 'hermes';
        if (!isBareCommand && !fs.existsSync(candidate)) {
            continue;
        }

        const result = spawn.sync(candidate, ['--version'], {
            encoding: 'utf8',
            env: hermesEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000,
            windowsHide: true,
        });
        if (!result.error && result.status === 0) {
            const version = `${result.stdout || result.stderr || ''}`.trim() || null;
            return {
                installed: true,
                command: candidate,
                version,
                error: null,
            };
        }
    }

    return {
        installed: false,
        command: null,
        version: null,
        error: 'Hermes Agent CLI is not installed or is not on PATH.',
    };
}

async function downloadHermesInstaller(url, targetPath, appendLog) {
    appendLog('meta', `Downloading ${url}\n`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(targetPath, bytes, { mode: 0o700 });
        appendLog('meta', `Downloaded installer to ${targetPath}\n`);
        return;
    } catch (error) {
        appendLog('stderr', `Node download failed: ${error instanceof Error ? error.message : String(error)}\n`);
        appendLog('meta', 'Retrying installer download with the system download tool...\n');
    }

    await downloadHermesInstallerWithNativeTool(url, targetPath, appendLog);
    if (process.platform !== 'win32') {
        await fs.promises.chmod(targetPath, 0o700);
    }
    appendLog('meta', `Downloaded installer to ${targetPath}\n`);
}

function downloadHermesInstallerWithNativeTool(url, targetPath, appendLog) {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'powershell.exe' : 'curl';
    const args = isWindows
        ? [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri ${JSON.stringify(url)} -UseBasicParsing -OutFile ${JSON.stringify(targetPath)}`,
        ]
        : ['-fL', '--retry', '2', '--connect-timeout', '20', '-o', targetPath, url];

    appendLog('meta', `$ ${command} ${args.join(' ')}\n`);

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: buildHermesEnv(process.env),
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        child.stdout.on('data', (buf) => appendLog('stdout', buf.toString()));
        child.stderr.on('data', (buf) => appendLog('stderr', buf.toString()));
        child.on('error', reject);
        child.on('close', (code, signal) => {
            if (signal) {
                reject(new Error(`${command} killed by ${signal}`));
                return;
            }
            if (code !== 0) {
                reject(new Error(`${command} exited with code ${code}`));
                return;
            }
            resolve();
        });
    });
}

function createJob(options) {
    const id = randomUUID();
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    return {
        id,
        provider: 'hermes',
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        error: null,
        logs: [],
        emitter,
        child: null,
        timer: null,
        binaryPath: null,
        options,
    };
}

function appendLog(job, stream, chunk) {
    const entry = { stream, chunk, at: Date.now() };
    job.logs.push(entry);
    if (job.logs.length > 2500) {
        job.logs.splice(0, job.logs.length - 2500);
    }
    job.emitter.emit('log', entry);
}

function finishJob(job, status, payload = {}) {
    if (job.status !== 'running') return;
    job.status = status;
    job.finishedAt = new Date().toISOString();
    if (typeof payload.exitCode === 'number') job.exitCode = payload.exitCode;
    if (payload.error) job.error = payload.error;
    if (payload.binaryPath) job.binaryPath = payload.binaryPath;
    job.emitter.emit('done', snapshotHermesInstallDonePayload(job));
    scheduleCleanup(job);
}

function scheduleCleanup(job) {
    if (job.timer) {
        clearTimeout(job.timer);
        job.timer = null;
    }
    setTimeout(() => {
        jobs.delete(job.id);
    }, FINISHED_TTL_MS);
}

function spawnLogged(job, command, args, options) {
    appendLog(job, 'meta', `$ ${command} ${args.join(' ')}\n`);
    const child = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    job.child = child;
    child.stdout.on('data', (buf) => appendLog(job, 'stdout', buf.toString()));
    child.stderr.on('data', (buf) => appendLog(job, 'stderr', buf.toString()));
    return new Promise((resolve, reject) => {
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

async function runConfigureScript(job, env, appRoot) {
    const configureScript = path.join(appRoot, 'scripts', 'hermes', 'configure-pixcode-mcp.mjs');
    if (!fs.existsSync(configureScript)) {
        appendLog(job, 'stderr', `Pixcode MCP configure script was not found: ${configureScript}\n`);
        return;
    }

    const code = await spawnLogged(job, process.execPath, [configureScript], {
        cwd: appRoot,
        env,
    });
    if (code !== 0) {
        throw new Error(`Pixcode MCP configuration exited with code ${code}`);
    }
}

function installerCommand(installerPath, { hermesHome, installDir, skipBrowser }) {
    if (process.platform === 'win32') {
        return {
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                installerPath,
                '-SkipSetup',
                '-NonInteractive',
                '-Branch',
                'main',
                ...(hermesHome ? ['-HermesHome', hermesHome] : []),
                ...(installDir ? ['-InstallDir', installDir] : []),
            ],
        };
    }

    return {
        command: 'bash',
        args: [
            installerPath,
            '--skip-setup',
            '--branch',
            'main',
            ...(installDir ? ['--dir', installDir] : []),
            ...(hermesHome ? ['--hermes-home', hermesHome] : []),
            ...(skipBrowser ? ['--skip-browser'] : []),
        ],
    };
}

async function runHermesInstall(job) {
    const {
        appRoot,
        force = false,
        hermesHome,
        installDir,
        pixcodeApiKey,
        pixcodeBaseUrl,
        skipBrowser = true,
    } = job.options;
    const env = buildHermesEnv(process.env, {
        PIXCODE_API_KEY: pixcodeApiKey,
        PIXCODE_BASE_URL: pixcodeBaseUrl,
        PIXCODE_APP_ROOT: appRoot,
        HERMES_HOME: hermesHome,
        HERMES_INSTALL_DIR: installDir,
    });

    appendLog(job, 'meta', `Hermes install mode: ${process.platform}\n`);
    appendLog(job, 'meta', `Pixcode base URL: ${pixcodeBaseUrl}\n`);

    const before = readHermesInstallStatus(env);
    if (before.installed && !force) {
        appendLog(job, 'meta', `Hermes already installed: ${before.version || before.command}\n`);
        await runConfigureScript(job, env, appRoot);
        finishJob(job, 'done', { binaryPath: before.command });
        return;
    }

    const installerPath = path.join(os.tmpdir(), `pixcode-hermes-install-${job.id}${process.platform === 'win32' ? '.ps1' : '.sh'}`);
    await downloadHermesInstaller(process.platform === 'win32' ? WINDOWS_INSTALLER_URL : POSIX_INSTALLER_URL, installerPath, (stream, chunk) => {
        appendLog(job, stream, chunk);
    });

    const install = installerCommand(installerPath, { hermesHome, installDir, skipBrowser });
    const installCode = await spawnLogged(job, install.command, install.args, {
        cwd: os.homedir(),
        env,
    });
    if (installCode !== 0) {
        throw new Error(`Hermes installer exited with code ${installCode}`);
    }

    primeHermesPath();
    const after = readHermesInstallStatus(env);
    if (!after.installed) {
        throw new Error(after.error || 'Hermes installer finished but hermes was not found.');
    }

    appendLog(job, 'meta', `Hermes ready: ${after.version || after.command}\n`);
    await runConfigureScript(job, env, appRoot);
    finishJob(job, 'done', { binaryPath: after.command });
}

export function createHermesInstallJob(options) {
    const job = createJob(options);
    jobs.set(job.id, job);

    job.timer = setTimeout(() => {
        if (job.status !== 'running') return;
        try { job.child?.kill('SIGKILL'); } catch { /* noop */ }
        finishJob(job, 'error', { error: 'Hermes install timed out after 20 minutes' });
    }, HARD_TIMEOUT_MS);

    runHermesInstall(job).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(job, 'stderr', `${message}\n`);
        finishJob(job, 'error', { error: message });
    });

    return job;
}

export function getHermesInstallJob(id) {
    return jobs.get(id) || null;
}

export function cancelHermesInstallJob(id) {
    const job = jobs.get(id);
    if (!job || job.status !== 'running') return false;
    try { job.child?.kill(); } catch { /* noop */ }
    finishJob(job, 'error', { error: 'Hermes install cancelled' });
    return true;
}

export function snapshotHermesInstallDonePayload(job) {
    if (job.status === 'done') {
        return {
            success: true,
            exitCode: job.exitCode,
            binaryPath: job.binaryPath,
            message: 'Hermes Agent is installed and Pixcode MCP is configured.',
        };
    }

    return {
        success: false,
        exitCode: job.exitCode,
        error: job.error || 'Hermes install failed',
    };
}
