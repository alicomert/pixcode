import { useEffect, useRef, useState } from 'preact/hooks'
import { CircleAlert, CircleCheck, CircleStop, Dot, Hammer, Play, Send, Terminal as TerminalIcon } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent } from '../state/app.js'

function renderEvent(event, index) {
  if (event.type === 'message') return <div class={`agent-line ${event.role || 'assistant'}`} key={`${event.ts}-${index}`}><span class="line-prefix">{event.role === 'user' ? '>' : <Dot size={14} />}</span><span>{event.text}</span></div>
  if (event.type === 'tool') return <div class="agent-line tool" key={`${event.ts}-${index}`}><span class="line-prefix"><Hammer size={13} /></span><span>{event.tool?.name || 'tool'} {JSON.stringify(event.tool?.input || '').slice(0, 240)}</span></div>
  if (event.type === 'error') return <div class="agent-line error-text" key={`${event.ts}-${index}`}><span class="line-prefix"><CircleAlert size={13} /></span><span>{event.message}</span></div>
  if (event.type === 'done') return <div class="agent-line system" key={`${event.ts}-${index}`}><span class="line-prefix"><CircleCheck size={13} /></span><span>process exited ({event.exitCode ?? 0})</span></div>
  if (event.type === 'status') return <div class="agent-line system" key={`${event.ts}-${index}`}><span class="line-prefix"><Dot size={14} /></span><span>{event.status}</span></div>
  return null
}

export function AgentPanel() {
  const [agents, setAgents] = useState([])
  const [events, setEvents] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const logRef = useRef(null)
  const sessionRef = useRef('')
  const completedRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    ws.request('agent', 'agents').then((list) => { if (!cancelled) setAgents(list) }).catch((requestError) => { if (!cancelled) setError(requestError.message) })
    const unsubscribe = ws.on('agent', 'session', (event) => {
      if (sessionRef.current && event.sessionId !== sessionRef.current) return
      if (!sessionRef.current) sessionRef.current = event.sessionId
      setEvents((current) => [...current, event])
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 0)
      if (event.type === 'done') {
        completedRef.current.add(event.sessionId)
        if (sessionRef.current === event.sessionId) { sessionRef.current = ''; setSessionId('') }
        setBusy(false)
      }
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  async function start() {
    if (!activeAgent.value || !input.trim()) return
    setBusy(true)
    setError('')
    setEvents([])
    sessionRef.current = ''
    setSessionId('')
    try {
      const response = await ws.request('agent', 'start', { agent: activeAgent.value, prompt: input.trim() })
      if (completedRef.current.has(response.sessionId)) {
        completedRef.current.delete(response.sessionId)
      } else {
        sessionRef.current = response.sessionId
        setSessionId(response.sessionId)
      }
      setInput('')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function send() {
    if (!sessionId || !input.trim()) return
    setBusy(true)
    setError('')
    const text = input.trim()
    sessionRef.current = ''
    try {
      const response = await ws.request('agent', 'send', { sessionId, text })
      if (response?.sessionId) {
        if (completedRef.current.has(response.sessionId)) {
          completedRef.current.delete(response.sessionId)
        } else {
          sessionRef.current = response.sessionId
          setSessionId(response.sessionId)
        }
      }
      setInput('')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function stop() {
    if (!sessionId) return
    await ws.request('agent', 'stop', { sessionId }).catch((requestError) => setError(requestError.message))
  }

  function submit(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (sessionId) send()
      else start()
    }
  }

  return (
    <div style="display:flex; flex:1; min-height:0; flex-direction:column">
      <div class="agent-terminal-header">
        <span class="terminal-badge"><TerminalIcon size={13} /> AGENT TERMINAL</span>
        <select value={activeAgent.value} onChange={(event) => (activeAgent.value = event.currentTarget.value)}>
          <option value="">{t('agent.placeholder')}</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id} disabled={!agent.available}>{agent.label}{agent.available ? '' : ` (${t('agent.missing')})`}</option>)}
        </select>
        <button class="btn-accent tw-toolbar-button" type="button" onClick={start} disabled={busy || !activeAgent.value}><Play size={13} /> {t('agent.run')}</button>
        <button class="tw-toolbar-button" type="button" onClick={stop} disabled={!sessionId || busy}><CircleStop size={13} /> {t('agent.stop')}</button>
      </div>
      <div class="agent-console" ref={logRef}>
        {!agents.some((agent) => agent.available) && <div class="agent-line system"><span class="line-prefix">#</span><span>{t('agent.none')}</span></div>}
        {events.map(renderEvent)}
        {error && <div class="error-text">{error}</div>}
      </div>
      <div class="agent-command-line">
        <span class="command-prompt">&gt;</span>
        <textarea value={input} onInput={(event) => setInput(event.currentTarget.value)} onKeyDown={submit} placeholder={t('agent.input')} />
        <button class="btn-accent command-run tw-icon-button" type="button" onClick={sessionId ? send : start} disabled={busy || !input.trim()} title={t('agent.send')} aria-label={t('agent.send')}><Send size={14} /></button>
      </div>
    </div>
  )
}
