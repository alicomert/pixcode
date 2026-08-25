import { useEffect, useRef, useState } from 'preact/hooks'
import { Save, X } from 'lucide-preact'
import { Compartment, EditorState } from '@codemirror/state'
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
import { activeFile, closeFile, openFiles, theme } from '../state/app.js'

const themeCompartment = new Compartment()
const lightEditorTheme = EditorView.theme({
  '&': { color: '#263241', backgroundColor: '#ffffff' },
  '.cm-content': { caretColor: '#111827' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#111827' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#c6ddf7' },
  '.cm-gutters': { backgroundColor: '#f5f7fa', color: '#7b8794', border: 'none' },
  '.cm-activeLine': { backgroundColor: '#f6f8fb' },
  '.cm-activeLineGutter': { backgroundColor: '#eef2f7' }
})

function editorTheme() {
  return theme.value === 'light' ? lightEditorTheme : oneDark
}

function languageFor(filePath) {
  if (/\.(jsx?|tsx?|mjs|cjs)$/.test(filePath)) return javascript()
  if (filePath.endsWith('.json')) return json()
  if (filePath.endsWith('.html')) return html()
  if (filePath.endsWith('.css')) return css()
  if (/\.(md|markdown)$/.test(filePath)) return markdown()
  if (filePath.endsWith('.py')) return python()
  return []
}

function baseExtensions(filePath, onSave, onDirty) {
  return [
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    languageFor(filePath),
    EditorView.updateListener.of((update) => { if (update.docChanged) onDirty(true) }),
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

function Editor({ path, onDirty }) {
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
    const extensions = baseExtensions(path, save, onDirty)
    extensions.push(themeCompartment.of(editorTheme()))
    if (diff) extensions.push(unifiedMergeView({ original }))
    const state = EditorState.create({ doc: content, extensions })
    viewRef.current = new EditorView({ parent: host.current, state })
    currentRef.current = content
    onDirty(false)
  }

  async function save() {
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    try {
      await ws.request('fs', 'write', { path, content })
      currentRef.current = content
      originalRef.current = content
      onDirty(false)
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

  useEffect(() => {
    if (viewRef.current) viewRef.current.dispatch({ effects: themeCompartment.reconfigure(editorTheme()) })
  }, [theme.value])

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
        <button class="tw-toolbar-button" type="button" onClick={save}><Save size={13} /> {t('editor.save')}</button>
        <button class="tw-toolbar-button" type="button" onClick={toggleDiff}>{t(showDiff ? 'editor.diff.hide' : 'editor.diff.show')}</button>
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
  const [dirtyFiles, setDirtyFiles] = useState({})
  if (!files.length || !active) return <div class="loading-screen muted">{t('editor.untitled')}</div>
  function setDirty(path, dirty) {
    setDirtyFiles((current) => ({ ...current, [path]: dirty }))
  }
  function close(path) {
    if (dirtyFiles[path] && !window.confirm(t('editor.closeDirty'))) return
    closeFile(path)
    setDirtyFiles((current) => { const next = { ...current }; delete next[path]; return next })
  }
  return (
    <>
      <div class="editor-tabs">
        {files.map((filePath) => (
          <button key={filePath} class={`editor-tab ${filePath === active ? 'active' : ''}`} type="button" onClick={() => (activeFile.value = filePath)} title={filePath}>
            <span class="editor-tab-name">{dirtyFiles[filePath] && <span class="dirty-dot" aria-label="modified">●</span>}{filePath.split('/').at(-1)}</span>
            <span class="close" onClick={(event) => { event.stopPropagation(); close(filePath) }}><X size={13} /></span>
          </button>
        ))}
      </div>
      <div class="editor-breadcrumb"><span>{active.split('/').slice(0, -1).join(' / ') || t('project.label')}</span><strong>{active.split('/').at(-1)}</strong></div>
      <Editor key={active} path={active} onDirty={(value) => setDirty(active, value)} />
    </>
  )
}
