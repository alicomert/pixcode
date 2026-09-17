import { listAgents } from '../agents/adapter.js'
import { requireAccess, requireAdmin } from '../auth.js'
import { httpError } from '../util/http.js'
import { cliEnvInfo, saveCliEnv } from '../cli-env.js'
import { closeRunner, detachSubscriber, getHistory, inputRunner, listChangedFiles, listPresence, listSessions, resizeRunner, sendToRunner, startRunner, stopRunner, unwatchRunner, watchRunner } from '../agents/runner.js'

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
    history: (ctx, { sessionId } = {}) => getHistory(ctx, sessionId),
    presence: (ctx) => { requireAccess(ctx); return listPresence(ctx) },
    watch: (ctx, { sessionId } = {}) => { requireAccess(ctx); return watchRunner(ctx, sessionId) },
    unwatch: (ctx, { sessionId } = {}) => unwatchRunner(ctx, sessionId),
    changedFiles: (ctx, { sessionId } = {}) => { requireAccess(ctx); return listChangedFiles(ctx, sessionId) },
    // Per-user CLI environment: names-only view (values are write-only) plus
    // the private-home toggle. Any signed-in user manages their own record;
    // admins may pass `for` to manage a member's (e.g. grant a private home
    // so the member signs in to claude/devin/gh with their own account).
    cliEnv: (ctx, { for: target } = {}) => {
      const self = ctx?.principal?.sub || 'owner'
      const sub = target ? String(target) : self
      if (sub !== self) requireAdmin(ctx)
      else requireAccess(ctx)
      return cliEnvInfo(sub)
    },
    saveCliEnv: (ctx, { for: target, env, home } = {}) => {
      const self = ctx?.principal?.sub || 'owner'
      const sub = target ? String(target) : self
      if (sub !== self) requireAdmin(ctx)
      else requireAccess(ctx)
      return saveCliEnv(sub, { env, home })
    }
  },
  onClose(ctx) { detachSubscriber(ctx) }
}
