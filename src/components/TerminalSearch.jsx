import { useEffect, useRef, useState } from 'preact/hooks'
import { ChevronDown, ChevronUp, X } from '../lib/icons.jsx'
import { t } from '../lib/i18n.js'

// Floating find-bar shared by the shell terminals and the agent terminal.
// `addon` is the xterm SearchAddon instance owned by the host view.
export function TerminalSearchBox({ addon, onClose }) {
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [count, setCount] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function find(direction) {
    if (!addon || !query) { setCount(''); return }
    try {
      const found = direction === 'prev' ? addon.findPrevious(query) : addon.findNext(query)
      setCount(found ? '' : '0')
    } catch { setCount('') }
  }

  function change(event) {
    const next = event.currentTarget.value
    setQuery(next)
    if (!addon) return
    // Search live as the user types — findNext from the current position
    // feels identical to VS Code's incremental find.
    try { setCount(next ? (addon.findNext(next) ? '' : '0') : '') } catch { setCount('') }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? 'prev' : 'next') }
    if (event.key === 'Escape') { event.preventDefault(); onClose?.() }
  }

  return <div class="terminal-search-bar" role="search">
    <input ref={inputRef} value={query} onInput={change} onKeyDown={onKeyDown} placeholder={t('terminal.searchPlaceholder')} aria-label={t('terminal.search')} />
    <span class="terminal-search-count">{count}</span>
    <button type="button" title={t('terminal.searchPrev')} aria-label={t('terminal.searchPrev')} onClick={() => find('prev')}><ChevronUp size={14} /></button>
    <button type="button" title={t('terminal.searchNext')} aria-label={t('terminal.searchNext')} onClick={() => find('next')}><ChevronDown size={14} /></button>
    <button type="button" title={t('terminal.searchClose')} aria-label={t('terminal.searchClose')} onClick={onClose}><X size={14} /></button>
  </div>
}
