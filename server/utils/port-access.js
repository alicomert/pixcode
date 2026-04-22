import os from 'os';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

import { c } from './colors.js';

/**
 * Tracks inbound port access decisions across runs so the server doesn't
 * re-prompt the user (on Windows/macOS) every start, and can skip work on
 * Linux where a rule has already been applied.
 */
const STATE_FILE = path.join(os.homedir(), '.pixcode', 'port-access.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Persisting the decision is a nice-to-have; failure shouldn't block start.
  }
}

/** Return all non-loopback IPv4 addresses assigned to this host. */
export function getLanIps() {
  const ifs = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  return ips;
}

function askYN(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve(null); // headless / daemon context — skip
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(['y', 'yes', 'e', 'evet'].includes(normalized));
    });
  });
}

// ---------------- Linux ----------------

function tryUfw(port) {
  try {
    execSync('command -v ufw', { stdio: 'pipe' });
    const status = execSync('ufw status', { stdio: 'pipe', encoding: 'utf8' });
    // UFW inactive = no rule needed; the port is already reachable.
    if (!/active/i.test(status)) return 'inactive';
    execSync(`sudo -n ufw allow ${port}/tcp`, { stdio: 'pipe' });
    return 'applied';
  } catch {
    return null;
  }
}

function tryFirewalld(port) {
  try {
    execSync('command -v firewall-cmd', { stdio: 'pipe' });
    const state = execSync('firewall-cmd --state', { stdio: 'pipe', encoding: 'utf8' });
    if (!/running/i.test(state)) return 'inactive';
    execSync(`sudo -n firewall-cmd --add-port=${port}/tcp --permanent`, { stdio: 'pipe' });
    execSync('sudo -n firewall-cmd --reload', { stdio: 'pipe' });
    return 'applied';
  } catch {
    return null;
  }
}

// ---------------- Windows ----------------

function applyWindowsRule(port) {
  const ruleName = `Pixcode-${port}`;
  const cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    return { ok: true, cmd, ruleName };
  } catch (error) {
    return { ok: false, cmd, ruleName, error: error.message };
  }
}

// ---------------- macOS ----------------

function macFirewallHint(port) {
  return [
    `${c.tip('[TIP]')}  macOS Application Firewall is per-app, not per-port.`,
    '       If other devices can\'t connect, open:',
    '       System Settings > Network > Firewall > Options',
    `       and add Node.js to "Allow incoming connections" (port ${port}).`,
  ].join('\n');
}

// ---------------- Main entry ----------------

/**
 * Make sure inbound traffic can reach `port` from the local network.
 *
 * - Linux: silently try ufw/firewalld with `sudo -n` (passwordless). Skips
 *   cleanly when no firewall is running or sudo is gated — LAN access
 *   already works on most desktop distros.
 * - Windows/macOS: ask the user once; remember the decision in
 *   ~/.pixcode/port-access.json so subsequent starts stay quiet.
 *
 * All failure paths are non-fatal: the server is already listening when
 * we get here, and LAN clients on the same subnet often can reach it
 * without any firewall change.
 */
export async function ensurePortOpen(port) {
  const state = loadState();
  const key = `port:${port}`;
  const entry = state[key];

  const lanIps = getLanIps();
  if (lanIps.length) {
    console.log(`${c.info('[INFO]')} LAN access:  ${c.bright(`http://${lanIps[0]}:${port}`)}`);
    if (lanIps.length > 1) {
      for (const extra of lanIps.slice(1)) {
        console.log(`${c.dim('       also:')}  http://${extra}:${port}`);
      }
    }
  }

  if (entry && entry.decision === 'deny') {
    console.log(`${c.dim('[INFO]')} Firewall prompt suppressed (previously declined). Re-enable via ~/.pixcode/port-access.json`);
    return;
  }

  const platform = process.platform;

  if (platform === 'linux') {
    if (entry && entry.status === 'applied') return;
    const result = tryUfw(port) || tryFirewalld(port);
    if (result === 'applied') {
      console.log(`${c.ok('[OK]')}   Inbound firewall rule added for port ${port}.`);
      saveState({ ...state, [key]: { decision: 'allow', status: 'applied', via: 'linux' } });
    } else if (result === 'inactive') {
      console.log(`${c.dim('[INFO]')} No active firewall detected — port ${port} should be reachable.`);
    } else {
      console.log(`${c.tip('[TIP]')}  Couldn't auto-open port (no sudo / unsupported firewall).`);
      console.log(`       Manual: ${c.bright(`sudo ufw allow ${port}/tcp`)}  ${c.dim('(or firewall-cmd equivalent)')}`);
    }
    return;
  }

  if (platform === 'win32') {
    if (entry && entry.status === 'applied') return;
    const approved = await askYN(
      `${c.tip('[?]')}    Open port ${port} in Windows Firewall so other devices on your network can connect? [y/N] `,
    );
    if (approved === null) {
      // No TTY — just show the manual command and move on.
      console.log(
        `${c.tip('[TIP]')}  To allow LAN access, run this in an elevated PowerShell:\n       ${c.bright(
          `netsh advfirewall firewall add rule name="Pixcode-${port}" dir=in action=allow protocol=TCP localport=${port}`,
        )}`,
      );
      return;
    }
    if (!approved) {
      console.log(`${c.dim('[INFO]')} Skipping firewall change.`);
      saveState({ ...state, [key]: { decision: 'deny' } });
      return;
    }
    const result = applyWindowsRule(port);
    if (result.ok) {
      console.log(`${c.ok('[OK]')}   Firewall rule "${result.ruleName}" added.`);
      saveState({ ...state, [key]: { decision: 'allow', status: 'applied', via: 'windows' } });
    } else {
      console.log(`${c.tip('[TIP]')}  Adding the rule needs Administrator. Run this in an elevated PowerShell:`);
      console.log(`       ${c.bright(result.cmd)}`);
      saveState({ ...state, [key]: { decision: 'allow', status: 'manual' } });
    }
    return;
  }

  if (platform === 'darwin') {
    if (entry && entry.status) return;
    const approved = await askYN(
      `${c.tip('[?]')}    Allow inbound connections on port ${port} through macOS firewall? [y/N] `,
    );
    if (approved === null) return;
    if (!approved) {
      console.log(`${c.dim('[INFO]')} Skipping firewall hint.`);
      saveState({ ...state, [key]: { decision: 'deny' } });
      return;
    }
    console.log(macFirewallHint(port));
    saveState({ ...state, [key]: { decision: 'allow', status: 'manual', via: 'macos' } });
  }
}
