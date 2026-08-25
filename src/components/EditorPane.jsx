import { useEffect, useRef, useState } from 'preact/hooks'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, completionKeymap, autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { unifiedMergeView } from '@codemirror/merge'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeFile, closeFile, openFiles } from '../state/app.js'

function languageFor(filePath) {
  if (/\.(jsx?|tsx?|mjs|cjs)$/.test(filePath)) return javascript()
  if (filePath.endsWith('.json')) return json()
  if (filePath.endsWith('.html')) return html()
  if (filePath.endsWith('.css')) return css()
  if (/\.(md|markdown)$/.test(filePath)) return markdown()
  if (filePath.endsWith('.py')) return python()
  return []
}

function baseExtensions(filePath, onSave) {
  return [
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    languageFor(filePath),
    keymap.of([
      { key: 'Mod-s', run: () => { onSave(); return true } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap
    ])
  ]
}

function Editor({ path }) {
  const host = useRef(null)
  const viewRef = useRef(null)
  const currentRef = useRef('')
  const originalRef = useRef('')
  const [showDiff, setShowDiff] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function createView(content, original, diff) {
    if (!host.current) return
    viewRef.current?.destroy()
    const extensions = baseExtensions(path, save)
    if (diff) extensions.push(unifiedMergeView({ original }))
    const state = EditorState.create({ doc: content, extensions })
    viewRef.current = new EditorView({ parent: host.current, state })
    currentRef.current = content
  }

  async function save() {
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    try {
      await ws.request('fs', 'write', { path, content })
      currentRef.current = content
      originalRef.current = content
      setStatus(t('editor.saved'))
      setError('')
      window.setTimeout(() => setStatus(''), 1_500)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    let cancelled = false
    setError('')
    ws.request('fs', 'read', { path }).then(({ content }) => {
      if (cancelled) return
      originalRef.current = content
      currentRef.current = content
      createView(content, content, false)
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || t('editor.error'))
    })
    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [path])

  function toggleDiff() {
    const next = !showDiff
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    currentRef.current = content
    setShowDiff(next)
    createView(content, originalRef.current, next)
  }

  return (
    <div class="editor">
      <div class="editor-toolbar">
        <button type="button" onClick={save}>{t('editor.save')}</button>
        <button type="button" onClick={toggleDiff}>{t(showDiff ? 'editor.diff.hide' : 'editor.diff.show')}</button>
        {status && <span class="muted">{status}</span>}
        {error && <span class="error-text">{error}</span>}
      </div>
      <div class="editor-host"><div class="cm-host" ref={host} /></div>
    </div>
  )
}

export function EditorPane() {
  const files = openFiles.value
  const active = activeFile.value
  if (!files.length || !active) return <div class="loading-screen muted">{t('editor.untitled')}</div>
  return (
    <>
      <div class="editor-tabs">
        {files.map((filePath) => (
          <button class={`editor-tab ${filePath === active ? 'active' : ''}`} type="button" onClick={() => (activeFile.value = filePath)}>
            <span>{filePath.split('/').at(-1)}</span>
            <span class="close" onClick={(event) => { event.stopPropagation(); closeFile(filePath) }}>×</span>
          </button>
        ))}
      </div>
      <Editor key={active} path={active} />
    </>
  )
}
