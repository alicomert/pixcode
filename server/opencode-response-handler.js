// OpenCode Response Handler — `opencode run --format json` parser.
//
// The JSON format streams one event per line (NDJSON). Event shapes follow
// the OpenAPI contract exposed by `opencode serve`. We treat the stream
// permissively: lines that don't parse as JSON are passed through as plain
// text deltas (covers OpenCode's pre-stream banner output and any debug
// noise the CLI emits to stdout).
import { sessionsService } from './modules/providers/services/sessions.service.js';

class OpencodeResponseHandler {
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
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        this.handleEvent(event);
      } catch {
        // Non-JSON line — surface as plain text delta so the user sees CLI
        // banners / status messages instead of swallowing them silently.
        if (this.onContentFragment) this.onContentFragment(trimmed + '\n');
      }
    }
  }

  handleEvent(event) {
    const sid = typeof this.ws.getSessionId === 'function' ? this.ws.getSessionId() : null;

    if (event.type === 'init' || event.type === 'session.start') {
      if (this.onInit) this.onInit(event);
      return;
    }

    // OpenCode emits assistant text as either a top-level `text` event
    // (current `--format json` shape: `{ type: "text", part: { text } }`)
    // or as `message`/`part` legacy shapes from earlier builds. Cover all
    // three so we don't drop tokens on a CLI version we haven't matched.
    if (event.type === 'text' && event.part && typeof event.part.text === 'string') {
      if (this.onContentFragment && event.part.text) this.onContentFragment(event.part.text);
    } else if (event.type === 'message' && event.role === 'assistant') {
      const content = event.content || event.text || '';
      if (this.onContentFragment && content) this.onContentFragment(content);
    } else if (event.type === 'part' && event.part_type === 'text') {
      const content = event.text || event.content || '';
      if (this.onContentFragment && content) this.onContentFragment(content);
    } else if (event.type === 'tool_use' || event.type === 'tool-use' || event.type === 'tool.start') {
      // Tool-use shape on `--format json`: `{ type:"tool_use", part:{ callID, tool, state:{ input } } }`
      const part = event.part || event;
      if (this.onToolUse) this.onToolUse({
        tool_id: part.callID || part.id || event.tool_id,
        tool_name: part.tool || part.name || event.tool_name,
        parameters: part.state?.input || part.input || event.parameters || {},
      });
    } else if (event.type === 'tool_result' || event.type === 'tool-result' || event.type === 'tool.end') {
      const part = event.part || event;
      const state = part.state || {};
      if (this.onToolResult) this.onToolResult({
        tool_id: part.callID || part.id || event.tool_id,
        output: state.output ?? part.output ?? event.output ?? event.result ?? '',
        status: state.status || event.status || (event.isError ? 'error' : 'ok'),
      });
    }

    const normalized = sessionsService.normalizeMessage('opencode', event, sid);
    for (const msg of normalized) {
      this.ws.send(msg);
    }
  }

  forceFlush() {
    if (this.buffer.trim()) {
      try {
        const event = JSON.parse(this.buffer);
        this.handleEvent(event);
      } catch {
        if (this.onContentFragment) this.onContentFragment(this.buffer);
      }
    }
  }

  destroy() {
    this.buffer = '';
  }
}

export default OpencodeResponseHandler;
