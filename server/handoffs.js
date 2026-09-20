import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Persistent memory, split the way the agent ecosystem converged on:
// .pixcode/MEMORY.md holds curated facts (conventions, decisions, gotchas)
// written by humans AND agents — never transcripts. .pixcode/handoffs/
// holds one snapshot per stopped session plus an auto-generated INDEX.md.
// Agents learn the files exist through two channels: the MEMORY_PROMPT_HINT
// prepended to every launch prompt, and a root AGENTS.md pointer that most
// agent CLIs auto-load when a session starts with no prompt at all.
const MAX_HANDOFFS = 30
const TAIL_LINES = 40
const TAIL_BYTES = 24 * 1024
const TAIL_LINE_CHARS = 240
const LIST_LIMIT = 20
const NAME_PATTERN = /^[\w.-]+\.md$/
const SESSIONS_START = '<!-- pixcode:sessions -->'
const SESSIONS_END = '<!-- /pixcode:sessions -->'
const INDEX_MAX = 12

export const MEMORY_PROMPT_HINT = '[pixcode] Shared project memory lives at .pixcode/MEMORY.md — read it before working and update it when you learn durable conventions, decisions, or gotchas (never chat logs or task progress). Recent session snapshots: .pixcode/handoffs/INDEX.md.'

const MEMORY_SEED = `# Project memory

<!--
Persistent memory for this workspace — shared by every agent session and
every human working here.

Agents: read this file BEFORE starting work. When you learn something
durable — a coding convention, a decision and the reason behind it, a
gotcha that cost time, an environment quirk — record it under the
matching heading below, one line per entry. Do NOT store session logs,
chat transcripts, or task progress here; ephemeral state belongs in
.pixcode/handoffs/ session snapshots.
-->

## Conventions

## Decisions

## Gotchas

## Environment
`

// Minimal pointer most agent CLIs (codex, devin, claude, gemini, opencode,
// grok) auto-load from the workspace root on session start.
const AGENTS_POINTER = `# AGENTS.md

This workspace runs on Pixcode. Before starting work, read
\`.pixcode/MEMORY.md\` — the project's persistent memory — and update it
when you learn durable conventions, decisions, or gotchas (never chat
logs). Recent session snapshots live under \`.pixcode/handoffs/\`
(start with \`INDEX.md\`).
`

// TUI chrome glyphs: Braille spinner cells, box drawing, blocks/shading,
// geometric frames, misc symbols — plus the ASCII spinner/prompt marks that
// decorate interactive CLIs (codex, claude, devin, gemini all redraw in place).
const DECORATION_RE = /[⠀-⣿─-╿▀-▟■-◿☀-➿⬀-⯿·❭❯│┃]/gu
const EDGE_DECORATION_RE = /^[\s⠀-⣿─-╿▀-▟■-◿☀-➿⬀-⯿·❭❯│┃|/\\_-]+|[\s⠀-⣿─-╿▀-▟■-◿☀-➿⬀-⯿·❭❯│┃|/\\_-]+$/gu

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[()#][0-9A-B]|[@-Z\\-_])/g, '')
}

// Keep lines that carry real text; drop spinner frames, box borders, and
// status-bar redraws where decoration outweighs readable characters.
function cleanTailLine(raw) {
  const squashed = raw.replace(/\s+/g, ' ').trim()
  if (squashed.length < 2) return ''
  const visible = squashed.replace(/\s/g, '')
  const decoration = (visible.match(DECORATION_RE) || []).length
  const alnum = (visible.match(/[0-9A-Za-zÀ-ɏ]/g) || []).length
  if (decoration / visible.length > 0.55 && alnum < 3) return ''
  const text = squashed.replace(EDGE_DECORATION_RE, '').trim()
  // Bare numbers and single glyphs are status-bar/shadow-DOM debris.
  if (text.length < 2 || /^\d+$/.test(text)) return ''
  return text.slice(0, TAIL_LINE_CHARS)
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

// .pixcode/ is runtime data — ignore it inside the dir itself so `git status`
// in the project stays clean without touching tracked files or .git/info.
function hideFromGit(dir) {
  try {
    const ignore = path.join(dir, '.gitignore')
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n', { mode: 0o644 })
  } catch { void 0 }
}

export function ensureMemory(workspace) {
  try {
    const dir = path.join(workspace, '.pixcode')
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
    hideFromGit(dir)
    const file = path.join(dir, 'MEMORY.md')
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, MEMORY_SEED, { mode: 0o644 })
    } else {
      migrateMemory(file)
    }
    ensureAgentsPointer(workspace)
    return '.pixcode/MEMORY.md'
  } catch { return null }
}

