/**
 * In-memory install-job registry + sandboxed local CLI installer.
 *
 * Why not `npm install -g`:
 *   - Requires admin/sudo on Windows and most Linux distros. When Pixcode
 *     runs as a non-privileged daemon, -g fails with EACCES and the user
 *     sees a blank log with no actionable error.
 *   - Even on Windows desktop, npm's global prefix is sometimes broken
 *     (AppData permissions, antivirus quarantining node_modules/.bin).
 *   - CI/docker/VPS setups often don't have `npm` on the daemon's PATH at
 *     all, even when the user's interactive shell does.
 *
 * What we do instead:
 *   - Install targets go into `~/.pixcode/cli-bin/` as LOCAL dependencies
 *     of a pixcode-owned package.json (no -g, no sudo, no UAC).
 *   - Resolve `npm` from the same Node install that's running the server
 *     (sibling file to `process.execPath`) so PATH environment doesn't
 *     matter.
 *   - On server boot, `~/.pixcode/cli-bin/node_modules/.bin` is prepended
 *     to `process.env.PATH`. Every existing `cross-spawn(binary)` call
 *     (in claude-auth, gemini-cli, qwen-code-cli, etc.) then resolves to
 *     the locally installed binary without any change to the adapter code.
 *
 * The HTTP/stream side of the API is the same as before:
 *   - POST /install → spawns the child, returns { jobId }
 *   - GET  /install/:jobId/stream → EventSource that replays the buffered
 *     transcript and then streams live chunks.
 *   - DELETE /install/:jobId → cancels an in-flight install.
 *
 * Jobs linger 10 minutes after completion so late subscribers still see
 * the outcome.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Use cross-spawn instead of node:child_process.spawn. On Windows, node's
// spawn cannot invoke `.cmd` / `.bat` files without `shell: true`, and with
// `shell: true` it tokenises on spaces — so a valid npm path like
// `C:\Program Files\nodejs\npm.cmd` gets split into "C:\Program" + "Files...".
// cross-spawn shells out through cmd.exe with proper quoting transparently
// and is already a transitive dependency we can safely re-use.
import spawn from 'cross-spawn';

const jobs = new Map();
const FINISHED_TTL_MS = 10 * 60 * 1000;
const HARD_TIMEOUT_MS = 10 * 60 * 1000;

export const CLI_HOME = path.join(os.homedir(), '.pixcode', 'cli-bin');
export const CLI_BIN_DIR = path.join(CLI_HOME, 'node_modules', '.bin');

/**
 * npm package → the binary name it installs. Used to verify the install
 * actually dropped an executable we can run, since npm can exit(0) even
 * when a package has no `bin` entry or our PATH wiring is wrong.
 */
const PACKAGE_BINARIES = {
    '@anthropic-ai/claude-code': 'claude',
    '@openai/codex': 'codex',
    '@google/gemini-cli': 'gemini',
    '@qwen-code/qwen-code': 'qwen',
};

/**
 * Make sure `CLI_HOME` exists with a minimal package.json so `npm install`
 * doesn't walk up to some unrelated parent and pollute it.
 */
function ensureCliHome() {
    fs.mkdirSync(CLI_HOME, { recursive: true });
    const pkgPath = path.join(CLI_HOME, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        const pkg = {
            name: 'pixcode-cli-bin',
            private: true,
            version: '0.0.0',
            description:
                'Pixcode-managed sandbox for provider CLIs (claude/codex/gemini/qwen). '
                + 'Safe to delete; Pixcode will re-create it on next install.',
        };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }
}

/**
 * Prepend the pixcode-managed bin dir to PATH. Called at server boot so
 * every subsequent `spawn('claude'|'gemini'|'codex'|'qwen', …)` in the
 * provider adapters (which use cross-spawn with bare names) resolves to
 * the locally installed binary without any per-adapter change.
 */
export function primeCliBinPath(env = process.env) {
    ensureCliHome();
    const sep = process.platform === 'win32' ? ';' : ':';
    const current = env.PATH || env.Path || '';
    if (!current.split(sep).some((entry) => path.resolve(entry || '') === path.resolve(CLI_BIN_DIR))) {
        const next = current ? `${CLI_BIN_DIR}${sep}${current}` : CLI_BIN_DIR;
        env.PATH = next;
        if ('Path' in env) env.Path = next;
    }
    // Once PATH is ready, resolve any well-known provider binaries to absolute
    // paths and export them as *_CLI_PATH env vars. This side-steps a Windows
    // gotcha: `child_process.spawn('claude', …)` does NOT auto-resolve .cmd /
    // .bat extensions, and the Claude Agent SDK calls spawn directly instead
    // of via cross-spawn — so a bare "claude" on PATH works in a shell but
    // fails inside the SDK. Pinning the full path side-steps it entirely.
    resolveProviderExecutables(env);
}

