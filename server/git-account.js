import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './util/http.js'

// Per-account git configuration: commit identity plus per-host HTTPS tokens.
// Tokens live only in this 0600 store and are injected into git through an
// in-process credential helper — they are never written to .git/config or
// the global credential store, so accounts on the same machine stay isolated.
const STORE_FILE = path.join(config.dataDir, 'git-accounts.json')

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) } catch { return {} }
}

function writeStore(store) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), { mode: 0o600 })
  } catch { /* git still works without a saved account */ }
}

function accountKey(ctx) {
  return String(ctx?.principal?.sub || 'owner')
}

function normalizeHost(host) {
  const value = String(host || '').trim().toLowerCase().replace(/:\d+$/, '')
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) || value.length > 253) throw httpError(400, 'invalid host')
  return value
}

// Public shape never exposes token values — only which hosts are configured
// plus the cached GitHub profile (login/avatar) for the connected card.
function publicAccount(account) {
  return {
    name: account?.name || '',
    email: account?.email || '',
    hosts: Object.keys(account?.tokens || {}).sort(),
    github: account?.github || null
  }
}

export function getGitAccount(ctx) {
  return publicAccount(readStore()[accountKey(ctx)])
}

export function saveGitAccount(ctx, { name, email, host, token, removeHost, github } = {}) {
  const store = readStore()
  const key = accountKey(ctx)
  const account = store[key] || {}
  if (name !== undefined) account.name = String(name || '').trim().slice(0, 120)
  if (email !== undefined) account.email = String(email || '').trim().slice(0, 200)
  if (github !== undefined) account.github = github || undefined
  account.tokens = account.tokens || {}
  if (host !== undefined && token) account.tokens[normalizeHost(host)] = String(token)
  if (removeHost) {
    const removed = normalizeHost(removeHost)
    delete account.tokens[removed]
    if (removed === 'github.com') delete account.github
  }
  store[key] = account
  writeStore(store)
  return publicAccount(account)
}

// `-c user.name=… -c user.email=…` so each user's commits carry their own
// identity regardless of the daemon's global gitconfig.
export function identityArgs(ctx) {
  const account = readStore()[accountKey(ctx)]
  const args = []
  if (account?.name) args.push('-c', `user.name=${account.name}`)
  if (account?.email) args.push('-c', `user.email=${account.email}`)
  return args
}

export function remoteHost(remoteUrl) {
  const value = String(remoteUrl || '')
  if (/^https?:\/\//i.test(value)) {
    try { return new URL(value).hostname.toLowerCase() } catch { return null }
  }
  return null
}

// Returns argv flags plus env for one git invocation. The credential helper
// is a shell snippet git runs itself, so the token travels in the child's
// environment — not in the process list and not on disk. An empty helper is
// set first to stop git falling through to a different account's store.
export function credentialFor(ctx, remoteUrl) {
  const host = remoteHost(remoteUrl)
  const token = host && readStore()[accountKey(ctx)]?.tokens?.[host]
  if (!token) return { args: [], env: {} }
  return {
    args: [
      '-c', 'credential.helper=',
      '-c', 'credential.helper=!f() { echo "username=oauth2"; echo "password=$PIXCODE_GIT_TOKEN"; }; f'
    ],
    env: { PIXCODE_GIT_TOKEN: token }
  }
}
