import { listAgents } from '../agents/adapter.js'
import { requireAccess } from '../auth.js'
import { httpError } from '../util/http.js'
import { closeRunner, detachSubscriber, getHistory, inputRunner, listSessions, resizeRunner, sendToRunner, startRunner, stopRunner } from '../agents/runner.js'

export const agentChannel = {
  ops: {
    agents: async (ctx, { refresh } = {}) => {
      const access = requireAccess(ctx)
      const agents = await listAgents({ refresh: !!refresh })
      return access.agents ? agents.filter((agent) => access.agents.has(agent.id)) : agents
    },
    start: (ctx, data = {}) => {
      const access = requireAccess(ctx)
      if (access.agents && !access.agents.has(String(data.agent || ''))) throw httpError(403, 'agent is not assigned to this account')
      return startRunner(ctx, data)
    },
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
