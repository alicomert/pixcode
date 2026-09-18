/**
 * Public-link ("share") providers — expose the daemon on a public HTTPS URL.
 *
 * State lives in $PIXCODE_HOME/share.json. The tunnel process is spawned
 * detached so it survives daemon restarts; the pid in the state file is the
 * single source of truth for "is it running".
 */
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';


const log = (msg) => console.log(`[share] ${msg}`);

const stateFile = () => path.join(config.dataDir, 'share.json');
const binDir = () => path.join(config.dataDir, 'bin');
const keyFile = () => path.join(config.dataDir, 'share-key');
const tunnelLog = () => path.join(config.dataDir, 'share.log');
const openLog = () => path.join(config.dataDir, 'bore-open.log');
const openersDir = () => path.join(config.dataDir, 'openers');

function readState() {
    try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}

function writeState(state) {
    if (state === null) { try { fs.unlinkSync(stateFile()); } catch { /* gone */ } return; }
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(stateFile(), JSON.stringify(state), { mode: 0o600 });
}

const pidAlive = (pid) => {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
};

const TARGETS = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const plat = TARGETS[process.platform] || 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const exeExt = process.platform === 'win32' ? '.exe' : '';

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const get = (u, redirects) => {
            https.get(u, { timeout: 30000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
                    res.resume(); get(res.headers.location, redirects + 1); return;
                }
                if (res.statusCode !== 200) { res.resume(); file.destroy(); fs.rmSync(dest, { force: true }); reject(new Error(`download ${u} → HTTP ${res.statusCode}`)); return; }
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', (e) => { file.destroy(); fs.rmSync(dest, { force: true }); reject(e); });
        };
        get(url, 0);
    });
}

async function ensureBinary(name, url) {
    const dest = path.join(binDir(), name + exeExt);
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(binDir(), { recursive: true, mode: 0o700 });
        log(`downloading ${name} from ${url}`);
        await download(url, dest);
        fs.chmodSync(dest, 0o755);
    }
    return dest;
}

async function ensureBinaryTgz(name, url, member) {
    const dest = path.join(binDir(), name + exeExt);
    if (!fs.existsSync(dest)) {
        const tgz = dest + '.tgz';
        log(`downloading ${name} from ${url}`);
        await download(url, tgz);
        fs.mkdirSync(binDir(), { recursive: true, mode: 0o700 });
        execFileSync('tar', ['-xzf', tgz, '-C', binDir(), member]);
        fs.rmSync(tgz, { force: true });
        fs.chmodSync(dest, 0o755);
    }
    return dest;
}

/** Persistent ed25519 keypair used as the share identity (e.g. for sish relays). */
function ensureKey() {
    if (!fs.existsSync(keyFile())) {
        execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyFile(), '-q']);
        fs.chmodSync(keyFile(), 0o600);
    }
    return keyFile();
}

function keyFingerprint() {
    try {
        const pub = fs.readFileSync(keyFile() + '.pub', 'utf8').split(' ')[1];
        return crypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 8);
    } catch { return null; }
}

/**
 * Provider contract:
 *   label   — display name
 *   fixed   — true when the URL can be made stable across restarts
 *   fields  — [{key,label,required,secret,placeholder,default}]
 *   build(opts, ctx) → {cmd, args, urlRe} | {cmd, args, url} | Promise<…>
 *     urlRe — regex matched against combined stdout+stderr, capture group or
 *             whole match is the public URL; url — URL known upfront.
 */
