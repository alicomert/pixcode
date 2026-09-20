import { useEffect, useRef, useState } from 'preact/hooks'
import { Bot, ChevronLeft, ChevronRight, FolderOpen, FolderPlus, GitFork, Globe, Plus, Terminal as TerminalIcon, X } from '../lib/icons.jsx'
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
import { useEscape } from '../lib/useEscape.js'
import { activeFile, closeFile, isAdmin, openFiles, openPreview, PREVIEW_TAB, theme, workspace } from '../state/app.js'
import { PreviewPane } from './PreviewPane.jsx'

function WelcomeView() {
  function dispatch(name) { window.dispatchEvent(new Event(name)) }
  return <div class="welcome-view">
    <div class="welcome-hero"><img src="/logo.png" alt="Pixcode" /><div><h1>Pixcode</h1><p>{t('welcome.subtitle')}</p></div></div>
    <div class="welcome-columns">
      <section class="welcome-column"><h2>{t('welcome.start')}</h2>{!isAdmin.value && <button type="button" onClick={() => dispatch('pixcode:open-folder')}><FolderOpen size={15} /> {t('project.openExisting')}</button>}<button type="button" onClick={() => dispatch('pixcode:create-file')}><Plus size={15} /> {t('welcome.newFile')}</button>{isAdmin.value && <><button type="button" onClick={() => dispatch('pixcode:open-folder')}><FolderOpen size={15} /> {t('welcome.openFolder')}</button><button type="button" onClick={() => dispatch('pixcode:clone-repo')}><GitFork size={15} /> {t('welcome.cloneRepo')}</button><button type="button" onClick={() => dispatch('pixcode:new-project')}><FolderPlus size={15} /> {t('welcome.newProject')}</button></>}</section>
      <section class="welcome-column welcome-cards"><h2>{t('welcome.tools')}</h2><button type="button" onClick={() => dispatch('pixcode:open-agent')}><Bot size={15} /><span><strong>{t('welcome.agentTitle')}</strong><small>{t('welcome.agentDescription')}</small></span></button><button type="button" onClick={() => dispatch('pixcode:open-terminal')}><TerminalIcon size={15} /><span><strong>{t('welcome.terminalTitle')}</strong><small>{t('welcome.terminalDescription')}</small></span></button><button type="button" onClick={openPreview}><Globe size={15} /><span><strong>{t('preview.title')}</strong><small>{t('welcome.previewDescription')}</small></span></button></section>
    </div>
    <p class="welcome-hint">{t('welcome.hint')}</p>
  </div>
}

const themeCompartment = new Compartment()
const lightEditorTheme = EditorView.theme({
  '&': { color: '#3b3b3b', backgroundColor: '#ffffff' },
  '.cm-content': { caretColor: '#3b3b3b' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3b3b3b' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#d6ccff' },
  '.cm-gutters': { backgroundColor: '#ffffff', color: '#6e7681', border: 'none' },
  '.cm-activeLine': { backgroundColor: '#f0f1f7' },
  '.cm-activeLineGutter': { backgroundColor: '#f0f1f7', color: '#171184' }
})

