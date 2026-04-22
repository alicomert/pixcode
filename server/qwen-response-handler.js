// Qwen Code Response Handler — stream-json parser.
// Qwen Code is a fork of Gemini CLI and emits the same NDJSON stream-json
// event shape (type: init | message | tool_use | tool_result | result | error).
// This handler is intentionally a structural twin of gemini-response-handler;
// the split keeps provider normalization clean and lets the two evolve
// independently if Qwen's protocol ever diverges.
import { sessionsService } from './modules/providers/services/sessions.service.js';

class QwenResponseHandler {
  constructor(ws, options = {}) {
    this.ws = ws;
    this.buffer = '';
    this.onContentFragment = options.onContentFragment || null;
    this.onInit = options.onInit || null;
    this.onToolUse = options.onToolUse || null;
    this.onToolResult = options.onToolResult || null;
  }

  processData(data) {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        this.handleEvent(event);
      } catch {
        // Not a JSON line — debug output or CLI warning, ignore.
      }
    }
  }

  handleEvent(event) {
    const sid = typeof this.ws.getSessionId === 'function' ? this.ws.getSessionId() : null;

    if (event.type === 'init') {
      if (this.onInit) this.onInit(event);
      return;
    }

    if (event.type === 'message' && event.role === 'assistant') {
      const content = event.content || '';
      if (this.onContentFragment && content) this.onContentFragment(content);
    } else if (event.type === 'tool_use' && this.onToolUse) {
      this.onToolUse(event);
    } else if (event.type === 'tool_result' && this.onToolResult) {
      this.onToolResult(event);
    }

    const normalized = sessionsService.normalizeMessage('qwen', event, sid);
    for (const msg of normalized) {
      this.ws.send(msg);
    }
  }

  forceFlush() {
    if (this.buffer.trim()) {
      try {
        const event = JSON.parse(this.buffer);
        this.handleEvent(event);
      } catch { /* ignore */ }
    }
  }

  destroy() {
    this.buffer = '';
  }
}

export default QwenResponseHandler;