/**
 * Scan PATH (plus known native-installer locations) for every provider
 * binary we ship support for, and export *_CLI_PATH env vars pointing to
 * the absolute executable. Existing vars are left alone so users can
 * override detection.
 */
export function resolveProviderExecutables(env = process.env) {
    const providers = [
        { name: 'claude', envKey: 'CLAUDE_CLI_PATH' },
        { name: 'codex', envKey: 'CODEX_CLI_PATH' },
        { name: 'gemini', envKey: 'GEMINI_CLI_PATH' },
        { name: 'qwen', envKey: 'QWEN_CLI_PATH' },
        { name: 'cursor-agent', envKey: 'CURSOR_CLI_PATH' },
    ];
    for (const { name, envKey } of providers) {
        if (env[envKey]) continue;
        const resolved = findExecutableOnPath(name, env);
        if (resolved) env[envKey] = resolved;
    }
}

/**
 * Search PATH for an executable, including the Windows extension variants.
 * Returns the absolute path or null. Plain Node has no cross-platform
 * equivalent of `which`, so we roll our own — it's small enough to not be
 * worth an extra dependency.
 */
export function findExecutableOnPath(name, env = process.env) {
    const isWindows = process.platform === 'win32';
    const sep = isWindows ? ';' : ':';
    const paths = (env.PATH || env.Path || '').split(sep).filter(Boolean);

    // Common native-installer / per-user fallback paths that aren't always on
    // the daemon's PATH but are on the user's interactive shell PATH. We
    // union them in so "pixcode --no-daemon" and "pixcode daemon" agree.
    const home = os.homedir();
    if (isWindows) {
        paths.push(path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm'));
        paths.push(path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', `${name}-code`));
        paths.push(path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'AnthropicClaude'));
    } else {
        paths.push(path.join(home, '.local', 'bin'));
        paths.push(path.join(home, '.npm-global', 'bin'));
        paths.push('/usr/local/bin');
        paths.push('/opt/homebrew/bin');
    }

    const exts = isWindows
        ? ['.cmd', '.exe', '.bat', '.ps1', '']
        : [''];

    for (const dir of paths) {
        for (const ext of exts) {
            const candidate = path.join(dir, name + ext);
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    return candidate;
                }
            } catch {
                // Permission denied / broken symlink — ignore and keep looking.
            }
        }
    }
    return null;
}

/**
 * Resolve `npm` next to the currently-running `node` binary. This is
 * more reliable than trusting PATH — when Pixcode runs as a daemon, PATH
 * is often minimal and doesn't include the user's node install.
 */
function resolveNpmCommand() {
    const nodeDir = path.dirname(process.execPath);
    const isWindows = process.platform === 'win32';
    const candidates = isWindows
        ? ['npm.cmd', 'npm.exe']
        : ['npm'];
    for (const c of candidates) {
        const full = path.join(nodeDir, c);
        if (fs.existsSync(full)) return full;
    }
    // Windows sometimes ships npm in a sibling "npm" directory.
    if (isWindows) {
        const siblingNpm = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
        if (fs.existsSync(siblingNpm)) {
            return siblingNpm; // we'll invoke `node <npm-cli.js>`
        }
    }
    // Fall back to bare name and let the shell resolve.
    return isWindows ? 'npm.cmd' : 'npm';
}

function packageFromCommand(installCmd) {
    // Legacy callers still pass `npm install -g <pkg>` strings — extract
    // the @scope/name so the local installer can reuse the same input.
    const match = String(installCmd).match(/@[^\s]+\/[^\s]+|[\w.-]+(?:@[\w.-]+)?$/);
    return match ? match[0] : installCmd;
}