const PROVIDERS = {
    cloudflared: {
        label: 'Cloudflare quick tunnel',
        fixed: false,
        account: 'none',
        fields: [],
        async build(_opts, { port }) {
            const bin = await ensureBinary('cloudflared',
                `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${plat}-${arch}${exeExt}`);
            return {
                cmd: bin,
                args: ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
                urlRe: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
            };
        },
    },
    sish: {
        label: 'sish (own SSH relay)',
        fixed: true,
        account: 'own',
        fields: [
            { key: 'host', label: 'Relay host', required: true, placeholder: 'tun.example.com' },
            { key: 'port', label: 'SSH port', default: '2222' },
            { key: 'domain', label: 'Public domain', placeholder: 'defaults to host' },
            { key: 'name', label: 'Subdomain', placeholder: 'empty = px-<key hash>' },
        ],
        async build(opts, { port }) {
            if (!opts.host) throw new Error('sish requires a relay host');
            const key = ensureKey();
            const name = (opts.name || `px-${keyFingerprint()}`).toLowerCase().replace(/[^a-z0-9-]/g, '');
            const domain = opts.domain || opts.host;
            return {
                cmd: 'ssh',
                args: [
                    '-N', '-T', '-o', 'BatchMode=yes',
                    '-o', 'StrictHostKeyChecking=accept-new',
                    '-o', 'ServerAliveInterval=30',
                    '-o', 'ExitOnForwardFailure=yes',
                    '-i', key, '-p', String(opts.port || 2222),
                    '-R', `${name}:80:127.0.0.1:${port}`,
                    opts.host,
                ],
                url: `https://${name}.${domain}`,
            };
        },
    },
    ngrok: {
        label: 'ngrok',
        fixed: true,
        account: 'free',
        fields: [
            { key: 'authtoken', label: 'Authtoken', required: true, secret: true },
            { key: 'domain', label: 'Dev domain', placeholder: 'xxx.ngrok-free.app (empty = random)' },
        ],
        async build(opts, { port }) {
            if (!opts.authtoken) throw new Error('ngrok requires an authtoken');
            const bin = await ensureBinaryTgz('ngrok',
                `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-${plat}-${arch}.tgz`, 'ngrok');
            const args = ['http', String(port), '--authtoken', opts.authtoken, '--log=stdout', '--log-format=json'];
            if (opts.domain) args.push(`--url=https://${opts.domain}`);
            return { cmd: bin, args, urlRe: /"url":\s*"(https:\/\/[^"]+)"/ };
        },
    },
    zrok: {
        label: 'zrok',
        fixed: true,
        account: 'free',
        fields: [
            { key: 'token', label: 'Enable token', required: true, secret: true, placeholder: 'from zrok invite' },
            { key: 'name', label: 'Reserved name', placeholder: 'empty = random' },
        ],
        async build(opts, { port }) {
            if (!opts.token) throw new Error('zrok requires an enable token');
            const bin = await ensureBinaryTgz('zrok',
                `https://github.com/openziti/zrok/releases/latest/download/zrok_${plat}_${arch}.tar.gz`, './zrok');
            try { execFileSync(bin, ['enable', opts.token], { stdio: 'pipe', timeout: 30000 }); } catch { /* already enabled */ }
            const args = ['share', 'public', '--headless', `http://127.0.0.1:${port}`];
            if (opts.name) args.push('--unique-name', opts.name);
            return { cmd: bin, args, urlRe: /https:\/\/[\w.-]+\.share\.zrok\.io/ };
        },
    },
    bore: {
        label: 'bore.dk',
        fixed: true,
        account: 'free',
        fields: [
            { key: 'name', label: 'Namespace', placeholder: 'empty = account default' },
        ],
        async build(opts, { port }) {
            const bin = await ensureBinary('bore',
                `https://bore.dk/downloads/latest/bore-${plat}-${arch}${exeExt}`);
            if (!boreSignedIn()) throw new Error('bore.dk sign-in required first');
            const args = ['up', String(port)];
            if (opts.name) args.push('--namespace', opts.name);
            return { cmd: bin, args, urlRe: /https:\/\/[\w.-]+\.bore\.dk/ };
        },
    },
};

export function shareProviders() {
    return Object.entries(PROVIDERS).map(([id, p]) => ({
        id, label: p.label, fixed: p.fixed, account: p.account || 'none', fields: p.fields,
    }));
}

export function shareStatus() {
    const st = readState();
    const running = !!(st && pidAlive(st.pid));
    return {
        enabled: !!st,
        running,
        provider: st?.provider || null,
        url: running ? st?.url || null : null,
        pid: running ? st.pid : null,
        pubkey: fs.existsSync(keyFile() + '.pub') ? fs.readFileSync(keyFile() + '.pub', 'utf8').trim() : null,
    };
}

const fullOptsFile = () => path.join(config.dataDir, 'share-opts.json');

