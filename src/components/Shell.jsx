import { useEffect, useRef, useState } from 'preact/hooks'
import { ArrowLeft, ArrowRight, Bell, Blocks, Bot, ChevronsUpDown, Circle, Code2, Download, Files, GitBranch, Globe2, History, Moon, PanelBottom, PanelLeft, Play, Plus, RefreshCw, Save, Search, Send, Settings, Sparkles, Sun, Terminal as TerminalIcon, Trash2, X } from '../lib/icons.jsx'
import { t, setLocale, locale, languages } from '../lib/i18n.js'
import { ws } from '../lib/ws.js'
import { initFsWatch } from '../lib/fs-watch.js'
import { initNotifications, notificationsEnabled, setNotificationsEnabled } from '../lib/notify.js'
import { setToken } from '../lib/api.js'
import { activeView, agentRailOpen, isAdmin, agentSessions, agentWidth, mobileTab, openFile, panelHeight, panelOpen, setAgentRail, setAgentWidth, setPanelHeight, setSidebarWidth, setTerminalFontSize, setTerminalScrollSpeed, setTheme, sidebarWidth, terminalFontSize, terminalScrollSpeed, theme, workspace } from '../state/app.js'
import { VscSelect } from './vsc.jsx'
import { UserManager } from './UserManager.jsx'
import { SkillManager } from './SkillManager.jsx'
import { ShareCard } from './ShareCard.jsx'
import { ProjectSwitcher } from './ProjectSwitcher.jsx'
import { FileTree } from './FileTree.jsx'
import { EditorPane } from './EditorPane.jsx'
import { GitPanel } from './GitPanel.jsx'
import { AgentPanel } from './AgentPanel.jsx'
import { Terminals } from './Terminals.jsx'
import { ActivityPanel } from './ActivityPanel.jsx'
import { UpdateChecker } from './UpdateChecker.jsx'
import { InstallBanner } from './InstallBanner.jsx'

const views = [
  { id: 'explorer', label: 'view.explorer', icon: 'explorer', mobile: 'files' },
  { id: 'search', label: 'view.search', icon: 'search', mobile: 'files' },
  { id: 'source', label: 'view.source', icon: 'source', mobile: 'git' },
  { id: 'run', label: 'view.run', icon: 'run', mobile: 'terminal' },
  { id: 'agent', label: 'view.agent', icon: 'agent', mobile: 'agent' },
  { id: 'activity', label: 'view.activity', icon: 'activity', mobile: 'files' },
  { id: 'remote', label: 'view.remote', icon: 'remote', mobile: 'files' },
  { id: 'extensions', label: 'view.extensions', icon: 'extensions', mobile: 'files' }
]

const mobileTabs = [
  { id: 'files', label: 'tab.files', icon: Files },
  { id: 'editor', label: 'tab.editor', icon: Code2 },
  { id: 'agent', label: 'tab.agent', icon: Sparkles },
  { id: 'terminal', label: 'tab.terminal', icon: TerminalIcon },
  { id: 'git', label: 'tab.git', icon: GitBranch },
  { id: 'settings', label: 'tab.settings', icon: Settings }
]

function Icon({ name }) {
  const icons = { explorer: Files, search: Search, source: GitBranch, run: Play, agent: Sparkles, activity: History, remote: Globe2, extensions: Blocks }
  const Glyph = icons[name] || Circle
  return <Glyph size={20} strokeWidth={1.65} aria-hidden="true" />
}

function isCompactViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function ActivityBar() {
  return (
    <nav class="activity-bar" aria-label={t('view.navigation')}>
      <div class="activity-top">
        {views.map((view) => (
         <button
            key={view.id}
           class={'activity-button tw-rail-button ' + (activeView.value === view.id ? 'active' : '')}
            data-active={activeView.value === view.id}
            type="button"
            title={t(view.label)}
            aria-label={t(view.label)}
            aria-pressed={activeView.value === view.id}
            onClick={() => { activeView.value = view.id; if (view.id === 'run') { panelOpen.value = true; if (isCompactViewport()) mobileTab.value = 'terminal' } else { mobileTab.value = view.mobile; if (view.id === 'agent') panelOpen.value = false } if (sidebarWidth.value === 0) setSidebarWidth(276) }}
          >
            <Icon name={view.icon} />
          </button>
        ))}
      </div>
      <div class="activity-bottom">
        <button class={"activity-button tw-rail-button " + (activeView.value === 'settings' ? 'active' : '')} data-active={activeView.value === 'settings'} type="button" title={t('view.settings')} onClick={() => { activeView.value = 'settings'; mobileTab.value = isCompactViewport() ? 'settings' : 'files'; panelOpen.value = false; if (sidebarWidth.value === 0) setSidebarWidth(276) }}><Settings size={19} strokeWidth={1.65} /></button>
        <span class="activity-version">v2</span>
      </div>
    </nav>
  )
}

