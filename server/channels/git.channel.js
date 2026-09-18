import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { httpError } from '../util/http.js'
import { workspacePath } from '../workspace.js'
import { credentialFor, getGitAccount, identityArgs, saveGitAccount } from '../git-account.js'
import { recordActivity } from '../activity.js'
import { adoptGithubUser, appBootstrap, devicePoll, deviceStart, oauthConfigInfo, setGithubClientId, webStart } from '../git-oauth.js'
import { requireAccess, requireAdmin } from '../auth.js'

const execFileAsync = promisify(execFile)
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }

function git(args, options = {}, requestedWorkspace, extraEnv = {}) {
  const base = workspacePath(requestedWorkspace, '.').base
  return execFileAsync('git', ['-C', base, ...args], {
    env: { ...GIT_ENV, ...extraEnv },
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout || 30_000,
    killSignal: 'SIGTERM'
  })
}

function parseStatus(output) {
  let branch = 'HEAD'
  let ahead = 0
  let behind = 0
  const files = []
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      const counts = line.match(/\+(\d+)\s+-(\d+)/)
      if (counts) { ahead = Number(counts[1]); behind = Number(counts[2]) }
      continue
    }
    if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), x: '?', y: '?', untracked: true })
      continue
    }
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const tab = line.indexOf('\t')
      const metadata = (tab === -1 ? line : line.slice(0, tab)).split(' ')
      const filePath = tab === -1 ? metadata.at(-1) : line.slice(tab + 1).split('\t').at(-1)
      const xy = metadata[1] || '  '
      files.push({
        path: filePath,
        x: xy[0] === '.' ? ' ' : xy[0],
        y: xy[1] === '.' ? ' ' : xy[1],
        untracked: false
      })
    }
  }
  return { branch, ahead, behind, files }
}

function refPart(value, label) {
  if (value == null || value === '') return null
  const result = String(value)
  if (result.startsWith('-') || result.includes('\0') || result.includes('\n')) throw httpError(400, `${label} is invalid`)
  return result
}

function safeRelative(value, requestedWorkspace) {
  return workspacePath(requestedWorkspace, value).relative
}

async function remoteOperation(command, remote, branch, requestedWorkspace, ctx) {
  const args = [command]
  const remoteRef = refPart(remote, 'remote')
  const branchRef = refPart(branch, 'branch')
  if (remoteRef) args.push(remoteRef)
  if (branchRef) args.push(branchRef)
  // Look up the remote's URL so the caller's stored token for that host can
  // be injected for this invocation only.
  const cred = { args: [], env: {} }
  try {
    const { stdout } = await git(['remote', 'get-url', remoteRef || 'origin'], {}, requestedWorkspace)
    const found = credentialFor(ctx, stdout.trim())
    cred.args.push(...found.args)
    Object.assign(cred.env, found.env)
  } catch { /* no configured remote — let the real op report the failure */ }
  try {
    const { stdout, stderr } = await git([...cred.args, ...args], { timeout: 120_000 }, requestedWorkspace, cred.env)
    try { recordActivity(workspacePath(requestedWorkspace, '.', ctx).base, 'git', { op: command, user: ctx?.principal?.username || '' }) } catch { void 0 }
    return { ok: true, output: `${stdout}${stderr}` }
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
    if (error.code === 'ETIMEDOUT' || error.killed) throw httpError(504, 'git operation timed out')
    throw httpError(400, detail || error.message || `git ${command} failed`)
  }
}

async function isTracked(filePath, requestedWorkspace) {
  try {
    await git(['ls-files', '--error-unmatch', '--', filePath], {}, requestedWorkspace)
    return true
  } catch {
    return false
  }
}

async function untrackedDiff(filePath, requestedWorkspace) {
  const base = workspacePath(requestedWorkspace, '.').base
  const absolute = path.resolve(base, filePath)
  const relative = path.relative(base, absolute) || path.basename(absolute)
  try {
    // os.devNull is NUL on Windows — /dev/null only exists on POSIX.
    await git(['diff', '--no-index', '--no-color', '--', os.devNull, relative], {}, requestedWorkspace)
    return ''
  } catch (error) {
    // `git diff --no-index` returns exit code 1 when the files differ; its
    // stdout is the valid patch in that case, not an operation failure.
    if (error.code === 1) return error.stdout || ''
    throw error
  }
}