export async function shareEnable(provider, opts = {}, { port = config.port } = {}) {
    const p = PROVIDERS[provider];
    if (!p) throw new Error(`unknown share provider "${provider}"`);
    shareDisableInternal();
    const spec = await p.build(opts, { port });
    // Tunnel output goes to a log file: the detached process keeps running
    // without pipe buffers to drain, and dead tunnels stay diagnosable.
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(tunnelLog(), `\n--- ${new Date().toISOString()} ${provider} start ---\n`);
    const child = spawn(spec.cmd, spec.args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.pipe(fs.createWriteStream(tunnelLog(), { flags: 'a' }));
    child.stderr?.pipe(fs.createWriteStream(tunnelLog(), { flags: 'a' }));
    const url = spec.url || await waitForUrl(child, spec.urlRe, 25000);
    child.unref();
    // display-safe state (secrets masked) + 0600 sidecar so resume works unattended
    fs.writeFileSync(fullOptsFile(), JSON.stringify(opts), { mode: 0o600 });
    const st = { enabled: true, provider, opts: stripSecrets(opts, p), url, pid: child.pid, startedAt: Date.now() };
    writeState(st);
    log(`share enabled via ${provider} → ${url} (pid ${child.pid})`);
    return { ...st, running: true };
}

function readFullOpts() {
    try { return JSON.parse(fs.readFileSync(fullOptsFile(), 'utf8')); } catch { return {}; }
}

const stripSecrets = (opts, p) => {
    const secretKeys = p.fields.filter((f) => f.secret).map((f) => f.key);
    const out = { ...opts };
    for (const k of secretKeys) if (out[k]) out[k] = '***';
    return out;
};

function waitForUrl(child, urlRe, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buf = '';
        const onData = (d) => {
            buf += d.toString();
            const m = buf.match(urlRe);
            if (m) { cleanup(); resolve(m[1] || m[0]); }
            else if (buf.length > 65536) { cleanup(); reject(new Error('provider produced no public URL')); }
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error(`timed out waiting for tunnel URL; output: ${buf.slice(-400)}`)); }, timeoutMs);
        const cleanup = () => { clearTimeout(timer); child.stdout?.off('data', onData); child.stderr?.off('data', onData); child.off('exit', onExit); child.off('error', onExit); };
        const onExit = (e) => { cleanup(); reject(new Error(`tunnel process exited (${e?.code ?? e}); output: ${buf.slice(-400)}`)); };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', onExit);
        child.on('error', onExit);
    });
}

function shareDisableInternal() {
    const st = readState();
    if (st?.pid && pidAlive(st.pid)) {
        try { process.kill(-st.pid, 'SIGTERM'); } catch { try { process.kill(st.pid, 'SIGTERM'); } catch { /* gone */ } }
    }
}

export function shareDisable() {
    shareDisableInternal();
    writeState(null);
    try { fs.unlinkSync(fullOptsFile()); } catch { /* gone */ }
    return { enabled: false, running: false };
}

/** Called on server start: re-attach or respawn a previously enabled tunnel. */
export async function shareResume({ port = config.port } = {}) {
    const st = readState();
    if (!st?.enabled) return;
    if (pidAlive(st.pid)) { log(`share already running (pid ${st.pid})`); return; }
    try {
        await shareEnable(st.provider, readFullOpts(), { port });
    } catch (e) { log(`share resume failed: ${e.message}`); }
}

/**
 * Watchdog for the detached tunnel process. A pid check alone misses the
 * classic quick-tunnel failure (cloudflared still alive but the edge reports
 * 1033), so every few ticks the public URL itself is probed; two consecutive
 * failures respawn the tunnel.
 */
let superviseTimer = null;
export function shareSupervise({ port = config.port } = {}) {
    if (superviseTimer) return;
    let unhealthyStreak = 0;
    let tick = 0;
    superviseTimer = setInterval(async () => {
        const st = readState();
        if (!st?.enabled) { unhealthyStreak = 0; return; }
        if (!pidAlive(st.pid)) {
            log('tunnel process died — respawning');
            try { await shareEnable(st.provider, readFullOpts(), { port }); } catch (e) { log(`respawn failed: ${e.message}`); }
            unhealthyStreak = 0;
            return;
        }
        if (++tick % 3 !== 0 || !st.url) return; // probe every ~2 min
        const healthy = await shareProbe().catch(() => ({ healthy: false }));
        if (healthy.healthy) { unhealthyStreak = 0; return; }
        if (++unhealthyStreak >= 2) {
            log('tunnel alive but unreachable — restarting');
            unhealthyStreak = 0;
            try { await shareEnable(st.provider, readFullOpts(), { port }); } catch (e) { log(`restart failed: ${e.message}`); }
        }
    }, 45_000);
    superviseTimer.unref?.();
}

/** Live check: does the public URL actually answer right now? */
export function shareProbe() {
    const st = readState();
    if (!st?.url) return Promise.resolve({ healthy: false, reason: 'no-url' });
    return new Promise((resolve) => {
        const req = https.get(`${st.url}/api/health`, {
            timeout: 8000,
            headers: { 'ngrok-skip-browser-warning': '1', 'user-agent': 'pixcode-share-probe' },
        }, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
            res.on('end', () => resolve({ healthy: res.statusCode === 200 && body.includes('"pixcode"'), http: res.statusCode }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ healthy: false, reason: 'timeout' }); });
        req.on('error', (e) => resolve({ healthy: false, reason: e.code || e.message }));
    });
}

