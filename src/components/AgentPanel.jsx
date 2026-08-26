import { useEffect, useRef, useState } from 'preact/hooks'
import { CircleStop, Maximize2, Plus, RefreshCw, Terminal as TerminalIcon, X } from '../lib/icons.jsx'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent, theme, workspace } from '../state/app.js'
import { terminalFont, terminalTheme } from '../lib/terminal-theme.js'
import { watchTerminalResize } from '../lib/terminal-resize.js'

const agentIcons = {
  claude: '/icons/claude-ai-icon.svg',
  codex: '/icons/codex-white.svg',
  gemini: '/icons/gemini-ai-icon.svg',
  qwen: '/icons/qwen-logo.svg',
  opencode: '/icons/opencode-logo-dark.svg',
  grok: '/icons/grok-build-icon.png'
}

// A close action must survive a browser refresh, especially when the server
// is an older instance that only understands `agent.stop`. Keep a small
// client-side tombstone list and associate each id with the session start
// time so an id reused after a backend restart is not hidden accidentally.
const CLOSED_SESSIONS_KEY = 'pixcode.agentClosedSessions'
const CLOSED_SESSION_TTL = 30 * 24 * 60 * 60 * 1_000

function readClosedSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_SESSIONS_KEY) || '{}')
    const now = Date.now()
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => {
      const closedAt = Number(value?.closedAt)
      return Number.isFinite(closedAt) && now - closedAt < CLOSED_SESSION_TTL
    }).slice(-200))
  } catch {
    return {}
  }
}

function writeClosedSessions(tombstones) {
  try { localStorage.setItem(CLOSED_SESSIONS_KEY, JSON.stringify(tombstones)) } catch { void 0 }
}

function rememberClosedSession(tombstones, session) {
  tombstones[session.sessionId] = { closedAt: Date.now(), startedAt: Number(session.startedAt) || 0 }
  const entries = Object.entries(tombstones).slice(-200)
  writeClosedSessions(Object.fromEntries(entries))
}

function isClosedSession(tombstones, session) {
  const tombstone = tombstones[session.sessionId]
  if (!tombstone) return false
  const startedAt = Number(session.startedAt) || 0
  // A missing start time is treated conservatively: hide it while the
  // tombstone is fresh. New sessions expose startedAt from the runner.
  if (!startedAt || !tombstone.startedAt || startedAt <= tombstone.closedAt) return true
  delete tombstones[session.sessionId]
  writeClosedSessions(tombstones)
  return false
}

function AgentLogo({ agent, size = 18 }) {
  const source = agent?.icon || agentIcons[agent?.id]
  if (source) return <img class="agent-logo" style={{ width: `${size}px`, height: `${size}px` }} src={source} alt="" aria-hidden="true" />
  return <TerminalIcon size={size} aria-hidden="true" />
}

