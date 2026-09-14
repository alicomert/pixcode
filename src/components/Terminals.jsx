import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, ChevronDown, Plus, Terminal as TerminalIcon, X } from '../lib/icons.jsx'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { terminalFontSize, theme, workspace } from '../state/app.js'
import { terminalFont, terminalTheme } from '../lib/terminal-theme.js'
import { watchTerminalResize } from '../lib/terminal-resize.js'
import { attachTerminalTouchScroll } from '../lib/terminal-touch.js'
import { sanitizeReplay } from '../lib/terminal-replay.js'

function TerminalView({ id, onReady, modifiersRef }) {
  const host = useRef(null)
  const terminalRef = useRef(null)
  const fitRef = useRef(null)

  useEffect(() => {
    if (!host.current) return undefined
    const terminal = new Terminal({
      fontFamily: terminalFont,
      fontSize: terminalFontSize.value,
      lineHeight: 1.25,
      fontWeight: 450,
      cursorBlink: true,
      disableStdin: false,
      scrollOnUserInput: true,
      theme: terminalTheme(theme.value)
    })
    terminalRef.current = terminal
    onReady?.({
      focus: () => terminal.focus(),
      blur: () => terminal.blur(),
      input: (data) => terminal.input(data, true)
    })
    const fit = new FitAddon()
    fitRef.current = fit
    terminal.loadAddon(fit)
    terminal.open(host.current)
    const stopTouchScroll = attachTerminalTouchScroll(host.current)
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
    const inputDisposable = terminal.onData((data) => {
      let nextData = data
      if (modifiersRef?.current && data.length === 1 && /[a-z]/i.test(data)) {
        nextData = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64)
        modifiersRef.current = false
      }
      ws.request('pty', 'input', { id, data: nextData }).catch(() => {})
    })
    async function hydrate() {
      try {
        const history = await ws.request('pty', 'history', { id })
        if (Array.isArray(history)) {
          for (const event of history) {
            if (event.seq && event.seq <= lastSeq) continue
            // Replayed output must not re-answer terminal queries; stale
            // responses would land in the shell's input as literal text.
            terminal.write(sanitizeReplay(event.data))
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
    const keyboardLayout = (event) => {
      if (!event.detail?.open) return
      requestAnimationFrame(() => {
        try {
          fit.fit()
          terminal.scrollToBottom()
        } catch {
          // xterm may be between open/dispose while the pane is switching.
        }
      })
    }
    window.addEventListener('pixcode:keyboard', keyboardLayout)
    hydrate()
    return () => {
      stopResizeWatcher()
      stopTouchScroll()
      host.current?.removeEventListener('pointerdown', focusTerminal)
      host.current?.removeEventListener('click', focusTerminal)
      dataUnsubscribe()
      exitUnsubscribe()
      inputDisposable.dispose()
      window.removeEventListener('pixcode:ws-open', reconnect)
      window.removeEventListener('pixcode:keyboard', keyboardLayout)
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
      onReady?.(null)
    }
  }, [id, onReady])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = terminalTheme(theme.value)
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
          ws.request('pty', 'resize', { id, cols: terminalRef.current.cols, rows: terminalRef.current.rows }).catch(() => {})
        } catch { /* terminal is switching */ }
      })
    }
  }, [theme.value, id])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = terminalFontSize.value
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
          ws.request('pty', 'resize', { id, cols: terminalRef.current.cols, rows: terminalRef.current.rows }).catch(() => {})
        } catch { /* terminal is switching */ }
      })
    }
  }, [terminalFontSize.value, id])

  return <div class="terminal-host" ref={host} />
}

const functionKeys = [
  ['F1', '\u001bOP'], ['F2', '\u001bOQ'], ['F3', '\u001bOR'], ['F4', '\u001bOS'],
  ['F5', '\u001b[15~'], ['F6', '\u001b[17~'], ['F7', '\u001b[18~'], ['F8', '\u001b[19~'],
  ['F9', '\u001b[20~'], ['F10', '\u001b[21~'], ['F11', '\u001b[23~'], ['F12', '\u001b[24~']
]

let viewportConsumers = 0

