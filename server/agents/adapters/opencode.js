import { Adapter } from '../adapter.js'

export class OpenCodeAdapter extends Adapter {
  static id = 'opencode'
  static label = 'OpenCode'
  static cli = 'opencode'
  static interactive = false

  buildArgs({ prompt } = {}) { return ['run', ...(prompt ? [prompt] : [])] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
