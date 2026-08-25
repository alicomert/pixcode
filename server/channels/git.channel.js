import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { httpError } from '../util/http.js'

const execFileAsync = promisify(execFile)
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }

function git(args, options = {}) {
  return execFileAsync('git', ['-C', config.workspace, ...args], {
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

function workspacePath(value) {
  const filePath = String(value)
  if (filePath.includes('\0') || filePath.includes('\n')) throw httpError(400, 'path is invalid')
  const resolved = path.resolve(config.workspace, filePath)
  if (resolved !== config.workspace && !resolved.startsWith(`${config.workspace}${path.sep}`)) throw httpError(403, 'path outside workspace')
  return filePath
}

async function remoteOperation(command, remote, branch) {
  const args = [command]
  const remoteRef = refPart(remote, 'remote')
  const branchRef = refPart(branch, 'branch')
  if (remoteRef) args.push(remoteRef)
  if (branchRef) args.push(branchRef)
  try {
    const { stdout, stderr } = await git(args, { timeout: 120_000 })
    return { ok: true, output: `${stdout}${stderr}` }
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
    if (error.code === 'ETIMEDOUT' || error.killed) throw httpError(504, 'git operation timed out')
    throw httpError(400, detail || error.message || `git ${command} failed`)
  }
}

export const gitChannel = {
  ops: {
    async status() {
      try {
        const { stdout } = await git(['status', '--porcelain=v2', '--branch'])
        return parseStatus(stdout)
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'not a git repository')
      }
    },

    async diff(_ctx, { path: filePath, staged = false } = {}) {
      const args = ['diff', '--no-color']
      if (staged) args.push('--cached')
      if (filePath) args.push('--', workspacePath(filePath))
      const { stdout } = await git(args)
      return { diff: stdout }
    },

    async stage(_ctx, { paths = [] } = {}) {
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['add', '--', ...paths.map(workspacePath)])
      return { ok: true }
    },

    async unstage(_ctx, { paths = [] } = {}) {
      if (!Array.isArray(paths) || paths.length === 0) throw httpError(400, 'paths required')
      await git(['reset', 'HEAD', '--', ...paths.map(workspacePath)])
      return { ok: true }
    },

    async commit(_ctx, { message } = {}) {
      if (!String(message || '').trim()) throw httpError(400, 'message required')
      try {
        const { stdout, stderr } = await git(['commit', '-m', String(message)])
        return { ok: true, output: `${stdout}${stderr}` }
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim()
        throw httpError(400, detail || 'git commit failed')
      }
    },

    push: (_ctx, { remote, branch } = {}) => remoteOperation('push', remote, branch),
    pull: (_ctx, { remote, branch } = {}) => remoteOperation('pull', remote, branch)
  }
}
