import { useEffect, useRef, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeAgent } from '../state/app.js'

function renderEvent(event, index) {
  if (event.type === 'message') return <div class={`message ${event.role || 'assistant'}`} key={`${event.ts}-${index}`}>{event.text}</div>
  if (event.type === 'tool') return <div class="message tool" key={`${event.ts}-${index}`}>{event.tool?.name || 'tool'} {JSON.stringify(event.tool?.input || '').slice(0, 240)}</div>
  if (event.type === 'error') return <div class="message error-text" key={`${event.ts}-${index}`}>{event.message}</div>
  if (event.type === 'done') return <div class="message system" key={`${event.ts}-${index}`}>done</div>
  if (event.type === 'status') return <div class="message system" key={`${event.ts}-${index}`}>{event.status}</div>
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

  useEffect(() => {
    let cancelled = false
    ws.request('agent', 'agents').then((list) => { if (!cancelled) setAgents(list) }).catch((requestError) => { if (!cancelled) setError(requestError.message) })
    const unsubscribe = ws.on('agent', 'session', (event) => {
      if (sessionRef.current && event.sessionId !== sessionRef.current) return
      setEvents((current) => [...current, event])
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 0)
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  async function start() {
    if (!activeAgent.value || !input.trim()) return
    setBusy(true)
    setError('')
    setEvents([])
    try {
      const response = await ws.request('agent', 'start', { agent: activeAgent.value, prompt: input.trim() })
      sessionRef.current = response.sessionId
      setSessionId(response.sessionId)
      setInput('')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function send() {
    if (!sessionId || !input.trim()) return
    setBusy(true)
    setError('')
    const text = input.trim()
    try {
      const response = await ws.request('agent', 'send', { sessionId, text })
      if (response?.sessionId) {
        sessionRef.current = response.sessionId
        setSessionId(response.sessionId)
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
      <div class="agent-toolbar">
        <select value={activeAgent.value} onChange={(event) => (activeAgent.value = event.currentTarget.value)}>
          <option value="">{t('agent.placeholder')}</option>
          {agents.map((agent) => <option value={agent.id} disabled={!agent.available}>{agent.label}{agent.available ? '' : ` (${t('agent.missing')})`}</option>)}
        </select>
        <button class="btn-accent" type="button" onClick={start} disabled={busy || !activeAgent.value}>{t('agent.new')}</button>
        <button type="button" onClick={stop} disabled={!sessionId || busy}>{t('agent.stop')}</button>
      </div>
      <div class="agent-log" ref={logRef}>
        {!agents.some((agent) => agent.available) && <div class="muted">{t('agent.none')}</div>}
        {events.map(renderEvent)}
        {error && <div class="error-text">{error}</div>}
      </div>
      <div class="agent-composer">
        <textarea value={input} onInput={(event) => setInput(event.currentTarget.value)} onKeyDown={submit} placeholder={t('agent.input')} />
        <button class="btn-accent" type="button" onClick={sessionId ? send : start} disabled={busy || !input.trim()}>{t('agent.send')}</button>
      </div>
    </div>
  )
}
