import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);

// nat-upnp is CommonJS and callback-based. We wrap it in promises and keep
// one shared client per process. The client is lazily created so importing
// this module does not try to bind SSDP sockets at boot.
let upnpClient = null;
const getUpnpClient = () => {
  if (!upnpClient) {
    const nat = requireCjs('nat-upnp');
    upnpClient = nat.createClient();
  }
  return upnpClient;
};

let upnpState = {
  mapped: false,
  port: null,
  externalIp: null,
  externalUrl: null,
  error: null,
};

// A UPnP mapping request can hang forever if the router never answers SSDP.
// Cap every call so the HTTP endpoint doesn't dangle — we surface a clean
// failure and the user can try tunnel mode instead.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

const promisifyUpnp = (method, arg) =>
  new Promise((resolve, reject) => {
    const client = getUpnpClient();
    const cb = (err, result) => (err ? reject(err) : resolve(result));
    if (arg === undefined) {
      client[method](cb);
    } else {
      client[method](arg, cb);
    }
  });

export const enableUpnp = async ({ port }) => {
  upnpState = { ...upnpState, error: null };
  try {
    await withTimeout(
      promisifyUpnp('portMapping', {
        public: port,
        private: port,
        // ttl:0 is documented as "never expire" — routers honor it differently,
        // but it's the least surprising default. We leave renewal to the user
        // clicking "enable" again if the router drops the lease.
        ttl: 0,
        description: 'Pixcode',
        protocol: 'tcp',
      }),
      8000,
      'UPnP portMapping',
    );
    const externalIp = await withTimeout(promisifyUpnp('externalIp'), 5000, 'UPnP externalIp');
    upnpState = {
      mapped: true,
      port,
      externalIp,
      externalUrl: externalIp ? `http://${externalIp}:${port}` : null,
      error: null,
    };
    return upnpState;
  } catch (err) {
    upnpState = {
      mapped: false,
      port,
      externalIp: null,
      externalUrl: null,
      error: err?.message || String(err),
    };
    throw err;
  }
};

export const disableUpnp = async ({ port }) => {
  try {
    await withTimeout(promisifyUpnp('portUnmapping', { public: port, protocol: 'tcp' }), 5000, 'UPnP portUnmapping');
  } catch (err) {
    upnpState = { ...upnpState, error: err?.message || String(err) };
    throw err;
  }
  upnpState = { mapped: false, port: null, externalIp: null, externalUrl: null, error: null };
  return upnpState;
};

export const getUpnpState = () => upnpState;

// ============================================================================
// Tunnel: detect cloudflared / ngrok and spawn; extract the public URL from
// stdout. We keep a single live tunnel per process — starting a new one
// stops the previous one to avoid dangling child processes.
// ============================================================================

let tunnelProc = null;
let tunnelState = {
  running: false,
  binary: null, // 'cloudflared' | 'ngrok'
  url: null,
  error: null,
  log: [],
};

const appendLog = (line) => {
  // Tunnels can be noisy. Cap the tail we retain so a long-running tunnel
  // doesn't grow the log into an OOM risk.
  tunnelState.log.push(line);
  if (tunnelState.log.length > 200) tunnelState.log.shift();
};

const detectBinary = async () => {
  const candidates = ['cloudflared', 'ngrok'];
  for (const name of candidates) {
    try {
      // `which` isn't guaranteed on Windows; we probe with `--version` instead
      // so the same code path works on Unix and Windows Command Prompt.
      await new Promise((resolve, reject) => {
        const child = spawn(name, ['--version'], { stdio: 'ignore' });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });
      return name;
    } catch {
      // try next
    }
  }
  return null;
};

const cloudflareUrlRegex = /https?:\/\/[a-z0-9.-]+trycloudflare\.com/i;
const ngrokUrlRegex = /https?:\/\/[a-z0-9.-]+\.ngrok(-free)?\.(app|io)/i;

const buildTunnelArgs = (binary, port) => {
  if (binary === 'cloudflared') return ['tunnel', '--url', `http://localhost:${port}`];
  if (binary === 'ngrok') return ['http', String(port), '--log', 'stdout', '--log-format', 'logfmt'];
  throw new Error(`Unsupported tunnel binary: ${binary}`);
};

const extractUrl = (binary, text) => {
  if (binary === 'cloudflared') return text.match(cloudflareUrlRegex)?.[0] ?? null;
  if (binary === 'ngrok') return text.match(ngrokUrlRegex)?.[0] ?? null;
  return null;
};

export const startTunnel = async ({ port }) => {
  if (tunnelProc) {
    // Already running — tell the caller to stop it first rather than silently
    // replacing, which would orphan the old child and lie about state.
    throw new Error('Tunnel already running; stop it first');
  }

  const binary = await detectBinary();
  if (!binary) {
    tunnelState = { running: false, binary: null, url: null, error: 'No tunnel binary found', log: [] };
    const err = new Error('No tunnel binary found (tried cloudflared, ngrok)');
    err.code = 'ENOENT_TUNNEL';
    throw err;
  }

  const args = buildTunnelArgs(binary, port);
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelProc = child;
  tunnelState = { running: true, binary, url: null, error: null, log: [] };

  const handleChunk = (chunk) => {
    const text = chunk.toString();
    text.split(/\r?\n/).filter(Boolean).forEach(appendLog);
    if (!tunnelState.url) {
      const url = extractUrl(binary, text);
      if (url) tunnelState.url = url;
    }
  };

  child.stdout.on('data', handleChunk);
  child.stderr.on('data', handleChunk);
  child.on('exit', (code) => {
    tunnelProc = null;
    tunnelState = {
      running: false,
      binary,
      url: null,
      error: code === 0 ? null : `Tunnel exited with code ${code}`,
      log: tunnelState.log,
    };
  });

  // Wait up to 15s for the public URL to appear in the log. We don't block
  // indefinitely — if the binary is hanging on login/auth, the UI should see
  // a clear failure instead of a spinner that never resolves.
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (tunnelState.url) return tunnelState;
    if (!tunnelProc) break; // process died early
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!tunnelState.url) {
    // If we never captured a URL, kill the child so we don't leak it.
    try { child.kill(); } catch { /* ignore */ }
    tunnelProc = null;
    tunnelState = { ...tunnelState, running: false, error: 'Tunnel did not report a public URL' };
    throw new Error(tunnelState.error);
  }

  return tunnelState;
};

export const stopTunnel = async () => {
  if (!tunnelProc) {
    tunnelState = { running: false, binary: null, url: null, error: null, log: [] };
    return tunnelState;
  }
  try {
    tunnelProc.kill();
  } catch {
    // already dead
  }
  tunnelProc = null;
  tunnelState = { running: false, binary: null, url: null, error: null, log: [] };
  return tunnelState;
};

export const getTunnelState = () => tunnelState;

// Explicit cleanup so the server process can shut down without leaking the
// child tunnel process.
process.on('exit', () => {
  if (tunnelProc) {
    try { tunnelProc.kill(); } catch { /* ignore */ }
  }
});
