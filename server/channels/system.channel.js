import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { requireAdmin } from '../auth.js'
import { config } from '../config.js'

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli.js')
const updateLog = () => path.join(config.dataDir, 'update.log')

// Server lifecycle ops. updateApply launches the CLI updater detached from
// the daemon — the child runs npm/git update and restarts the daemon, which
// drops this socket; clients poll /api/health and reload when the new
// version answers.
//
// Under systemd the daemon runs with KillMode=control-group, so `systemctl
// stop` SIGTERMs every process in the service cgroup — a plain child of the
// daemon would die mid-update. When INVOCATION_ID is set (systemd-managed)
// the updater runs as its own transient oneshot unit, outside the daemon's
// cgroup, logging to journald and $PIXCODE_HOME/update.log.
export const systemChannel = {
  ops: {
    updateCheck: async (ctx) => {
      requireAdmin(ctx)
      const { checkForUpdate, installMode } = await import('../update.js')
      const info = await checkForUpdate()
      return { ...info, mode: installMode() }
    },
    updateApply: (ctx) => {
      requireAdmin(ctx)
      mkdirSync(config.dataDir, { recursive: true })
      if (process.env.INVOCATION_ID) {
        const child = spawn('systemd-run', [
          '--unit', `pixcode-update-${Date.now()}`,
          '--service-type=oneshot',
          '--collect',
          '--same-dir',
          '-p', `StandardOutput=append:${updateLog()}`,
          '-p', `StandardError=append:${updateLog()}`,
          '--setenv', `HOME=${os.homedir()}`,
          '--setenv', `PATH=${process.env.PATH || '/usr/bin:/bin'}`,
          '--setenv', `PIXCODE_HOME=${config.dataDir}`,
          process.execPath, cliPath, 'update', '--yes',
        ], { detached: true, stdio: 'ignore' })
        child.unref()
        return { started: true, supervisor: 'systemd', log: updateLog() }
      }
      const out = openSync(updateLog(), 'a')
      const child = spawn(process.execPath, [cliPath, 'update', '--yes'], {
        detached: true,
        stdio: ['ignore', out, out],
      })
      child.unref()
      return { started: true, supervisor: 'detached', log: updateLog() }
    },
  },
}
