import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const config = {
  port: Number(process.env.PORT || process.env.PIXCODE_PORT || 3210),
  host: process.env.PIXCODE_HOST || '0.0.0.0',
  dataDir: process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode'),
  workspace: path.resolve(process.env.PIXCODE_WORKSPACE || process.cwd()),
  distDir: fileURLToPath(new URL('../dist/', import.meta.url))
}

export const VERSION = '2.0.0-alpha.1'
