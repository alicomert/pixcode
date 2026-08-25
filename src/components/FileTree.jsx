import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { openFile } from '../state/app.js'

function joinPath(parent, name) {
  return parent === '.' ? name : `${parent}/${name}`
}

function Node({ path, name, type, depth = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [error, setError] = useState('')

  async function activate() {
    if (type !== 'dir') { openFile(path); return }
    const next = !expanded
    setExpanded(next)
    if (next && !children) {
      try { setChildren(await ws.request('fs', 'list', { path })) } catch (requestError) { setError(requestError.message) }
    }
  }

  return (
    <div>
      <button class={`tree-item ${type === 'dir' ? `dir ${expanded ? 'open' : ''}` : 'file'}`} style={{ paddingLeft: `${6 + depth * 12}px` }} type="button" onClick={activate}>
        <span class="name">{name}</span>
      </button>
      {error && <div class="error-text" style={{ paddingLeft: `${12 + depth * 12}px` }}>{error}</div>}
      {expanded && children?.map((child) => <Node key={joinPath(path, child.name)} path={joinPath(path, child.name)} {...child} depth={depth + 1} />)}
      {expanded && children?.length === 0 && <div class="tree-item muted" style={{ paddingLeft: `${18 + depth * 12}px` }}>{t('tree.empty')}</div>}
    </div>
  )
}

export function FileTree() {
  const [root, setRoot] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ws.request('fs', 'list', { path: '.' }).then((entries) => {
      if (!cancelled) setRoot(entries)
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message)
    })
    return () => { cancelled = true }
  }, [])

  if (error) return <div class="tree error-text">{error}</div>
  if (!root) return <div class="tree muted">{t('tree.loading')}</div>
  if (root.length === 0) return <div class="tree muted">{t('tree.empty')}</div>
  return <div class="tree">{root.map((entry) => <Node key={entry.name} path={entry.name} {...entry} />)}</div>
}
