// OpenCode Response Handler — `opencode run --format json` parser.
//
// The JSON format streams one event per line (NDJSON). Verified shapes
// (opencode-ai 0.x, see opencode.ai/docs/cli):
//
//   { type:"step_start",  timestamp, sessionID, part:{ type:"step-start",  id, messageID, sessionID } }
//   { type:"text",        timestamp, sessionID, part:{ type:"text", id, messageID, sessionID, text:"…", time:{…}, metadata:{…} } }
//   { type:"tool_use",    timestamp, sessionID, part:{ type:"tool-use",  callID, tool, state:{ input } } }
//   { type:"tool_result", timestamp, sessionID, part:{ type:"tool-result", callID, state:{ output, status } } }
//   { type:"step_finish", timestamp, sessionID, part:{ type:"step-finish", reason, tokens, cost } }
//   { type:"error",       timestamp, sessionID, error:{ name, data:{ message, statusCode? } } }
//
// Important: field names are camelCase — `sessionID`, `callID`, `messageID`.
// Earlier integration code assumed snake_case (`session_id`, `tool_id`) which
// is wrong; nothing in `opencode run --format json` uses snake_case.
//
// Lines that don't parse as JSON are surfaced as plain text deltas (covers
// the CLI's pre-stream banner output, "Shell cwd was reset to …" notices on
// Windows, and any debug noise).
import { sessionsService } from './modules/providers/services/sessions.service.js';

class OpencodeResponseHandler {
  constructor(ws, options = {}) {
    this.ws = ws;
    this.buffer = '';
    this.onContentFragment = options.onContentFragment || null;
    this.onInit = options.onInit || null;
    this.onToolUse = options.onToolUse || null;
    this.onToolResult = options.onToolResult || null;
    this.onError = options.onError || null;
    this.capturedCliSessionId = null;
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

    // Capture OpenCode's real session ID (e.g. `ses_22d6…`) the first time we
    // see one. Every event carries `sessionID` at the top level — we don't
    // wait for an `init`/`session.start` event because OpenCode `run --format
    // json` never emits those (the first event is always `step_start`).
    if (!this.capturedCliSessionId && typeof event.sessionID === 'string' && event.sessionID) {
      this.capturedCliSessionId = event.sessionID;
      if (this.onInit) this.onInit({ session_id: event.sessionID, sessionID: event.sessionID });
    }

    const part = event.part && typeof event.part === 'object' ? event.part : null;

    if (event.type === 'text' && part && typeof part.text === 'string') {
      if (this.onContentFragment && part.text) this.onContentFragment(part.text);
    } else if (event.type === 'tool_use' || event.type === 'tool-use' || event.type === 'tool.start') {
      const state = part?.state && typeof part.state === 'object' ? part.state : {};
      if (this.onToolUse) this.onToolUse({
        tool_id: part?.callID || part?.id || event.tool_id || '',
        tool_name: part?.tool || part?.name || event.tool_name || '',
        parameters: state.input || part?.input || event.parameters || {},
      });
    } else if (event.type === 'tool_result' || event.type === 'tool-result' || event.type === 'tool.end') {
      const state = part?.state && typeof part.state === 'object' ? part.state : {};
      if (this.onToolResult) this.onToolResult({
        tool_id: part?.callID || part?.id || event.tool_id || '',
        output: state.output ?? part?.output ?? event.output ?? event.result ?? '',
        status: state.status || event.status || (event.isError ? 'error' : 'ok'),
      });
    }

    const normalized = sessionsService.normalizeMessage('opencode', event, sid);
    for (const msg of normalized) {
      if (msg.kind === 'error' && this.onError) {
        this.onError(msg.content || 'OpenCode streaming error');
      }
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
