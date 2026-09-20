import { Adapter } from '../adapter.js'

export class DevinAdapter extends Adapter {
  static id = 'devin'
  static label = 'Devin'
  static cli = 'devin'
  static icon = '/icons/devin-icon.svg'
  static interactive = true
  static install = { command: 'curl -fsSL https://cli.devin.ai/install.sh | bash', windows: 'irm https://static.devin.ai/cli/setup.ps1 | iex' }

  buildTerminalArgs() { return [] }
  // After a daemon restart, continue the conversation this session was on
  // instead of dropping the chat into a fresh one.
  buildResumeArgs() { return ['-c'] }
  // -p's optional PROMPT value must directly follow the flag — anything
  // between them turns the prompt into a PATH argument instead.
  buildArgs({ prompt } = {}) { return ['-p', ...(prompt ? [prompt] : []), '--respect-workspace-trust=false'] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
