import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { requireAdmin } from '../auth.js'
import { config } from '../config.js'

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli.js')
const updateLog = () => path.join(config.dataDir, 'update.log')

// Server lifecycle ops. updateApply spawns the CLI updater detached — the
// child runs npm/git update and restarts the daemon, which drops this socket;
// clients poll /api/health and reload when the new version answers. Output is
// teed to $PIXCODE_HOME/update.log so a failed update leaves a trail.
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
      const out = openSync(updateLog(), 'a')
      const child = spawn(process.execPath, [cliPath, 'update', '--yes'], {
        detached: true,
        stdio: ['ignore', out, out],
      })
      child.unref()
      return { started: true, log: updateLog() }
    },
  },
}
