import pty from 'node-pty'
import path from 'node:path'
import { config } from '../config.js'
import { httpError } from '../util/http.js'

const shells = new Map()
let counter = 0

function defaultShell() {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash')
}

function dimensions(cols, rows) {
  return {
    cols: Math.min(Math.max(Number(cols) || 80, 20), 500),
    rows: Math.min(Math.max(Number(rows) || 24, 5), 200)
  }
}

function workspaceCwd(cwd) {
  const resolved = path.resolve(config.workspace, String(cwd || '.'))
  if (resolved !== config.workspace && !resolved.startsWith(`${config.workspace}${path.sep}`)) throw httpError(403, 'cwd outside workspace')
  return resolved
}

export const ptyChannel = {
  ops: {
    create(ctx, { cols = 80, rows = 24, cwd } = {}) {
      const id = `pty_${++counter}`
      const size = dimensions(cols, rows)
      const term = pty.spawn(defaultShell(), [], {
        name: 'xterm-256color',
        ...size,
        cwd: workspaceCwd(cwd),
        env: { ...process.env, TERM: 'xterm-256color' }
      })
      const shell = { term, ctx }
      shells.set(id, shell)
      term.onData((data) => ctx.emit('pty', 'data', { id, data }))
      term.onExit(({ exitCode }) => {
        shells.delete(id)
        ctx.emit('pty', 'exit', { id, exitCode })
      })
      return { id }
    },

    input(_ctx, { id, data } = {}) {
      const shell = shells.get(id)
      if (shell && data != null) shell.term.write(String(data))
      return { ok: true }
    },

    resize(_ctx, { id, cols, rows } = {}) {
      const shell = shells.get(id)
      if (shell) {
        const size = dimensions(cols, rows)
        shell.term.resize(size.cols, size.rows)
      }
      return { ok: true }
    },

    kill(_ctx, { id } = {}) {
      const shell = shells.get(id)
      if (shell) {
        try { shell.term.kill() } catch { void 0 }
        shells.delete(id)
      }
      return { ok: true }
    }
  },

  onClose(ctx) {
    for (const [id, shell] of shells) {
      if (shell.ctx !== ctx) continue
      try { shell.term.kill() } catch { void 0 }
      shells.delete(id)
    }
  }
}