const darkEditorSurface = EditorView.theme({
  '&': { backgroundColor: '#0e1219' },
  '.cm-gutters': { backgroundColor: '#0e1219', color: '#5f6879', border: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#5c3ffc4d' },
  '.cm-activeLine': { backgroundColor: '#1e242f66' }
})

function editorTheme() {
  return theme.value === 'light' ? lightEditorTheme : [oneDark, darkEditorSurface]
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
  const dirtyRef = useRef(false)
  const viewVersion = useRef(0)
  const [showDiff, setShowDiff] = useState(false)
  const [diffBusy, setDiffBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [conflicted, setConflicted] = useState(false)

  // Mirror of the parent's dirty flag for use inside async WS callbacks —
  // the tab-strip state lives in EditorPane.
  function markDirty(value) {
    dirtyRef.current = value
    onDirty(value)
  }

  async function createView(content, original, diff, resetDirty = true) {
    if (!host.current) return
    const version = ++viewVersion.current
    const language = await languageFor(path)
    if (!host.current || version !== viewVersion.current) return
    viewRef.current?.destroy()
    const extensions = baseExtensions(save, markDirty)
    extensions.push(themeCompartment.of(editorTheme()))
    if (language.length) extensions.push(language)
    if (diff) extensions.push(unifiedMergeView({ original }))
    const state = EditorState.create({ doc: content, extensions })
    viewRef.current = new EditorView({ parent: host.current, state })
    currentRef.current = content
    if (resetDirty) markDirty(false)
  }

  async function save() {
    const content = viewRef.current?.state.doc.toString() ?? currentRef.current
    try {
      const requestWorkspace = workspace.value?.path || ''
      await ws.request('fs', 'write', { path, content, workspace: requestWorkspace })
      currentRef.current = content
      diskRef.current = content
      markDirty(false)
      setConflicted(false)
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

  // External edits (another user, an agent CLI, another PC) reload clean
  // buffers in place; a dirty buffer is never clobbered — it gets a conflict
  // chip with an explicit reload instead.
  async function handleExternalChange() {
    try {
      const { content } = await ws.request('fs', 'read', { path, workspace: workspace.value?.path || '' })
      const current = viewRef.current?.state.doc.toString() ?? currentRef.current
      diskRef.current = content
      if (content === current) { setConflicted(false); return }
      if (dirtyRef.current) { setConflicted(true); return }
      setConflicted(false)
      await createView(content, showDiff ? baselineRef.current : content, showDiff, false)
    } catch {
      if (dirtyRef.current) setConflicted(true)
    }
  }

  async function reloadFromDisk() {
    setError('')
    try {
      const { content } = await ws.request('fs', 'read', { path, workspace: workspace.value?.path || '' })
      diskRef.current = content
      baselineRef.current = content
      setConflicted(false)
      setShowDiff(false)
      await createView(content, content, false)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => ws.on('fs', 'changed', (data) => {
    if (String(data?.workspace || '') !== (workspace.value?.path || '')) return
    if (!Array.isArray(data?.files) || !data.files.some((file) => file.path === path)) return
    void handleExternalChange()
  }), [path, showDiff])

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
        <vscode-button secondary icon="save" onClick={save}>{t('editor.save')}</vscode-button>
        <vscode-button secondary icon="diff" onClick={toggleDiff} disabled={diffBusy}>{diffBusy ? t('editor.diff.loading') : t(showDiff ? 'editor.diff.hide' : 'editor.diff.show')}</vscode-button>
        {status && <span class="muted">{status}</span>}
        {conflicted && <span class="editor-conflict"><span class="error-text">{t('editor.diskChanged')}</span><vscode-button secondary onClick={reloadFromDisk}>{t('editor.reload')}</vscode-button></span>}
        {error && <span class="error-text" role="alert">{error}</span>}
      </div>
      <div class="editor-host"><div class="cm-host" ref={host} /></div>
    </div>
  )
}

export function EditorPane() {
  const files = openFiles.value
  const active = activeFile.value
  const [dirtyFiles, setDirtyFiles] = useState({})
  const [menu, setMenu] = useState(null)
  useEscape(!!menu, () => setMenu(null))
  const tabsRef = useRef(null)
  const [scrollState, setScrollState] = useState({ overflow: false, left: false, right: false })
  const workspaceKey = workspace.value?.id || workspace.value?.path || 'default'
  useEffect(() => { setDirtyFiles({}) }, [workspaceKey])

  function updateScrollState() {
    const el = tabsRef.current
    if (!el) return
    setScrollState({
      overflow: el.scrollWidth > el.clientWidth + 2,
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    })
  }
  useEffect(() => {
    updateScrollState()
    const el = tabsRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    window.addEventListener('resize', updateScrollState)
    return () => { observer.disconnect(); window.removeEventListener('resize', updateScrollState) }
  }, [files.length])

  if (!files.length || !active) return <WelcomeView />

  function setDirty(path, dirty) {
    setDirtyFiles((current) => ({ ...current, [path]: dirty }))
  }
  function close(path) {
    if (dirtyFiles[path] && !window.confirm(t('editor.closeDirty'))) return
    closeFile(path)
    setDirtyFiles((current) => { const next = { ...current }; delete next[path]; return next })
  }
  function closeMany(paths) {
    if (paths.some((p) => dirtyFiles[p]) && !window.confirm(t('editor.closeDirty'))) return
    for (const p of paths) closeFile(p)
    setDirtyFiles((current) => { const next = { ...current }; for (const p of paths) delete next[p]; return next })
  }
  function menuAction(kind) {
    const index = files.indexOf(menu.path)
    if (kind === 'close') close(menu.path)
    else if (kind === 'others') closeMany(files.filter((p) => p !== menu.path))
    else if (kind === 'right') closeMany(files.slice(index + 1))
    else if (kind === 'all') closeMany([...files])
    else if (kind === 'copy') navigator.clipboard?.writeText(menu.path)
    setMenu(null)
  }
  function scrollTabs(direction) {
    tabsRef.current?.scrollBy({ left: direction * 240, behavior: 'smooth' })
  }

  const previewActive = active === PREVIEW_TAB
  return (
    <>
      <div class="editor-tabs-wrap">
        {scrollState.overflow && (
          <button type="button" class="editor-tabs-scroll" disabled={!scrollState.left} onClick={() => scrollTabs(-1)} aria-label={t('editor.scrollLeft')}><ChevronLeft size={14} /></button>
        )}
        <div class="editor-tabs" ref={tabsRef} onScroll={updateScrollState}>
          {files.map((filePath) => (
            <button
              key={filePath}
              class={`editor-tab ${filePath === active ? 'active' : ''}`}
              type="button"
              onClick={() => (activeFile.value = filePath)}
              onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); close(filePath) } }}
              onContextMenu={(event) => { event.preventDefault(); setMenu({ path: filePath, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 190) }) }}
              title={filePath === PREVIEW_TAB ? t('preview.title') : filePath}
            >
              <span class="editor-tab-name">{filePath === PREVIEW_TAB ? <Globe size={13} /> : (dirtyFiles[filePath] && <span class="dirty-dot" role="img" aria-label="modified">●</span>)}{filePath === PREVIEW_TAB ? t('preview.title') : filePath.split('/').at(-1)}</span>
              <span class="close" role="button" tabIndex={0} title={t('editor.closeTab')} aria-label={t('editor.closeTab')} onClick={(event) => { event.stopPropagation(); close(filePath) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); close(filePath) } }}><X size={13} /></span>
            </button>
          ))}
        </div>
        {scrollState.overflow && (
          <button type="button" class="editor-tabs-scroll" disabled={!scrollState.right} onClick={() => scrollTabs(1)} aria-label={t('editor.scrollRight')}><ChevronRight size={14} /></button>
        )}
        <button type="button" class="editor-preview-btn" onClick={openPreview} title={t('preview.open')} aria-label={t('preview.open')}><Globe size={14} /></button>
      </div>
      <div class="editor-breadcrumb"><span>{previewActive ? t('preview.title') : (active.split('/').slice(0, -1).join(' / ') || t('project.label'))}</span>{!previewActive && <strong>{active.split('/').at(-1)}</strong>}</div>
      {previewActive ? <PreviewPane /> : <Editor key={workspaceKey + ':' + active} path={active} onDirty={(value) => setDirty(active, value)} />}
      {menu && (
        <>
          <div class="tab-menu-overlay" onClick={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null) }} />
          <div class="tab-menu" role="menu" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
            <button type="button" role="menuitem" onClick={() => menuAction('close')}>{t('editor.closeTab')}</button>
            <button type="button" role="menuitem" onClick={() => menuAction('others')} disabled={files.length < 2}>{t('editor.closeOthers')}</button>
            <button type="button" role="menuitem" onClick={() => menuAction('right')} disabled={files.indexOf(menu.path) === files.length - 1}>{t('editor.closeToRight')}</button>
            <div class="tab-menu-sep" />
            <button type="button" role="menuitem" onClick={() => menuAction('all')}>{t('editor.closeAll')}</button>
            {menu.path !== PREVIEW_TAB && <button type="button" role="menuitem" onClick={() => menuAction('copy')}>{t('editor.copyPath')}</button>}
          </div>
        </>
      )}
    </>
  )
}
