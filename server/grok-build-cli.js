/**
 * Grok Build (xAI) CLI adapter for Pixcode / NanoClaw multi-runner.
 * Docs: https://github.com/xai-org/grok-build  ·  https://docs.x.ai/build/overview
 * Install: curl -fsSL https://x.ai/cli/install.sh | bash
 * Binary: `grok` (or `xai-grok-pager`)
 */
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

import crossSpawn from 'cross-spawn';

import { createNormalizedMessage } from './shared/utils.js';

const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;
const active = new Map();

function resolveGrokBinary() {
  return process.env.PIXCODE_GROK_BIN
    || process.env.GROK_BIN
    || 'grok';
}

/**
 * Headless / non-interactive prompt to Grok Build when possible.
 * Falls back to a clear install message if binary missing.
 */
export async function spawnGrok(command, options = {}, writer) {
  const workingDir = (options.cwd || options.projectPath || process.cwd())
    .replace(/[^\x20-\x7E]/g, '')
    .trim() || process.cwd();
  const bin = resolveGrokBinary();
  // Prefer headless/print style flags used by agent CLIs; grok may use different flags.
  // Documented headless: see docs.x.ai/build — try common patterns.
  const args = [];
  if (command?.trim()) {
    // Many xAI CLI builds accept a prompt as args or via stdin
    if (process.env.PIXCODE_GROK_ARGS) {
      args.push(...String(process.env.PIXCODE_GROK_ARGS).split(/\s+/).filter(Boolean));
    }
    args.push(command.trim());
  }

  const sessionKey = options.sessionId || `grok-${Date.now()}`;
  writer?.send?.(createNormalizedMessage({
    kind: 'status',
    text: `Starting Grok Build (${bin}) in ${workingDir}`,
  }));

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawnFunction(bin, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        // Avoid nested TUI if launched from another agent
        CI: process.env.CI || '1',
        NO_COLOR: process.env.NO_COLOR || '1',
      },
      shell: process.platform === 'win32',
    });

    active.set(sessionKey, child);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      writer?.send?.(createNormalizedMessage({ kind: 'stream_delta', text, role: 'assistant' }));
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      active.delete(sessionKey);
      const msg = error.code === 'ENOENT'
        ? 'Grok Build CLI not found. Install: https://x.ai/cli  (curl -fsSL https://x.ai/cli/install.sh | bash) — docs: https://docs.x.ai/build/overview'
        : (error.message || String(error));
      writer?.send?.(createNormalizedMessage({ kind: 'error', text: msg, isError: true }));
      reject(new Error(msg));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      active.delete(sessionKey);
      if (code === 0) {
        writer?.send?.(createNormalizedMessage({
          kind: 'status',
          text: 'Grok Build finished',
          sessionId: sessionKey,
        }));
        resolve({ sessionId: sessionKey, output: stdout });
        return;
      }
      const errText = stderr.trim() || stdout.trim() || `Grok Build exited with code ${code}`;
      writer?.send?.(createNormalizedMessage({ kind: 'error', text: errText, isError: true }));
      reject(new Error(errText));
    });
  });
}

export function abortGrokSession(sessionId) {
  const child = active.get(sessionId);
  if (!child) return false;
  try {
    child.kill('SIGTERM');
  } catch {
    return false;
  }
  active.delete(sessionId);
  return true;
}

export function isGrokSessionActive(sessionId) {
  return active.has(sessionId);
}

export function getActiveGrokSessions() {
  return [...active.keys()];
}
