import { useEffect, useState } from 'preact/hooks'
import { Download, RefreshCw, Trash2 } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { isAdmin, workspace } from '../state/app.js'
import { VscSelect } from './vsc.jsx'

// Agent skills manager: installs SKILL.md collections from a git repo into
// the selected agent's skills dir — the user's own (possibly private) home,
// or the workspace's .claude/skills for project-scoped collections.
export function SkillManager() {
  const [agents, setAgents] = useState([])
  const [agent, setAgent] = useState('claude')
  const [scope, setScope] = useState('user')
  const [users, setUsers] = useState([])
  const [target, setTarget] = useState('')
  const [skills, setSkills] = useState([])
  const [repo, setRepo] = useState('')
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    ws.request('agent', 'agents').then((list) => {
      const known = (list || []).filter((item) => ['claude', 'devin'].includes(item.id))
      setAgents(known.length ? known : [{ id: 'claude', label: 'claude' }])
      if (known.length && !known.some((item) => item.id === agent)) setAgent(known[0].id)
    }).catch(() => {})
    if (isAdmin.value) {
      ws.request('auth', 'users').then((list) => setUsers(Array.isArray(list) ? list : [])).catch(() => {})
    }
  }, [])

  useEffect(() => { load() }, [agent, scope, target])

  async function load() {
    setBusy(true)
    setError('')
    try {
      const { skills: list } = await ws.request('agent', 'skills', {
        agent,
        scope,
        for: target || undefined,
        workspace: workspace.value?.path || ''
      })
      setSkills(list || [])
    } catch (requestError) {
      setSkills([])
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function install() {
    const value = repo.trim()
    if (!value || installing) return
    setInstalling(true)
    setError('')
    setNotice('')
    try {
      const result = await ws.request('agent', 'skillInstall', {
        agent,
        scope,
        for: target || undefined,
        workspace: workspace.value?.path || '',
        repo: value
      })
      setRepo('')
      setNotice(t('skills.installed', { count: result.count || 0 }))
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setInstalling(false)
    }
  }

  async function remove(name) {
    try {
      await ws.request('agent', 'skillRemove', {
        agent,
        scope,
        for: target || undefined,
        workspace: workspace.value?.path || '',
        name
      })
      setSkills((current) => current.filter((skill) => skill.name !== name))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return <div class="settings-card skill-manager">
    <div class="settings-control-row">
      <div class="settings-control-copy"><span><strong>{t('skills.agent')}</strong></span></div>
      <VscSelect value={agent} onChange={setAgent} aria-label={t('skills.agent')}>
        {agents.map((item) => <vscode-option key={item.id} value={item.id}>{item.label || item.id}</vscode-option>)}
      </VscSelect>
    </div>
    <div class="settings-control-row">
      <div class="settings-control-copy"><span><strong>{t('skills.scope')}</strong></span></div>
      <VscSelect value={scope} onChange={setScope} aria-label={t('skills.scope')}>
        <vscode-option value="user">{t('skills.scopeUser')}</vscode-option>
        <vscode-option value="workspace">{t('skills.scopeWorkspace')}</vscode-option>
      </VscSelect>
    </div>
    {isAdmin.value && scope === 'user' && users.length > 0 && (
      <div class="settings-control-row">
        <div class="settings-control-copy"><span><strong>{t('skills.forUser')}</strong></span></div>
        <VscSelect value={target} onChange={setTarget} aria-label={t('skills.forUser')}>
          <vscode-option value="">{t('skills.self')}</vscode-option>
          {users.map((user) => <vscode-option key={user.id} value={user.id}>{user.username}</vscode-option>)}
        </VscSelect>
      </div>
    )}
    <div class="settings-control-row">
      <vscode-textfield class="skill-repo-input" value={repo} placeholder={t('skills.repoPlaceholder')} onInput={(event) => setRepo(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') install() }} />
      <vscode-button icon="cloud-download" disabled={!repo.trim() || installing} onClick={install}>{installing ? t('skills.installing') : t('skills.install')}</vscode-button>
    </div>
    {error && <span class="error-text" role="alert">{error}</span>}
    {notice && <span class="skill-notice">{notice}</span>}
    <div class="skill-list">
      {busy && <span class="muted">{t('tree.loading')}</span>}
      {!busy && !skills.length && <span class="muted">{t('skills.empty')}</span>}
      {skills.map((skill) => (
        <div class="skill-row" key={skill.name}>
          <span class="skill-name"><strong>{skill.name}</strong>{skill.description && <small>{skill.description}</small>}</span>
          <button class="tw-icon-button" type="button" title={t('skills.remove')} aria-label={t('skills.remove')} onClick={() => remove(skill.name)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  </div>
}