async function untrackedFiles(requestedWorkspace) {
  const { stdout } = await git(['status', '--porcelain=v2', '--branch', '--untracked-files=all'], {}, requestedWorkspace)
  return parseStatus(stdout).files.filter((file) => file.untracked).map((file) => file.path)
}

async function baseline(filePath, staged, head = false, requestedWorkspace) {
  const revision = staged || head ? `HEAD:${filePath}` : `:0:${filePath}`
  try {
    const { stdout } = await git(['show', revision], {}, requestedWorkspace)
    return { content: stdout, exists: true, source: staged || head ? 'head' : 'index' }
  } catch (error) {
    // Missing blobs represent untracked files (or a repository with no HEAD);
    // an empty baseline is exactly the comparison VibeVim uses for new files.
    if (error.code === 128) return { content: '', exists: false, source: 'empty' }
    throw error
  }
}

export const gitChannel = {
  ops: {
    async status(ctx, { workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      try {
        const { stdout } = await git(['status', '--porcelain=v2', '--branch', '--untracked-files=all'], {}, workspace)
        return parseStatus(stdout)
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'not a git repository')
      }
    },

    async diff(ctx, { path: filePath, staged = false, head = false, workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      const args = ['diff', '--no-color']
      if (head) args.push('HEAD')
      else if (staged) args.push('--cached')
      if (filePath) {
        const safePath = safeRelative(filePath, workspace)
        // Git does not include untracked files in a normal diff. Compare them
        // against /dev/null so the Git panel can show the complete new file.
        if (!staged && !(await isTracked(safePath, workspace))) return { diff: await untrackedDiff(safePath, workspace) }
        args.push('--', safePath)
      }
      let stdout
      try {
        ({ stdout } = await git(args, {}, workspace))
      } catch (error) {
        // A repository without a commit has no HEAD yet. In that case a
        // staged diff is still useful as a fallback, while a working-tree
        // diff can continue to use the regular index comparison.
        if (!head || error.code !== 128) throw error
        const fallback = ['diff', '--no-color', ...(staged ? ['--cached'] : [])]
        if (filePath) fallback.push('--', safeRelative(filePath, workspace))
        const fallbackResult = await git(fallback, {}, workspace)
        stdout = fallbackResult.stdout
      }
      if (staged || head || filePath) return { diff: stdout }
      // A plain git diff omits untracked files. Append a /dev/null patch so
      // callers asking for the complete workspace diff see new files too.
      const additions = []
      for (const untrackedPath of await untrackedFiles(workspace)) {
        const patch = await untrackedDiff(untrackedPath, workspace)
        if (patch) additions.push(patch)
      }
      return { diff: stdout + additions.join('') }
    },

    async baseline(ctx, { path: filePath, staged = false, head = false, workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      if (!filePath) throw httpError(400, 'path required')
      return baseline(safeRelative(filePath, workspace), staged, head, workspace)
    },

    async stage(ctx, { paths = [], workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['add', '--', ...paths.map((item) => safeRelative(item, workspace))], {}, workspace)
      return { ok: true }
    },

    async unstage(ctx, { paths = [], workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['reset', 'HEAD', '--', ...paths.map((item) => safeRelative(item, workspace))], {}, workspace)
      return { ok: true }
    },

    async commit(ctx, { message, all = false, workspace } = {}) {
      workspacePath(workspace, '.', ctx)
      if (!String(message || '').trim()) throw httpError(400, 'message required')
      try {
        // `all` mirrors VS Code's commit button: stage every change first so
        // the user never has to think about the staging area.
        if (all) await git(['add', '-A'], {}, workspace)
        const { stdout, stderr } = await git([...identityArgs(ctx), 'commit', '-m', String(message)], {}, workspace)
        recordActivity(workspacePath(workspace, '.', ctx).base, 'git', { op: 'commit', user: ctx?.principal?.username || '' })
        return { ok: true, output: `${stdout}${stderr}` }
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'git commit failed')
      }
    },

    async init(ctx, { workspace } = {}) {
      const { base } = workspacePath(workspace, '.', ctx)
      const { stdout, stderr } = await git(['init'], {}, workspace)
      recordActivity(base, 'git', { op: 'init', user: ctx?.principal?.username || '' })
      return { ok: true, output: `${stdout}${stderr}` }
    },

    async discard(ctx, { path: filePath, workspace } = {}) {
      const { base } = workspacePath(workspace, '.', ctx)
      if (!filePath) throw httpError(400, 'path required')
      const safePath = safeRelative(filePath, workspace)
      if (await isTracked(safePath, workspace)) {
        // Restores both index and worktree so a staged edit also disappears.
        await git(['restore', '--staged', '--worktree', '--', safePath], {}, workspace)
      } else {
        await git(['clean', '-f', '--', safePath], {}, workspace)
      }
      recordActivity(base, 'git', { op: 'discard', files: [safePath], user: ctx?.principal?.username || '' })
      return { ok: true }
    },

    async log(ctx, { workspace, limit = 12 } = {}) {
      workspacePath(workspace, '.', ctx)
      try {
        const { stdout } = await git(['log', '--format=%h%x00%s%x00%an%x00%cr', '-n', String(Math.min(Number(limit) || 12, 50))], {}, workspace)
        const commits = stdout.split('\n').filter(Boolean).map((line) => {
          const [short, subject, author, ago] = line.split('\x00')
          return { short, subject, author, ago }
        })
        return { commits }
      } catch {
        // A repository without commits still gets a panel — just an empty one.
        return { commits: [] }
      }
    },

    // Validates a GitHub access token (web/device/PAT) against the API,
    // stores it for github.com and adopts the profile as the commit identity.
    async connectGitHub(ctx, { token } = {}) {
      requireAccess(ctx)
      const value = String(token || '').trim()
      if (!value) throw httpError(400, 'token required')
      return adoptGithubUser(ctx?.principal?.sub || 'owner', value)
    },

    // Web OAuth flow: open the app's authorize URL in a tab, GitHub sends the
    // browser back to /api/git/oauth/callback, and the server saves the token.
    // The workbench polls `git account` until the profile shows up.
    oauthStart: (ctx) => { requireAccess(ctx); return webStart(ctx?.principal?.sub || 'owner') },

    // OAuth device flow: GitHub hands the user a short code they approve in
    // the browser; polling swaps it for a token that then flows through the
    // normal connectGitHub path. The client_id is a public app identifier —
    // resolved from PIXCODE_GITHUB_CLIENT_ID or the admin-managed store.
    oauthConfig: (ctx) => { requireAccess(ctx); return oauthConfigInfo() },
    // Admin-only one-time setup: builds the manifest + nonce the client posts
    // to github.com/settings/apps/new so the GitHub App creates itself.
    appBootstrap: (ctx, { origin } = {}) => {
      requireAdmin(ctx)
      const value = String(origin || '')
      if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(value)) throw httpError(400, 'invalid origin')
      return appBootstrap(value)
    },
    deviceStart: (ctx) => { requireAccess(ctx); return deviceStart() },
    async devicePoll(ctx, { deviceCode } = {}) {
      requireAccess(ctx)
      const result = await devicePoll(deviceCode)
      if (result.status !== 'authorized') return result
      const account = await gitChannel.ops.connectGitHub(ctx, { token: result.token })
      return { status: 'authorized', account }
    },
    saveOauthClientId: (ctx, { clientId } = {}) => { requireAdmin(ctx); return setGithubClientId(clientId) },

    push: (ctx, { remote, branch, workspace } = {}) => { workspacePath(workspace, '.', ctx); return remoteOperation('push', remote, branch, workspace, ctx) },
    pull: (ctx, { remote, branch, workspace } = {}) => { workspacePath(workspace, '.', ctx); return remoteOperation('pull', remote, branch, workspace, ctx) },
    fetch: (ctx, { remote, workspace } = {}) => { workspacePath(workspace, '.', ctx); return remoteOperation('fetch', remote, null, workspace, ctx) },

    // Per-account git identity + HTTPS tokens. Each signed-in user edits only
    // their own record; tokens are write-only and never returned to clients.
    account: (ctx) => { requireAccess(ctx); return getGitAccount(ctx) },
    saveAccount: (ctx, data = {}) => { requireAccess(ctx); return saveGitAccount(ctx, data) }
  }
}
