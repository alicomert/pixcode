import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// Operator-facing CLI settings — `null` workspace means "use the managed
// projects directory". Resolution order: flag > this file > env > default.
const FILE = path.join(config.dataDir, 'cli.json')

const DEFAULTS = {
  port: 3001,
  workspace: null,
  autostart: true
}

export function cliConfigExists() {
  return fs.existsSync(FILE)
}

export function readCliConfig() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { ...DEFAULTS, ...(value && typeof value === 'object' ? value : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeCliConfig(patch) {
  const next = { ...readCliConfig(), ...patch }
  fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 })
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 })
  return next
}

export function validPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return port
}

// CLI flag beats saved settings, which beat the environment, which beats the
// built-in default — the same precedence the daemon itself applies.
export function resolvePort(flagPort) {
  return validPort(flagPort) ?? validPort(readCliConfig().port) ?? config.port
}
