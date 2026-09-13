import { Adapter } from '../adapter.js'

export class DevinAdapter extends Adapter {
  static id = 'devin'
  static label = 'Devin'
  static cli = 'devin'
  static icon = '/icons/devin-icon.svg'
  static interactive = true
  static install = { command: 'curl -fsSL https://cli.devin.ai/install.sh | bash', windows: 'irm https://static.devin.ai/cli/setup.ps1 | iex' }

  buildTerminalArgs() { return [] }
  buildArgs({ prompt } = {}) { return ['-p', '--respect-workspace-trust=false', ...(prompt ? [prompt] : [])] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