// Right-hand rail: always-visible anchor for agent actions. The bot icon
// toggles the auxiliary agent pane, the plus opens the new-session modal.
function AgentRail() {
  const open = agentRailOpen.value
  return (
    <nav class="activity-bar agent-rail" aria-label={t('view.agent')}>
      <div class="activity-top">
        <button class={'activity-button tw-rail-button ' + (open ? 'active' : '')} type="button" title={t('view.agent')} aria-label={t('view.agent')} aria-pressed={open} onClick={() => setAgentRail(!open)}>
          <Bot size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button class="activity-button tw-rail-button" type="button" title={t('agent.new')} aria-label={t('agent.new')} onClick={() => window.dispatchEvent(new Event('pixcode:new-agent'))}>
          <Plus size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

function TopBar() {
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    const capturePrompt = (event) => { event.preventDefault(); setInstallPrompt(event) }
    const clearPrompt = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', clearPrompt)
    return () => { window.removeEventListener('beforeinstallprompt', capturePrompt); window.removeEventListener('appinstalled', clearPrompt) }
  }, [])

  function logout() {
    ws.close()
    setToken('')
    location.reload()
  }

  async function install() {
    const event = installPrompt
    setInstallPrompt(null)
    try { await event?.prompt() } catch { /* already consumed by the banner */ }
  }

  return (
    <header class="topbar">
      <div class="window-brand"><img class="brand-logo" src="/logo.png" alt="Pixcode" /><strong>{t('app.title')}</strong></div>
      <div class="window-nav"><vscode-toolbar-button icon="arrow-left" disabled title={t('navigation.back')}></vscode-toolbar-button><vscode-toolbar-button icon="arrow-right" disabled title={t('navigation.forward')}></vscode-toolbar-button></div>
      <button class="command-center tw-command-field" type="button" onClick={() => { activeView.value = 'search'; mobileTab.value = 'files'; if (sidebarWidth.value === 0) setSidebarWidth(276); window.dispatchEvent(new Event('pixcode:focus-search')) }}><Search class="command-icon" size={15} /><span>{t('command.search')}</span><kbd>Ctrl+P</kbd></button>
      <ProjectSwitcher />
      <span class="spacer" />
      <div class="topbar-actions">
        {installPrompt && <vscode-toolbar-button icon="cloud-download" title={t('pwa.install')} aria-label={t('pwa.install')} onClick={install}></vscode-toolbar-button>}
        <vscode-toolbar-button class="layout-button" icon="layout-sidebar-left" title={t('layout.toggleSidebar')} onClick={() => setSidebarWidth(sidebarWidth.value > 0 ? 0 : 276)}></vscode-toolbar-button>
        <vscode-toolbar-button class="layout-button" icon="layout-panel" title={t('layout.togglePanel')} onClick={() => (panelOpen.value = !panelOpen.value)}></vscode-toolbar-button>
        <UpdateChecker />
        <select aria-label={t('lang.label')} value={locale.value} onChange={(event) => setLocale(event.currentTarget.value)}>
          {languages.map((language) => <option key={language.value} value={language.value}>{language.value === 'zh-CN' ? '中文' : language.value.toUpperCase()}</option>)}
        </select>
        <button type="button" class="icon-button tw-icon-button" title={t(theme.value === 'dark' ? 'topbar.theme.light' : 'topbar.theme.dark')} onClick={() => setTheme(theme.value === 'dark' ? 'light' : 'dark')}>{theme.value === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <button type="button" class="logout-button" onClick={logout}>{t('topbar.logout')}</button>
      </div>
    </header>
  )
}

function SidebarView() {
  if (activeView.value === 'search') return <SearchView />
  if (activeView.value === 'source') return <GitPanel />
  if (activeView.value === 'run') return <RunView />
  if (activeView.value === 'agent') return <AgentInfo />
  if (activeView.value === 'activity') return <ActivityPanel />
  if (activeView.value === 'remote') return <RemoteView />
  if (activeView.value === 'extensions') return <ExtensionsView />
  if (activeView.value === 'settings') return <SettingsView />
  return <><div class="sidebar-heading"><span>{t('view.explorer')}</span><span class="sidebar-heading-actions">•••</span></div><FileTree /></>
}

function SearchView() {
  const inputRef = useRef(null)
  const searchRequest = useRef(0)
  const debounceRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const workspaceRequest = useRef(0)
  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    const workspaceChange = () => { workspaceRequest.current += 1; window.clearTimeout(debounceRef.current); setBusy(false); setResults([]); setError(''); setQuery('') }
    window.addEventListener('pixcode:focus-search', focus)
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    return () => { window.removeEventListener('pixcode:focus-search', focus); window.removeEventListener('pixcode:workspace-change', workspaceChange); window.clearTimeout(debounceRef.current) }
  }, [])
  async function search(eventOrQuery) {
    const nextQuery = typeof eventOrQuery === 'string' ? eventOrQuery : query
    eventOrQuery?.preventDefault?.()
    const requestId = ++searchRequest.current
    const workspaceId = ++workspaceRequest.current
    if (!nextQuery.trim()) { setResults([]); setError(''); return }
    setBusy(true)
    try {
      const nextResults = await ws.request('fs', 'search', { query: nextQuery, workspace: workspace.value?.path || '' })
      if (requestId === searchRequest.current && workspaceId === workspaceRequest.current) { setResults(nextResults); setError('') }
    } catch (requestError) {
      if (requestId === searchRequest.current && workspaceId === workspaceRequest.current) { setResults([]); setError(requestError.message) }
    } finally {
      if (requestId === searchRequest.current && workspaceId === workspaceRequest.current) setBusy(false)
    }
  }
  function changeQuery(event) {
    const value = event.currentTarget.value
    setQuery(value)
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => search(value), 180)
  }
  return <div class="search-view"><div class="sidebar-heading"><span>{t('view.search')}</span><span class="sidebar-heading-actions">{results.length || ''}</span></div><form onSubmit={search}><Search class="search-input-icon" size={15} /><vscode-textfield ref={inputRef} value={query} onInput={changeQuery} placeholder={t('search.placeholder')} autofocus /><vscode-toolbar-button icon="search" type="submit" aria-label={t('view.search')}></vscode-toolbar-button></form><vscode-scrollable class="search-results">{busy && <span class="muted">{t('tree.loading')}</span>}{error && <span class="error-text search-error">{error}</span>}{results.map((result) => <button key={result.path + (result.line || '')} type="button" class={['search-result', result.reason === 'content' ? 'content-match' : ''].filter(Boolean).join(' ')} disabled={result.type === 'dir'} onClick={() => { if (result.type !== 'dir') window.dispatchEvent(new CustomEvent('pixcode:open-file', { detail: result.path })) }}><span class="search-result-path">{result.path}</span>{result.line && <span class="search-result-meta">:{result.line} {result.preview || ''}</span>}</button>)}{!busy && query && !results.length && !error && <span class="muted">{t('search.none')}</span>}</vscode-scrollable></div>
}

