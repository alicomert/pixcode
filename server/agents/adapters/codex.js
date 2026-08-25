import { Adapter } from '../adapter.js'

export class CodexAdapter extends Adapter {
  static id = 'codex'
  static label = 'Codex'
  static cli = 'codex'
  static icon = '/icons/codex-white.svg'
  static interactive = false

  buildTerminalArgs() { return [] }
  buildArgs({ prompt } = {}) { return ['exec', '--json', ...(prompt ? [prompt] : [])] }

  normalizeLine(line) {
    let object
    try { object = JSON.parse(line) } catch { return [{ type: 'message', role: 'assistant', text: line }] }
    if (object.type === 'item.completed' && object.item?.type === 'message') {
      const text = (object.item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text).join('')
      return text ? [{ type: 'message', role: 'assistant', text }] : []
    }
    if (object.type === 'item.completed' && object.item?.type === 'function_call') {
      return [{ type: 'tool', role: 'assistant', tool: { name: object.item.name, input: object.item.arguments } }]
    }
    if (object.type === 'task.completed') return [{ type: 'done', role: 'system', result: object }]
    return []
  }
}
