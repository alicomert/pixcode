import { Adapter } from '../adapter.js'

export class DevinAdapter extends Adapter {
  static id = 'devin'
  static label = 'Devin'
  static cli = 'devin'
  static icon = '/icons/devin-icon.svg'
  static interactive = true

  buildTerminalArgs() { return [] }
  buildArgs({ prompt } = {}) { return ['-p', '--respect-workspace-trust=false', ...(prompt ? [prompt] : [])] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
