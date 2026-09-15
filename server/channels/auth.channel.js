import { createUser, issueApiKey, listApiKeys, listUsers, removeUser, requireAdmin, revokeApiKey, updateUser } from '../auth.js'

export const authChannel = {
  ops: {
    me: (ctx) => ({ principal: ctx.principal }),
    keys: (ctx) => { requireAdmin(ctx); return listApiKeys() },
    issueKey: (ctx, { name } = {}) => { requireAdmin(ctx); return issueApiKey(name) },
    revokeKey: (ctx, { id } = {}) => { requireAdmin(ctx); return { revoked: revokeApiKey(id) } },
    users: (ctx) => { requireAdmin(ctx); return listUsers() },
    createUser: (ctx, data) => { requireAdmin(ctx); return createUser(data) },
    updateUser: (ctx, { id, ...patch } = {}) => { requireAdmin(ctx); return updateUser(id, patch) },
    removeUser: (ctx, { id } = {}) => { requireAdmin(ctx); return { removed: removeUser(id) } }
  }
}
