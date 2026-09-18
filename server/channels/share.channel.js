import { requireAdmin } from '../auth.js'
import { boreLogin, boreStatus, shareDisable, shareEnable, shareProbe, shareProviders, shareStatus } from '../share.js'

// Public-link management is admin-only: enabling it exposes the whole
// workbench on a public URL, so members must not flip it on themselves.
export const shareChannel = {
  ops: {
    status: (ctx) => { requireAdmin(ctx); return shareStatus() },
    providers: (ctx) => { requireAdmin(ctx); return { providers: shareProviders() } },
    enable: (ctx, { provider, opts, port } = {}) => {
      requireAdmin(ctx)
      return shareEnable(provider, opts || {}, { port })
    },
    disable: (ctx) => { requireAdmin(ctx); return shareDisable() },
    probe: (ctx) => { requireAdmin(ctx); return shareProbe() },
    boreStatus: (ctx) => { requireAdmin(ctx); return boreStatus() },
    boreLogin: (ctx, { origin } = {}) => { requireAdmin(ctx); return boreLogin(origin) }
  }
}
