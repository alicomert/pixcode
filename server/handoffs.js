import fs from 'node:fs'
import path from 'node:path'

// Session handoffs: when an agent session stops, a Markdown summary lands in
// the workspace at .pixcode/handoffs/<session>.md — changed files, the
// terminal tail, who ran it. The next session (any CLI, any user) can read
// the file and pick the work up, which is the multi-CLI memory the agent
// ecosystem converged on. .pixcode/MEMORY.md is the shared, human-editable
// half: conventions and decisions sessions should keep in mind.
const MAX_HANDOFFS = 30
const TAIL_LINES = 40
const TAIL_BYTES = 24 * 1024
const LIST_LIMIT = 20
const NAME_PATTERN = /^[\w.-]+\.md$/

const MEMORY_SEED = `# Project memory

Shared memory for everyone working in this workspace — humans and agent
sessions. Conventions, decisions, and gotchas belong here; agent sessions
continuing from a handoff are pointed at this file.

`

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[()#][0-9A-B]|[@-Z\\-_])/g, '')
}

function dirFor(workspace) {
  return path.join(workspace, '.pixcode', 'handoffs')
}

function stamp(ts) {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
}

function prune(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir) } catch { return }
  const aged = entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, ts: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.ts - a.ts)
  for (const old of aged.slice(MAX_HANDOFFS)) {
    try { fs.rmSync(path.join(dir, old.name), { force: true }) } catch { void 0 }
  }
}

export function ensureMemory(workspace) {
  try {
    const file = path.join(workspace, '.pixcode', 'MEMORY.md')
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 })
      fs.writeFileSync(file, MEMORY_SEED, { mode: 0o644 })
    }
    return '.pixcode/MEMORY.md'
  } catch { return null }
}

export function writeHandoff(session, { files = [], branch = '', tail = '' } = {}) {
  if (!session?.workspace) return null
  try {
    const dir = dirFor(session.workspace)
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
    const memory = ensureMemory(session.workspace)
    const name = `${session.sessionId}-${session.state?.agent || 'agent'}.md`
    const lines = [
      `# Session handoff — ${session.state?.agent || 'agent'} #${session.index || 1}`,
      '',
      `- **Agent**: ${session.state?.agent || '?'} (session ${session.sessionId})`,
      `- **Started**: ${stamp(session.startedAt || Date.now())}`,
      `- **Ended**: ${stamp(Date.now())}`,
      `- **Owner**: ${session.ownerName || session.owner || '?'}`,
      branch ? `- **Branch**: ${branch}` : null,
      '',
      '## Changed files',
      '',
      ...(files.length ? files.map((file) => `- \`${file.status}\` ${file.path}`) : ['_(none recorded)_']),
      '',
      '## Terminal tail',
      '',
      '```',
      tail || '(no output captured)',
      '```',
      '',
      '---',
      memory ? `Continue this work: read \`${memory}\` for shared project memory, then pick up where this session left off.` : 'Continue this work where this session left off.',
      ''
    ].filter((line) => line !== null)
    fs.writeFileSync(path.join(dir, name), lines.join('\n'), { mode: 0o644 })
    prune(dir)
    return name
  } catch { return null }
}

export function tailFromHistory(history) {
  let text = ''
  for (const event of history || []) {
    if (event?.type !== 'data' || typeof event.data !== 'string') continue
    text += event.data
    if (text.length > TAIL_BYTES) text = text.slice(-TAIL_BYTES)
  }
  const lines = stripAnsi(text).split(/\r?\n/).map((line) => line.trimEnd())
  // Keep the last meaningful lines; drop the blank margin a TUI leaves behind.
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines.at(-1).trim()) lines.pop()
  return lines.slice(-TAIL_LINES).join('\n')
}

export function listHandoffs(workspace) {
  const dir = dirFor(workspace)
  let entries = []
  try { entries = fs.readdirSync(dir) } catch { return [] }
  return entries
    .filter((name) => NAME_PATTERN.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      const match = name.match(/^(s_\d+)-([\w-]+)\.md$/)
      return { name, sessionId: match?.[1] || '', agent: match?.[2] || '', ts: stat.mtimeMs, size: stat.size }
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, LIST_LIMIT)
}

export function readHandoff(workspace, name) {
  if (!NAME_PATTERN.test(String(name || ''))) return null
  try { return fs.readFileSync(path.join(dirFor(workspace), name), 'utf8') } catch { return null }
}
