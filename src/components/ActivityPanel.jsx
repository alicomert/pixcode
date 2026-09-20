import { useEffect, useRef, useState } from 'preact/hooks'
import { Bot, Files, FolderOpen, GitBranch, History, Terminal as TerminalIcon } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { workspace } from '../state/app.js'

const kindIcons = { fs: Files, git: GitBranch, pty: TerminalIcon, agent: Bot, project: FolderOpen }

function ago(ts) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 1000))
  if (seconds < 45) return t('activity.now')
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return new Date(ts).toLocaleDateString()
}

function entryText(entry) {
  switch (entry.kind) {
    case 'fs': return entry.op && t(`activity.fs.${entry.op}`) !== `activity.fs.${entry.op}`
      ? t(`activity.fs.${entry.op}`)
      : t('activity.files', { count: entry.count || (entry.files || []).length })
    case 'git': return t(`activity.git.${entry.op || 'refs'}`) !== `activity.git.${entry.op || 'refs'}` ? t(`activity.git.${entry.op || 'refs'}`) : t('activity.git.refs')
    case 'pty': return entry.action === 'exit' ? t('activity.ptyExit', { code: entry.exitCode ?? '?' }) : t('activity.ptyOpen')
    case 'agent':
      if (entry.action === 'handoff') return t('activity.agentHandoff', { agent: entry.agent || '?' })
      if (entry.action === 'memoryDigest') return t('activity.memoryDigest', { agent: entry.agent || '?' })
      return entry.action === 'exit'
        ? t('activity.agentExit', { agent: entry.agent || '?', index: entry.index || '' })
        : t('activity.agentStart', { agent: entry.agent || '?', index: entry.index || '' })
    case 'project': return t('activity.project', { op: entry.op || '' })
    default: return entry.text || entry.kind
  }
}

export function ActivityPanel() {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const requestSeq = useRef(0)

  useEffect(() => {
    let disposed = false
    async function load() {
      const seq = ++requestSeq.current
      try {
        const { entries: list } = await ws.request('activity', 'list', { workspace: workspace.value?.path || '', limit: 150 })
        if (!disposed && seq === requestSeq.current) { setEntries(list || []); setError('') }
      } catch (requestError) {
        if (!disposed && seq === requestSeq.current) setError(requestError.message)
      }
    }
    async function subscribe() {
      // Watching is what turns recordActivity() pushes into live rows.
      await ws.request('activity', 'watch', { workspace: workspace.value?.path || '' }).catch(() => {})
      load()
    }
    const onEvent = (data) => {
      if (String(data?.workspace || '') !== (workspace.value?.path || '')) return
      setEntries((current) => [data.entry, ...current].slice(0, 300))
    }
    const unsubscribe = ws.on('activity', 'event', onEvent)
    const reopen = () => subscribe()
    const workspaceChange = () => { setEntries([]); subscribe() }
    window.addEventListener('pixcode:ws-open', reopen)
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    subscribe()
    return () => {
      disposed = true
      unsubscribe()
      window.removeEventListener('pixcode:ws-open', reopen)
      window.removeEventListener('pixcode:workspace-change', workspaceChange)
      ws.request('activity', 'unwatch', { workspace: workspace.value?.path || '' }).catch(() => {})
    }
  }, [])

  return <div class="activity-view">
    <div class="sidebar-heading"><span>{t('view.activity')}</span><span class="sidebar-heading-actions"><History size={14} /></span></div>
    <vscode-scrollable class="activity-list">
      {error && <span class="error-text search-error">{error}</span>}
      {!entries.length && !error && <span class="muted activity-empty">{t('activity.empty')}</span>}
      {entries.map((entry, index) => {
        const Icon = kindIcons[entry.kind] || History
        return <div class="activity-row" key={`${entry.ts}-${index}`}>
          <span class={`activity-icon activity-kind-${entry.kind}`}><Icon size={14} /></span>
          <span class="activity-body">
            <span class="activity-text">{entryText(entry)}</span>
            {Array.isArray(entry.files) && entry.files.length > 0 && (
              <span class="activity-files">
                {entry.files.map((file) => <button key={file} type="button" class="activity-file" title={file} onClick={() => window.dispatchEvent(new CustomEvent('pixcode:open-file', { detail: file }))}>{file.split('/').pop()}</button>)}
                {entry.count > entry.files.length && <span class="muted">+{entry.count - entry.files.length}</span>}
              </span>
            )}
          </span>
          <span class="activity-meta">{entry.user && <span class="activity-user">{entry.user}</span>}<time dateTime={new Date(Number(entry.ts || 0)).toISOString()} title={new Date(Number(entry.ts || 0)).toLocaleString()}>{ago(entry.ts)}</time></span>
        </div>
      })}
    </vscode-scrollable>
  </div>
}
