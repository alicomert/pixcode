import { useEffect, useRef, useState } from 'preact/hooks'
import { CircleStop, Maximize2, Plus, RefreshCw, Terminal as TerminalIcon, X } from 'lucide-preact'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent } from '../state/app.js'
import { theme } from '../state/app.js'

const agentIcons = {
  claude: '/icons/claude-ai-icon.svg',
  codex: '/icons/codex-white.svg',
  gemini: '/icons/gemini-ai-icon.svg',
  qwen: '/icons/qwen-logo.svg',
  opencode: '/icons/opencode-logo-dark.svg',
  grok: '/icons/grok-build-icon.png'
}

function AgentLogo({ agent, size = 18 }) {
  const source = agent?.icon || agentIcons[agent?.id]
  if (source) return <img class="agent-logo" style={{ width: `${size}px`, height: `${size}px` }} src={source} alt="" aria-hidden="true" />
  return <TerminalIcon size={size} aria-hidden="true" />
}

function terminalTheme() {
  return theme.value === 'light'
    ? { background: '#17202b', foreground: '#edf1f7', cursor: '#edf1f7', selectionBackground: '#315d87' }
    : { background: '#101010', foreground: '#d1d1d1', cursor: '#d1d1d1', selectionBackground: '#26394c' }
}

function AgentTerminalView({ session, onStatus }) {
  const host = useRef(null)
  const terminalRef = useRef(null)

  useEffect(() => {
    if (!host.current || !session) return undefined
    const terminal = new Terminal({ fontFamily: 'var(--mono)', fontSize: 12, cursorBlink: true, convertEol: true, scrollback: 10_000, theme: terminalTheme() })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    terminalRef.current = terminal
    let disposed = false
    let lastSeq = 0
    let hydrated = false
    const pendingEvents = []

    async function hydrate() {
      try {
        const history = await ws.request('agent', 'history', { sessionId: session.sessionId })
        for (const event of history) {
          if (event.type === 'data') terminal.write(event.data || '')
          lastSeq = Math.max(lastSeq, event.seq || 0)
        }
        hydrated = true
        for (const event of pendingEvents.splice(0).sort((left, right) => (left.seq || 0) - (right.seq || 0))) {
          if (event.seq && event.seq <= lastSeq) continue
          if (event.type === 'data') terminal.write(event.data || '')
          lastSeq = Math.max(lastSeq, event.seq || 0)
          if (event.type === 'done') onStatus(session.sessionId, 'stopped')
        }
        if (!disposed) fit.fit()
      } catch (error) {
        if (!disposed) terminal.write(`\r\n[history unavailable: ${error.message}]\r\n`)
      }
    }
    const resize = () => {
      try {
        fit.fit()
        ws.request('agent', 'resize', { sessionId: session.sessionId, cols: terminal.cols, rows: terminal.rows }).catch(() => {})
      } catch { /* terminal can be mid-dispose */ }
    }
    const inputDisposable = terminal.onData((data) => {
      ws.request('agent', 'input', { sessionId: session.sessionId, data }).catch(() => {})
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
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    hydrate().then(resize)
    return () => {
      disposed = true
      observer.disconnect()
      dataUnsubscribe()
      inputDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [session?.sessionId])

  useEffect(() => { if (terminalRef.current) terminalRef.current.options.theme = terminalTheme() }, [theme.value])
  return <div class="agent-terminal-host" ref={host} />
}

export function AgentPanel() {
  const [agents, setAgents] = useState([])
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null

  async function load() {
    setRefreshing(true)
    try {
      const [list, currentSessions] = await Promise.all([ws.request('agent', 'agents'), ws.request('agent', 'sessions').catch(() => [])])
      setAgents(list)
      setSessions((current) => {
        const incoming = new Map(currentSessions.map((session) => [session.sessionId, session]))
        return current.map((session) => incoming.get(session.sessionId) || session).concat(currentSessions.filter((session) => !current.some((item) => item.sessionId === session.sessionId)))
      })
      const available = list.filter((agent) => agent.available)
      if (!activeSessionId && currentSessions[0]) setActiveSessionId(currentSessions[0].sessionId)
      if (!activeAgent.value && available[0]) activeAgent.value = available[0].id
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const unsubscribe = ws.on('agent', 'session', (event) => {
      setSessions((current) => {
        const existing = current.find((session) => session.sessionId === event.sessionId)
        const next = existing
          ? current.map((session) => session.sessionId === event.sessionId ? { ...session, status: event.type === 'done' ? 'stopped' : 'running' } : session)
          : [...current, { sessionId: event.sessionId, agent: event.agent, status: event.type === 'done' ? 'stopped' : 'running', startedAt: event.ts, index: current.filter((item) => item.agent === event.agent).length + 1 }]
        return next
      })
      if (!activeSessionId) setActiveSessionId(event.sessionId)
    })
    return unsubscribe
  }, [])

  async function openAgent(agent) {
    if (!agent.available || busy) return
    setBusy(true)
    setError('')
    try {
      const session = await ws.request('agent', 'start', { agent: agent.id, cols: 100, rows: 30 })
      setSessions((current) => current.some((item) => item.sessionId === session.sessionId)
        ? current.map((item) => item.sessionId === session.sessionId ? { ...item, ...session } : item)
        : [...current, session])
      setActiveSessionId(session.sessionId)
      activeAgent.value = agent.id
      setModalOpen(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function stopSession(sessionId) {
    await ws.request('agent', 'stop', { sessionId }).catch((requestError) => setError(requestError.message))
    setSessions((current) => current.map((session) => session.sessionId === sessionId ? { ...session, status: 'stopped' } : session))
  }

  async function closeSession(event, sessionId) {
    event.stopPropagation()
    await stopSession(sessionId)
    setSessions((current) => {
      const next = current.filter((session) => session.sessionId !== sessionId)
      if (activeSessionId === sessionId) setActiveSessionId(next.at(-1)?.sessionId || '')
      return next
    })
  }

  function updateStatus(sessionId, status) {
    setSessions((current) => current.map((session) => session.sessionId === sessionId ? { ...session, status } : session))
  }

  function sessionLabel(session) {
    const agent = agents.find((item) => item.id === session.agent)
    return `${agent?.label || session.agent} #${session.index || 1}`
  }

  return (
    <div class="agent-panel">
      <div class="agent-session-tabs">
        <div class="agent-session-tabs-scroll">
          {sessions.map((session) => {
            const agent = agents.find((item) => item.id === session.agent)
            return <button class={`agent-session-tab ${session.sessionId === activeSessionId ? 'active' : ''}`} type="button" key={session.sessionId} onClick={() => { setActiveSessionId(session.sessionId); activeAgent.value = session.agent }} title={sessionLabel(session)}>
              <AgentLogo agent={agent} size={14} /><span>{sessionLabel(session)}</span>{session.status === 'running' && <i class="agent-session-live" />}<span class="agent-tab-close" onClick={(event) => closeSession(event, session.sessionId)}><X size={12} /></span>
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
    </div>
  )
}
