import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './util/http.js'

// Per-user CLI environment — the "isolated or shared" switch. A user with no
// record spawns CLIs under the daemon's env (shared credentials, zero setup).
// Saving env keys or enabling a private home flips just that user to isolated
// mode: their claude/gh/etc. sessions get their own vars and, with `home`, a
// private HOME so CLI logins/configs no longer collide.
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
// PATH stays service-curated; identity vars are managed so a stray override
// cannot silently break shell init or the private-home toggle.
const BLOCKED = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL'])

function storeFile() {
  return path.join(config.dataDir, 'cli-env.json')
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(storeFile(), 'utf8')) || {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(storeFile(), JSON.stringify(store, null, 2), { mode: 0o600 })
  try { fs.chmodSync(storeFile(), 0o600) } catch { void 0 }
}

export function cliHomeFor(sub) {
  return path.join(config.dataDir, 'cli-home', String(sub))
}

// What the client may see: which keys exist and whether a private home is on.
// Values are write-only — never returned over the wire.
export function cliEnvInfo(sub) {
  const record = readStore()[String(sub)] || {}
  return { keys: Object.keys(record.env || {}).sort(), home: !!record.home }
}

export function saveCliEnv(sub, { env, home } = {}) {
  const store = readStore()
  const record = { ...(store[String(sub)] || {}) }
  if (env && typeof env === 'object') {
    record.env = { ...(record.env || {}) }
    for (const [key, value] of Object.entries(env)) {
      if (!ENV_KEY.test(key)) throw httpError(400, `invalid env name: ${key}`)
      if (BLOCKED.has(key.toUpperCase())) throw httpError(400, `${key} is managed by Pixcode`)
      if (value == null || value === '') delete record.env[key]
      else record.env[key] = String(value).slice(0, 4096)
    }
    if (!Object.keys(record.env).length) delete record.env
  }
  if (home !== undefined) record.home = !!home
  if (record.env || record.home) store[String(sub)] = record
  else delete store[String(sub)]
  writeStore(store)
  return cliEnvInfo(sub)
}

// Spawn-time view: extra env vars to merge over the shared daemon env, or
// null for pure shared mode. Private homes are created lazily on first spawn.
export function cliEnvFor(sub) {
  const record = readStore()[String(sub)]
  if (!record) return null
  const extra = { ...(record.env || {}) }
  if (record.home) {
    const home = cliHomeFor(sub)
    fs.mkdirSync(home, { recursive: true, mode: 0o700 })
    extra.HOME = home
    // Windows CLIs resolve config against USERPROFILE, not HOME — without
    // this the "private home" flag would silently share credentials there.
    if (process.platform === 'win32') extra.USERPROFILE = home
  }
  return Object.keys(extra).length ? extra : null
}
