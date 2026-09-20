import fs from 'node:fs'
import path from 'node:path'

// Session handoffs: when an agent session stops, a Markdown summary lands in
// the workspace at .pixcode/handoffs/<session>.md — changed files, the
// terminal tail, who ran it. The next session (any CLI, any user) can read
// the file and pick the work up, which is the multi-CLI memory the agent
// ecosystem converged on. .pixcode/MEMORY.md is the shared half: human-
// editable notes on top, plus an auto-maintained "Recent sessions" index.
const MAX_HANDOFFS = 30
const TAIL_LINES = 40
const TAIL_BYTES = 24 * 1024
const TAIL_LINE_CHARS = 240
const LIST_LIMIT = 20
const NAME_PATTERN = /^[\w.-]+\.md$/
const SESSIONS_START = '<!-- pixcode:sessions -->'
const SESSIONS_END = '<!-- /pixcode:sessions -->'
const SESSIONS_MAX = 12

const MEMORY_SEED = `# Project memory

Shared memory for everyone working in this workspace — humans and agent
sessions. Conventions, decisions, and gotchas belong here; agent sessions
continuing from a handoff are pointed at this file.

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
    if (!fs.existsSync(file)) fs.writeFileSync(file, MEMORY_SEED, { mode: 0o644 })
    return '.pixcode/MEMORY.md'
  } catch { return null }
}

// MEMORY.md doubles as the session index: a marker-delimited "Recent sessions"
// block is rewritten on every handoff so the file actually stays current.
// Anything humans write outside the markers is preserved verbatim.
function updateMemory(workspace, session, fileCount, handoffName) {
  try {
    const file = path.join(workspace, '.pixcode', 'MEMORY.md')
    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : MEMORY_SEED
    const row = `- ${stamp(Date.now())} · ${session.state?.agent || 'agent'} #${session.index || 1} · ${fileCount} changed file${fileCount === 1 ? '' : 's'} · [\`handoffs/${handoffName}\`](handoffs/${handoffName})`
    if (content.includes(SESSIONS_START) && content.includes(SESSIONS_END)) {
      const start = content.indexOf(SESSIONS_START) + SESSIONS_START.length
      const end = content.indexOf(SESSIONS_END)
      const rows = content.slice(start, end).split('\n').filter((line) => line.startsWith('- '))
      rows.unshift(row)
      content = `${content.slice(0, start)}\n${rows.slice(0, SESSIONS_MAX).join('\n')}\n${content.slice(end)}`
    } else {
      content = `${content.trimEnd()}\n\n## Recent sessions\n\n${SESSIONS_START}\n${row}\n${SESSIONS_END}\n`
    }
    fs.writeFileSync(file, content, { mode: 0o644 })
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
      memory ? `Continue this work: read \`${memory}\` for shared project memory, then pick up where this session left off.` : 'Continue this work where this session left off.',
      ''
    ].filter((line) => line !== null)
    fs.writeFileSync(path.join(dir, name), lines.join('\n'), { mode: 0o644 })
    prune(dir)
    updateMemory(session.workspace, session, changed.length, name)
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
