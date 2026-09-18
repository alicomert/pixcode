import fs from 'node:fs'
import { detachActivitySubscriber, listActivity, subscribeActivity, unsubscribeActivity } from '../activity.js'
import { pinFsWatcher, unpinFsWatcher } from './fs.channel.js'
import { workspacePath } from '../workspace.js'

// Resolve the caller's workspace exactly like the fs watcher does — the
// project allowlist in workspacePath() applies before any log is exposed.
function base(requestedWorkspace, ctx) {
  const { base } = workspacePath(requestedWorkspace, '.', ctx)
  try { return fs.realpathSync(base) } catch { return base }
}

// An activity subscriber also pins the fs watcher: the log must keep filling
// from disk changes even when the file tree is not armed for this client.
const pinned = new Map() // ctx -> Set<base>

function pin(ctx, resolved) {
  let set = pinned.get(ctx)
  if (!set) { set = new Set(); pinned.set(ctx, set) }
  if (set.has(resolved)) return
  set.add(resolved)
  pinFsWatcher(resolved)
}

function unpin(ctx, resolved) {
  const set = pinned.get(ctx)
  if (!set?.delete(resolved)) return
  unpinFsWatcher(resolved)
  if (!set.size) pinned.delete(ctx)
}

export const activityChannel = {
  ops: {
    list(ctx, { workspace, limit } = {}) {
      return { entries: listActivity(base(workspace, ctx), limit) }
    },
    watch(ctx, { workspace } = {}) {
      const resolved = base(workspace, ctx)
      subscribeActivity(resolved, ctx, workspace)
      pin(ctx, resolved)
      return { watching: true }
    },
    unwatch(ctx, { workspace } = {}) {
      const resolved = base(workspace, ctx)
      unsubscribeActivity(resolved, ctx)
      unpin(ctx, resolved)
      return { watching: false }
    }
  },
  onClose(ctx) {
    detachActivitySubscriber(ctx)
    const set = pinned.get(ctx)
    if (set) {
      for (const resolved of set) unpinFsWatcher(resolved)
      pinned.delete(ctx)
    }
  }
}