function AgentTerminalView({ session, onStatus }) {
  const host = useRef(null)
  const terminalRef = useRef(null)

  useEffect(() => {
    if (!host.current || !session) return undefined
    const terminal = new Terminal({ fontFamily: terminalFont, fontSize: 13.5, lineHeight: 1.25, fontWeight: 450, cursorBlink: true, disableStdin: false, scrollOnUserInput: true, convertEol: true, scrollback: 5_000, theme: terminalTheme(theme.value) })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    // The active agent tab should be immediately typeable after it is
    // restored; xterm otherwise waits for the first explicit click.
    terminal.focus()
    terminalRef.current = terminal
    let disposed = false
    let lastSeq = 0
    let hydrated = false
    let hydrating = false
    const pendingEvents = []

    async function hydrate() {
      if (hydrating || disposed) return
      hydrating = true
      try {
        const history = await ws.request('agent', 'history', { sessionId: session.sessionId })
        for (const event of history) {
          if (event.seq && event.seq <= lastSeq) continue
          if (event.type === 'data') terminal.write(event.data || '')
          lastSeq = Math.max(lastSeq, event.seq || 0)
          if (event.type === 'done') onStatus(session.sessionId, 'stopped')
        }
        if (!hydrated) {
          hydrated = true
          for (const event of pendingEvents.splice(0).sort((left, right) => (left.seq || 0) - (right.seq || 0))) {
            if (event.seq && event.seq <= lastSeq) continue
            if (event.type === 'data') terminal.write(event.data || '')
            lastSeq = Math.max(lastSeq, event.seq || 0)
            if (event.type === 'done') onStatus(session.sessionId, 'stopped')
          }
        }
      } catch (error) {
        if (!disposed) {
          terminal.write(`\r\n[history unavailable: ${error.message}]\r\n`)
          // A temporary history failure must not trap subsequent live output
          // in the pending queue. The next reconnect will hydrate again and
          // sequence filtering will discard any duplicate chunks.
          hydrated = true
          for (const event of pendingEvents.splice(0).sort((left, right) => (left.seq || 0) - (right.seq || 0))) {
            if (event.seq && event.seq <= lastSeq) continue
            if (event.type === 'data') terminal.write(event.data || '')
            lastSeq = Math.max(lastSeq, event.seq || 0)
            if (event.type === 'done') onStatus(session.sessionId, 'stopped')
          }
        }
      } finally {
        hydrating = false
      }
    }
    const stopResizeWatcher = watchTerminalResize(host.current, fit, terminal, (cols, rows) => {
      ws.request('agent', 'resize', { sessionId: session.sessionId, cols, rows }).catch(() => {})
    })
    const focusTerminal = () => terminal.focus()
    host.current.addEventListener('pointerdown', focusTerminal)
    host.current.addEventListener('click', focusTerminal)
    const reconnect = () => {
      hydrated = false
      pendingEvents.length = 0
      hydrate()
    }
    window.addEventListener('pixcode:ws-open', reconnect)
    let inputErrorShown = false
    const inputDisposable = terminal.onData((data) => {
      ws.request('agent', 'input', { sessionId: session.sessionId, data }).catch((error) => {
        // Do not silently swallow a dead/reconnected PTY. Showing one concise
        // diagnostic keeps the terminal usable and makes the stopped state
        // obvious instead of accepting keystrokes that disappear.
        if (disposed || inputErrorShown) return
        inputErrorShown = true
        terminal.write(`\r\n[agent input unavailable: ${error.message}]\r\n`)
        if (/session (?:not )?running|session not found/i.test(error.message || '')) onStatus(session.sessionId, 'stopped')
      })
    })
    const dataUnsubscribe = ws.on('agent', 'session', (event) => {
      if (event.sessionId !== session.sessionId || (event.seq && event.seq <= lastSeq)) return
      if (!hydrated) {
        pendingEvents.push(event)
        return
      }
      lastSeq = event.seq || lastSeq
      if (event.type === 'data') terminal.write(event.data || '')
      if (event.type === 'done') onStatus(session.sessionId, 'stopped')
    })
    hydrate().finally(() => {
      if (!disposed) stopResizeWatcher.refresh?.()
    }).catch(() => {})
    return () => {
      disposed = true
      stopResizeWatcher()
      host.current?.removeEventListener('pointerdown', focusTerminal)
      host.current?.removeEventListener('click', focusTerminal)
      window.removeEventListener('pixcode:ws-open', reconnect)
      dataUnsubscribe()
      inputDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [session?.sessionId])

  useEffect(() => { if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(theme.value) }, [theme.value])
  return <div class="agent-terminal-host" ref={host} />
}

export function AgentPanel() {
  const [agents, setAgents] = useState([])
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [closeConfirmSessionId, setCloseConfirmSessionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const closedSessions = useRef(readClosedSessions())
  const loadingRef = useRef(false)
  const reloadRequestedRef = useRef(false)
  const loadSequence = useRef(0)
  const activeSessionRef = useRef('')

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null

  function selectSession(sessionId) {
    activeSessionRef.current = sessionId
    setActiveSessionId(sessionId)
  }

  async function load() {
    if (loadingRef.current) {
      // A workspace switch can arrive while the previous session list is
      // still in flight. Queue one fresh read instead of leaving the new
      // workspace with the old tab set.
      reloadRequestedRef.current = true
      return
    }
    loadingRef.current = true
    setRefreshing(true)
    const sequence = ++loadSequence.current
    const requestedWorkspace = workspace.value?.path || ''
    try {
      const [list, currentSessions] = await Promise.all([ws.request('agent', 'agents'), ws.request('agent', 'sessions', { workspace: requestedWorkspace })])
      if (sequence !== loadSequence.current || requestedWorkspace !== (workspace.value?.path || '')) return
      setAgents(list)
      // Stopped sessions are history records, not writable terminals. Do not
      // restore them as tabs after refresh; only a live PTY can accept input.
      const visibleSessions = currentSessions.filter((session) => session.status === 'running' && !isClosedSession(closedSessions.current, session))
      setSessions(visibleSessions)
      if (visibleSessions.length && !activeSessionRef.current) activeAgent.value = visibleSessions.at(-1).agent
      const available = list.filter((agent) => agent.available)
      if (activeSessionRef.current && !visibleSessions.some((session) => session.sessionId === activeSessionRef.current)) selectSession(visibleSessions.at(-1)?.sessionId || '')
      if (!activeSessionRef.current && visibleSessions[0]) selectSession(visibleSessions[0].sessionId)
      if (!activeAgent.value && available[0]) activeAgent.value = available[0].id
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      loadingRef.current = false
      setRefreshing(false)
      if (reloadRequestedRef.current || requestedWorkspace !== (workspace.value?.path || '')) {
        reloadRequestedRef.current = false
        window.setTimeout(() => load(), 0)
      }
    }
  }

  useEffect(() => {
    const openNewSession = () => {
      setError('')
      setModalOpen(true)
    }
    const reconnect = () => load()
    const workspaceChange = () => {
      selectSession('')
      load()
    }
    const unsubscribe = ws.on('agent', 'session', (event) => {
      const currentWorkspace = workspace.value?.path || ''
      if (event.workspace && currentWorkspace && event.workspace !== currentWorkspace) return
      if (isClosedSession(closedSessions.current, event)) return
      // A completion event cannot create a usable tab. It may arrive just
      // after the authoritative session list and must not resurrect a PTY
      // that has already exited.
      if (event.type === 'done') {
        setSessions((current) => {
          const next = current.filter((session) => session.sessionId !== event.sessionId)
          if (activeSessionRef.current === event.sessionId) selectSession(next.at(-1)?.sessionId || '')
          return next
        })
        return
      }
      setSessions((current) => {
        const existing = current.find((session) => session.sessionId === event.sessionId)
        const nextIndex = Math.max(0, ...current.filter((item) => item.agent === event.agent).map((item) => Number(item.index) || 0)) + 1
        const next = existing
          ? current.map((session) => session.sessionId === event.sessionId ? { ...session, status: 'running' } : session)
          : [...current, { sessionId: event.sessionId, agent: event.agent, status: 'running', startedAt: event.startedAt || event.ts, index: event.index || nextIndex }]
        return next
      })
    })
    window.addEventListener('pixcode:ws-open', reconnect)
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    window.addEventListener('pixcode:new-agent', openNewSession)
    load()
    return () => {
      window.removeEventListener('pixcode:ws-open', reconnect)
      window.removeEventListener('pixcode:workspace-change', workspaceChange)
      window.removeEventListener('pixcode:new-agent', openNewSession)
      unsubscribe()
    }
  }, [])

  async function openAgent(agent) {
    if (!agent.available || busy) return
    setBusy(true)
    setError('')
    try {
      const session = await ws.request('agent', 'start', { agent: agent.id, workspace: workspace.value?.path || '', cols: 100, rows: 30 })
      setSessions((current) => current.some((item) => item.sessionId === session.sessionId)
        ? current.map((item) => item.sessionId === session.sessionId ? { ...item, ...session } : item)
        : [...current, session])
      selectSession(session.sessionId)
      activeAgent.value = agent.id
      setModalOpen(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function stopSession(sessionId) {
    try {
      await ws.request('agent', 'stop', { sessionId })
      setSessions((current) => {
        const next = current.filter((session) => session.sessionId !== sessionId)
        if (activeSessionRef.current === sessionId) selectSession(next.at(-1)?.sessionId || '')
        return next
      })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function requestCloseSession(event, sessionId) {
    event.stopPropagation()
    setCloseConfirmSessionId(sessionId)
  }

  async function confirmCloseSession() {
    const sessionId = closeConfirmSessionId
    if (!sessionId) return
    setCloseConfirmSessionId('')
    const session = sessions.find((item) => item.sessionId === sessionId)
    rememberClosedSession(closedSessions.current, session || { sessionId, startedAt: 0 })
    // Remove the tab immediately. A stale backend may take time to reject the
    // newer `close` operation; the UI must not look stuck while that happens.
    setSessions((current) => {
      const next = current.filter((item) => item.sessionId !== sessionId)
      if (activeSessionRef.current === sessionId) selectSession(next.at(-1)?.sessionId || '')
      return next
    })
    let closeError = null
    try {
      await ws.request('agent', 'close', { sessionId })
    } catch (requestError) {
      // Keep the UI usable while an older backend is still running without
      // the dedicated close operation. Stopping is the safe compatibility
      // fallback; the closed-id filter prevents that stopped session from
      // being re-added by a refresh in this client.
      try {
        await ws.request('agent', 'stop', { sessionId })
      } catch (stopError) {
        // The tab is still closed locally even if a stale/disconnected
        // backend cannot acknowledge it. The tombstone prevents that stale
        // session from being restored on the next refresh.
        closeError = stopError.message || requestError.message
      }
    }
    if (closeError && !/session not found/i.test(closeError)) setError(closeError)
  }

  function updateStatus(sessionId, status) {
    if (status === 'stopped') {
      setSessions((current) => {
        const next = current.filter((session) => session.sessionId !== sessionId)
        if (activeSessionRef.current === sessionId) selectSession(next.at(-1)?.sessionId || '')
        return next
      })
      return
    }
    setSessions((current) => current.map((session) => session.sessionId === sessionId ? { ...session, status } : session))
  }

  function sessionLabel(session) {
    const agent = agents.find((item) => item.id === session.agent)
    return `${agent?.label || session.agent} #${session.index || 1}`
  }

  const closeConfirmSession = sessions.find((session) => session.sessionId === closeConfirmSessionId) || null

  return (
    <div class="agent-panel">
      <div class="agent-session-tabs">
        <div class="agent-session-tabs-scroll">
          {sessions.map((session) => {
            const agent = agents.find((item) => item.id === session.agent)
            return <button class={`agent-session-tab ${session.sessionId === activeSessionId ? 'active' : ''}`} type="button" key={session.sessionId} onClick={() => { selectSession(session.sessionId); activeAgent.value = session.agent }} title={sessionLabel(session)}>
              <AgentLogo agent={agent} size={14} /><span>{sessionLabel(session)}</span>{session.status === 'running' && <i class="agent-session-live" />}<span class="agent-tab-close" role="button" tabIndex="0" onClick={(event) => requestCloseSession(event, session.sessionId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') requestCloseSession(event, session.sessionId) }} title={t('agent.close')} aria-label={t('agent.close')}><X size={12} /></span>
            </button>
          })}
        </div>
        <button class="tw-icon-button agent-add-button" type="button" onClick={() => setModalOpen(true)} title={t('agent.new')} aria-label={t('agent.new')}><Plus size={14} /></button>
      </div>
      <div class="agent-terminal-header">
        <span class="terminal-badge"><TerminalIcon size={13} /> AGENT TERMINAL</span>
        {activeSession && <span class="agent-terminal-provider"><AgentLogo agent={agents.find((agent) => agent.id === activeSession.agent)} size={16} /><strong>{sessionLabel(activeSession)}</strong><code>{activeSession.status}</code></span>}
        <span class="agent-header-spacer" />
        {activeSession?.status === 'running' && <button class="tw-toolbar-button" type="button" onClick={() => stopSession(activeSession.sessionId)}><CircleStop size={13} /> {t('agent.stop')}</button>}
        <button class="tw-icon-button" type="button" onClick={load} disabled={refreshing} title={t('agent.refresh')} aria-label={t('agent.refresh')}><RefreshCw size={13} class={refreshing ? 'spin' : ''} /></button>
      </div>
      <div class="agent-console agent-terminal-console">
        {activeSession ? <AgentTerminalView key={activeSession.sessionId} session={activeSession} onStatus={updateStatus} /> : <div class="agent-empty-terminal"><TerminalIcon size={20} /><span>{t('agent.noSession')}</span><button class="btn-accent tw-toolbar-button" type="button" onClick={() => setModalOpen(true)}><Plus size={13} /> {t('agent.new')}</button></div>}
        {error && <div class="error-text agent-error">{error}</div>}
      </div>
      {modalOpen && <div class="agent-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setModalOpen(false) }}><section class="agent-modal" role="dialog" aria-modal="true" aria-labelledby="agent-modal-title"><div class="agent-modal-heading"><strong id="agent-modal-title">{t('agent.new')}</strong><button class="tw-icon-button" type="button" onClick={() => setModalOpen(false)} title={t('common.cancel')} aria-label={t('common.cancel')}><X size={15} /></button></div><p>{t('agent.chooseCli')}</p><div class="agent-modal-list">{agents.map((agent) => <button class={`agent-modal-item ${agent.available ? '' : 'unavailable'}`} type="button" disabled={!agent.available || busy} key={agent.id} onClick={() => openAgent(agent)}><span class="agent-picker-logo"><AgentLogo agent={agent} size={22} /></span><span><strong>{agent.label}</strong><small>{agent.cli}{agent.available ? '' : ` · ${t('agent.missing')}`}</small></span><Maximize2 size={13} /></button>)}</div></section></div>}
      {closeConfirmSession && <div class="agent-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setCloseConfirmSessionId('') }}><section class="agent-modal agent-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="agent-close-title"><div class="agent-modal-heading"><strong id="agent-close-title">{t('agent.closeTitle')}</strong><button class="tw-icon-button" type="button" onClick={() => setCloseConfirmSessionId('')} title={t('common.cancel')} aria-label={t('common.cancel')}><X size={15} /></button></div><p>{t('agent.closeConfirm', { name: sessionLabel(closeConfirmSession) })}</p><div class="modal-actions"><button type="button" onClick={() => setCloseConfirmSessionId('')}>{t('agent.closeNo')}</button><button class="btn-accent" type="button" onClick={confirmCloseSession}>{t('agent.closeYes')}</button></div></section></div>}
    </div>
  )
}
