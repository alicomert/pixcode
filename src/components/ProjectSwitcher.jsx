import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, ChevronRight, FolderOpen, FolderPlus, GitFork, Plus, RefreshCw, X } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { setWorkspace } from '../state/app.js'

const TABS_KEY = 'pixcode.workspace.tabs'
const ACTIVE_TAB_KEY = 'pixcode.workspace.activeTab'

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function recordKey(record) {
  return String(record?.id || record?.path || '')
}

function tabFromRecord(record, tabId = '') {
  return {
    tabId: tabId || ('workspace_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
    projectId: recordKey(record),
    name: record?.name || record?.path || t('project.label'),
    path: record?.path || '',
    external: !!record?.external
  }
}

function normalizeTabs(value) {
  const tabs = Array.isArray(value) ? value : []
  const used = new Set()
  return tabs.map((tab, index) => {
    let slot = Number(tab.slot)
    if (!Number.isInteger(slot) || slot < 1 || used.has(slot)) slot = index + 1
    while (used.has(slot)) slot += 1
    used.add(slot)
    return { ...tab, slot }
  })
}

function nextSlot(tabs) {
  const used = new Set(tabs.map((tab) => Number(tab.slot)).filter((slot) => Number.isInteger(slot) && slot > 0))
  let slot = 1
  while (used.has(slot)) slot += 1
  return slot
}

function persistTabs(tabs, activeTabId) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(normalizeTabs(tabs).slice(-24)))
    if (activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
  } catch { void 0 }
}

function createTabRecord(record, slot) {
  return { ...tabFromRecord(record), slot }
}

function toRecord(tab, projects) {
  return projects.find((project) => project.id === tab.projectId) || {
    id: tab.projectId,
    name: tab.name,
    path: tab.path,
    external: tab.external,
    active: false
  }
}

