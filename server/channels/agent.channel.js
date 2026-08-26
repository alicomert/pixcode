import { listAgents } from '../agents/adapter.js'
import { closeRunner, detachSubscriber, getHistory, inputRunner, listSessions, resizeRunner, sendToRunner, startRunner, stopRunner } from '../agents/runner.js'

export const agentChannel = {
  ops: {
    agents: () => listAgents(),
    start: (ctx, data) => startRunner(ctx, data),
    input: (ctx, { sessionId, data } = {}) => inputRunner(ctx, sessionId, data),
    resize: (ctx, { sessionId, cols, rows } = {}) => resizeRunner(ctx, sessionId, cols, rows),
    send: (ctx, { sessionId, text } = {}) => sendToRunner(ctx, sessionId, text),
    stop: (ctx, { sessionId } = {}) => stopRunner(ctx, sessionId),
    close: (ctx, { sessionId } = {}) => closeRunner(ctx, sessionId),
    sessions: (ctx, { workspace } = {}) => listSessions(ctx, workspace),
    history: (ctx, { sessionId } = {}) => getHistory(ctx, sessionId)
  },
  onClose(ctx) { detachSubscriber(ctx) }
}
