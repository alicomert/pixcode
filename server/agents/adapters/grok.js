import { Adapter } from '../adapter.js'

export class GrokAdapter extends Adapter {
  static id = 'grok'
  static label = 'Grok CLI'
  static cli = 'grok'
  static icon = '/icons/grok-build-icon.png'
  static interactive = false

  buildTerminalArgs() { return [] }
  buildArgs({ prompt } = {}) { return prompt ? ['-p', prompt] : [] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
