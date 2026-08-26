import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { httpError } from '../util/http.js'
import { workspacePath } from '../workspace.js'

const execFileAsync = promisify(execFile)
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }

function git(args, options = {}, requestedWorkspace) {
  const base = workspacePath(requestedWorkspace, '.').base
  return execFileAsync('git', ['-C', base, ...args], {
    env: GIT_ENV,
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout || 30_000,
    killSignal: 'SIGTERM'
  })
}

function parseStatus(output) {
  let branch = 'HEAD'
  const files = []
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
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
  return { branch, files }
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

async function remoteOperation(command, remote, branch, requestedWorkspace) {
  const args = [command]
  const remoteRef = refPart(remote, 'remote')
  const branchRef = refPart(branch, 'branch')
  if (remoteRef) args.push(remoteRef)
  if (branchRef) args.push(branchRef)
  try {
    const { stdout, stderr } = await git(args, { timeout: 120_000 }, requestedWorkspace)
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
    await git(['diff', '--no-index', '--no-color', '--', '/dev/null', relative], {}, requestedWorkspace)
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
    async status(_ctx, { workspace } = {}) {
      try {
        const { stdout } = await git(['status', '--porcelain=v2', '--branch', '--untracked-files=all'], {}, workspace)
        return parseStatus(stdout)
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'not a git repository')
      }
    },

    async diff(_ctx, { path: filePath, staged = false, head = false, workspace } = {}) {
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

    async baseline(_ctx, { path: filePath, staged = false, head = false, workspace } = {}) {
      if (!filePath) throw httpError(400, 'path required')
      return baseline(safeRelative(filePath, workspace), staged, head, workspace)
    },

    async stage(_ctx, { paths = [], workspace } = {}) {
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['add', '--', ...paths.map((item) => safeRelative(item, workspace))], {}, workspace)
      return { ok: true }
    },

    async unstage(_ctx, { paths = [], workspace } = {}) {
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['reset', 'HEAD', '--', ...paths.map((item) => safeRelative(item, workspace))], {}, workspace)
      return { ok: true }
    },

    async commit(_ctx, { message, workspace } = {}) {
      if (!String(message || '').trim()) throw httpError(400, 'message required')
      try {
        const { stdout, stderr } = await git(['commit', '-m', String(message)], {}, workspace)
        return { ok: true, output: `${stdout}${stderr}` }
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'git commit failed')
      }
    },

    push: (_ctx, { remote, branch, workspace } = {}) => remoteOperation('push', remote, branch, workspace),
    pull: (_ctx, { remote, branch, workspace } = {}) => remoteOperation('pull', remote, branch, workspace)
  }
}
