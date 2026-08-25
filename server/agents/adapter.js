import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const registry = new Map()

export class Adapter {
  static id = ''
  static label = ''
  static cli = ''
  static icon = ''
  static interactive = false

  buildArgs(_options) { return [] }
  normalizeLine(_line, _state) { return [] }
  buildUserFrame(text) { return `${text}\n` }
}

export function registerAdapter(AdapterClass) {
  registry.set(AdapterClass.id, AdapterClass)
}

export function getAdapter(id) {
  return registry.get(id)
}

async function commandAvailable(command) {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [command], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

export async function listAgents() {
  return Promise.all([...registry.values()].map(async (AdapterClass) => ({
    id: AdapterClass.id,
    label: AdapterClass.label,
    cli: AdapterClass.cli,
    icon: AdapterClass.icon,
    interactive: AdapterClass.interactive,
    available: await commandAvailable(AdapterClass.cli)
  })))
}
