import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PATH_MARKER = '__PIXCODE_PATH__'

// Service managers (systemd user units, launchd, Task Scheduler) hand us a
// minimal PATH that misses user-level installs such as ~/.local/bin, nvm,
// Homebrew, or scoop. The agent CLIs live in exactly those places, so merge
// the login shell's PATH with well-known install roots once per process.
function nvmBinDirs() {
  const dir = path.join(os.homedir(), '.nvm', 'versions', 'node')
  try {
    return fs.readdirSync(dir)
      .filter((name) => /^v?\d/.test(name))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .slice(0, 1)
      .map((name) => path.join(dir, name, 'bin'))
  } catch {
    return []
  }
}

function extraPathDirs() {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    return [
      path.join(appData, 'npm'),
      path.join(localAppData, 'pnpm'),
      path.join(home, 'scoop', 'shims'),
      path.join(home, '.local', 'bin')
    ]
  }
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/usr/local/bin',
    '/usr/local/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/opt/local/bin',
    path.join(home, '.bun', 'bin'),
    path.join(home, '.deno', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    ...nvmBinDirs()
  ]
}

async function loginShellPath() {
  if (process.platform === 'win32') return ''
  const shell = process.env.SHELL || '/bin/bash'
  // Interactive+login covers .bashrc/.zshrc (nvm, custom exports); the login-
  // only fallback still catches .profile-based setups. The marker lets us
  // strip any banner text a noisy rc file prints.
  for (const flag of ['-ilc', '-lc']) {
    try {
      const { stdout } = await execFileAsync(shell, [flag, `printf '${PATH_MARKER}%s' "$PATH"`], { timeout: 8_000 })
      const value = String(stdout).split(PATH_MARKER).pop().trim()
      if (value.includes(path.delimiter) || value.startsWith('/')) return value
    } catch { /* try the next invocation style */ }
  }
  return ''
}

async function computeEnhancedPath() {
  const seen = new Set()
  const parts = []
  const push = (dirs) => {
    for (const dir of dirs) {
      if (dir && !seen.has(dir)) { seen.add(dir); parts.push(dir) }
    }
  }
  push(String(process.env.PATH || '').split(path.delimiter).filter(Boolean))
  push((await loginShellPath()).split(path.delimiter).filter(Boolean))
  push(extraPathDirs().filter((dir) => fs.existsSync(dir)))
  return parts.join(path.delimiter)
}

let enhancedPathPromise = null

export function enhancedPath() {
  if (!enhancedPathPromise) enhancedPathPromise = computeEnhancedPath()
  return enhancedPathPromise
}

export async function refreshEnhancedPath() {
  enhancedPathPromise = computeEnhancedPath()
  return enhancedPathPromise
}

export async function enhancedEnv(extra = {}) {
  return { ...process.env, PATH: await enhancedPath(), ...extra }
}
