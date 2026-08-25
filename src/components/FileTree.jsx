import { useEffect, useState } from 'preact/hooks'
import { ChevronDown, ChevronRight, File, FilePlus2, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { openFile } from '../state/app.js'

function joinPath(parent, name) {
  return parent === '.' ? name : parent + '/' + name
}

function Node({ path, name, type, depth = 0, refreshToken, onError, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)

  useEffect(() => {
    setExpanded(false)
    setChildren(null)
  }, [refreshToken])

  async function loadChildren(force = false) {
    if (!force && children) return
    try {
      setChildren(await ws.request('fs', 'list', { path }))
      onError('')
    } catch (requestError) {
      onError(requestError.message)
    }
  }

  async function activate() {
    if (type !== 'dir') { openFile(path); return }
    const next = !expanded
    setExpanded(next)
    if (next) await loadChildren()
  }

  const itemClass = ['tree-item', type === 'dir' ? 'dir' : 'file', expanded ? 'open' : ''].filter(Boolean).join(' ')
  return (
    <div class="tree-node">
      <div class="tree-row">
        <button class={itemClass} style={{ paddingLeft: String(6 + depth * 12) + 'px' }} type="button" onClick={activate} title={path}>
          <span class="tree-file-icon" aria-hidden="true">{type === 'dir' ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <File size={14} />}</span>
          <span class="name">{name}</span>
        </button>
        <span class="tree-actions">
          <button class="tw-icon-button" type="button" title={t('tree.rename')} aria-label={t('tree.rename')} onClick={() => onChanged({ type: 'rename', path, name })}><Pencil size={13} /></button>
          <button class="tw-icon-button" type="button" title={t('tree.delete')} aria-label={t('tree.delete')} onClick={() => onChanged({ type: 'delete', path, name })}><Trash2 size={13} /></button>
        </span>
      </div>
      {expanded && children?.map((child) => <Node key={joinPath(path, child.name)} path={joinPath(path, child.name)} {...child} depth={depth + 1} refreshToken={refreshToken} onError={onError} onChanged={onChanged} />)}
      {expanded && children?.length === 0 && <div class="tree-item muted" style={{ paddingLeft: String(18 + depth * 12) + 'px' }}>{t('tree.empty')}</div>}
    </div>
  )
}

export function FileTree() {
  const [root, setRoot] = useState(null)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [dialog, setDialog] = useState(null)

  async function refresh() {
    try {
      setError('')
      setRoot(await ws.request('fs', 'list', { path: '.' }))
      setRefreshToken((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => { refresh() }, [])

  async function submitAction(event) {
    event.preventDefault()
    if (!dialog) return
    try {
      if (dialog.type === 'delete') {
        await ws.request('fs', 'delete', { path: dialog.path })
      } else if (dialog.type === 'rename') {
        const parent = dialog.path.includes('/') ? dialog.path.slice(0, dialog.path.lastIndexOf('/')) : '.'
        await ws.request('fs', 'rename', { from: dialog.path, to: joinPath(parent, dialog.value.trim()) })
      } else if (dialog.type === 'file') {
        await ws.request('fs', 'write', { path: dialog.value.trim(), content: '' })
      } else {
        await ws.request('fs', 'mkdir', { path: dialog.value.trim() })
      }
      setDialog(null)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openCreate(type) {
    setDialog({ type, value: '' })
  }

  function handleNodeAction(action) {
    setDialog({ ...action, value: action.type === 'rename' ? action.name : '' })
  }

  return (
    <div class="file-tree">
      <div class="tree-toolbar" aria-label={t('view.explorer')}>
        <button class="tw-icon-button" type="button" title={t('tree.newFile')} aria-label={t('tree.newFile')} onClick={() => openCreate('file')}><FilePlus2 size={15} /></button>
        <button class="tw-icon-button" type="button" title={t('tree.newFolder')} aria-label={t('tree.newFolder')} onClick={() => openCreate('folder')}><FolderPlus size={15} /></button>
        <button class="tw-icon-button" type="button" title={t('tree.refresh')} aria-label={t('tree.refresh')} onClick={refresh}><RefreshCw size={14} /></button>
      </div>
      {error && <div class="tree-error error-text">{error}</div>}
      {!error && !root && <div class="tree muted">{t('tree.loading')}</div>}
      {!error && root?.length === 0 && <div class="tree muted">{t('tree.empty')}</div>}
      {!error && root?.length > 0 && <div class="tree">{root.map((entry) => <Node key={entry.name} path={entry.name} {...entry} refreshToken={refreshToken} onError={setError} onChanged={handleNodeAction} />)}</div>}
      {dialog && <div class="modal-backdrop" onClick={() => setDialog(null)}>
        <form class="file-action-modal" onSubmit={submitAction} onClick={(event) => event.stopPropagation()}>
          <h2>{t(dialog.type === 'delete' ? 'tree.delete' : dialog.type === 'rename' ? 'tree.rename' : dialog.type === 'file' ? 'tree.newFile' : 'tree.newFolder')}</h2>
          {dialog.type === 'delete' ? <p>{t('tree.deleteConfirm', { name: dialog.name })}</p> : <input value={dialog.value} onInput={(event) => setDialog((current) => ({ ...current, value: event.currentTarget.value }))} placeholder={t('tree.pathPlaceholder')} autoFocus />}
          <div class="modal-actions"><button type="button" onClick={() => setDialog(null)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={dialog.type !== 'delete' && !dialog.value.trim()}>{t(dialog.type === 'delete' ? 'tree.delete' : dialog.type === 'rename' ? 'tree.rename' : 'tree.create')}</button></div>
        </form>
      </div>}
    </div>
  )
}
