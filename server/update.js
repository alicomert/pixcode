import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION } from './config.js'

// Self-update for the published CLI. Two release channels are checked — the
// npm registry and the GitHub repo's tags/releases — because users install
// from either. Which channel *applies* the update depends on how this copy
// was installed (global npm package vs git checkout).

const NPM_PACKAGE = '@pixelbyte-software/pixcode'
const NPM_LATEST_URL = 'https://registry.npmjs.org/@pixelbyte-software%2Fpixcode/latest'
const REPO = 'alicomert/pixcode'
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`
const TAGS_API = `https://api.github.com/repos/${REPO}/tags?per_page=30`
export const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Mirrors src/lib/updater.js compareVersions — keep the two in sync.
export function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/)
    if (!match) return null
    return { numbers: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)], prerelease: match[4] || '' }
  }
  const a = parse(left)
  const b = parse(right)
  if (!a || !b) return 0
  for (let i = 0; i < a.numbers.length; i += 1) {
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i] ? 1 : -1
  }
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true })
}

async function fetchJson(url, timeout = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': `pixcode/${VERSION}`, accept: 'application/json' }
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function latestOnGithub() {
  const release = await fetchJson(RELEASE_API)
  if (release?.tag_name) return String(release.tag_name).replace(/^v/i, '')
  // No release objects yet — fall back to the newest semver tag.
  const tags = await fetchJson(TAGS_API)
  if (!Array.isArray(tags)) return null
  let best = null
  for (const tag of tags) {
    const version = String(tag?.name || '').replace(/^v/i, '')
    if (/^\d+\.\d+\.\d+/.test(version) && (!best || compareVersions(version, best) > 0)) best = version
  }
  return best
}

async function latestOnNpm() {
  const data = await fetchJson(NPM_LATEST_URL)
  return data?.version ? String(data.version) : null
}

export async function checkForUpdate() {
  const [npm, github] = await Promise.all([latestOnNpm(), latestOnGithub()])
  const candidates = [npm, github].filter(Boolean)
  let latest = null
  for (const version of candidates) {
    if (!latest || compareVersions(version, latest) > 0) latest = version
  }
  return {
    current: VERSION,
    npm,
    github,
    latest,
    updateAvailable: Boolean(latest && compareVersions(latest, VERSION) > 0),
    releasePage: RELEASE_PAGE
  }
}

// How was this copy installed? A global npm package lives under node_modules;
// a source checkout is a git working tree.
export function installMode() {
  if (PACKAGE_ROOT.includes(`${path.sep}node_modules${path.sep}`)) return 'npm'
  try {
    execFileSync('git', ['-C', PACKAGE_ROOT, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
    return 'git'
  } catch {
    return 'unknown'
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
}

// Applies the update through the channel this install came from, then restarts
// the daemon so the new code actually serves. Returns a short log of steps.
export async function applyUpdate({ restartDaemon = true } = {}) {
  const mode = installMode()
  const steps = []
  if (mode === 'npm') {
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    run(npmBin, ['install', '-g', `${NPM_PACKAGE}@latest`])
    steps.push('npm install -g')
  } else if (mode === 'git') {
    run('git', ['-C', PACKAGE_ROOT, 'fetch', '--tags', 'origin'])
    run('git', ['-C', PACKAGE_ROOT, 'pull', '--ff-only'])
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    run(npmBin, ['install'], { cwd: PACKAGE_ROOT })
    run(npmBin, ['run', 'build'], { cwd: PACKAGE_ROOT })
    steps.push('git pull + rebuild')
  } else {
    throw new Error(`cannot self-update from this install — download ${RELEASE_PAGE}`)
  }
  if (restartDaemon) {
    const { stopDaemon, startDaemon, daemonStatus } = await import('./daemon.js')
    const status = await daemonStatus()
    if (status.running || status.listening) {
      await stopDaemon()
      await startDaemon({ port: status.port })
      steps.push('daemon restarted')
    }
  }
  return { mode, steps }
}
