import { Adapter } from '../adapter.js'

export class ClaudeAdapter extends Adapter {
  static id = 'claude'
  static label = 'Claude Code'
  static cli = 'claude'
  static icon = '/icons/claude-ai-icon.svg'
  static interactive = true

  buildArgs({ prompt } = {}) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--input-format', 'stream-json']
    if (prompt) args.push(prompt)
    return args
  }

  buildUserFrame(text) {
    return `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`
  }

  normalizeLine(line) {
    let object
    try { object = JSON.parse(line) } catch { return [{ type: 'message', role: 'assistant', text: line }] }
    const events = []
    if (object.type === 'system' && object.subtype === 'init') {
      events.push({ type: 'status', role: 'system', status: 'ready', providerSessionId: object.session_id })
    } else if (object.type === 'assistant') {
      const content = object.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) events.push({ type: 'message', role: 'assistant', text: block.text })
          if (block.type === 'tool_use') events.push({ type: 'tool', role: 'assistant', tool: { name: block.name, input: block.input } })
        }
      }
    } else if (object.type === 'result') {
      events.push({ type: 'done', role: 'system', result: object.result, usage: object.usage })
    }
    return events
  }
}
