import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

export const TUNNEL_PERSISTENCE_PATH = process.env.PIXCODE_TUNNEL_STATE_PATH
  || path.join(os.homedir(), '.pixcode', 'external-access.json');

let tunnelProc = null;
let suppressNextTunnelRestore = false;
let restoreTimer = null;
let restoreInFlight = null;
let tunnelState = {
  running: false,
  binary: null, // 'cloudflared' | 'ngrok'
  provider: null, // 'cloudflare' | 'ngrok'
  url: null,
  error: null,
  installHint: null,
  desired: false,
  restoring: false,
  log: [],
};

const DEFAULT_TUNNEL_PREFERENCE = Object.freeze({
  desired: false,
  port: null,
  provider: 'cloudflare',
  lastUrl: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  updatedAt: null,
});

const readTunnelPreference = async () => {
  try {
    const raw = await fs.readFile(TUNNEL_PERSISTENCE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_TUNNEL_PREFERENCE,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[external-access] Failed to read tunnel preference:', error?.message || error);
    }
    return { ...DEFAULT_TUNNEL_PREFERENCE };
  }
};

export const persistTunnelPreference = async (patch) => {
  const current = await readTunnelPreference();
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(TUNNEL_PERSISTENCE_PATH), { recursive: true });
  await fs.writeFile(TUNNEL_PERSISTENCE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
};

const appendLog = (line) => {
  // Tunnels can be noisy. Cap the tail we retain so a long-running tunnel
  // doesn't grow the log into an OOM risk.
  tunnelState.log.push(line);
  if (tunnelState.log.length > 200) tunnelState.log.shift();
};

const normalizeTunnelProvider = (provider) => (provider === 'ngrok' ? 'ngrok' : 'cloudflare');

const tunnelProviderBinary = (provider) => (normalizeTunnelProvider(provider) === 'ngrok' ? 'ngrok' : 'cloudflared');

const tunnelBinaryProvider = (binary) => (binary === 'ngrok' ? 'ngrok' : 'cloudflare');

const detectBinary = async (provider = null) => {
  const candidates = provider ? [tunnelProviderBinary(provider)] : ['cloudflared', 'ngrok'];
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

const createTunnelInstallHint = (provider = 'cloudflare') => {
  if (normalizeTunnelProvider(provider) === 'ngrok') {
    return {
      title: 'ngrok binary required',
      message: 'Install and authenticate ngrok to create a public mobile URL. Local LAN QR codes still work on the same Wi-Fi/network.',
      commands: [
        'macOS: brew install ngrok/ngrok/ngrok',
        'Windows: winget install ngrok.ngrok',
        'Linux: install ngrok from https://ngrok.com/download',
      ],
      docsUrl: 'https://ngrok.com/download',
    };
  }

  return {
    title: 'Cloudflare Tunnel binary required',
    message: 'Install cloudflared to create a public Cloudflare URL. Local LAN QR codes still work on the same Wi-Fi/network.',
    commands: [
      'macOS: brew install cloudflared',
      'Windows: winget install Cloudflare.cloudflared',
      'Linux: install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    ],
    docsUrl: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  };
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

export const startTunnel = async ({ port, provider: requestedProvider = 'cloudflare', persistPreference = false, restoring = false } = {}) => {
  const provider = normalizeTunnelProvider(requestedProvider);
  if (tunnelProc) {
    if (persistPreference) {
      await persistTunnelPreference({
        desired: true,
        port,
        provider: tunnelState.provider || tunnelBinaryProvider(tunnelState.binary),
        lastUrl: tunnelState.url,
      });
      tunnelState = { ...tunnelState, desired: true, restoring: false };
    }
    return tunnelState;
  }
  suppressNextTunnelRestore = false;

  const binary = await detectBinary(provider);
  if (!binary) {
    const installHint = createTunnelInstallHint(provider);
    tunnelState = {
      running: false,
      binary: null,
      provider,
      url: null,
      error: provider === 'cloudflare' ? 'cloudflared was not found' : 'ngrok was not found',
      installHint,
      desired: Boolean(persistPreference || restoring),
      restoring,
      log: [],
    };
    const err = new Error(tunnelState.error);
    err.code = 'ENOENT_TUNNEL';
    err.installHint = installHint;
    throw err;
  }

  const args = buildTunnelArgs(binary, port);
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelProc = child;
  tunnelState = {
    running: true,
    binary,
    provider,
    url: null,
    error: null,
    installHint: null,
    desired: Boolean(persistPreference || restoring),
    restoring,
    log: [],
  };

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
      provider,
      url: null,
      error: code === 0 ? null : `Tunnel exited with code ${code}`,
      installHint: null,
      desired: tunnelState.desired,
      restoring: false,
      log: tunnelState.log,
    };

    if (suppressNextTunnelRestore) {
      suppressNextTunnelRestore = false;
      return;
    }

    void readTunnelPreference().then((preference) => {
      if (!preference.desired) return;
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
        restoreRequestedTunnel({ port: Number(preference.port || port) || port }).catch((error) => {
          console.warn('[external-access] Tunnel restore failed after exit:', error?.message || error);
        });
      }, 3000);
    });
  });

  // Wait up to 15s for the public URL to appear in the log. We don't block
  // indefinitely — if the binary is hanging on login/auth, the UI should see
  // a clear failure instead of a spinner that never resolves.
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (tunnelState.url) {
      if (persistPreference || restoring) {
        await persistTunnelPreference({
          desired: true,
          port,
          provider,
          lastUrl: tunnelState.url,
          lastStartedAt: new Date().toISOString(),
        });
        tunnelState = { ...tunnelState, desired: true, restoring: false };
      }
      return tunnelState;
    }
    if (!tunnelProc) break; // process died early
     
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!tunnelState.url) {
    // If we never captured a URL, kill the child so we don't leak it.
    suppressNextTunnelRestore = true;
    try { child.kill(); } catch { /* ignore */ }
    tunnelProc = null;
    tunnelState = { ...tunnelState, running: false, error: 'Tunnel did not report a public URL', installHint: null, restoring: false };
    throw new Error(tunnelState.error);
  }

  return tunnelState;
};

