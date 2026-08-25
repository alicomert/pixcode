import { useEffect, useRef, useState } from 'preact/hooks'
import { CircleAlert, CircleCheck, CircleStop, Dot, Hammer, Play, RefreshCw, Send, Terminal as TerminalIcon } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent } from '../state/app.js'

const agentIcons = {
  claude: '/icons/claude-ai-icon.svg',
  codex: '/icons/codex-white.svg',
  gemini: '/icons/gemini-ai-icon.svg',
  qwen: '/icons/qwen-logo.svg',
  opencode: '/icons/opencode-logo-dark.svg',
  grok: '/icons/grok-build-icon.png'
}

function AgentLogo({ agent, size = 20 }) {
  const source = agent?.icon || agentIcons[agent?.id]
  if (source) return <img class="agent-logo" style={{ width: `${size}px`, height: `${size}px` }} src={source} alt="" aria-hidden="true" />
  return <span class="agent-logo-fallback" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true"><TerminalIcon size={size - 4} /></span>
}

function eventText(event) {
  if (event.type === 'tool') {
    const input = typeof event.tool?.input === 'string' ? event.tool.input : JSON.stringify(event.tool?.input || '')
    return `${event.tool?.name || 'tool'} ${input}`
  }
  if (event.type === 'done') return `process exited (${event.exitCode ?? 0})`
  return event.text || event.message || event.status || ''
}

function renderEvent(event, index) {
  if (event.type === 'message') return <div class={`agent-line ${event.role || 'assistant'}`} key={`${event.ts}-${index}`}><span class="line-prefix">{event.role === 'user' ? '>' : <Dot size={14} />}</span><span>{eventText(event)}</span></div>
  if (event.type === 'tool') return <div class="agent-line tool" key={`${event.ts}-${index}`}><span class="line-prefix"><Hammer size={13} /></span><span>{eventText(event)}</span></div>
  if (event.type === 'error') return <div class="agent-line error-text" key={`${event.ts}-${index}`}><span class="line-prefix"><CircleAlert size={13} /></span><span>{eventText(event)}</span></div>
  if (event.type === 'done') return <div class="agent-line system" key={`${event.ts}-${index}`}><span class="line-prefix"><CircleCheck size={13} /></span><span>{eventText(event)}</span></div>
  if (event.type === 'status') return <div class="agent-line system" key={`${event.ts}-${index}`}><span class="line-prefix"><Dot size={14} /></span><span>{eventText(event)}</span></div>
  return null
}

function mergeHistory(current, next) {
  const merged = [...current]
  for (const event of next) {
    const duplicate = merged.some((item) => item.ts === event.ts && item.type === event.type && item.text === event.text && item.message === event.message)
    if (!duplicate) merged.push(event)
  }
  return merged.sort((left, right) => (left.ts || 0) - (right.ts || 0))
}

