import { useEffect, useRef, useState } from 'preact/hooks'
import { Plus, Terminal as TerminalIcon, X } from '../lib/icons.jsx'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { theme, workspace } from '../state/app.js'
import { terminalFont, terminalTheme } from '../lib/terminal-theme.js'
import { watchTerminalResize } from '../lib/terminal-resize.js'

function TerminalView({ id }) {
  const host = useRef(null)
  const terminalRef = useRef(null)

  useEffect(() => {
    if (!host.current) return undefined
    const terminal = new Terminal({
      fontFamily: terminalFont,
      fontSize: 13.5,
      lineHeight: 1.25,
      fontWeight: 450,
      cursorBlink: true,
      disableStdin: false,
      scrollOnUserInput: true,
      theme: terminalTheme(theme.value)
    })
    terminalRef.current = terminal
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    terminal.focus()
    const focusTerminal = () => terminal.focus()
    host.current.addEventListener('pointerdown', focusTerminal)
    host.current.addEventListener('click', focusTerminal)
    const stopResizeWatcher = watchTerminalResize(host.current, fit, terminal, (cols, rows) => {
      ws.request('pty', 'resize', { id, cols, rows }).catch(() => {})
    })
    let hydrated = false
    let lastSeq = 0
    const pending = []
    const dataUnsubscribe = ws.on('pty', 'data', (event) => {
      if (event.id !== id) return
      if (event.seq && event.seq <= lastSeq) return
      if (!hydrated) {
        pending.push(event)
        return
      }
      terminal.write(event.data || '')
      lastSeq = Math.max(lastSeq, event.seq || lastSeq)
    })
    const exitUnsubscribe = ws.on('pty', 'exit', (event) => { if (event.id === id) terminal.write(`\r\n[process exited: ${event.exitCode}]\r\n`) })
    const inputDisposable = terminal.onData((data) => ws.request('pty', 'input', { id, data }).catch(() => {}))
    async function hydrate() {
      try {
        const history = await ws.request('pty', 'history', { id })
        if (Array.isArray(history)) {
          for (const event of history) {
            if (event.seq && event.seq <= lastSeq) continue
            terminal.write(event.data || '')
            lastSeq = Math.max(lastSeq, event.seq || lastSeq)
          }
        }
      } catch (error) {
        if (!hydrated) terminal.write(`\r\n[terminal history unavailable: ${error.message}]\r\n`)
      } finally {
        hydrated = true
        for (const event of pending.splice(0).sort((left, right) => (left.seq || 0) - (right.seq || 0))) {
          if (event.seq && event.seq <= lastSeq) continue
          terminal.write(event.data || '')
          lastSeq = Math.max(lastSeq, event.seq || lastSeq)
        }
      }
    }
    const reconnect = () => { hydrated = false; pending.length = 0; hydrate() }
    window.addEventListener('pixcode:ws-open', reconnect)
    hydrate()
    return () => {
      stopResizeWatcher()
      host.current?.removeEventListener('pointerdown', focusTerminal)
      host.current?.removeEventListener('click', focusTerminal)
      dataUnsubscribe()
      exitUnsubscribe()
      inputDisposable.dispose()
      window.removeEventListener('pixcode:ws-open', reconnect)
      terminal.dispose()
      terminalRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(theme.value)
  }, [theme.value])

  return <div class="terminal-host" ref={host} />
}

// Keep normal shell ids grouped by workspace. Unmounting the panel must not
// kill a process; the backend owns process lifetime for the websocket.
const terminalStores = new Map()

function workspaceKey() {
  return String(workspace.value?.id || workspace.value?.path || 'default')
}

function storeFor(key) {
  if (!terminalStores.has(key)) terminalStores.set(key, { tabs: [], active: '', creating: false })
  return terminalStores.get(key)
}

export function Terminals() {
  const initialKey = workspaceKey()
  const initialStore = storeFor(initialKey)
  const [storeKey, setStoreKey] = useState(initialKey)
  const [tabs, setTabs] = useState(initialStore.tabs)
  const [active, setActive] = useState(initialStore.active)
  const [error, setError] = useState('')
  const tabsRef = useRef(initialStore.tabs)
  const activeRef = useRef(initialStore.active)
  const mountedRef = useRef(true)


  async function newTab() {
    const store = storeFor(storeKey)
    if (store.creating) return
    store.creating = true
    try {
      const { id } = await ws.request('pty', 'create', { cols: 80, rows: 24, workspace: workspace.value?.path || '' })
      store.tabs = [...store.tabs, id]
      store.active = id
      if (!mountedRef.current || storeKey !== workspaceKey()) return
      tabsRef.current = store.tabs
      activeRef.current = id
      setTabs(store.tabs)
      setActive(id)
      setError('')
    } catch (requestError) { setError(requestError.message) }
    finally { store.creating = false }
  }

  useEffect(() => {
    mountedRef.current = true
    const store = storeFor(storeKey)
    tabsRef.current = store.tabs
    activeRef.current = store.active
    setTabs(store.tabs)
    setActive(store.active)
    if (!store.tabs.length) newTab()
    const reconcile = async () => {
      if (workspaceKey() !== storeKey) return
      try {
        const live = await ws.request('pty', 'list', { workspace: workspace.value?.path || '' })
        const liveIds = new Set((live || []).map((item) => item.id))
        // Rehydrate terminals created before a page refresh. The backend keeps
        // PTYs alive by client identity, so an empty in-memory tab store must
        // adopt the live ids instead of creating duplicate shells.
        const existing = store.tabs.filter((id) => liveIds.has(id))
        const known = new Set(existing)
        store.tabs = [...existing, ...[...liveIds].filter((id) => !known.has(id))]
        if (!store.tabs.includes(store.active)) store.active = store.tabs.at(-1) || ''
        tabsRef.current = store.tabs
        activeRef.current = store.active
        setTabs(store.tabs)
        setActive(store.active)
        if (!store.tabs.length) newTab()
      } catch {
        // Older servers do not expose pty.list; the create fallback remains.
      }
    }
    reconcile()
    const exitUnsubscribe = ws.on('pty', 'exit', (event) => {
      const currentStore = storeFor(storeKey)
      if (!currentStore.tabs.includes(event.id)) return
      currentStore.tabs = currentStore.tabs.filter((id) => id !== event.id)
      if (currentStore.active === event.id) currentStore.active = currentStore.tabs.at(-1) || ''
      if (currentStore === storeFor(workspaceKey())) {
        tabsRef.current = currentStore.tabs
        activeRef.current = currentStore.active
        setTabs(currentStore.tabs)
        setActive(currentStore.active)
      }
    })
    const workspaceChange = () => {
      const nextKey = workspaceKey()
      if (nextKey === storeKey) return
      const nextStore = storeFor(nextKey)
      setStoreKey(nextKey)
      tabsRef.current = nextStore.tabs
      activeRef.current = nextStore.active
      setTabs(nextStore.tabs)
      setActive(nextStore.active)
      setError('')
      // The effect for the new key creates the first terminal after render.
    }
    window.addEventListener('pixcode:workspace-change', workspaceChange)
    const reconnect = () => {
      // PTY ids remain server-owned across a transient socket reconnect. The
      // current terminal view will hydrate again and resume receiving events.
      if (activeRef.current) setActive(activeRef.current)
      reconcile()
    }
    window.addEventListener('pixcode:ws-open', reconnect)
    return () => {
      mountedRef.current = false
      window.removeEventListener('pixcode:workspace-change', workspaceChange)
      exitUnsubscribe()
      window.removeEventListener('pixcode:ws-open', reconnect)
    }
  }, [storeKey])

  async function closeTab(event, id) {
    event.stopPropagation()
    await ws.request('pty', 'kill', { id }).catch(() => {})
    const store = storeFor(storeKey)
    const next = store.tabs.filter((item) => item !== id)
    store.tabs = next
    if (store.active === id) store.active = next.at(-1) || ''
    tabsRef.current = next
    activeRef.current = store.active
    setTabs(next)
    setActive(store.active)
  }

  return (
    <div style="display:flex; flex:1; min-height:0; flex-direction:column">
      <div class="terminal-tabs">
        {tabs.map((id, index) => (
          <button class={`terminal-tab ${id === active ? 'active' : ''}`} type="button" onClick={() => { const store = storeFor(storeKey); store.active = id; activeRef.current = id; setActive(id) }}>
            <span><TerminalIcon size={13} /> sh {index + 1}</span>
            <span class="muted" title={t('terminal.close')} onClick={(event) => closeTab(event, id)}><X size={13} /></span>
          </button>
        ))}
        <button class="tw-icon-button" type="button" onClick={newTab} title={t('terminal.new')} aria-label={t('terminal.new')}><Plus size={14} /></button>
      </div>
      {error && <div class="error-text" style="padding:8px">{error}</div>}
      {active && <TerminalView key={active} id={active} />}
      {!active && !error && <div class="tree muted">{t('terminal.new')}</div>}
    </div>
  )
}
