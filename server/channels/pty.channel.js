import pty from '@homebridge/node-pty-prebuilt-multiarch'
import { httpError } from '../util/http.js'
import { workspaceCwd, workspaceRoot } from '../workspace.js'

const shells = new Map()
let counter = 0
const MAX_HISTORY_BYTES = 2 * 1024 * 1024

function ownerKey(ctx) {
  return `${String(ctx?.principal?.sub || 'owner')}:${String(ctx?.clientId || 'legacy')}`
}

function defaultShell() {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash')
}

function dimensions(cols, rows) {
  return {
    cols: Math.min(Math.max(Number(cols) || 80, 20), 500),
    rows: Math.min(Math.max(Number(rows) || 24, 5), 200)
  }
}

function getOwnedShell(ctx, id) {
  const shell = shells.get(id)
  if (!shell || shell.owner !== ownerKey(ctx)) throw httpError(404, 'terminal not found')
  shell.subscribers.add(ctx)
  return shell
}

export const ptyChannel = {
  ops: {
    create(ctx, { cols = 80, rows = 24, cwd, workspace: requestedWorkspace } = {}) {
      const id = `pty_${++counter}`
      const size = dimensions(cols, rows)
      const workspacePath = workspaceRoot(requestedWorkspace)
      const term = pty.spawn(defaultShell(), [], {
        name: 'xterm-256color',
        ...size,
        cwd: workspaceCwd(workspacePath, cwd),
        env: { ...process.env, TERM: 'xterm-256color' }
      })
      const shell = { term, owner: ownerKey(ctx), subscribers: new Set([ctx]), workspace: workspacePath, history: [], historyBytes: 0, sequence: 0 }
      shells.set(id, shell)
      term.onData((data) => {
        const event = { data, seq: ++shell.sequence }
        shell.history.push(event)
        shell.historyBytes += Buffer.byteLength(data)
        while (shell.historyBytes > MAX_HISTORY_BYTES && shell.history.length > 1) shell.historyBytes -= Buffer.byteLength(shell.history.shift()?.data || '')
        for (const subscriber of shell.subscribers) {
          try { subscriber.emit('pty', 'data', { id, data, seq: event.seq }) } catch { shell.subscribers.delete(subscriber) }
        }
      })
      term.onExit(({ exitCode }) => {
        shells.delete(id)
        for (const subscriber of shell.subscribers) {
          try { subscriber.emit('pty', 'exit', { id, exitCode }) } catch { shell.subscribers.delete(subscriber) }
        }
      })
      return { id }
    },

    list(ctx, { workspace } = {}) {
      const requested = workspace ? workspaceRoot(workspace) : ''
      return [...shells.entries()]
        .filter(([, shell]) => shell.owner === ownerKey(ctx) && (!requested || shell.workspace === requested))
        .map(([id, shell]) => ({ id, workspace: shell.workspace, pid: shell.term.pid }))
    },

    history(ctx, { id } = {}) {
      const shell = getOwnedShell(ctx, id)
      return shell.history
    },

    input(ctx, { id, data } = {}) {
      const shell = getOwnedShell(ctx, id)
      if (data != null) shell.term.write(String(data))
      return { ok: true }
    },

    resize(ctx, { id, cols, rows } = {}) {
      const shell = getOwnedShell(ctx, id)
      const size = dimensions(cols, rows)
      shell.term.resize(size.cols, size.rows)
      return { ok: true }
    },

    kill(ctx, { id } = {}) {
      const shell = getOwnedShell(ctx, id)
      try { shell.term.kill() } catch { void 0 }
      shells.delete(id)
      return { ok: true }
    }
  },

  onClose(ctx) {
    for (const shell of shells.values()) {
      if (shell.owner === ownerKey(ctx)) shell.subscribers.delete(ctx)
    }
  }
}