export function createInstallJob({ provider, installCmd, packageName }) {
    const pkg = packageName || packageFromCommand(installCmd);
    const id = randomUUID();
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);

    const job = {
        id,
        provider,
        installCmd,
        package: pkg,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        error: null,
        logs: [],
        emitter,
        child: null,
        timer: null,
    };

    const appendLog = (stream, chunk) => {
        const entry = { stream, chunk, at: Date.now() };
        job.logs.push(entry);
        if (job.logs.length > 2000) {
            job.logs.splice(0, job.logs.length - 2000);
        }
        emitter.emit('log', entry);
    };

    try {
        ensureCliHome();
    } catch (err) {
        job.status = 'error';
        job.error = `Could not create ${CLI_HOME}: ${err?.message || err}`;
        job.finishedAt = new Date().toISOString();
        appendLog('stderr', job.error + '\n');
        emitter.emit('done', buildDonePayload(job));
        scheduleCleanup(job);
        jobs.set(id, job);
        return job;
    }

    appendLog('meta', `Installing ${pkg} into ${CLI_HOME}\n`);
    appendLog('meta', `(sandboxed — no sudo / admin required)\n`);

    const npmCmd = resolveNpmCommand();
    const useNodeRunner = npmCmd.endsWith('.js');

    const cmd = useNodeRunner ? process.execPath : npmCmd;
    const args = useNodeRunner
        ? [npmCmd, 'install', pkg, '--no-audit', '--no-fund', '--loglevel=http']
        : ['install', pkg, '--no-audit', '--no-fund', '--loglevel=http'];

    appendLog('meta', `$ ${cmd} ${args.join(' ')}\n`);

    let child;
    try {
        child = spawn(cmd, args, {
            cwd: CLI_HOME,
            env: { ...process.env, npm_config_yes: 'true' },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            // cross-spawn handles .cmd/.bat resolution itself — no shell
            // needed. Passing `shell: true` here would re-introduce the
            // space-in-path tokenisation bug that caused "'C:\Program' is
            // not recognized" on Windows installs of Node.
        });
    } catch (err) {
        const message = err?.message || String(err);
        console.error(`[install-job:${provider}:${id}] Spawn failed:`, message);
        job.status = 'error';
        job.error = `Failed to launch npm: ${message}`;
        job.finishedAt = new Date().toISOString();
        appendLog('stderr', job.error + '\n');
        emitter.emit('done', buildDonePayload(job));
        scheduleCleanup(job);
        jobs.set(id, job);
        return job;
    }

    job.child = child;
    child.stdout.on('data', (buf) => appendLog('stdout', buf.toString()));
    child.stderr.on('data', (buf) => appendLog('stderr', buf.toString()));

    child.on('error', (err) => {
        if (job.status !== 'running') return;
        job.status = 'error';
        job.error = `npm process error: ${err.message}`;
        job.finishedAt = new Date().toISOString();
        appendLog('stderr', job.error + '\n');
        emitter.emit('done', buildDonePayload(job));
        scheduleCleanup(job);
    });

    child.on('close', (code, signal) => {
        if (job.status !== 'running') return;
        job.exitCode = code ?? null;
        job.finishedAt = new Date().toISOString();

        if (code !== 0) {
            job.status = 'error';
            job.error = signal
                ? `Install killed by signal ${signal}`
                : `npm exited with code ${code}`;
            emitter.emit('done', buildDonePayload(job));
            scheduleCleanup(job);
            return;
        }

        // Verify the binary actually landed. If we don't check, a package
        // without a `bin` entry (or a half-extracted tarball) would still
        // read as "success" and the user would be confused when auth
        // status stays red.
        const binName = PACKAGE_BINARIES[pkg] || provider;
        const binaryPath = findInstalledBinary(binName);
        if (!binaryPath) {
            job.status = 'error';
            job.error = `npm exited cleanly but ${binName} was not found in ${CLI_BIN_DIR}`;
            appendLog('stderr', job.error + '\n');
            emitter.emit('done', buildDonePayload(job));
            scheduleCleanup(job);
            return;
        }

        // Make sure our live server process can resolve the new binary
        // from this moment on, without a restart. primeCliBinPath is
        // idempotent so re-calling after each install is cheap.
        primeCliBinPath();

        appendLog('meta', `✓ Installed ${binName} → ${binaryPath}\n`);
        job.status = 'done';
        job.binaryPath = binaryPath;
        emitter.emit('done', buildDonePayload(job));
        scheduleCleanup(job);
    });

    job.timer = setTimeout(() => {
        if (job.status !== 'running') return;
        try { child.kill('SIGKILL'); } catch { /* noop */ }
        job.status = 'error';
        job.error = 'Install timed out after 10 minutes';
        job.finishedAt = new Date().toISOString();
        appendLog('stderr', job.error + '\n');
        emitter.emit('done', buildDonePayload(job));
        scheduleCleanup(job);
    }, HARD_TIMEOUT_MS);

    jobs.set(id, job);
    return job;
}

function findInstalledBinary(name) {
    const isWindows = process.platform === 'win32';
    const candidates = isWindows
        ? [`${name}.cmd`, `${name}.exe`, name]
        : [name];
    for (const c of candidates) {
        const full = path.join(CLI_BIN_DIR, c);
        if (fs.existsSync(full)) return full;
    }
    return null;
}

function buildDonePayload(job) {
    if (job.status === 'done') {
        return {
            success: true,
            exitCode: job.exitCode,
            binaryPath: job.binaryPath,
            message: `${job.provider} installed. Refreshing auth status…`,
        };
    }
    return {
        success: false,
        exitCode: job.exitCode,
        error: job.error || 'Install failed',
    };
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

export function getInstallJob(id) {
    return jobs.get(id) || null;
}

export function cancelInstallJob(id) {
    const job = jobs.get(id);
    if (!job) return false;
    if (job.status !== 'running') return false;
    try { job.child?.kill(); } catch { /* noop */ }
    job.status = 'error';
    job.error = 'Install cancelled';
    job.finishedAt = new Date().toISOString();
    job.emitter.emit('done', buildDonePayload(job));
    scheduleCleanup(job);
    return true;
}

export function snapshotDonePayload(job) {
    return buildDonePayload(job);
}
