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
import https from 'node:https';
import path from 'node:path';
import { config } from './config.js';


const log = (msg) => console.log(`[share] ${msg}`);

const stateFile = () => path.join(config.dataDir, 'share.json');
const binDir = () => path.join(config.dataDir, 'bin');
const keyFile = () => path.join(config.dataDir, 'share-key');

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
        fields: [
            { key: 'name', label: 'Namespace', placeholder: 'empty = account default' },
        ],
        async build(opts, { port }) {
            const bin = await ensureBinary('bore',
                `https://bore.dk/downloads/latest/bore-${plat}-${arch}${exeExt}`);
            const args = ['up', String(port)];
            if (opts.name) args.push('--namespace', opts.name);
            return { cmd: bin, args, urlRe: /https:\/\/[\w.-]+\.bore\.dk/ };
        },
    },
};

export function shareProviders() {
    return Object.entries(PROVIDERS).map(([id, p]) => ({
        id, label: p.label, fixed: p.fixed, fields: p.fields,
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
    const child = spawn(spec.cmd, spec.args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = spec.url || await waitForUrl(child, spec.urlRe, 25000);
    child.unref();
    child.stdout?.destroy(); child.stderr?.destroy();
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
