import { useEffect, useRef, useState } from 'preact/hooks'
import { ArrowLeft, ArrowRight, Blocks, Circle, Download, Files, GitBranch, Globe2, Moon, PanelBottom, PanelLeft, Play, Search, Settings, Sparkles, Sun, Terminal as TerminalIcon, X } from 'lucide-preact'
import { t, setLocale, locale } from '../lib/i18n.js'
import { ws } from '../lib/ws.js'
import { setToken } from '../lib/api.js'
import { activeView, agentWidth, gitBranch, mobileTab, openFile, panelHeight, panelOpen, setAgentWidth, setPanelHeight, setSidebarWidth, setTheme, sidebarWidth, theme } from '../state/app.js'
import { ProjectSwitcher } from './ProjectSwitcher.jsx'
import { FileTree } from './FileTree.jsx'
import { EditorPane } from './EditorPane.jsx'
import { GitPanel } from './GitPanel.jsx'
import { AgentPanel } from './AgentPanel.jsx'
import { Terminals } from './Terminals.jsx'

const views = [
  { id: 'explorer', label: 'view.explorer', icon: 'explorer', mobile: 'files' },
  { id: 'search', label: 'view.search', icon: 'search', mobile: 'files' },
  { id: 'source', label: 'view.source', icon: 'source', mobile: 'git' },
  { id: 'run', label: 'view.run', icon: 'run', mobile: 'terminal' },
  { id: 'agent', label: 'view.agent', icon: 'agent', mobile: 'agent' },
  { id: 'remote', label: 'view.remote', icon: 'remote', mobile: 'files' },
  { id: 'extensions', label: 'view.extensions', icon: 'extensions', mobile: 'files' }
]

const mobileTabs = [
  { id: 'files', label: 'tab.files' },
  { id: 'editor', label: 'tab.editor' },
  { id: 'agent', label: 'tab.agent' },
  { id: 'terminal', label: 'tab.terminal' },
  { id: 'git', label: 'tab.git' }
]

function Icon({ name }) {
  const icons = { explorer: Files, search: Search, source: GitBranch, run: Play, agent: Sparkles, remote: Globe2, extensions: Blocks }
  const Glyph = icons[name] || Circle
  return <Glyph size={20} strokeWidth={1.65} aria-hidden="true" />
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
            onClick={() => { activeView.value = view.id; mobileTab.value = view.mobile; if (sidebarWidth.value === 0) setSidebarWidth(276); if (view.id === 'run') panelOpen.value = true }}
          >
            <Icon name={view.icon} />
          </button>
        ))}
      </div>
      <div class="activity-bottom">
        <button class={"activity-button tw-rail-button " + (activeView.value === 'settings' ? 'active' : '')} data-active={activeView.value === 'settings'} type="button" title={t('view.settings')} onClick={() => { activeView.value = 'settings'; mobileTab.value = 'files'; if (sidebarWidth.value === 0) setSidebarWidth(276) }}><Settings size={19} strokeWidth={1.65} /></button>
        <span class="activity-version">v2</span>
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
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  return (
    <header class="topbar">
      <div class="window-brand"><span class="brand-mark"><img class="brand-logo" src="/logo.svg" alt="" aria-hidden="true" /></span><strong>{t('app.title')}</strong></div>
      <div class="window-nav"><button class="tw-icon-button" type="button" disabled title={t('navigation.back')}><ArrowLeft size={16} /></button><button class="tw-icon-button" type="button" disabled title={t('navigation.forward')}><ArrowRight size={16} /></button></div>
      <button class="command-center tw-command-field" type="button" onClick={() => { activeView.value = 'search'; mobileTab.value = 'files'; if (sidebarWidth.value === 0) setSidebarWidth(276); window.dispatchEvent(new Event('pixcode:focus-search')) }}><Search class="command-icon" size={15} /><span>{t('command.search')}</span><kbd>Ctrl+P</kbd></button>
      <ProjectSwitcher />
      <span class="spacer" />
      <div class="topbar-actions">
        {installPrompt && <button type="button" class="icon-button tw-icon-button" title={t('pwa.install')} aria-label={t('pwa.install')} onClick={install}><Download size={16} /></button>}
        <button type="button" class="layout-button tw-icon-button" title={t('layout.toggleSidebar')} onClick={() => setSidebarWidth(sidebarWidth.value > 0 ? 0 : 276)}><PanelLeft size={16} /></button>
        <button type="button" class="layout-button tw-icon-button" title={t('layout.togglePanel')} onClick={() => (panelOpen.value = !panelOpen.value)}><PanelBottom size={16} /></button>
        <select aria-label={t('lang.label')} value={locale.value} onChange={(event) => setLocale(event.currentTarget.value)}>
          <option value="tr">TR</option><option value="en">EN</option>
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
  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    window.addEventListener('pixcode:focus-search', focus)
    return () => { window.removeEventListener('pixcode:focus-search', focus); window.clearTimeout(debounceRef.current) }
  }, [])
  async function search(eventOrQuery) {
    const nextQuery = typeof eventOrQuery === 'string' ? eventOrQuery : query
    eventOrQuery?.preventDefault?.()
    const requestId = ++searchRequest.current
    if (!nextQuery.trim()) { setResults([]); setError(''); return }
    setBusy(true)
    try {
      const nextResults = await ws.request('fs', 'search', { query: nextQuery })
      if (requestId === searchRequest.current) { setResults(nextResults); setError('') }
    } catch (requestError) {
      if (requestId === searchRequest.current) { setResults([]); setError(requestError.message) }
    } finally {
      if (requestId === searchRequest.current) setBusy(false)
    }
  }
  function changeQuery(event) {
    const value = event.currentTarget.value
    setQuery(value)
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => search(value), 180)
  }
  return <div class="search-view"><div class="sidebar-heading"><span>{t('view.search')}</span><span class="sidebar-heading-actions">{results.length || ''}</span></div><form onSubmit={search}><Search class="search-input-icon" size={15} /><input ref={inputRef} value={query} onInput={changeQuery} placeholder={t('search.placeholder')} autoFocus /><button class="tw-icon-button" type="submit" aria-label={t('view.search')}><Search size={14} /></button></form><div class="search-results">{busy && <span class="muted">{t('tree.loading')}</span>}{error && <span class="error-text search-error">{error}</span>}{results.map((result) => <button key={result.path + (result.line || '')} type="button" class={['search-result', result.reason === 'content' ? 'content-match' : ''].filter(Boolean).join(' ')} disabled={result.type === 'dir'} onClick={() => { if (result.type !== 'dir') window.dispatchEvent(new CustomEvent('pixcode:open-file', { detail: result.path })) }}><span class="search-result-path">{result.path}</span>{result.line && <span class="search-result-meta">:{result.line} {result.preview || ''}</span>}</button>)}{!busy && query && !results.length && !error && <span class="muted">{t('search.none')}</span>}</div></div>
}

