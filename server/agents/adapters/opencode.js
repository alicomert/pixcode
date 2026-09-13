import { Adapter } from '../adapter.js'

export class OpenCodeAdapter extends Adapter {
  static id = 'opencode'
  static label = 'OpenCode'
  static cli = 'opencode'
  static icon = '/icons/opencode-logo-dark.svg'
  static interactive = false
  static install = { command: 'npm install -g opencode-ai' }

  buildTerminalArgs() { return [] }
  buildResumeArgs() { return ['--continue'] }
  buildArgs({ prompt } = {}) { return ['run', ...(prompt ? [prompt] : [])] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
