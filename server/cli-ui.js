import readline from 'node:readline/promises'

// Tiny interactive layer for the CLI — standard library only so the published
// package stays dependency-light. Every helper degrades to plain output when
// stdout is not a TTY (pipes, CI, daemon logs).

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY)

const paint = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`
const noColor = Boolean(process.env.NO_COLOR) || !process.stdout.isTTY
const wrap = (code) => (text) => (noColor ? String(text) : paint(code)(text))

export const c = {
  bold: wrap(1),
  dim: wrap(2),
  accent: wrap(35),   // pixcode indigo → magenta reads well on dark terminals
  ok: wrap(32),
  warn: wrap(33),
  err: wrap(31),
  cyan: wrap(36)
}

export function box(title, rows) {
  // eslint-disable-next-line no-control-regex -- stripping ANSI escapes is the point
  const plain = (row) => row.replace(/\x1b\[[0-9;]*m/g, '')
  const width = Math.min(72, Math.max(title.length + 2, ...rows.map((row) => plain(row).length + 2)))
  console.log(`  ┌─ ${c.bold(title)} ${'─'.repeat(Math.max(0, width - title.length - 2))}┐`)
  for (const row of rows) console.log(`  │ ${row}`)
  console.log(`  └${'─'.repeat(width)}┘`)
}

let rl = null
function prompt() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return rl
}

export function closePrompts() {
  if (rl) { rl.close(); rl = null }
}

export async function ask(question, fallback = '') {
  const suffix = fallback ? ` ${c.dim(`[${fallback}]`)}` : ''
  try {
    const answer = (await prompt().question(`  ${question}${suffix}: `)).trim()
    return answer || fallback
  } catch {
    return fallback // EOF — accept the default
  }
}

export async function confirm(question, fallback = true) {
  const hint = fallback ? 'Y/n' : 'y/N'
  try {
    const answer = (await prompt().question(`  ${question} ${c.dim(`[${hint}]`)}: `)).trim().toLowerCase()
    if (!answer) return fallback
    return answer === 'y' || answer === 'yes'
  } catch {
    return fallback
  }
}

// Numbered pick-list; returns the chosen option's `value`, 'back', or null on
// quit. Non-TTY callers get the default without prompting.
export async function choose(title, options, { defaultValue } = {}) {
  if (!isInteractive()) return defaultValue ?? options[0]?.value
  if (title) console.log(`  ${c.bold(title)}`)
  options.forEach((option, index) => {
    console.log(`    ${c.accent(`${index + 1})`)} ${option.label}${option.hint ? `  ${c.dim(option.hint)}` : ''}`)
  })
  for (;;) {
    let raw
    try {
      raw = (await prompt().question(`  ${c.dim('>')} `)).trim().toLowerCase()
    } catch {
      return null // stdin closed (Ctrl+D / EOF) — treat as quit
    }
    if (!raw && defaultValue !== undefined) return defaultValue
    if (raw === 'q' || raw === 'quit' || raw === 'exit') return null
    if (raw === 'b' || raw === 'back') return 'back'
    const index = Number(raw) - 1
    if (Number.isInteger(index) && options[index]) return options[index].value
    console.log(`  ${c.warn('pick a number from the list (or q to quit)')}`)
  }
}
