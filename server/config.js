import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const config = {
  // 3001 is the stable Pixcode publication port. PORT/PIXCODE_PORT remain
  // available for isolated development or smoke-test instances.
  port: Number(process.env.PORT || process.env.PIXCODE_PORT || 3001),
  host: process.env.PIXCODE_HOST || '0.0.0.0',
  dataDir: process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode'),
  projectsDir: path.resolve(process.env.PIXCODE_PROJECTS || path.join(process.cwd(), 'pixcode-projects')),
  workspace: process.env.PIXCODE_WORKSPACE ? path.resolve(process.env.PIXCODE_WORKSPACE) : null,
  distDir: fileURLToPath(new URL('../dist/', import.meta.url))
}

export const VERSION = "2.0.7"
