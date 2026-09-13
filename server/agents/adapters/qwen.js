import { Adapter } from '../adapter.js'

export class QwenAdapter extends Adapter {
  static id = 'qwen'
  static label = 'Qwen Code'
  static cli = 'qwen'
  static icon = '/icons/qwen-logo.svg'
  static interactive = false
  static install = { command: 'npm install -g @qwen-code/qwen-code' }

  buildTerminalArgs() { return [] }
  buildResumeArgs() { return ['--resume'] }
  buildArgs({ prompt } = {}) { return ['-p', prompt || ''] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
