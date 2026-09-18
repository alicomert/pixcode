import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from './config.js'
import { cliEnvInfo, cliHomeFor } from './cli-env.js'
import { httpError } from './util/http.js'

const execFileAsync = promisify(execFile)

// Agent skill collections (cursor/plugins + anthropics/skills pattern): a
// skill is a directory holding SKILL.md, installed per agent into that CLI's
// skills dir under the user's (possibly private) home, or into the workspace
// at .claude/skills for project-scoped collections. installSkillRepo accepts
// single-skill repos and multi-skill collections — every dir containing a
// SKILL.md is copied in under its own name.
const AGENT_SKILL_DIRS = {
  claude: '.claude/skills',
  devin: '.config/devin/skills'
}
const MAX_SKILLS = 40
const CLONE_TIMEOUT_MS = 60_000
const NAME_PATTERN = /^[\w][\w.-]{0,63}$/

function homeForSub(sub) {
  try {
    if (cliEnvInfo(sub).home) {
      const dir = cliHomeFor(sub)
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      return dir
    }
  } catch { void 0 }
  return os.homedir()
}

export function skillsDirFor({ agent, scope, sub, workspace } = {}) {
  if (scope === 'workspace') {
    if (!workspace) throw httpError(400, 'workspace required')
    return path.join(workspace, '.claude', 'skills')
  }
  const rel = AGENT_SKILL_DIRS[agent] || path.join('.pixcode', 'skills', String(agent || 'agent'))
  return path.join(homeForSub(sub), rel)
}

// "owner/repo" shorthand expands to GitHub; otherwise a full https:// git URL
// is required — ssh/git/file remotes are rejected so the daemon never reaches
// local paths or hands credentials to an arbitrary scheme.
export function normalizeRepo(input) {
  const value = String(input || '').trim()
  if (!value) throw httpError(400, 'repo required')
  if (/^https:\/\/[\w.-]+(?::\d+)?\/[\w./-]+$/i.test(value)) return value.replace(/\.git$/i, '')
  if (/^[\w.-]+\/[\w./-]+$/.test(value) && !value.startsWith('/')) return `https://github.com/${value.replace(/\.git$/i, '')}`
  throw httpError(400, 'use a https:// git URL or owner/repo shorthand')
}

function* skillDirs(root, depth = 0) {
  if (depth > 3) return
  let entries = []
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return }
  if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
    yield root
    return // a skill never nests another skill — stop descending
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.git' && !entry.name.startsWith('.')) {
      yield* skillDirs(path.join(root, entry.name), depth + 1)
    }
  }
}

export async function installSkillRepo({ repo, dir }) {
  const url = normalizeRepo(repo)
  const tmp = path.join(config.dataDir, 'tmp', `skill-${crypto.randomBytes(6).toString('hex')}`)
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 })
  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--quiet', url, path.join(tmp, 'repo')], {
      timeout: CLONE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw httpError(400, `clone failed: ${error.message?.split('\n')[0] || 'git error'}`)
  }
  const root = path.join(tmp, 'repo')
  const found = [...skillDirs(root)]
  if (!found.length) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw httpError(400, 'no SKILL.md found in this repository')
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
  const installed = []
  for (const source of found.slice(0, MAX_SKILLS)) {
    const name = path.basename(source)
    if (!NAME_PATTERN.test(name)) continue
    const target = path.join(dir, name)
    fs.rmSync(target, { recursive: true, force: true })
    fs.cpSync(source, target, { recursive: true })
    installed.push(name)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  return { installed, count: installed.length }
}

export function listSkills(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return entries
    .filter((entry) => entry.isDirectory() && NAME_PATTERN.test(entry.name))
    .filter((entry) => { try { return fs.statSync(path.join(dir, entry.name, 'SKILL.md')).isFile() } catch { return false } })
    .map((entry) => {
      let description = ''
      try {
        const head = fs.readFileSync(path.join(dir, entry.name, 'SKILL.md'), 'utf8').split('\n').slice(0, 20)
        const index = head.findIndex((line) => /^description:/i.test(line.trim()))
        if (index >= 0) {
          description = head[index].split(':').slice(1).join(':').trim()
          // YAML folded markers (description: >) put the text on the next line.
          if (description === '>' || description === '|' || description === '>-' || description === '|-') {
            description = (head[index + 1] || '').trim()
          }
          description = description.slice(0, 140)
        }
      } catch { void 0 }
      return { name: entry.name, description }
    })
    .slice(0, 200)
}

export function removeSkill(dir, name) {
  if (!NAME_PATTERN.test(String(name || ''))) throw httpError(400, 'invalid skill name')
  const target = path.join(dir, name)
  fs.rmSync(target, { recursive: true, force: true })
  return { ok: true }
}
