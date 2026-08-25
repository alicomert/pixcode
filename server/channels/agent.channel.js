import { listAgents } from '../agents/adapter.js'
import { getHistory, listSessions, sendToRunner, startRunner, stopOwnedSessions, stopRunner } from '../agents/runner.js'

export const agentChannel = {
  ops: {
    agents: () => listAgents(),
    start: (ctx, data) => startRunner(ctx, data),
    send: (ctx, { sessionId, text } = {}) => sendToRunner(ctx, sessionId, text),
    stop: (ctx, { sessionId } = {}) => stopRunner(ctx, sessionId),
    sessions: (ctx) => listSessions(ctx),
    history: (ctx, { sessionId } = {}) => getHistory(ctx, sessionId)
  },
  onClose(ctx) { stopOwnedSessions(ctx) }
}
