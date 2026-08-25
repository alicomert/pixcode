import { Adapter } from '../adapter.js'

export class QwenAdapter extends Adapter {
  static id = 'qwen'
  static label = 'Qwen Code'
  static cli = 'qwen'
  static icon = '/icons/qwen-logo.svg'
  static interactive = false

  buildTerminalArgs() { return [] }
  buildArgs({ prompt } = {}) { return ['-p', prompt || ''] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
