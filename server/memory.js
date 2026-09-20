import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { getAdapter } from './agents/adapter.js'
import { config } from './config.js'
import { enhancedEnv } from './util/env.js'
import { cliEnvFor } from './cli-env.js'
import { recordActivity } from './activity.js'

const execFileAsync = promisify(execFile)

// Per-user preference: whether a finished agent session may spend a small
// background run distilling durable facts into .pixcode/MEMORY.md. On by
// default — the user whose CLI ran the session pays the tokens, so the
// choice belongs to that same user.
const DIGEST_TIMEOUT_MS = 120_000
const DIGEST_MAX_BUFFER = 2 * 1024 * 1024

function storeFile() {
  return path.join(config.dataDir, 'memory.json')
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

export function memoryPrefsFor(sub) {
  const record = readStore()[String(sub)] || {}
  return { digest: record.digest !== false }
}

export function saveMemoryPrefs(sub, { digest } = {}) {
  const store = readStore()
  const record = { ...(store[String(sub)] || {}) }
  if (digest !== undefined) record.digest = !!digest
  if (record.digest === false) store[String(sub)] = record
  else delete store[String(sub)]
  writeStore(store)
  return memoryPrefsFor(sub)
}

// A stopped session leaves a handoff snapshot behind; the digest gives the
// same CLI one short headless run to read it and distill durable facts into
// MEMORY.md. This is deliberately best-effort: no retries, a hard timeout,
// and a dead/killed process is simply skipped — memory is a nice-to-have,
// never a reason to hold a session's exit path hostage.
export async function runMemoryDigest({ agent, workspace, cwd, owner, ownerName, handoffName } = {}) {
  try {
    if (!memoryPrefsFor(owner).digest) return
    const AdapterClass = getAdapter(agent)
    if (!AdapterClass?.cli) return
    const args = new AdapterClass().buildArgs({
      prompt: `[pixcode] An agent session just ended in this workspace. Its snapshot is at .pixcode/handoffs/${handoffName} — read it (changed files + terminal tail).\n\nIf it reveals anything durable worth remembering across sessions — a coding convention, a decision and its reason, a gotcha that cost time, an environment quirk — append ONE line under the matching heading in .pixcode/MEMORY.md. At most 3 lines total; never record task progress, chat history, or trivia. If nothing qualifies, change nothing. Do not modify any other file.`
    })
    if (!args?.length) return
    const env = await enhancedEnv({ ...(cliEnvFor(owner) || {}) })
    await execFileAsync(AdapterClass.cli, args, {
      cwd,
      env,
      timeout: DIGEST_TIMEOUT_MS,
      maxBuffer: DIGEST_MAX_BUFFER,
      killSignal: 'SIGKILL'
    })
    recordActivity(workspace, 'agent', { action: 'memoryDigest', agent, user: ownerName || owner })
  } catch { /* digest is best-effort — a failed run just means no new memories */ }
}