function RunView() {
  return <div class="info-view"><div class="sidebar-heading">{t('view.run')}</div><div class="info-actions"><vscode-button onClick={() => { panelOpen.value = true; if (isCompactViewport()) mobileTab.value = 'terminal' }}>{t('run.openTerminal')}</vscode-button></div></div>
}

function AgentInfo() {
  return <div class="info-view"><div class="sidebar-heading">{t('view.agent')}</div><div class="info-actions"><vscode-button onClick={() => { mobileTab.value = 'agent'; panelOpen.value = false; window.dispatchEvent(new Event('pixcode:new-agent')) }}>{t('agent.open')}</vscode-button></div></div>
}

function RemoteView() {
  return <div class="info-view"><div class="sidebar-heading"><span>{t('view.remote')}</span><Globe2 size={14} /></div><div class="info-card"><Globe2 size={22} /><strong>{t('remote.localTitle')}</strong><p>{t('remote.localDescription')}</p><code>localhost</code></div></div>
}

function ExtensionsView() {
  return <div class="info-view"><div class="sidebar-heading"><span>{t('view.extensions')}</span><Blocks size={14} /></div><div class="extension-list"><div class="extension-card"><span class="extension-icon"><Sparkles size={16} /></span><span><strong>Pixcode Agents</strong><small>{t('extensions.agentsDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div><div class="extension-card"><span class="extension-icon"><Files size={16} /></span><span><strong>CodeMirror</strong><small>{t('extensions.editorDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div><div class="extension-card"><span class="extension-icon"><TerminalIcon size={16} /></span><span><strong>xterm.js</strong><small>{t('extensions.terminalDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div></div></div>
}

function SettingsView() {
  const [notifyOn, setNotifyOn] = useState(notificationsEnabled())
  async function toggleNotifications() {
    if (notifyOn) {
      await setNotificationsEnabled(false)
      setNotifyOn(false)
    } else {
      setNotifyOn(await setNotificationsEnabled(true))
    }
  }
  function resetLayout() {
    setSidebarWidth(276)
    setAgentWidth(368)
    setPanelHeight(260)
    panelOpen.value = false
    mobileTab.value = 'files'
    activeView.value = 'explorer'
  }

  return <div class="info-view settings-view">
    <div class="sidebar-heading"><span>{t('view.settings')}</span><Settings size={14} /></div>
    <vscode-scrollable class="settings-scroll">
      <vscode-collapsible class="settings-section" heading={t('settings.appearance')} open>
        <p class="settings-section-hint">{t('settings.appearanceHint')}</p>
        <div class="settings-card">
          <div class="settings-control-row">
            <div class="settings-control-copy"><Sun size={16} /><span><strong>{t('settings.theme')}</strong><small>{t('settings.themeHint')}</small></span></div>
            <div class="settings-segmented" role="group" aria-label={t('settings.theme')}>
              <button type="button" class={theme.value === 'dark' ? 'active' : ''} aria-pressed={theme.value === 'dark'} onClick={() => setTheme('dark')}><Moon size={14} />{t('settings.dark')}</button>
              <button type="button" class={theme.value === 'light' ? 'active' : ''} aria-pressed={theme.value === 'light'} onClick={() => setTheme('light')}><Sun size={14} />{t('settings.light')}</button>
            </div>
          </div>
          <div class="settings-control-row">
            <div class="settings-control-copy"><TerminalIcon size={16} /><span><strong>{t('settings.terminalFontSize')}</strong><small>{t('settings.terminalFontSizeHint')}</small></span></div>
            <div class="settings-range-control"><input type="range" min="11" max="18" step="0.5" value={terminalFontSize.value} onInput={(event) => setTerminalFontSize(event.currentTarget.value)} aria-label={t('settings.terminalFontSize')} /><output>{terminalFontSize.value}px</output></div>
          </div>
          <div class="settings-control-row">
            <div class="settings-control-copy"><ChevronsUpDown size={16} /><span><strong>{t('settings.scrollSpeed')}</strong><small>{t('settings.scrollSpeedHint')}</small></span></div>
            <div class="settings-range-control"><input type="range" min="0.25" max="3" step="0.25" value={terminalScrollSpeed.value} onInput={(event) => setTerminalScrollSpeed(event.currentTarget.value)} aria-label={t('settings.scrollSpeed')} /><output>×{terminalScrollSpeed.value}</output></div>
          </div>
          <div class="settings-control-row">
            <div class="settings-control-copy"><Globe2 size={16} /><span><strong>{t('lang.label')}</strong><small>{t('settings.languageHint')}</small></span></div>
            <VscSelect value={locale.value} onChange={setLocale} aria-label={t('lang.label')}>
              {languages.map((language) => <vscode-option key={language.value} value={language.value}>{language.nativeName}</vscode-option>)}
            </VscSelect>
          </div>
        </div>
      </vscode-collapsible>
      <vscode-collapsible class="settings-section" heading={t('settings.workspace')} open>
        <p class="settings-section-hint">{t('settings.workspaceHint')}</p>
        <div class="settings-card">
          <div class="settings-control-row">
            <div class="settings-control-copy"><PanelLeft size={16} /><span><strong>{t('settings.sidebar')}</strong><small>{sidebarWidth.value ? t('settings.visible') : t('settings.hidden')}</small></span></div>
            <vscode-button secondary onClick={() => setSidebarWidth(sidebarWidth.value ? 0 : 276)}>{t('layout.toggleSidebar')}</vscode-button>
          </div>
          <div class="settings-control-row">
            <div class="settings-control-copy"><PanelBottom size={16} /><span><strong>{t('settings.terminalPanel')}</strong><small>{panelOpen.value ? t('settings.visible') : t('settings.hidden')}</small></span></div>
            <vscode-button secondary onClick={() => (panelOpen.value = !panelOpen.value)}>{t('layout.togglePanel')}</vscode-button>
          </div>
          <div class="settings-control-row settings-control-row-last">
            <div class="settings-control-copy"><RefreshCw size={16} /><span><strong>{t('settings.resetLayout')}</strong><small>{t('settings.resetLayoutHint')}</small></span></div>
            <vscode-button secondary onClick={resetLayout}>{t('settings.reset')}</vscode-button>
          </div>
        </div>
      </vscode-collapsible>
      <vscode-collapsible class="settings-section" heading={t('settings.notifications')} open>
        <p class="settings-section-hint">{t('settings.notificationsHint')}</p>
        <div class="settings-card">
          <div class="settings-control-row">
            <div class="settings-control-copy"><Bell size={16} /><span><strong>{t('settings.agentAlerts')}</strong><small>{t('settings.agentAlertsHint')}</small></span></div>
            <vscode-button secondary onClick={toggleNotifications}>{notifyOn ? t('settings.on') : t('settings.off')}</vscode-button>
          </div>
          <div class="settings-control-row settings-control-row-last">
            <div class="settings-control-copy"><Send size={16} /><span><strong>{t('settings.webhook')}</strong><small>{t('settings.webhookHint')}</small></span></div>
            <span class="muted settings-webhook-note">pixcode settings set webhook &lt;url&gt;</span>
          </div>
        </div>
      </vscode-collapsible>
      <vscode-collapsible class="settings-section" heading={t('git.accountTitle')} open>
        <p class="settings-section-hint">{t('git.accountHint')}</p>
        <GitAccountCard />
      </vscode-collapsible>
      <vscode-collapsible class="settings-section" heading={t('skills.title')} open>
        <p class="settings-section-hint">{t('skills.hint')}</p>
        <SkillManager />
      </vscode-collapsible>
      <vscode-collapsible class="settings-section" heading={t('update.title')} open>
        <p class="settings-section-hint">{t('update.description')}</p>
        <div class="settings-card settings-update-card"><UpdateChecker detailed /></div>
      </vscode-collapsible>
      {isAdmin.value && (
        <vscode-collapsible class="settings-section" heading={t('share.title')} open>
          <p class="settings-section-hint">{t('share.hint')}</p>
          <ShareCard />
        </vscode-collapsible>
      )}
      {isAdmin.value && (
        <vscode-collapsible class="settings-section" heading={t('users.title')} open>
          <p class="settings-section-hint">{t('users.hint')}</p>
          <UserManager />
        </vscode-collapsible>
      )}
    </vscode-scrollable>
  </div>
}

// Per-user git connection: commit identity plus one HTTPS token per host.
// Tokens are write-only — the server stores them in a 0600 file and injects
// them into git's credential helper per operation; this form only ever sees
// the list of configured hosts.
function GitAccountCard() {
  const [account, setAccount] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [host, setHost] = useState('github.com')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ws.request('git', 'account', {}).then((result) => {
      setAccount(result)
      setName(result.name || '')
      setEmail(result.email || '')
    }).catch(() => setAccount({ name: '', email: '', hosts: [] }))
  }, [])

  async function save() {
    setBusy(true)
    setStatus('')
    try {
      const next = await ws.request('git', 'saveAccount', { name, email, ...(token.trim() ? { host, token: token.trim() } : {}) })
      setAccount(next)
      setToken('')
      setStatus(t('git.accountSaved'))
    } catch (requestError) {
      setStatus(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeHost(value) {
    setBusy(true)
    try {
      setAccount(await ws.request('git', 'saveAccount', { removeHost: value }))
    } catch { /* keep current list */ } finally {
      setBusy(false)
    }
  }

  if (!account) return <div class="settings-card"><span class="muted">{t('tree.loading')}</span></div>
  return <div class="settings-card git-account-card">
    <div class="settings-control-row">
      <div class="settings-control-copy"><GitBranch size={16} /><span><strong>{t('git.identity')}</strong><small>{t('git.identityHint')}</small></span></div>
    </div>
    <div class="git-account-fields">
      <vscode-textfield value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('git.namePlaceholder')} aria-label={t('git.namePlaceholder')} />
      <vscode-textfield value={email} onInput={(event) => setEmail(event.currentTarget.value)} placeholder={t('git.emailPlaceholder')} aria-label={t('git.emailPlaceholder')} />
    </div>
    <div class="settings-control-row">
      <div class="settings-control-copy"><Globe2 size={16} /><span><strong>{t('git.tokenTitle')}</strong><small>{t('git.tokenHint')}</small></span></div>
    </div>
    <div class="git-account-fields">
      <vscode-textfield value={host} onInput={(event) => setHost(event.currentTarget.value)} placeholder="github.com" aria-label={t('git.hostPlaceholder')} />
      <vscode-textfield type="password" value={token} onInput={(event) => setToken(event.currentTarget.value)} placeholder={t('git.tokenPlaceholder')} aria-label={t('git.tokenPlaceholder')} />
    </div>
    {account.hosts?.length > 0 && <div class="git-account-hosts">
      {account.hosts.map((value) => <span class="git-host-chip" key={value}><code>{value}</code><button type="button" onClick={() => removeHost(value)} disabled={busy} title={t('git.removeHost')} aria-label={`${t('git.removeHost')} ${value}`}><Trash2 size={12} /></button></span>)}
    </div>}
    <div class="git-account-footer">
      {status && <span class={status === t('git.accountSaved') ? 'muted' : 'error-text'}>{status}</span>}
      <vscode-button onClick={save} disabled={busy} icon="save"><Save size={13} /> {t('git.saveAccount')}</vscode-button>
    </div>
  </div>
}

function ResizeHandle({ direction, className = '', onResize }) {
  const start = useRef(null)
  function begin(event) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    start.current = direction === 'vertical' ? event.clientX : event.clientY
    const move = (moveEvent) => {
      const next = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY
      const delta = next - start.current
      start.current = next
      onResize(delta)
    }
    const end = () => { document.body.classList.remove('is-resizing'); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); start.current = null }
    document.body.classList.add('is-resizing')
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end, { once: true })
    document.addEventListener('pointercancel', end, { once: true })
  }
  return <div class={`resize-handle ${direction} ${className}`} role="separator" aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'} onPointerDown={begin} />
}

export function Shell() {
  useEffect(() => {
    initFsWatch()
    initNotifications()
    const open = (event) => openFile(event.detail)
    const openAgent = () => { mobileTab.value = 'agent'; panelOpen.value = false; window.setTimeout(() => window.dispatchEvent(new Event('pixcode:new-agent')), 0) }
    const openTerminal = () => { panelOpen.value = true; if (isCompactViewport()) mobileTab.value = 'terminal' }
    const newFile = () => { activeView.value = 'explorer'; mobileTab.value = 'files'; window.setTimeout(() => window.dispatchEvent(new Event('pixcode:new-file')), 0) }
    const createFile = () => { activeView.value = 'explorer'; mobileTab.value = 'files'; window.setTimeout(() => window.dispatchEvent(new Event('pixcode:new-file')), 0) }
    const shortcuts = (event) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'p') { event.preventDefault(); activeView.value = 'search'; mobileTab.value = 'files' }
      if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); setSidebarWidth(sidebarWidth.value > 0 ? 0 : 276) }
      if (modifier && event.key.toLowerCase() === 'j') { event.preventDefault(); panelOpen.value = !panelOpen.value }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); activeView.value = 'explorer'; mobileTab.value = 'files' }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); activeView.value = 'search'; mobileTab.value = 'files' }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'g') { event.preventDefault(); activeView.value = 'source'; mobileTab.value = 'git' }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); activeView.value = 'run'; panelOpen.value = true; if (isCompactViewport()) mobileTab.value = 'terminal' }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); activeView.value = 'extensions'; mobileTab.value = 'files' }
      if (modifier && event.code === 'Backquote') { event.preventDefault(); panelOpen.value = !panelOpen.value }
    }
    window.addEventListener('pixcode:open-file', open)
    window.addEventListener('pixcode:open-agent', openAgent)
    window.addEventListener('pixcode:open-terminal', openTerminal)
    window.addEventListener('pixcode:new-file', newFile)
    window.addEventListener('pixcode:create-file', createFile)
    window.addEventListener('keydown', shortcuts)
    return () => { window.removeEventListener('pixcode:open-file', open); window.removeEventListener('pixcode:open-agent', openAgent); window.removeEventListener('pixcode:open-terminal', openTerminal); window.removeEventListener('pixcode:new-file', newFile); window.removeEventListener('pixcode:create-file', createFile); window.removeEventListener('keydown', shortcuts); ws.close() }
  }, [])
  const mobile = mobileTab.value
  const effectiveSidebar = sidebarWidth.value
  const effectivePanel = panelOpen.value ? panelHeight.value : 0
  const effectiveAgent = agentWidth.value
  // The auxiliary pane is user-toggled through the right agent rail; it opens
  // itself when a session appears so restored/spawned agents stay visible.
  useEffect(() => {
    if (agentSessions.value.length > 0) setAgentRail(true)
  }, [agentSessions.value.length])
  const agentsCollapsed = !agentRailOpen.value && !isCompactViewport()
  return <div class="shell">
    <TopBar />
    <div class={`workbench ${agentsCollapsed ? 'agents-collapsed' : ''}`} style={{ '--sidebar-width': `${effectiveSidebar}px`, '--agent-width': `${effectiveAgent}px`, '--panel-height': `${effectivePanel}px` }}>
      <ActivityBar />
      <aside class={`sidebar pane ${mobile === 'files' || mobile === 'git' || mobile === 'settings' ? 'mobile-active' : ''} ${effectiveSidebar ? '' : 'collapsed'}`}><SidebarView /></aside>
      <ResizeHandle direction="vertical" className="sidebar-resize" onResize={(delta) => setSidebarWidth(sidebarWidth.value + delta)} />
      <main class={`editor-area pane ${mobile === 'editor' ? 'mobile-active' : ''}`}><EditorPane /></main>
      <ResizeHandle direction="vertical" className="agent-resize" onResize={(delta) => setAgentWidth(agentWidth.value - delta)} />
      <aside class={`auxiliary pane ${mobile === 'agent' || mobile === 'terminal' ? 'mobile-active' : ''}`}><section class={`aux-section agent-section ${mobile === 'terminal' ? 'aux-section-hidden' : ''} ${mobile === 'agent' || mobile !== 'terminal' ? 'mobile-view-active' : ''}`}><AgentPanel /></section>{mobile === 'terminal' && isCompactViewport() && <section class="aux-section terminal-section mobile-view-active"><Terminals /></section>}</aside>
      <AgentRail />
      {panelOpen.value && !isCompactViewport() && <><ResizeHandle direction="horizontal" className="panel-resize" onResize={(delta) => setPanelHeight(panelHeight.value - delta)} /><div class="bottom-panel"><div class="panel-header"><span>{t('panel.terminal')}</span><vscode-toolbar-button icon="close" onClick={() => (panelOpen.value = false)} title={t('panel.close')} aria-label={t('panel.close')}></vscode-toolbar-button></div><Terminals /></div></>}
    </div>
    <nav class="mobile-tabs" aria-label={t('view.navigation')}>{mobileTabs.map((item) => { const Glyph = item.icon; return <button key={item.id} class={`mobile-tab ${mobile === item.id ? 'active' : ''}`} type="button" onClick={() => { mobileTab.value = item.id; if (item.id === 'terminal') panelOpen.value = true; if (item.id === 'agent' || item.id === 'settings') panelOpen.value = false; if (item.id === 'git') activeView.value = 'source'; if (item.id === 'files') activeView.value = 'explorer'; if (item.id === 'agent') activeView.value = 'agent'; if (item.id === 'terminal') activeView.value = 'run'; if (item.id === 'settings') activeView.value = 'settings' }}><Glyph size={18} strokeWidth={1.7} aria-hidden="true" /><span>{t(item.label)}</span></button> })}</nav>
    <InstallBanner />
  </div>
}