export function TerminalAccessory({ actionsRef, modifiersRef, terminalId }) {
  const [expanded, setExpanded] = useState(false)
  const [ctrl, setCtrl] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    // Android can resize innerHeight together with the visual viewport when
    // the keyboard opens. Keep the pre-keyboard height so that both resize
    // modes produce the same keyboard inset.
    let layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight)
    let previousKeyboardOpen = false
    viewportConsumers += 1
    const updateViewport = () => {
      const currentLayoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight)
      const visualHeight = Math.round(viewport.height)
      const visualOffset = Math.round(viewport.offsetTop)
      const viewportGap = layoutHeight - (visualHeight + visualOffset)
      const keyboardHeight = Math.max(0, Math.round(viewportGap))
      const keyboardOpen = keyboardHeight > 100 && visualHeight < layoutHeight - 80
      // Refresh the baseline after the keyboard has closed (including after
      // rotation), but never while the viewport is in its reduced state.
      if (!keyboardOpen && currentLayoutHeight > layoutHeight) layoutHeight = currentLayoutHeight
      document.documentElement.style.setProperty('--pixcode-keyboard-height', `${keyboardHeight}px`)
      document.documentElement.style.setProperty('--pixcode-visual-height', `${visualHeight}px`)
      document.documentElement.style.setProperty('--pixcode-viewport-offset', `${visualOffset}px`)
      document.documentElement.classList.toggle('pixcode-keyboard-open', keyboardOpen)
      if (keyboardOpen !== previousKeyboardOpen) {
        previousKeyboardOpen = keyboardOpen
        window.dispatchEvent(new CustomEvent('pixcode:keyboard', { detail: { open: keyboardOpen } }))
      }
      setKeyboardOpen(keyboardOpen)
    }
    updateViewport()
    viewport.addEventListener('resize', updateViewport)
    viewport.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    const resetViewportBaseline = () => {
      layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight)
      updateViewport()
    }
    window.addEventListener('orientationchange', resetViewportBaseline)
    return () => {
      viewport.removeEventListener('resize', updateViewport)
      viewport.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', resetViewportBaseline)
      viewportConsumers -= 1
      if (viewportConsumers === 0) {
        document.documentElement.style.removeProperty('--pixcode-keyboard-height')
        document.documentElement.style.removeProperty('--pixcode-visual-height')
        document.documentElement.style.removeProperty('--pixcode-viewport-offset')
        document.documentElement.classList.remove('pixcode-keyboard-open')
      }
    }
  }, [])

  useEffect(() => {
    setCtrl(false)
    modifiersRef.current = false
  }, [terminalId, modifiersRef])

  function toggleCtrl() {
    const next = !ctrl
    setCtrl(next)
    modifiersRef.current = next
  }

  function send(data, refocus = !expanded) {
    const actions = actionsRef.current
    if (!actions) return
    actions.input(data)
    if (refocus) actions.focus()
  }

  function sendControl(letter) {
    send(String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64))
    setCtrl(false)
    modifiersRef.current = false
  }

  function toggleExpanded() {
    const next = !expanded
    setExpanded(next)
    if (next) actionsRef.current?.blur()
    else actionsRef.current?.focus()
  }

  return <>
    {expanded && <div class={`terminal-mobile-tray ${keyboardOpen ? 'keyboard-open' : ''}`} role="group" aria-label={t('terminal.extraKeys')}>
      <div class="terminal-mobile-tray-heading"><span>{t('terminal.extraKeys')}</span><button type="button" class="terminal-key terminal-key-close" aria-label={t('terminal.closeExtraKeys')} onClick={toggleExpanded}><X size={14} /></button></div>
      <div class="terminal-mobile-tray-grid">
        {functionKeys.map(([label, value]) => <button key={label} type="button" class="terminal-key terminal-key-function" onPointerDown={(event) => event.preventDefault()} onClick={() => send(value)}>{label}</button>)}
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[H')}>Home</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[F')}>End</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[5~')}>PgUp</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[6~')}>PgDn</button>
        <button type="button" class={`terminal-key ${ctrl ? 'active' : ''}`} aria-pressed={ctrl} onPointerDown={(event) => event.preventDefault()} onClick={toggleCtrl}>Ctrl</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b')}>Esc</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\t')}>Tab</button>
        <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[3~')}>Del</button>
      </div>
    </div>}
    <div class={`terminal-mobile-accessory ${keyboardOpen ? 'keyboard-open' : ''}`} role="toolbar" aria-label={t('terminal.keyboardToolbar')}>
      <button type="button" class={`terminal-key terminal-key-modifier ${ctrl ? 'active' : ''}`} aria-pressed={ctrl} onPointerDown={(event) => event.preventDefault()} onClick={toggleCtrl}>Ctrl</button>
      <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => sendControl('c')}>^C</button>
      <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => sendControl('x')}>^X</button>
      <button type="button" class="terminal-key" onPointerDown={(event) => event.preventDefault()} onClick={() => sendControl('v')}>^V</button>
      <button type="button" class="terminal-key terminal-key-icon" aria-label={t('terminal.arrowLeft')} onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[D')}><ArrowLeft size={16} /></button>
      <button type="button" class="terminal-key terminal-key-icon" aria-label={t('terminal.arrowDown')} onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[B')}><ArrowDownToLine size={16} /></button>
      <button type="button" class="terminal-key terminal-key-icon" aria-label={t('terminal.arrowUp')} onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[A')}><ArrowUpFromLine size={16} /></button>
      <button type="button" class="terminal-key terminal-key-icon" aria-label={t('terminal.arrowRight')} onPointerDown={(event) => event.preventDefault()} onClick={() => send('\u001b[C')}><ArrowRight size={16} /></button>
      <button type="button" class="terminal-key terminal-key-more" aria-expanded={expanded} aria-label={t('terminal.extraKeys')} onPointerDown={(event) => event.preventDefault()} onClick={toggleExpanded}><span>•••</span><ChevronDown size={13} /></button>
    </div>
  </>
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
  const terminalActionsRef = useRef(null)
  const terminalModifiersRef = useRef(false)
  const handleTerminalReady = useCallback((actions) => { terminalActionsRef.current = actions }, [])
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
      {active && <div class="terminal-mobile-stage"><TerminalView key={active} id={active} onReady={handleTerminalReady} modifiersRef={terminalModifiersRef} /><TerminalAccessory terminalId={active} actionsRef={terminalActionsRef} modifiersRef={terminalModifiersRef} /></div>}
      {!active && !error && <div class="tree muted">{t('terminal.new')}</div>}
    </div>
  )
}