export function AgentPanel() {
  const [agents, setAgents] = useState([])
  const [eventsBySession, setEventsBySession] = useState({})
  const [sessionsByAgent, setSessionsByAgent] = useState({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const logRef = useRef(null)
  const sessionAgentsRef = useRef(new Map())
  const selectedSessionRef = useRef('')
  const completedSessionsRef = useRef(new Set())

  const selectedAgent = agents.find((agent) => agent.id === activeAgent.value) || null
  const selectedSession = selectedAgent ? sessionsByAgent[selectedAgent.id] : null
  const selectedSessionId = selectedSession?.sessionId || ''
  const selectedEvents = selectedSessionId ? (eventsBySession[selectedSessionId] || []) : []
  const selectedRunning = selectedSession?.status === 'running'

  useEffect(() => { selectedSessionRef.current = selectedSessionId }, [selectedSessionId])

  function setAgentSession(agentId, session) {
    if (!agentId || !session?.sessionId) return
    sessionAgentsRef.current.set(session.sessionId, agentId)
    setSessionsByAgent((current) => ({ ...current, [agentId]: { ...current[agentId], ...session } }))
  }

  async function loadAgents() {
    setRefreshing(true)
    try {
      const [list, sessions] = await Promise.all([
        ws.request('agent', 'agents'),
        ws.request('agent', 'sessions').catch(() => [])
      ])
      setAgents(list)
      const nextSessions = {}
      await Promise.all(sessions.map(async (session) => {
        sessionAgentsRef.current.set(session.sessionId, session.agent)
        nextSessions[session.agent] = session
        const history = await ws.request('agent', 'history', { sessionId: session.sessionId }).catch(() => [])
        setEventsBySession((current) => ({ ...current, [session.sessionId]: mergeHistory(current[session.sessionId] || [], history) }))
      }))
      setSessionsByAgent(nextSessions)
      const current = list.find((agent) => agent.id === activeAgent.value && agent.available)
      const firstAvailable = list.find((agent) => agent.available)
      if (!current) activeAgent.value = firstAvailable?.id || ''
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadAgents()
    const unsubscribe = ws.on('agent', 'session', (event) => {
      if (cancelled || !event.sessionId) return
      if (event.agent) sessionAgentsRef.current.set(event.sessionId, event.agent)
      setEventsBySession((current) => ({ ...current, [event.sessionId]: mergeHistory(current[event.sessionId] || [], [event]) }))
      if (event.type === 'done') completedSessionsRef.current.add(event.sessionId)
      const agentId = sessionAgentsRef.current.get(event.sessionId)
      if (agentId) {
        setSessionsByAgent((current) => ({
          ...current,
          [agentId]: { ...(current[agentId] || {}), sessionId: event.sessionId, status: event.type === 'done' ? 'stopped' : 'running', agent: agentId }
        }))
      }
      if (event.sessionId === selectedSessionRef.current) setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 0)
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  function selectAgent(agent) {
    if (!agent.available) return
    activeAgent.value = agent.id
    setError('')
  }

  async function start() {
    const agentId = activeAgent.value
    const text = input.trim()
    if (!agentId || !text || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await ws.request('agent', 'start', { agent: agentId, prompt: text })
      const status = completedSessionsRef.current.has(response.sessionId) ? 'stopped' : 'running'
      setAgentSession(agentId, { sessionId: response.sessionId, agent: agentId, status, startedAt: Date.now() })
      setInput('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    const text = input.trim()
    if (!selectedSessionId || !text || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await ws.request('agent', 'send', { sessionId: selectedSessionId, text })
      if (response?.sessionId) {
        const status = completedSessionsRef.current.has(response.sessionId) ? 'stopped' : 'running'
        setAgentSession(activeAgent.value, { sessionId: response.sessionId, agent: activeAgent.value, status, startedAt: Date.now() })
      }
      setInput('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!selectedSessionId || busy) return
    setBusy(true)
    await ws.request('agent', 'stop', { sessionId: selectedSessionId }).catch((requestError) => setError(requestError.message))
    setSessionsByAgent((current) => ({ ...current, [activeAgent.value]: { ...current[activeAgent.value], status: 'stopped' } }))
    setBusy(false)
  }

  function submit(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (selectedRunning) send()
      else start()
    }
  }

  return (
    <div class="agent-panel">
      <div class="agent-picker">
        <div class="agent-picker-heading"><span>{t('agent.list')}</span><button class="tw-icon-button" type="button" onClick={loadAgents} disabled={refreshing} title={t('agent.refresh')} aria-label={t('agent.refresh')}><RefreshCw size={13} class={refreshing ? 'spin' : ''} /></button></div>
        <div class="agent-picker-list" role="listbox" aria-label={t('agent.list')}>
          {agents.map((agent) => {
            const session = sessionsByAgent[agent.id]
            const active = activeAgent.value === agent.id
            return <button key={agent.id} class={`agent-picker-item ${active ? 'active' : ''} ${agent.available ? '' : 'unavailable'}`} type="button" role="option" aria-selected={active} disabled={!agent.available} onClick={() => selectAgent(agent)} title={agent.available ? `${agent.label} (${agent.cli})` : `${agent.label}: ${t('agent.missing')}`}>
              <span class="agent-picker-logo"><AgentLogo agent={agent} size={20} /></span>
              <span class="agent-picker-copy"><strong>{agent.label}</strong><small>{agent.cli}</small></span>
              <span class={`agent-state-dot ${agent.available ? 'ready' : ''} ${session?.status === 'running' ? 'running' : ''}`} aria-label={agent.available ? t('agent.ready') : t('agent.missing')} />
            </button>
          })}
          {!agents.length && <span class="agent-picker-empty">{error || t('agent.none')}</span>}
        </div>
      </div>
      <div class="agent-terminal-header">
        <span class="terminal-badge"><TerminalIcon size={13} /> AGENT TERMINAL</span>
        {selectedAgent && <span class="agent-terminal-provider"><AgentLogo agent={selectedAgent} size={17} /><strong>{selectedAgent.label}</strong><code>{selectedAgent.cli}</code></span>}
        <span class="agent-header-spacer" />
        <button class="btn-accent tw-toolbar-button" type="button" onClick={start} disabled={busy || !selectedAgent || !input.trim()}><Play size={13} /> {t('agent.run')}</button>
        <button class="tw-toolbar-button" type="button" onClick={stop} disabled={!selectedRunning || busy}><CircleStop size={13} /> {t('agent.stop')}</button>
      </div>
      <div class="agent-console" ref={logRef}>
        {!selectedAgent && !agents.length && <div class="agent-line system"><span class="line-prefix">#</span><span>{t('agent.none')}</span></div>}
        {selectedAgent && !selectedEvents.length && <div class="agent-line system"><span class="line-prefix">$</span><span>{selectedAgent.cli}</span></div>}
        {selectedEvents.map(renderEvent)}
        {error && <div class="error-text agent-error">{error}</div>}
      </div>
      <div class="agent-command-line">
        <span class="command-prompt">&gt;</span>
        <textarea value={input} onInput={(event) => setInput(event.currentTarget.value)} onKeyDown={submit} placeholder={t('agent.input')} aria-label={t('agent.input')} />
        <button class="btn-accent command-run tw-icon-button" type="button" onClick={selectedRunning ? send : start} disabled={busy || !selectedAgent || !input.trim()} title={t('agent.send')} aria-label={t('agent.send')}><Send size={14} /></button>
      </div>
    </div>
  )
}
