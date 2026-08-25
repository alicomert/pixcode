import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, ChevronRight, FolderOpen, FolderPlus, GitFork, RefreshCw, X } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

export function ProjectSwitcher() {
  const [projects, setProjects] = useState([])
  const [current, setCurrent] = useState(null)
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
    return () => { window.removeEventListener('pixcode:open-folder', openFolder); window.removeEventListener('pixcode:clone-repo', cloneRepo); window.removeEventListener('pixcode:new-project', newProject) }
  }, [])

  async function select(event) {
    const id = event.currentTarget.value
    if (!id || id === current?.id) return
    try { await ws.request('project', 'select', { id }); location.reload() } catch (requestError) { setError(requestError.message) }
  }

  async function create(event) {
    event.preventDefault()
    try {
      const created = await ws.request('project', 'create', { name })
      await ws.request('project', 'select', { id: created.id })
      location.reload()
    } catch (requestError) { setError(requestError.message) }
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
    setBusy(true)
    try { await ws.request('project', 'open', { path: folderPath }); location.reload() } catch (requestError) { setError(requestError.message); setBusy(false) }
  }

  async function clone(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const project = await ws.request('project', 'clone', { url, name })
      await ws.request('project', 'select', { id: project.id })
      location.reload()
    } catch (requestError) { setError(requestError.message); setBusy(false) }
  }

  function openModal(nextMode) {
    setMode(nextMode)
    setError('')
    setShowCreate(true)
    if (nextMode === 'folder' && !browser) browse()
  }

  return (
    <>
      <div class="project-switcher">
        <span class="project-label">{t('project.label')}</span>
        <select value={current?.id || ''} onChange={select} aria-label={t('project.label')}>
          {!current && <option value="">{t('project.loading')}</option>}
          {current?.external && <option value={current.id}>{current.name}</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button class="tw-icon-button" type="button" onClick={() => openModal('folder')} title={t('project.openFolder')} aria-label={t('project.openFolder')}><FolderOpen size={15} /></button>
        <button class="tw-icon-button" type="button" onClick={() => openModal('create')} title={t('project.new')} aria-label={t('project.new')}><FolderPlus size={15} /></button>
        {error && <span class="project-error" title={error}>!</span>}
      </div>
      {showCreate && <div class="modal-backdrop" onClick={() => setShowCreate(false)}>
        <section class="project-modal project-open-modal" onClick={(event) => event.stopPropagation()}>
          <div class="project-modal-header"><h2>{mode === 'github' ? t('project.cloneRepo') : mode === 'create' ? t('project.new') : t('project.openFolder')}</h2><button class="tw-icon-button" type="button" onClick={() => setShowCreate(false)} title={t('common.cancel')} aria-label={t('common.cancel')}><X size={15} /></button></div>
          <div class="project-modal-tabs"><button type="button" class={mode === 'folder' ? 'active' : ''} onClick={() => openModal('folder')}><FolderOpen size={14} /> {t('project.openFolder')}</button><button type="button" class={mode === 'github' ? 'active' : ''} onClick={() => openModal('github')}><GitFork size={14} /> {t('project.cloneRepo')}</button><button type="button" class={mode === 'create' ? 'active' : ''} onClick={() => openModal('create')}><FolderPlus size={14} /> {t('project.new')}</button></div>
          {mode === 'folder' && <form onSubmit={openFolder}>
            <p>{t('project.folderHint')}</p>
            <div class="project-path-row"><input value={folderPath} onInput={(event) => setFolderPath(event.currentTarget.value)} placeholder="/home/user/project" autoFocus /><button class="tw-icon-button" type="button" onClick={() => browse(folderPath || '~')} disabled={busy} title={t('project.browse')} aria-label={t('project.browse')}><RefreshCw size={14} class={busy ? 'spin' : ''} /></button></div>
            {browser && <div class="folder-browser"><button type="button" class="folder-browser-parent" disabled={!browser.parent} onClick={() => browse(browser.parent)}><ArrowLeft size={13} /> {browser.parent || '/'}</button>{browser.entries.map((entry) => <button type="button" class="folder-browser-entry" key={entry.path} onClick={() => browse(entry.path)}><FolderOpen size={14} /> <span>{entry.name}</span><ChevronRight size={13} /></button>)}{!browser.entries.length && <span class="muted">{t('tree.empty')}</span>}</div>}
            <div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={busy || !folderPath.trim()}><FolderOpen size={13} /> {t('project.openFolder')}</button></div>
          </form>}
          {mode === 'github' && <form onSubmit={clone}>
            <p>{t('project.cloneHint')}</p><input value={url} onInput={(event) => setUrl(event.currentTarget.value)} placeholder="https://github.com/org/repository.git" autoFocus /><input value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('project.namePlaceholder')} /><div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={busy || !url.trim()}><GitFork size={13} /> {t('project.cloneRepo')}</button></div>
          </form>}
          {mode === 'create' && <form onSubmit={create}><p>{t('project.nameHint')}</p><input value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('project.namePlaceholder')} autoFocus /><div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit">{t('project.create')}</button></div></form>}
          {error && <div class="error-text project-modal-error">{error}</div>}
        </section>
      </div>}
    </>
  )
}
