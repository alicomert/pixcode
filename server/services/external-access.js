import { spawn } from 'node:child_process';

/**
 * External-access service.
 *
 * Previously exposed a UPnP auto-port-forward path via `nat-upnp`, but that
 * package pulled in the deprecated `request` / `har-validator` / `uuid@3`
 * chain (noise at every install). Cloudflared and ngrok cover the same
 * "publish my laptop to the internet" use case with a better security
 * posture (no permanent port in the router firewall), so we kept the
 * tunnel flow and dropped UPnP entirely. If UPnP becomes a user-demanded
 * feature again we can bring it back via a maintained package like
 * `@achingbrain/nat-port-mapper`.
 */

// Keep the UPnP getter + no-op togglers so callers still compile, but they
// always report "unavailable". This is transitional — the routes layer no
// longer surfaces them either, so nothing in the live codebase hits these.
const UPNP_UNAVAILABLE = Object.freeze({
  mapped: false,
  port: null,
  externalIp: null,
  externalUrl: null,
  error: 'UPnP auto-port-forward was removed in v1.32. Use cloudflared or ngrok tunnels instead.',
});
export const getUpnpState = () => UPNP_UNAVAILABLE;

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