/* ---------------- bore.dk sign-in ----------------
 * `bore login` opens the auth URL through the OS browser — useless on a
 * headless daemon. We shadow `xdg-open`/`open`/`$BROWSER` with a shim that
 * logs the URL instead, rewrite its 127.0.0.1 callback to this Pixcode
 * origin, and hand the link to the admin. After bore.dk sign-in the browser
 * lands back on /api/share/bore/callback, which we proxy to the local
 * listener — so sign-in works from any device, including a phone.
 */
const boreConfigFile = () => path.join(os.homedir(), '.bore', 'config.json');
let pendingBore = null;

export function boreSignedIn() {
    try {
        const cfg = JSON.parse(fs.readFileSync(boreConfigFile(), 'utf8'));
        return !!(cfg.session || cfg.token || cfg.accessToken || cfg.authToken || cfg.credentials);
    } catch { return false; }
}

export function boreStatus() {
    return { signedIn: boreSignedIn(), pending: !!pendingBore };
}

function ensureOpeners() {
    const dir = openersDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const script = `#!/bin/sh\nfor a in "$@"; do echo "$a" >> '${openLog()}'; done\n`;
    for (const name of ['xdg-open', 'open', 'sensible-browser', 'x-www-browser', 'www-browser']) {
        fs.writeFileSync(path.join(dir, name), script, { mode: 0o755 });
    }
    return dir;
}

export async function boreLogin(origin) {
    if (boreSignedIn()) { pendingBore = null; return { signedIn: true }; }
    const bin = await ensureBinary('bore',
        `https://bore.dk/downloads/latest/bore-${plat}-${arch}${exeExt}`);
    const openers = ensureOpeners();
    fs.writeFileSync(openLog(), '', { mode: 0o600 });
    const child = spawn(bin, ['login'], {
        detached: true,
        stdio: ['ignore', fs.openSync(tunnelLog(), 'a'), fs.openSync(tunnelLog(), 'a')],
        env: { ...process.env, PATH: `${openers}:${process.env.PATH || ''}`, BROWSER: path.join(openers, 'open') },
    });
    child.unref();
    pendingBore = { pid: child.pid, cbPort: null, at: Date.now() };
    // The login helper exits once auth completes; give the shim time to log the URL.
    const authUrl = await waitForOpenUrl(12000);
    if (!authUrl) { killPending(); throw new Error('bore did not produce a sign-in URL'); }
    const cbPort = Number(decodeURIComponent(authUrl.match(/callback=([^&]+)/)?.[1] || '').match(/127\.0\.0\.1:(\d+)/)?.[1]);
    if (!cbPort) { killPending(); throw new Error('could not parse bore callback address'); }
    pendingBore.cbPort = cbPort;
    // Expire the pending login if nobody finishes it.
    const pending = pendingBore;
    setTimeout(() => { if (pendingBore === pending) killPending(); }, 5 * 60_000).unref?.();
    const base = (origin || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
    return { signedIn: false, authUrl: authUrl.replace(/callback=[^&]+/, `callback=${encodeURIComponent(`${base}/api/share/bore/callback`)}`) };
}

function killPending() {
    if (pendingBore?.pid && pidAlive(pendingBore.pid)) {
        try { process.kill(-pendingBore.pid, 'SIGTERM'); } catch { try { process.kill(pendingBore.pid, 'SIGTERM'); } catch { /* gone */ } }
    }
    pendingBore = null;
}

function waitForOpenUrl(timeoutMs) {
    const started = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            try {
                const match = fs.readFileSync(openLog(), 'utf8').match(/https:\/\/\S+/);
                if (match) { resolve(match[0]); return; }
            } catch { /* not yet */ }
            if (Date.now() - started > timeoutMs) { resolve(null); return; }
            setTimeout(check, 250).unref?.();
        };
        check();
    });
}

/** Public route: forward the bore.dk post-login redirect to the local listener. */
export function shareRoutes(router) {
    router.get('/api/share/bore/callback', (req, res) => {
        const cbPort = pendingBore?.cbPort;
        if (!cbPort) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('no bore sign-in in progress'); return; }
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const proxy = http.get({ host: '127.0.0.1', port: cbPort, path: `/callback${query}`, timeout: 8000 }, (up) => {
            res.writeHead(up.statusCode || 200, { 'content-type': up.headers['content-type'] || 'text/html' });
            up.pipe(res);
        });
        proxy.on('timeout', () => { proxy.destroy(); res.writeHead(502); res.end('bore callback timed out'); });
        proxy.on('error', () => { res.writeHead(502); res.end('bore callback unreachable'); });
    }, { auth: false });
}
