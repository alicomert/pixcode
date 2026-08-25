import { useEffect, useState } from 'preact/hooks'
import { FolderPlus } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

export function ProjectSwitcher() {
  const [projects, setProjects] = useState([])
  const [current, setCurrent] = useState(null)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')

  async function load() {
    try {
      const [list, selected] = await Promise.all([ws.request('project', 'list'), ws.request('project', 'current')])
      setProjects(list)
      setCurrent(selected)
      setError('')
    } catch (requestError) { setError(requestError.message) }
  }

  useEffect(() => { load() }, [])

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

  return (
    <>
      <div class="project-switcher">
        <span class="project-label">{t('project.label')}</span>
        <select value={current?.id || ''} onChange={select} aria-label={t('project.label')}>
          {!current && <option value="">{t('project.loading')}</option>}
          {current?.external && <option value={current.id}>{current.name}</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button class="tw-icon-button" type="button" onClick={() => setShowCreate(true)} title={t('project.new')} aria-label={t('project.new')}><FolderPlus size={15} /></button>
        {error && <span class="project-error" title={error}>!</span>}
      </div>
      {showCreate && <div class="modal-backdrop" onClick={() => setShowCreate(false)}>
        <form class="project-modal" onSubmit={create} onClick={(event) => event.stopPropagation()}>
          <h2>{t('project.new')}</h2>
          <p>{t('project.nameHint')}</p>
          <input value={name} onInput={(event) => setName(event.currentTarget.value)} placeholder={t('project.namePlaceholder')} autoFocus />
          <div class="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button><button class="btn-accent" type="submit">{t('project.create')}</button></div>
        </form>
      </div>}
    </>
  )
}
