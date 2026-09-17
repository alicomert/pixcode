import { ws } from './ws.js'
import { workspace } from '../state/app.js'

// One live workspace watch per connection. The subscription dies with the
// socket, so it is re-armed on every (re)open and re-pointed whenever the
// workspace switches. Views only consume `ws.on('fs', 'changed')` events —
// they never manage the subscription themselves.
let watched = null

function currentWorkspace() {
  return workspace.value?.path || ''
}

function subscribe(force = false) {
  const next = currentWorkspace()
  if (!force && next === watched) return
  const previous = watched
  watched = next
  if (previous && previous !== next) ws.request('fs', 'unwatch', { workspace: previous }).catch(() => {})
  ws.request('fs', 'watch', { workspace: next }).catch(() => {})
}

export function initFsWatch() {
  window.addEventListener('pixcode:ws-open', () => subscribe(true))
  window.addEventListener('pixcode:workspace-change', () => subscribe())
  subscribe()
}
