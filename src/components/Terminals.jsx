import { useEffect, useRef, useState } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

function TerminalView({ id }) {
  const host = useRef(null)

  useEffect(() => {
    if (!host.current) return undefined
    const terminal = new Terminal({
      fontFamily: 'var(--mono)',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#15171c', foreground: '#edf1f7' }
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    const resize = () => {
      try {
        fit.fit()
        ws.request('pty', 'resize', { id, cols: terminal.cols, rows: terminal.rows })
      } catch {}
    }
    resize()
    const dataUnsubscribe = ws.on('pty', 'data', (event) => { if (event.id === id) terminal.write(event.data) })
    const exitUnsubscribe = ws.on('pty', 'exit', (event) => { if (event.id === id) terminal.write(`\r\n[process exited: ${event.exitCode}]\r\n`) })
    const inputDisposable = terminal.onData((data) => ws.request('pty', 'input', { id, data }))
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    return () => {
      observer.disconnect()
      dataUnsubscribe()
      exitUnsubscribe()
      inputDisposable.dispose()
      terminal.dispose()
    }
  }, [id])

  return <div class="terminal-host" ref={host} />
}

export function Terminals() {
  const [tabs, setTabs] = useState([])
  const [active, setActive] = useState('')
  const [error, setError] = useState('')

  async function newTab() {
    try {
      const { id } = await ws.request('pty', 'create', { cols: 80, rows: 24 })
      setTabs((current) => [...current, id])
      setActive(id)
      setError('')
    } catch (requestError) { setError(requestError.message) }
  }

  useEffect(() => { newTab() }, [])

  async function closeTab(event, id) {
    event.stopPropagation()
    await ws.request('pty', 'kill', { id }).catch(() => {})
    setTabs((current) => {
      const next = current.filter((item) => item !== id)
      if (active === id) setActive(next.at(-1) || '')
      return next
    })
  }

  return (
    <div style="display:flex; flex:1; min-height:0; flex-direction:column">
      <div class="terminal-tabs">
        {tabs.map((id, index) => (
          <button class={`terminal-tab ${id === active ? 'active' : ''}`} type="button" onClick={() => setActive(id)}>
            <span>sh {index + 1}</span>
            <span class="muted" title={t('terminal.close')} onClick={(event) => closeTab(event, id)}>×</span>
          </button>
        ))}
        <button type="button" onClick={newTab}>{t('terminal.new')}</button>
      </div>
      {error && <div class="error-text" style="padding:8px">{error}</div>}
      {active && <TerminalView key={active} id={active} />}
      {!active && !error && <div class="tree muted">{t('terminal.new')}</div>}
    </div>
  )
}
