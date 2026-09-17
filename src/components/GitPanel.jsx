import { useEffect, useRef, useState } from 'preact/hooks'
import { Copy, FolderGit2, GitBranch, Github, Undo2 } from '../lib/icons.jsx'
import { getFileIcon } from './FileTree.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { isAdmin, openFile, workspace } from '../state/app.js'

const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Pixcode'

function statusBadge(file) {
  if (file.untracked) return { label: 'A', className: 'added', title: t('git.statusAdded') }
  if (file.x === 'D' || file.y === 'D') return { label: 'D', className: 'deleted', title: t('git.statusDeleted') }
  if (file.x === 'R') return { label: 'R', className: 'renamed', title: t('git.statusRenamed') }
  return { label: 'M', className: 'modified', title: t('git.statusModified') }
}

function splitPath(filePath) {
  const index = filePath.lastIndexOf('/')
  return index === -1 ? { name: filePath, dir: '' } : { name: filePath.slice(index + 1), dir: `${filePath.slice(0, index)}/` }
}

function GitHubConnect({ account, onAccount }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('oauth')
  const [device, setDevice] = useState(null)
  const [token, setToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [appSlug, setAppSlug] = useState('')
  const [webFlow, setWebFlow] = useState(false)
  const [setupWaiting, setSetupWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const setupRef = useRef(null)
  const webRef = useRef(null)
  useEffect(() => () => { window.clearTimeout(pollRef.current); window.clearInterval(setupRef.current); window.clearInterval(webRef.current) }, [])

  async function openCard() {
    setOpen(true)
    setError('')
    try {
      const config = await ws.request('git', 'oauthConfig', {})
      setAppSlug(config.slug || '')
      setWebFlow(Boolean(config.webFlow))
      // Legacy apps (created before client secrets were stored) cannot run the
      // web flow — send the admin through setup once more so the manifest
      // re-creates the app with a secret. Members fall back to device flow.
      if (!config.clientIdSet || (isAdmin.value && !config.webFlow)) setMode('setup')
    } catch { /* fall through to oauth — the start op reports the same gap */ }
  }

  // Web flow: open the authorize URL, then watch the account record — the
  // callback saves the token server-side, so this tab just waits for the
  // profile to appear.
  function startWeb() {
    setBusy(true)
    setError('')
    ws.request('git', 'oauthStart', {}).then(({ url }) => {
      window.open(url, '_blank', 'noopener')
      setMode('webwait')
      window.clearInterval(webRef.current)
      webRef.current = window.setInterval(async () => {
        try {
          const next = await ws.request('git', 'account', {})
          if (next?.github) {
            window.clearInterval(webRef.current)
            setOpen(false)
            setMode('oauth')
            onAccount(next)
          }
        } catch { /* keep polling */ }
      }, 2000)
    }).catch((requestError) => {
      setError(requestError.message)
      if (/client id/i.test(requestError.message)) setMode('setup')
    }).finally(() => setBusy(false))
  }

  function cancelWeb() {
    window.clearInterval(webRef.current)
    setMode('oauth')
  }

  function schedulePoll(deviceCode, interval) {
    window.clearTimeout(pollRef.current)
    pollRef.current = window.setTimeout(async () => {
      try {
        const result = await ws.request('git', 'devicePoll', { deviceCode })
        if (result.status === 'authorized') {
          setDevice(null)
          setOpen(false)
          onAccount(result.account)
          return
        }
        schedulePoll(deviceCode, interval + (result.interval || 0))
      } catch (requestError) {
        setDevice(null)
        setError(requestError.message)
      }
    }, interval * 1000)
  }

  async function startDevice() {
    setBusy(true)
    setError('')
    try {
      const data = await ws.request('git', 'deviceStart', {})
      setDevice(data)
      window.open(data.verificationUri, '_blank', 'noopener')
      schedulePoll(data.deviceCode, data.interval)
    } catch (requestError) {
      setError(requestError.message)
      if (/client id not configured/i.test(requestError.message)) setMode('setup')
      else if (/device flow/i.test(requestError.message)) setMode('deviceflow')
    } finally {
      setBusy(false)
    }
  }

  function cancelDevice() {
    window.clearTimeout(pollRef.current)
    setDevice(null)
  }

  function watchSetup() {
    window.clearInterval(setupRef.current)
    setupRef.current = window.setInterval(async () => {
      try {
        const config = await ws.request('git', 'oauthConfig', {})
        if (config.clientIdSet) {
          setAppSlug(config.slug || '')
          setWebFlow(Boolean(config.webFlow))
          window.clearInterval(setupRef.current)
          setSetupWaiting(false)
          setMode('oauth')
        }
      } catch { /* keep polling */ }
    }, 2500)
  }

  // The manifest POST hands GitHub a complete app definition — the admin only
  // presses "Create GitHub App" on the prefilled page, then GitHub returns to
  // our callback which stores the client_id.
  async function createApp() {
    setBusy(true)
    setError('')
    try {
      const { state, manifest } = await ws.request('git', 'appBootstrap', { origin: window.location.origin })
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = 'https://github.com/settings/apps/new'
      form.target = '_blank'
      form.rel = 'noopener'
      form.style.display = 'none'
      for (const [name, value] of [['manifest', JSON.stringify(manifest)], ['state', state]]) {
        const input = document.createElement('input')
        input.name = name
        input.value = value
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
      form.remove()
      setSetupWaiting(true)
      watchSetup()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveClientId() {
    if (!clientId.trim()) return
    setBusy(true)
    setError('')
    try {
      await ws.request('git', 'saveOauthClientId', { clientId: clientId.trim() })
      setClientId('')
      setMode('deviceflow')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    if (!token.trim()) return
    setBusy(true)
    setError('')
    try {
      onAccount(await ws.request('git', 'connectGitHub', { token: token.trim() }))
      setToken('')
      setOpen(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    onAccount(await ws.request('git', 'saveAccount', { removeHost: 'github.com' }).catch(() => null))
  }

  if (account?.github) {
    return (
      <div class="git-hub-user">
        {account.github.avatarUrl ? <img class="git-hub-avatar" src={account.github.avatarUrl} alt="" /> : <Github size={16} />}
        <span class="git-hub-login">@{account.github.login}</span>
        <span class="git-hub-name muted">{account.github.name}</span>
        <button type="button" class="git-hub-disconnect" onClick={disconnect} title={t('git.disconnect')} aria-label={t('git.disconnect')}>×</button>
      </div>
    )
  }

  return (
    <div class={`git-hub-card ${open ? 'open' : ''}`}>
      {!open ? (
        <button type="button" class="git-hub-connect" onClick={openCard}>
          <Github size={14} />
          <span>{t('git.connectGithub')}</span>
        </button>
      ) : mode === 'webwait' ? (
        <div class="git-hub-form">
          <div class="git-device-status muted"><span class="git-device-dot" />{t('git.waitingAuth')}</div>
          <div class="git-hub-hint muted">{t('git.webWaitHint')}</div>
          <div class="git-hub-actions">
            <vscode-button secondary onClick={cancelWeb}>{t('common.cancel')}</vscode-button>
          </div>
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : device ? (
        <div class="git-hub-form">
          <div class="git-device-code-row">
            <code class="git-device-code">{device.userCode}</code>
            <button type="button" class="git-device-copy" onClick={() => navigator.clipboard?.writeText(device.userCode)} title={t('editor.copyPath')} aria-label={t('editor.copyPath')}><Copy size={13} /></button>
          </div>
          <div class="git-hub-hint muted">{t('git.deviceCodeHint')}</div>
          <div class="git-hub-actions">
            <vscode-button onClick={() => window.open(device.verificationUri, '_blank', 'noopener')}>{t('git.openGithub')}</vscode-button>
            <vscode-button secondary onClick={cancelDevice}>{t('common.cancel')}</vscode-button>
          </div>
          <div class="git-device-status muted"><span class="git-device-dot" />{t('git.waitingAuth')}</div>
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : mode === 'setup' ? (
        <div class="git-hub-form">
          {isAdmin.value ? (
            <>
              <div class="git-hub-hint muted">{t('git.setupHint')}</div>
              {setupWaiting ? (
                <div class="git-device-status muted"><span class="git-device-dot" />{t('git.waitingSetup')}</div>
              ) : (
                <div class="git-hub-actions">
                  <vscode-button icon="mark-github" onClick={createApp} disabled={busy}>{busy ? t('git.connecting') : t('git.createApp')}</vscode-button>
                </div>
              )}
              <button type="button" class="git-hub-switch" onClick={() => { setMode('manual'); setError('') }}>{t('git.manualClientId')}</button>
            </>
          ) : (
            <div class="git-hub-hint muted">{t('git.clientIdAdminOnly')}</div>
          )}
          <button type="button" class="git-hub-switch" onClick={() => { setMode('token'); setError('') }}>{t('git.useToken')}</button>
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : mode === 'deviceflow' ? (
        <div class="git-hub-form">
          {isAdmin.value ? (
            <>
              <div class="git-hub-hint muted">{t('git.deviceFlowRetry')}</div>
              <div class="git-hub-actions">
                <vscode-button icon="mark-github" onClick={createApp} disabled={busy}>{busy ? t('git.waitingSetup') : t('git.recreateApp')}</vscode-button>
              </div>
              {appSlug && <button type="button" class="git-hub-switch" onClick={() => window.open(`https://github.com/settings/apps/${appSlug}`, '_blank', 'noopener')}>{t('git.openAppSettings')}</button>}
            </>
          ) : (
            <div class="git-hub-hint muted">{t('git.deviceFlowMemberHint')}</div>
          )}
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : mode === 'manual' ? (
        <div class="git-hub-form">
          <div class="git-hub-hint muted">{t('git.clientIdHint')}</div>
          <vscode-textfield value={clientId} onInput={(event) => setClientId(event.currentTarget.value)} placeholder={t('git.clientIdPlaceholder')} />
          <div class="git-hub-actions">
            <vscode-button icon="check" onClick={saveClientId} disabled={busy || !clientId.trim()}>{t('editor.save')}</vscode-button>
          </div>
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : mode === 'token' ? (
        <div class="git-hub-form">
          <div class="git-hub-hint muted">{t('git.connectHint')}</div>
          <vscode-textfield value={token} onInput={(event) => setToken(event.currentTarget.value)} placeholder={t('git.tokenInputPlaceholder')} />
          <div class="git-hub-actions">
            <vscode-button secondary onClick={() => window.open(GITHUB_TOKEN_URL, '_blank', 'noopener')}>{t('git.createToken')}</vscode-button>
            <vscode-button icon="check" onClick={connect} disabled={busy || !token.trim()}>{busy ? t('git.connecting') : t('git.connect')}</vscode-button>
          </div>
          <button type="button" class="git-hub-switch" onClick={() => { setMode('oauth'); setError('') }}>{t('git.useOauth')}</button>
          {error && <div class="error-text">{error}</div>}
        </div>
      ) : (
        <div class="git-hub-form">
          <div class="git-hub-hint muted">{t(webFlow ? 'git.webHint' : 'git.oauthHint')}</div>
          <div class="git-hub-actions">
            <vscode-button icon="mark-github" onClick={webFlow ? startWeb : startDevice} disabled={busy}>{busy ? t('git.connecting') : t('git.continueGithub')}</vscode-button>
          </div>
          {webFlow && <button type="button" class="git-hub-switch" onClick={startDevice} disabled={busy}>{t('git.useDevice')}</button>}
          <button type="button" class="git-hub-switch" onClick={() => { setMode('token'); setError('') }}>{t('git.useToken')}</button>
          {error && <div class="error-text">{error}</div>}
        </div>
      )}
    </div>
  )
}

export function GitPanel() {
  const [state, setState] = useState(null)
  const [account, setAccount] = useState(null)
  const [commits, setCommits] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [repoMissing, setRepoMissing] = useState(false)
  const busyRef = useRef('')
  const refreshingRef = useRef(false)
  const refreshRequestedRef = useRef(false)
  const workspaceRequest = useRef(0)
  const fsTimer = useRef(null)

  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true
    const requestWorkspace = ++workspaceRequest.current
    const requestedPath = workspace.value?.path || ''
    setError('')
    try {
      const next = await ws.request('git', 'status', { workspace: requestedPath })
      if (requestWorkspace !== workspaceRequest.current || requestedPath !== (workspace.value?.path || '')) return
      setState(next)
      setRepoMissing(false)
      const history = await ws.request('git', 'log', { workspace: requestedPath, limit: 12 }).catch(() => ({ commits: [] }))
      if (requestWorkspace === workspaceRequest.current && requestedPath === (workspace.value?.path || '')) setCommits(history.commits || [])
    } catch {
      if (requestWorkspace === workspaceRequest.current && requestedPath === (workspace.value?.path || '')) {
        setState(null)
        setCommits([])
        setRepoMissing(true)
      }
    } finally {
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
      setState(null)
      setCommits([])
      if (refreshingRef.current) refreshRequestedRef.current = true
      else refresh()
    }
    // File events carry the real-time updates (source files AND .git refs);
    // the interval is only a safety net for missed watcher events.
    const fsPush = ws.on('fs', 'changed', (data) => {
      if (String(data?.workspace || '') !== (workspace.value?.path || '')) return
      window.clearTimeout(fsTimer.current)
      fsTimer.current = window.setTimeout(refreshIfIdle, 250)
    })
    const interval = window.setInterval(refreshIfIdle, 15_000)
    ws.request('git', 'account', {}).then(setAccount).catch(() => {})
    window.addEventListener('pixcode:ws-open', refreshIfIdle)
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    window.addEventListener('pixcode:workspace-data-change', refreshIfIdle)
    refresh()
    return () => {
      fsPush()
      window.clearTimeout(fsTimer.current)
      window.clearInterval(interval)
      window.removeEventListener('pixcode:ws-open', refreshIfIdle)
      window.removeEventListener('pixcode:workspace-change', workspaceChange)
      window.removeEventListener('pixcode:workspace-data-change', refreshIfIdle)
    }
  }, [])

  async function run(operation, data = {}) {
    setBusy(operation)
    busyRef.current = operation
    setError('')
    try {
      await ws.request('git', operation, { ...data, workspace: workspace.value?.path || '' })
      busyRef.current = ''
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
      busyRef.current = ''
    }
  }

  // One click stages everything and commits — the staging area stays invisible
  // like VS Code's default commit flow.
  async function commit() {
    if (!message.trim()) return
    await run('commit', { message, all: true })
    setMessage('')
  }

  async function discard(file, event) {
    event.stopPropagation()
    if (!window.confirm(t('git.discardConfirm', { file: file.path }))) return
    await run('discard', { path: file.path })
  }

  const files = state?.files || []

  return (
    <div class="git-panel">
      <div class="section-title">
        <span>{t('git.title')}</span>
        <vscode-toolbar-button icon="sync" onClick={() => run('fetch')} disabled={!!busy} title={t('git.fetch')} aria-label={t('git.fetch')}></vscode-toolbar-button>
        <vscode-toolbar-button icon="refresh" onClick={refresh} disabled={!!busy} title={t('git.refresh')} aria-label={t('git.refresh')}></vscode-toolbar-button>
      </div>
      {error && <div class="error-text" style="padding:6px 10px">{error}</div>}
      {repoMissing ? (
        <div class="git-welcome">
          <FolderGit2 size={27} />
          <h2>{t('git.noRepositoryTitle')}</h2>
          <p>{t('git.noRepositoryDescription')}</p>
          <div class="git-welcome-actions">
            <vscode-button icon="repo" onClick={() => run('init')} disabled={!!busy}>{t('git.initRepo')}</vscode-button>
            <vscode-button secondary icon="repo-clone" onClick={() => window.dispatchEvent(new Event('pixcode:clone-repo'))}>{t('git.openRemote')}</vscode-button>
          </div>
        </div>
      ) : (
        <div class="git-scroll">
          <GitHubConnect account={account} onAccount={setAccount} />

          <div class="git-branch-row">
            <GitBranch size={13} />
            <span class="git-branch-name">{state?.branch || '…'}</span>
            {(state?.ahead > 0 || state?.behind > 0) && (
              <span class="git-sync muted">
                {state.behind > 0 && <span title={t('git.behind')}>↓{state.behind}</span>}
                {state.ahead > 0 && <span title={t('git.ahead')}>↑{state.ahead}</span>}
              </span>
            )}
            <span class="agent-header-spacer" />
            <vscode-toolbar-button icon="arrow-down" onClick={() => run('pull')} disabled={!!busy} title={t('git.pull')} aria-label={t('git.pull')}></vscode-toolbar-button>
            <vscode-toolbar-button icon="arrow-up" onClick={() => run('push')} disabled={!!busy} title={t('git.push')} aria-label={t('git.push')}></vscode-toolbar-button>
          </div>

          <div class="git-commit-box">
            <textarea
              class="git-message"
              rows="2"
              value={message}
              onInput={(event) => setMessage(event.currentTarget.value)}
              onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') commit() }}
              placeholder={t('git.messagePlaceholder')}
            />
            <vscode-button icon="check" class="git-commit-btn" onClick={commit} disabled={!!busy || !message.trim() || !files.length}>
              {busy === 'commit' ? t('git.busy') : t('git.commit')}
            </vscode-button>
            {account?.name && <div class="git-committer muted">{t('git.committingAs', { name: account.name })}</div>}
          </div>

          <div class="git-section">
            <span>{t('git.changes')}</span>
            {files.length > 0 && <span class="git-count">{files.length}</span>}
          </div>
          {!state && <div class="tree muted">{t('tree.loading')}</div>}
          {state && files.length === 0 && <div class="tree muted">{t('git.noChanges')}</div>}
          {files.map((file) => {
            const badge = statusBadge(file)
            const { name, dir } = splitPath(file.path)
            const [FileGlyph, iconColor] = getFileIcon(name, 'file', false)
            return (
              <button type="button" class="git-item" key={file.path} onClick={() => openFile(file.path)} title={file.path}>
                <FileGlyph size={14} strokeWidth={1.7} style={{ color: iconColor }} aria-hidden="true" />
                <span class="git-item-name">{name}</span>
                {dir && <span class="git-item-dir muted">{dir}</span>}
                <span class={`git-badge ${badge.className}`} title={badge.title}>{badge.label}</span>
                <span class="git-item-actions">
                  <span class="git-item-action" role="button" tabIndex={-1} onClick={(event) => discard(file, event)} title={t('git.discard')} aria-label={t('git.discard')}><Undo2 size={13} /></span>
                </span>
              </button>
            )
          })}

          <div class="git-section"><span>{t('git.history')}</span></div>
          {commits.length === 0 && <div class="tree muted">{t('git.noCommits')}</div>}
          {commits.map((entry) => (
            <div class="git-log-item" key={entry.short}>
              <span class="git-log-dot" aria-hidden="true" />
              <span class="git-log-subject" title={entry.subject}>{entry.subject}</span>
              <span class="git-log-meta muted">{entry.author} · {entry.ago}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
