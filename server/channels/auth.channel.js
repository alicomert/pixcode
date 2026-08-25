import { issueApiKey, listApiKeys, revokeApiKey } from '../auth.js'

export const authChannel = {
  ops: {
    me: (ctx) => ({ principal: ctx.principal }),
    keys: () => listApiKeys(),
    issueKey: (_ctx, { name } = {}) => issueApiKey(name),
    revokeKey: (_ctx, { id } = {}) => ({ revoked: revokeApiKey(id) })
  }
}
