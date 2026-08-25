import { Adapter } from '../adapter.js'

export class GeminiAdapter extends Adapter {
  static id = 'gemini'
  static label = 'Gemini CLI'
  static cli = 'gemini'
  static icon = '/icons/gemini-ai-icon.svg'
  static interactive = false

  buildArgs({ prompt } = {}) { return ['-p', prompt || ''] }
  normalizeLine(line) { return [{ type: 'message', role: 'assistant', text: line, partial: true }] }
}
