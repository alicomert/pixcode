import { listAgents } from '../agents/adapter.js'
import { requireAccess, requireAdmin } from '../auth.js'
import { httpError } from '../util/http.js'
import { cliEnvInfo, saveCliEnv } from '../cli-env.js'
import { ensureMemory, listHandoffs, readHandoff } from '../handoffs.js'
import { installSkillRepo, listSkills, removeSkill, skillsDirFor } from '../skills.js'
import { workspaceRoot } from '../workspace.js'
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
    // Session handoffs + shared workspace memory: workspaceRoot() applies the
    // caller's project allowlist before any file under .pixcode/ is touched.
    handoffs: (ctx, { workspace } = {}) => listHandoffs(workspaceRoot(workspace, ctx)),
    handoff: (ctx, { workspace, name } = {}) => ({ content: readHandoff(workspaceRoot(workspace, ctx), name) }),
    memory: (ctx, { workspace } = {}) => ({ path: ensureMemory(workspaceRoot(workspace, ctx)) }),
    // Broadcast the same prompt to several running sessions — each target is
    // validated by sendToRunner's own write check, so a member can never
    // reach a session they could not type into directly.
    broadcast: (ctx, { sessionIds, text } = {}) => {
      requireAccess(ctx)
      const ids = Array.isArray(sessionIds) ? [...new Set(sessionIds)].slice(0, 20) : []
      if (!ids.length) throw httpError(400, 'sessionIds required')
      if (!String(text || '').trim()) throw httpError(400, 'text required')
      return {
        results: ids.map((id) => {
          try { sendToRunner(ctx, id, text); return { sessionId: id, ok: true } }
          catch (error) { return { sessionId: id, error: error.message } }
        })
      }
    },
    // Agent skill manager: installs SKILL.md collections from a git repo into
    // the agent's skills dir. `for` manages another user's private home
    // (admin-only); `workspace` scope installs into .claude/skills inside the
    // project — the same allowlist the fs ops use applies via workspaceRoot.
    skills: (ctx, { agent, scope, for: target, workspace } = {}) => {
      const self = ctx?.principal?.sub || 'owner'
      const sub = target ? String(target) : self
      if (sub !== self) requireAdmin(ctx)
      else requireAccess(ctx)
      const base = scope === 'workspace' ? workspaceRoot(workspace, ctx) : ''
      return { skills: listSkills(skillsDirFor({ agent, scope, sub, workspace: base })) }
    },
    skillInstall: async (ctx, { agent, scope, for: target, workspace, repo } = {}) => {
      const self = ctx?.principal?.sub || 'owner'
      const sub = target ? String(target) : self
      if (sub !== self) requireAdmin(ctx)
      else requireAccess(ctx)
      const base = scope === 'workspace' ? workspaceRoot(workspace, ctx) : ''
      const dir = skillsDirFor({ agent, scope, sub, workspace: base })
      return installSkillRepo({ repo, dir })
    },
    skillRemove: (ctx, { agent, scope, for: target, workspace, name } = {}) => {
      const self = ctx?.principal?.sub || 'owner'
      const sub = target ? String(target) : self
      if (sub !== self) requireAdmin(ctx)
      else requireAccess(ctx)
      const base = scope === 'workspace' ? workspaceRoot(workspace, ctx) : ''
      return removeSkill(skillsDirFor({ agent, scope, sub, workspace: base }), name)
    },
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