export function ProjectSwitcher() {
  const [projects, setProjects] = useState([])
  const [current, setCurrent] = useState(null)
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState('')
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [mode, setMode] = useState('folder')
  const [name, setName] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [browser, setBrowser] = useState(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [list, selected] = await Promise.all([ws.request('project', 'list'), ws.request('project', 'current')])
      setProjects(list)
      setCurrent(selected)
      const available = new Set(list.map((project) => project.id))
      const stored = normalizeTabs(readJson(TABS_KEY, []).filter((tab) => tab && tab.tabId && available.has(tab.projectId)))
      const selectedKey = recordKey(selected)
      let nextTabs = stored
      let nextActive = readJson(ACTIVE_TAB_KEY, '')
      if (!nextTabs.length) nextTabs = [createTabRecord(selected, 1)]
      if (!nextTabs.some((tab) => tab.projectId === selectedKey)) nextTabs = [...nextTabs, createTabRecord(selected, nextSlot(nextTabs))]
      const selectedTab = nextTabs.find((tab) => tab.tabId === nextActive && tab.projectId === selectedKey)
        || nextTabs.find((tab) => tab.projectId === selectedKey)
        || nextTabs[0]
      nextActive = selectedTab.tabId
      setTabs(nextTabs)
      setActiveTabId(nextActive)
      setWorkspace(selected)
      persistTabs(nextTabs, nextActive)
      // Other panes mount in parallel with the switcher. Broadcast the
      // authoritative initial workspace so they do not briefly load another
      // workspace's files, Git state, or agent sessions.
      window.dispatchEvent(new CustomEvent('pixcode:workspace-change', { detail: selected }))
      setError('')
    } catch (requestError) { setError(requestError.message) }
  }

  useEffect(() => {
    load()
    const openFolder = () => openModal('folder')
    const cloneRepo = () => openModal('github')
    const newProject = () => { setMode('create'); setShowCreate(true) }
    window.addEventListener('pixcode:open-folder', openFolder)
    window.addEventListener('pixcode:clone-repo', cloneRepo)
    window.addEventListener('pixcode:new-project', newProject)
    return () => {
      window.removeEventListener('pixcode:open-folder', openFolder)
      window.removeEventListener('pixcode:clone-repo', cloneRepo)
      window.removeEventListener('pixcode:new-project', newProject)
    }
  }, [])

  async function activateTab(tab, tabList = tabs) {
    if (!tab?.projectId || busy) return
    const record = toRecord(tab, projects)
    if (record.id === current?.id) {
      setActiveTabId(tab.tabId)
      setWorkspace(record)
      persistTabs(tabList, tab.tabId)
      window.dispatchEvent(new CustomEvent('pixcode:workspace-change', { detail: record }))
      return
    }
    setBusy(true)
    setError('')
    try {
      const selected = record.id === current?.id ? record : await ws.request('project', 'select', { id: record.id })
      setCurrent(selected)
      setActiveTabId(tab.tabId)
      setWorkspace(selected)
      persistTabs(tabList, tab.tabId)
      window.dispatchEvent(new CustomEvent('pixcode:workspace-change', { detail: selected }))
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function openAsTab(record) {
    if (!record?.id || busy) return
    const newTab = createTabRecord(record, nextSlot(tabs))
    const duplicate = tabs.find((item) => item.projectId === record.id)
    const targetTab = duplicate || newTab
    const nextTabs = duplicate ? tabs : [...tabs, newTab]
    setTabs((existing) => {
      const existingDuplicate = existing.find((item) => item.projectId === record.id)
      const next = existingDuplicate ? existing : [...existing, newTab]
      persistTabs(next, targetTab.tabId)
      return next
    })
    setProjects((existing) => existing.some((item) => item.id === record.id) ? existing : [...existing, record])
    setActiveTabId(targetTab.tabId)
    setShowCreate(false)
    setBusy(true)
    try {
      const selected = record.id === current?.id ? record : await ws.request('project', 'select', { id: record.id })
      setCurrent(selected)
      setWorkspace(selected)
      setActiveTabId(targetTab.tabId)
      persistTabs(nextTabs, targetTab.tabId)
      window.dispatchEvent(new CustomEvent('pixcode:workspace-change', { detail: selected }))
    } catch (requestError) {
      setError(requestError.message)
      setTabs((existing) => {
        const next = existing.filter((item) => item.tabId !== targetTab.tabId)
        persistTabs(next, next.at(-1)?.tabId || '')
        return next
      })
    } finally { setBusy(false) }
  }

  async function selectProject(event) {
    const project = projects.find((item) => item.id === event.currentTarget.value)
    event.currentTarget.value = ''
    if (project) await openAsTab(project)
  }

  async function create(event) {
    event.preventDefault()
    try { await openAsTab(await ws.request('project', 'create', { name })) } catch (requestError) { setError(requestError.message) }
  }

  async function browse(path = folderPath || '~') {
    setBusy(true)
    try {
      const result = await ws.request('project', 'browse', { path })
      setBrowser(result)
      setFolderPath(result.path)
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function openFolder(event) {
    event.preventDefault()
    try { await openAsTab(await ws.request('project', 'open', { path: folderPath })) } catch (requestError) { setError(requestError.message) }
  }

  async function clone(event) {
    event.preventDefault()
    try { await openAsTab(await ws.request('project', 'clone', { url, name })) } catch (requestError) { setError(requestError.message) }
  }

  function openModal(nextMode) {
    setMode(nextMode)
    setError('')
    setShowCreate(true)
    if (nextMode === 'folder' && !browser) browse()
  }

  function closeTab(event, tabId) {
    event.stopPropagation()
    if (tabs.length <= 1) return
    const index = tabs.findIndex((tab) => tab.tabId === tabId)
    const remaining = tabs.filter((tab) => tab.tabId !== tabId)
    const next = tabId === activeTabId ? (remaining[index] || remaining[index - 1] || remaining[0]) : null
    setTabs(remaining)
    persistTabs(remaining, next?.tabId || activeTabId)
    if (next) {
      // Keep the close interaction synchronous from the user's perspective;
      // activation itself handles the backend switch and event fan-out.
      void activateTab(next, remaining)
    }
  }

  return (
    <>
      <div class="workspace-switcher" aria-label={t('topbar.workspace')}>
        <div class="workspace-tabs" role="tablist" aria-label={t('topbar.workspace')}>
          {tabs.map((tab) => <button class={'workspace-tab ' + (tab.tabId === activeTabId ? 'active' : '')} type="button" role="tab" aria-selected={tab.tabId === activeTabId} key={tab.tabId} onClick={() => activateTab(tab)} title={tab.path || tab.name}>
            <span class="workspace-tab-index">{tab.slot}</span><span class="workspace-tab-copy"><strong>Workspace #{tab.slot}</strong><small>{tab.name}</small></span><span class="workspace-tab-close" role="button" tabIndex="0" onClick={(event) => closeTab(event, tab.tabId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') closeTab(event, tab.tabId) }} aria-label={t('project.closeTab')} title={t('project.closeTab')}><X size={11} /></span>
          </button>)}
        </div>
        <select class="workspace-add-select" value="" onChange={selectProject} aria-label={t('project.openExisting')}>
          <option value="">{t('project.openExisting')}</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button class="tw-icon-button workspace-add-button" type="button" onClick={() => openModal('folder')} title={t('project.newWorkspace')} aria-label={t('project.newWorkspace')}><Plus size={15} /></button>
        {error && <span class="project-error" title={error}>!</span>}
      </div>
      {showCreate && <div class="modal-backdrop" onClick={() => setShowCreate(false)}>
        <section class="project-modal project-open-modal" onClick={(event) => event.stopPropagation()}>
          <div class="project-modal-header"><h2>{t('project.newWorkspace')}</h2><button class="tw-icon-button" type="button" onClick={() => setShowCreate(false)} title={t('common.cancel')} aria-label={t('common.cancel')}><X size={15} /></button></div>
          <div class="workspace-project-picker"><span>{t('project.openExisting')}</span><div>{projects.map((project) => <button type="button" key={project.id} onClick={() => openAsTab(project)} disabled={busy}><FolderOpen size={13} /><span>{project.name}</span></button>)}</div></div>
          <div class="project-modal-tabs"><button type="button" class={mode === 'folder' ? 'active' : ''} onClick={() => openModal('folder')}><FolderOpen size={14} /> {t('project.openFolder')}</button><button type="button" class={mode === 'github' ? 'active' : ''} onClick={() => openModal('github')}><GitFork size={14} /> {t('project.cloneRepo')}</button><button type="button" class={mode === 'create' ? 'active' : ''} onClick={() => openModal('create')}><FolderPlus size={14} /> {t('project.new')}</button></div>
          {mode === 'folder' && <form onSubmit={openFolder}>
            <p>{t('project.folderHint')}</p><div class="project-path-row"><input value={folderPath} onInput={(event) => setFolderPath(event.currentTarget.value)} placeholder="/home/user/project" autoFocus /><button class="tw-icon-button" type="button" onClick={() => browse(folderPath || '~')} disabled={busy} title={t('project.browse')} aria-label={t('project.browse')}><RefreshCw size={14} class={busy ? 'spin' : ''} /></button></div>
            {browser && <div class="folder-browser"><button type="button" class="folder-browser-parent" disabled={!browser.parent} onClick={() => browse(browser.parent)}><ArrowLeft size={13} /> {browser.parent || '/'}</button>{browser.entries.map((entry) => <button type="button" class="folder-browser-entry" key={entry.path} onClick={() => browse(entry.path)}><FolderOpen size={14} /><span>{entry.name}</span><ChevronRight size={13} /></button>)}{!browser.entries.length && <span class="muted">{t('tree.empty')}</span>}</div>}
            <div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={busy || !folderPath.trim()}><FolderOpen size={13} /> {t('project.openFolder')}</button></div>
          </form>}
          {mode === 'github' && <form onSubmit={clone}><p>{t('project.cloneHint')}</p><input value={url} onInput={(event) => setUrl(event.currentTarget.value)} placeholder="https://github.com/org/repository.git" autoFocus /><input value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('project.namePlaceholder')} /><div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={busy || !url.trim()}><GitFork size={13} /> {t('project.cloneRepo')}</button></div></form>}
          {mode === 'create' && <form onSubmit={create}><p>{t('project.nameHint')}</p><input value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('project.namePlaceholder')} autoFocus /><div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={busy}>{t('project.create')}</button></div></form>}
          {error && <div class="error-text project-modal-error">{error}</div>}
        </section>
      </div>}
    </>
  )
}