function RunView() {
  return <div class="info-view"><div class="sidebar-heading">{t('view.run')}</div><div class="info-actions"><button type="button" class="btn-accent" onClick={() => (panelOpen.value = true)}>{t('run.openTerminal')}</button></div></div>
}

function AgentInfo() {
  return <div class="info-view"><div class="sidebar-heading">{t('view.agent')}</div><div class="info-actions"><button type="button" class="btn-accent" onClick={() => { mobileTab.value = 'agent'; panelOpen.value = true }}>{t('agent.open')}</button></div></div>
}

function RemoteView() {
  return <div class="info-view"><div class="sidebar-heading"><span>{t('view.remote')}</span><Globe2 size={14} /></div><div class="info-card"><Globe2 size={22} /><strong>{t('remote.localTitle')}</strong><p>{t('remote.localDescription')}</p><code>localhost</code></div></div>
}

function ExtensionsView() {
  return <div class="info-view"><div class="sidebar-heading"><span>{t('view.extensions')}</span><Blocks size={14} /></div><div class="extension-list"><div class="extension-card"><span class="extension-icon"><Sparkles size={16} /></span><span><strong>Pixcode Agents</strong><small>{t('extensions.agentsDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div><div class="extension-card"><span class="extension-icon"><Files size={16} /></span><span><strong>CodeMirror</strong><small>{t('extensions.editorDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div><div class="extension-card"><span class="extension-icon"><TerminalIcon size={16} /></span><span><strong>xterm.js</strong><small>{t('extensions.terminalDescription')}</small></span><span class="extension-state">{t('extensions.builtIn')}</span></div></div></div>
}

function SettingsView() {
  return <div class="info-view"><div class="sidebar-heading">{t('view.settings')}</div><div class="settings-list"><label><span>{t('settings.theme')}</span><select value={theme.value} onChange={(event) => setTheme(event.currentTarget.value)}><option value="dark">{t('topbar.theme.dark')}</option><option value="light">{t('topbar.theme.light')}</option></select></label><label><span>{t('lang.label')}</span><select value={locale.value} onChange={(event) => setLocale(event.currentTarget.value)}><option value="tr">TR</option><option value="en">EN</option></select></label><button type="button" onClick={() => setSidebarWidth(sidebarWidth.value ? 0 : 276)}>{t('layout.toggleSidebar')}</button><button type="button" onClick={() => (panelOpen.value = !panelOpen.value)}>{t('layout.togglePanel')}</button></div></div>
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

function StatusBar() {
  return <footer class="statusbar"><span class="status-branch"><GitBranch size={12} /> {gitBranch.value}</span><span class="status-message">{t('status.ready')}</span><span class="status-spacer" /><span>Ln 1, Col 1</span><span>Spaces: 2</span><span>UTF-8</span><span>▴ 0 ▾ 0</span></footer>
}

export function Shell() {
  useEffect(() => {
    const open = (event) => openFile(event.detail)
    const openAgent = () => { mobileTab.value = 'agent'; panelOpen.value = true }
    const openTerminal = () => { mobileTab.value = 'terminal'; panelOpen.value = true }
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
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); activeView.value = 'run'; mobileTab.value = 'terminal'; panelOpen.value = true }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); activeView.value = 'extensions'; mobileTab.value = 'files' }
      if (modifier && event.code === 'Backquote') { event.preventDefault(); panelOpen.value = !panelOpen.value }
    }
    window.addEventListener('pixcode:open-file', open)
    window.addEventListener('pixcode:open-agent', openAgent)
    window.addEventListener('pixcode:open-terminal', openTerminal)
    window.addEventListener('pixcode:new-file', newFile)
    window.addEventListener('pixcode:create-file', createFile)
    window.addEventListener('keydown', shortcuts)
    let cancelled = false
    const refreshBranch = async () => {
      try {
        const state = await ws.request('git', 'status')
        if (!cancelled) gitBranch.value = state?.branch || 'HEAD'
      } catch {
        if (!cancelled) gitBranch.value = '-'
      }
    }
    refreshBranch()
    const branchTimer = window.setInterval(refreshBranch, 10_000)
    return () => { cancelled = true; window.clearInterval(branchTimer); window.removeEventListener('pixcode:open-file', open); window.removeEventListener('pixcode:open-agent', openAgent); window.removeEventListener('pixcode:open-terminal', openTerminal); window.removeEventListener('pixcode:new-file', newFile); window.removeEventListener('pixcode:create-file', createFile); window.removeEventListener('keydown', shortcuts); ws.close() }
  }, [])
  const mobile = mobileTab.value
  const effectiveSidebar = sidebarWidth.value
  const effectivePanel = panelOpen.value ? panelHeight.value : 0
  const effectiveAgent = agentWidth.value
  return <div class="shell">
    <TopBar />
    <div class="workbench" style={{ '--sidebar-width': `${effectiveSidebar}px`, '--agent-width': `${effectiveAgent}px`, '--panel-height': `${effectivePanel}px` }}>
      <ActivityBar />
      <aside class={`sidebar pane ${mobile === 'files' || mobile === 'git' ? 'mobile-active' : ''} ${effectiveSidebar ? '' : 'collapsed'}`}><SidebarView /></aside>
      <ResizeHandle direction="vertical" className="sidebar-resize" onResize={(delta) => setSidebarWidth(sidebarWidth.value + delta)} />
      <main class={`editor-area pane ${mobile === 'editor' ? 'mobile-active' : ''}`}><EditorPane /></main>
      <ResizeHandle direction="vertical" className="agent-resize" onResize={(delta) => setAgentWidth(agentWidth.value - delta)} />
      <aside class={`auxiliary pane ${mobile === 'agent' || mobile === 'terminal' ? 'mobile-active' : ''}`}><section class={`aux-section agent-section ${mobile === 'agent' || mobile !== 'terminal' ? 'mobile-view-active' : ''}`}><AgentPanel /></section>{mobile === 'terminal' && <section class="aux-section terminal-section mobile-view-active"><Terminals /></section>}</aside>
      {panelOpen.value && <><ResizeHandle direction="horizontal" className="panel-resize" onResize={(delta) => setPanelHeight(panelHeight.value - delta)} /><div class="bottom-panel"><div class="panel-header"><span>{t('panel.terminal')}</span><button class="tw-icon-button" type="button" onClick={() => (panelOpen.value = false)} title={t('panel.close')} aria-label={t('panel.close')}><X size={16} /></button></div><Terminals /></div></>}
    </div>
    <StatusBar />
    <nav class="mobile-tabs" aria-label={t('view.navigation')}>{mobileTabs.map((item) => <button key={item.id} class={`mobile-tab ${mobile === item.id ? 'active' : ''}`} type="button" onClick={() => { mobileTab.value = item.id; if (item.id === 'git') activeView.value = 'source'; if (item.id === 'files') activeView.value = 'explorer'; if (item.id === 'agent') activeView.value = 'agent'; if (item.id === 'terminal') activeView.value = 'run' }}>{t(item.label)}</button>)}</nav>
  </div>
}
