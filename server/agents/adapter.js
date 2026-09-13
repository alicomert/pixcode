import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { enhancedPath, refreshEnhancedPath } from '../util/env.js'

const registry = new Map()
const AVAILABILITY_TTL = 24 * 60 * 60 * 1_000
const CACHE_FILE = path.join(config.dataDir, 'agent-availability.json')

export class Adapter {
  static id = ''
  static label = ''
  static cli = ''
  static icon = ''
  static interactive = false
  static install = null

  buildArgs(_options) { return [] }
  buildTerminalArgs(_options) { return [] }
  // Arguments that relaunch the CLI continuing its previous conversation,
  // or null when the CLI cannot resume — the runner falls back to a fresh
  // interactive spawn.
  buildResumeArgs() { return null }
  normalizeLine(_line, _state) { return [] }
  buildUserFrame(text) { return `${text}\n` }
}

export function registerAdapter(AdapterClass) {
  registry.set(AdapterClass.id, AdapterClass)
}

export function getAdapter(id) {
  return registry.get(id)
}

let availability = null

function availabilityStore() {
  if (availability) return availability
  availability = new Map()
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    for (const [id, entry] of Object.entries(raw?.agents || {})) {
      if (Number.isFinite(entry?.checkedAt)) availability.set(id, { available: !!entry.available, checkedAt: entry.checkedAt })
    }
  } catch { /* first run or unreadable cache — treated as empty */ }
  return availability
}

function persistAvailability() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ agents: Object.fromEntries(availabilityStore()) }, null, 2), { mode: 0o600 })
  } catch { /* the cache is best-effort; probing still works */ }
}

// A filesystem scan over the enhanced PATH needs no which/where binary and
// finds CLIs that only exist in user-level directories.
async function commandAvailable(command, pathEnv) {
  const dirs = String(pathEnv || '').split(path.delimiter).filter(Boolean)
  const names = process.platform === 'win32'
    ? [command, ...String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((ext) => command + ext.toLowerCase()), ...String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((ext) => command + ext.toUpperCase())]
    : [command]
  for (const dir of dirs) {
    for (const name of names) {
      try {
        await fs.promises.access(path.join(dir, name), fs.constants.X_OK)
        return true
      } catch { /* try the next candidate */ }
    }
  }
  return false
}

function installForPlatform(install) {
  if (!install || typeof install !== 'object') return null
  const command = (process.platform === 'win32' && install.windows) || install.command || null
  return command ? { command } : null
}

export async function listAgents({ refresh = false } = {}) {
  const pathEnv = refresh ? await refreshEnhancedPath() : await enhancedPath()
  const store = availabilityStore()
  const now = Date.now()
  let changed = false
  const agents = await Promise.all([...registry.values()].map(async (AdapterClass) => {
    const cached = store.get(AdapterClass.id)
    const fresh = !refresh && cached && now - cached.checkedAt < AVAILABILITY_TTL
    const available = fresh ? cached.available : await commandAvailable(AdapterClass.cli, pathEnv)
    if (!fresh) {
      store.set(AdapterClass.id, { available, checkedAt: now })
      changed = true
    }
    return {
      id: AdapterClass.id,
      label: AdapterClass.label,
      cli: AdapterClass.cli,
      icon: AdapterClass.icon,
      interactive: AdapterClass.interactive,
      available,
      install: installForPlatform(AdapterClass.install)
    }
  }))
  if (changed) persistAvailability()
  return agents
}
