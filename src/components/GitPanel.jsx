import { useEffect, useRef, useState } from 'preact/hooks'
import { ArrowDownToLine, ArrowUpFromLine, FolderGit2, GitCompare, GitCommitHorizontal, GitFork, RefreshCw } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { workspace } from '../state/app.js'

function badge(file) {
  if (file.untracked) return { label: 'A', className: 'added' }
  if (file.x === 'D' || file.y === 'D') return { label: 'D', className: 'deleted' }
  return { label: 'M', className: 'modified' }
}

function diffOptions(file) {
  if (file.untracked) return {}
  const staged = file.x && file.x !== ' '
  const working = file.y && file.y !== ' '
  if (staged && working) return { head: true }
  return staged ? { staged: true } : {}
}

export function GitPanel() {
  const [state, setState] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [diff, setDiff] = useState(null)
  const [repoMissing, setRepoMissing] = useState(false)
  const busyRef = useRef('')
  const refreshingRef = useRef(false)
  const refreshRequestedRef = useRef(false)
  const diffPathRef = useRef('')
  const workspaceRequest = useRef(0)

  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true
    const requestWorkspace = ++workspaceRequest.current
    const requestedPath = workspace.value?.path || ''
    setError('')
    try {
      const next = await ws.request('git', 'status', { workspace: workspace.value?.path || '' })
      if (requestWorkspace !== workspaceRequest.current || requestedPath !== (workspace.value?.path || '')) return
      setState(next)
      setRepoMissing(false)
      const selectedPath = diffPathRef.current
      const selectedFile = selectedPath && next.files.find((file) => file.path === selectedPath)
      if (selectedPath && !selectedFile) {
        setDiff(null)
        diffPathRef.current = ''
      } else if (selectedPath && selectedFile && !busyRef.current) {
        try {
          const nextDiff = await ws.request('git', 'diff', { path: selectedPath, ...diffOptions(selectedFile), workspace: requestedPath })
          if (requestWorkspace === workspaceRequest.current && requestedPath === (workspace.value?.path || '')) setDiff({ path: selectedPath, text: nextDiff.diff })
        } catch {
          setDiff(null)
          diffPathRef.current = ''
        }
      }
    } catch (requestError) {
      if (requestWorkspace === workspaceRequest.current && requestedPath === (workspace.value?.path || '')) {
        setState(null)
        setRepoMissing(true)
        setError('')
      }
    }
    finally {
      refreshingRef.current = false
      if (refreshRequestedRef.current || requestedPath !== (workspace.value?.path || '')) {
        refreshRequestedRef.current = false
        window.setTimeout(() => refresh(), 0)
      }
    }
  }

  useEffect(() => {
    const refreshIfIdle = () => { if (!busyRef.current) refresh() }
    const workspaceChange = () => {
      workspaceRequest.current += 1
      diffPathRef.current = ''
      setState(null)
      setDiff(null)
      setOutput('')
      if (refreshingRef.current) refreshRequestedRef.current = true
      else refresh()
    }
    const dataChange = () => {
      if (!busyRef.current) refresh()
      else refreshRequestedRef.current = true
    }
    const interval = window.setInterval(refreshIfIdle, 2_000)
    window.addEventListener('pixcode:ws-open', refreshIfIdle)
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    window.addEventListener('pixcode:workspace-data-change', dataChange)
    refresh()
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pixcode:ws-open', refreshIfIdle)
      window.removeEventListener('pixcode:workspace-change', workspaceChange)
      window.removeEventListener('pixcode:workspace-data-change', dataChange)
    }
  }, [])

  async function run(operation, data = {}) {
    setBusy(operation)
    busyRef.current = operation
    setError('')
    setOutput('')
    try {
      const result = await ws.request('git', operation, { ...data, workspace: workspace.value?.path || '' })
      setOutput(result?.output || '')
      busyRef.current = ''
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
      busyRef.current = ''
    }
  }

  async function commit() {
    if (!message.trim()) return
    await run('commit', { message })
    setMessage('')
  }

  async function toggleStage(file) {
    const staged = !file.untracked && file.x !== ' '
    await run(staged ? 'unstage' : 'stage', { paths: [file.path] })
  }

  async function showDiff(file) {
    const filePath = file.path
    const requestedPath = workspace.value?.path || ''
    setBusy('diff')
    busyRef.current = 'diff'
    diffPathRef.current = filePath
    setError('')
    try {
      const result = await ws.request('git', 'diff', { path: filePath, ...diffOptions(file), workspace: requestedPath })
      if (requestedPath === (workspace.value?.path || '') && diffPathRef.current === filePath) setDiff({ path: filePath, text: result.diff })
    } catch (requestError) {
      if (requestedPath === (workspace.value?.path || '')) setError(requestError.message)
    } finally { setBusy(''); busyRef.current = '' }
  }

  return (
    <div style="display:flex; flex:1; min-height:0; flex-direction:column">
      <div class="section-title">
        <span>{state?.branch || t('git.title')}</span>
        <button class="tw-icon-button" type="button" onClick={refresh} disabled={!!busy} title={t('git.refresh')} aria-label={t('git.refresh')}><RefreshCw size={14} /></button>
      </div>
      {error && <div class="error-text" style="padding:8px">{error}</div>}
      {repoMissing && <div class="git-welcome"><FolderGit2 size={27} /><h2>{t('git.noRepositoryTitle')}</h2><p>{t('git.noRepositoryDescription')}</p><button type="button" class="tw-toolbar-button" onClick={() => window.dispatchEvent(new Event('pixcode:clone-repo'))}><GitFork size={13} /> {t('git.openRemote')}</button></div>}
      <div class="git-list">
        {!state && !error && <div class="tree muted">{t('tree.loading')}</div>}
        {state?.files.length === 0 && <div class="tree muted">{t('git.noChanges')}</div>}
        {state?.files.map((file) => {
          const item = badge(file)
          return (
            <div class="git-item" key={file.path}>
              <span class={`git-badge ${item.className}`}>{item.label}</span>
              <span class="path">{file.path}</span>
              <button class="tw-toolbar-button" type="button" onClick={() => showDiff(file)} disabled={!!busy}><GitCompare size={13} /> {t('git.diff')}</button>
              <button type="button" onClick={() => toggleStage(file)} disabled={!!busy}>{!file.untracked && file.x !== ' ' ? t('git.unstage') : t('git.stage')}</button>
            </div>
          )
        })}
      </div>
      <div class="commit-row">
        <input value={message} onInput={(event) => setMessage(event.currentTarget.value)} placeholder={t('git.messagePlaceholder')} />
        <button class="btn-accent tw-toolbar-button" type="button" onClick={commit} disabled={!!busy || !message.trim()}><GitCommitHorizontal size={13} /> {t('git.commit')}</button>
      </div>
      <div class="git-actions">
        <button class="tw-toolbar-button" type="button" onClick={() => run('pull')} disabled={!!busy}><ArrowDownToLine size={13} /> {busy === 'pull' ? t('git.busy') : t('git.pull')}</button>
        <button class="btn-accent tw-toolbar-button" type="button" onClick={() => run('push')} disabled={!!busy}><ArrowUpFromLine size={13} /> {busy === 'push' ? t('git.busy') : t('git.push')}</button>
      </div>
      {diff && <div class="git-diff"><strong>{diff.path}</strong><pre>{diff.text || t('git.noChanges')}</pre></div>}
      {output && <pre class="tree muted" style="max-height:90px; overflow:auto; margin:0">{output}</pre>}
    </div>
  )
}