export const stopTunnel = async ({ persistPreference = true } = {}) => {
  suppressNextTunnelRestore = Boolean(tunnelProc);
  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
  if (persistPreference) {
    await persistTunnelPreference({
      desired: false,
      lastStoppedAt: new Date().toISOString(),
    });
  }
  if (!tunnelProc) {
    suppressNextTunnelRestore = false;
    tunnelState = {
      running: false,
      binary: null,
      provider: null,
      url: null,
      error: null,
      installHint: null,
      desired: false,
      restoring: false,
      log: [],
    };
    return tunnelState;
  }
  try {
    tunnelProc.kill();
  } catch {
    // already dead
  }
  tunnelProc = null;
  tunnelState = {
    running: false,
    binary: null,
    provider: null,
    url: null,
    error: null,
    installHint: null,
    desired: false,
    restoring: false,
    log: [],
  };
  return tunnelState;
};

export const restoreRequestedTunnel = async ({ port } = {}) => {
  if (restoreInFlight) return restoreInFlight;

  restoreInFlight = (async () => {
    const preference = await readTunnelPreference();
    if (!preference.desired) {
      tunnelState = { ...tunnelState, desired: false, restoring: false };
      return tunnelState;
    }
    if (tunnelProc) {
      tunnelState = { ...tunnelState, desired: true, restoring: false };
      return tunnelState;
    }

    const restorePort = Number(port || preference.port);
    if (!Number.isFinite(restorePort) || restorePort <= 0) {
      tunnelState = {
        ...tunnelState,
        running: false,
        desired: true,
        restoring: false,
        error: 'Tunnel restore skipped: no valid server port',
      };
      return tunnelState;
    }

    try {
      return await startTunnel({
        port: restorePort,
        provider: preference.provider || 'cloudflare',
        persistPreference: true,
        restoring: true,
      });
    } catch (error) {
      tunnelState = {
        ...tunnelState,
        running: false,
        desired: true,
        restoring: false,
        error: `Tunnel restore failed: ${error?.message || error}`,
        installHint: error?.installHint || tunnelState.installHint || null,
      };
      return tunnelState;
    }
  })();

  try {
    return await restoreInFlight;
  } finally {
    restoreInFlight = null;
  }
};

export const getTunnelState = () => tunnelState;

// Explicit cleanup so the server process can shut down without leaking the
// child tunnel process.
process.on('exit', () => {
  if (tunnelProc) {
    try { tunnelProc.kill(); } catch { /* ignore */ }
  }
});