// Early builds wrote the session index into MEMORY.md and seeded it with
// boilerplate prose. Strip the generated block and upgrade the bare seed to
// the structured layout — anything a human actually wrote survives.
function migrateMemory(file) {
  try {
    let content = fs.readFileSync(file, 'utf8')
    if (content.includes(SESSIONS_START) && content.includes(SESSIONS_END)) {
      const start = content.indexOf(SESSIONS_START)
      const end = content.indexOf(SESSIONS_END) + SESSIONS_END.length
      content = (content.slice(0, start) + content.slice(end)).replace(/## Recent sessions\s*$/m, '')
    }
    // No sections means the file still holds only the old prose seed.
    if (!/^## /m.test(content)) {
      if (content === MEMORY_SEED || !fs.existsSync(file)) return
      fs.writeFileSync(file, MEMORY_SEED, { mode: 0o644 })
      return
    }
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') === content) return
    fs.writeFileSync(file, content.trimEnd() + '\n', { mode: 0o644 })
  } catch { void 0 }
}

// A root AGENTS.md is the only channel that reaches interactive sessions
// launched with no prompt — the CLIs load it themselves. Only created when
// absent (a user's own AGENTS.md is never overwritten) and hidden via
// .git/info/exclude, which ignores untracked files without touching .gitignore.
// A tracked-but-deleted AGENTS.md is a deliberate removal — leave it gone.
function ensureAgentsPointer(workspace) {
  try {
    const file = path.join(workspace, 'AGENTS.md')
    if (fs.existsSync(file)) return
    try {
      execFileSync('git', ['-C', workspace, 'ls-files', '--error-unmatch', 'AGENTS.md'], { stdio: 'pipe' })
      return
    } catch { /* untracked or not a repo — safe to write */ }
    fs.writeFileSync(file, AGENTS_POINTER, { mode: 0o644 })
    const exclude = path.join(workspace, '.git', 'info', 'exclude')
    if (fs.existsSync(exclude)) {
      const lines = fs.readFileSync(exclude, 'utf8').split('\n')
      if (!lines.some((line) => line.trim() === 'AGENTS.md')) fs.appendFileSync(exclude, 'AGENTS.md\n')
    }
  } catch { void 0 }
}

// handoffs/INDEX.md is the session log — rewritten on every handoff, newest
// first. Keeping it out of MEMORY.md is deliberate: memory is curated facts,
// the index is history an agent can consult when continuing prior work.
function writeIndex(workspace, session, fileCount, handoffName) {
  try {
    const dir = dirFor(workspace)
    const row = `- ${stamp(Date.now())} · ${session.state?.agent || 'agent'} #${session.index || 1} · ${fileCount} changed file${fileCount === 1 ? '' : 's'} · [\`${handoffName}\`](${handoffName})`
    const file = path.join(dir, 'INDEX.md')
    let rows = [row]
    try {
      rows = rows.concat(fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.startsWith('- ')))
    } catch { /* first index */ }
    fs.writeFileSync(file, [
      '# Session handoffs',
      '',
      'Newest first — one snapshot per stopped session: changed files, terminal',
      'tail, who ran it. Read the latest before continuing earlier work.',
      '',
      ...rows.slice(0, INDEX_MAX),
      ''
    ].join('\n'), { mode: 0o644 })
  } catch { void 0 }
}

export function writeHandoff(session, { files = [], branch = '', tail = '' } = {}) {
  if (!session?.workspace) return null
  try {
    // The store dir itself must never appear in the changed-files list.
    const changed = files.filter((file) => !/^\.pixcode([/\\]|$)/.test(file.path))
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
      ...(changed.length ? changed.map((file) => `- \`${file.status}\` ${file.path}`) : ['_(none recorded)_']),
      '',
      '## Terminal tail',
      '',
      '```',
      tail || '(no output captured)',
      '```',
      '',
      '---',
      memory ? `Continue this work: read \`${memory}\` for project memory and \`.pixcode/handoffs/INDEX.md\` for earlier sessions, then pick up where this session left off.` : 'Continue this work where this session left off.',
      ''
    ].filter((line) => line !== null)
    fs.writeFileSync(path.join(dir, name), lines.join('\n'), { mode: 0o644 })
    prune(dir)
    writeIndex(session.workspace, session, changed.length, name)
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
  // In-place TUI redraws arrive as CR-separated frames — every \r is a line
  // boundary, then decoration-only lines and consecutive repeats are dropped.
  // eslint-disable-next-line no-control-regex
  const cleaned = stripAnsi(text).replace(/\x07/g, '').replace(/\r/g, '\n')
  const lines = []
  let previous = ''
  for (const raw of cleaned.split('\n')) {
    const line = cleanTailLine(raw)
    if (!line || line === previous) continue
    previous = line
    lines.push(line)
  }
  // Keystroke-echo frames leave tiny fragments ("B", "Ne", "xt.js") that a
  // later frame renders in full — drop any line already contained in a
  // later one (also collapses non-consecutive repeats to the last copy).
  const kept = lines.filter((line, i) => {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].includes(line)) return false
    }
    return true
  })
  return kept.slice(-TAIL_LINES).join('\n')
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
