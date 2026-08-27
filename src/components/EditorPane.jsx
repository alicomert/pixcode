import { useEffect, useRef, useState } from 'preact/hooks'
import { Bot, FolderOpen, FolderPlus, GitFork, Plus, Save, Terminal as TerminalIcon, X } from '../lib/icons.jsx'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, completionKeymap, autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { unifiedMergeView } from '@codemirror/merge'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { activeFile, closeFile, openFiles, theme, workspace } from '../state/app.js'

function WelcomeView() {
  function dispatch(name) { window.dispatchEvent(new Event(name)) }
  return <div class="welcome-view">
    <div class="welcome-hero"><img src="/logo.png" alt="Pixcode" /><div><h1>Pixcode</h1><p>{t('welcome.subtitle')}</p></div></div>
    <div class="welcome-columns">
      <section class="welcome-column"><h2>{t('welcome.start')}</h2><button type="button" onClick={() => dispatch('pixcode:create-file')}><Plus size={15} /> {t('welcome.newFile')}</button><button type="button" onClick={() => dispatch('pixcode:open-folder')}><FolderOpen size={15} /> {t('welcome.openFolder')}</button><button type="button" onClick={() => dispatch('pixcode:clone-repo')}><GitFork size={15} /> {t('welcome.cloneRepo')}</button><button type="button" onClick={() => dispatch('pixcode:new-project')}><FolderPlus size={15} /> {t('welcome.newProject')}</button></section>
      <section class="welcome-column welcome-cards"><h2>{t('welcome.tools')}</h2><button type="button" onClick={() => dispatch('pixcode:open-agent')}><Bot size={15} /><span><strong>{t('welcome.agentTitle')}</strong><small>{t('welcome.agentDescription')}</small></span></button><button type="button" onClick={() => dispatch('pixcode:open-terminal')}><TerminalIcon size={15} /><span><strong>{t('welcome.terminalTitle')}</strong><small>{t('welcome.terminalDescription')}</small></span></button></section>
    </div>
    <p class="welcome-hint">{t('welcome.hint')}</p>
  </div>
}

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

const languageLoaders = [
  { test: /\.(jsx?|tsx?|mjs|cjs)$/, load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript()) },
  { test: /\.json$/, load: () => import('@codemirror/lang-json').then(({ json }) => json()) },
  { test: /\.html?$/, load: () => import('@codemirror/lang-html').then(({ html }) => html()) },
  { test: /\.css$/, load: () => import('@codemirror/lang-css').then(({ css }) => css()) },
  { test: /\.(md|markdown)$/, load: () => import('@codemirror/lang-markdown').then(({ markdown }) => markdown()) },
  { test: /\.py$/, load: () => import('@codemirror/lang-python').then(({ python }) => python()) }
]

async function languageFor(filePath) {
  const loader = languageLoaders.find((candidate) => candidate.test.test(filePath))
  return loader ? loader.load() : []
}

function baseExtensions(onSave, onDirty) {
  return [
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
  const diskRef = useRef('')
  const baselineRef = useRef('')
  const viewVersion = useRef(0)
  const [showDiff, setShowDiff] = useState(false)
  const [diffBusy, setDiffBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function createView(content, original, diff, resetDirty = true) {
    if (!host.current) return
    const version = ++viewVersion.current
    const language = await languageFor(path)
    if (!host.current || version !== viewVersion.current) return
    viewRef.current?.destroy()
    const extensions = baseExtensions(save, onDirty)
    extensions.push(themeCompartment.of(editorTheme()))
    if (language.length) extensions.push(language)
    if (diff) extensions.push(unifiedMergeView({ original }))
    const state = EditorState.create({ doc: content, extensions })
    viewRef.current = new EditorView({ parent: host.current, state })
    currentRef.current = content
    if (resetDirty) onDirty(false)
  }

  async function save() {
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    try {
      const requestWorkspace = workspace.value?.path || ''
      await ws.request('fs', 'write', { path, content, workspace: requestWorkspace })
      currentRef.current = content
      diskRef.current = content
      onDirty(false)
      window.dispatchEvent(new Event('pixcode:workspace-data-change'))
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
    const requestWorkspace = workspace.value?.path || ''
    ws.request('fs', 'read', { path, workspace: requestWorkspace }).then(async ({ content }) => {
      if (cancelled) return
      diskRef.current = content
      baselineRef.current = content
      currentRef.current = content
      await createView(content, content, false)
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || t('editor.error'))
    })
    return () => {
      cancelled = true
      viewVersion.current += 1
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [path])

  useEffect(() => {
    if (viewRef.current) viewRef.current.dispatch({ effects: themeCompartment.reconfigure(editorTheme()) })
  }, [theme.value])

  async function toggleDiff() {
    const next = !showDiff
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    currentRef.current = content
    if (!next) {
      setShowDiff(false)
      await createView(content, diskRef.current, false, false)
      return
    }
    setDiffBusy(true)
    setError('')
    try {
      try {
        let baselineOptions = { path }
        const status = await ws.request('git', 'status', { workspace: workspace.value?.path || '' })
        const file = status?.files?.find((entry) => entry.path === path)
        if (file && !file.untracked && file.x !== ' ' && file.y !== ' ') baselineOptions = { path, head: true }
        else if (file && !file.untracked && file.x !== ' ') baselineOptions = { path, staged: true }
        const result = await ws.request('git', 'baseline', { ...baselineOptions, workspace: workspace.value?.path || '' })
        baselineRef.current = result?.content ?? ''
      } catch (requestError) {
        // A non-Git workspace still gets a useful local diff against the
        // content that was read from disk. Git-backed workspaces use the index
        // baseline returned above, including an empty baseline for new files.
        baselineRef.current = diskRef.current
        const message = requestError.message || ''
        if (!/not a git repository|not a git repo|invalid object name|does not exist in/i.test(message)) setError(message || t('editor.diffError'))
      }
      const latestContent = viewRef.current?.state.doc.toString() ?? currentRef.current
      currentRef.current = latestContent
      setShowDiff(true)
      await createView(latestContent, baselineRef.current, true, false)
    } finally {
      setDiffBusy(false)
    }
  }

  return (
    <div class="editor">
      <div class="editor-toolbar">
        <button class="tw-toolbar-button" type="button" onClick={save}><Save size={13} /> {t('editor.save')}</button>
        <button class="tw-toolbar-button" type="button" onClick={toggleDiff} disabled={diffBusy}>{diffBusy ? t('editor.diff.loading') : t(showDiff ? 'editor.diff.hide' : 'editor.diff.show')}</button>
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
  const workspaceKey = workspace.value?.id || workspace.value?.path || 'default'
  useEffect(() => { setDirtyFiles({}) }, [workspaceKey])
  if (!files.length || !active) return <WelcomeView />
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
      <Editor key={workspaceKey + ':' + active} path={active} onDirty={(value) => setDirty(active, value)} />
    </>
  )
}
