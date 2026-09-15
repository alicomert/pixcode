import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { VscSelect } from './vsc.jsx'
import { User, UserPlus } from '../lib/icons.jsx'

// Admin-only account management: create member logins and scope each one to
// an allowlist of projects and agent CLIs. A null list means unrestricted.
export function UserManager() {
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'member' })
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [userList, projectList, agentList] = await Promise.all([
        ws.request('auth', 'users'),
        ws.request('project', 'list'),
        ws.request('agent', 'agents')
      ])
      setUsers(userList || [])
      setProjects(projectList || [])
      setAgents(agentList || [])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  useEffect(() => { void load() }, [])

  async function create(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await ws.request('auth', 'createUser', {
        username: form.username.trim(),
        password: form.password,
        role: form.role
      })
      setForm({ username: '', password: '', role: 'member' })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  function edit(user) {
    if (user.owner) return
    setDraft({
      id: user.id,
      username: user.username,
      role: user.role,
      disabled: user.disabled,
      allProjects: user.projects === null,
      projects: new Set(user.projects || []),
      allAgents: user.agents === null,
      agents: new Set(user.agents || []),
      password: ''
    })
  }

  function toggle(list, value) {
    const next = new Set(draft[list])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setDraft({ ...draft, [list]: next })
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await ws.request('auth', 'updateUser', {
        id: draft.id,
        role: draft.role,
        disabled: draft.disabled,
        projects: draft.allProjects ? null : [...draft.projects],
        agents: draft.allAgents ? null : [...draft.agents],
        ...(draft.password ? { password: draft.password } : {})
      })
      setDraft(null)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setBusy(true)
    setError('')
    try {
      await ws.request('auth', 'removeUser', { id })
      setDraft(null)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return <div class="settings-card user-manager">
    {error && <p class="user-manager-error">{error}</p>}
    {users.map((user) => (
      <div class="user-row" key={user.id}>
        <button type="button" class="user-row-head" onClick={() => (draft?.id === user.id ? setDraft(null) : edit(user))} disabled={user.owner} title={user.owner ? t('users.ownerHint') : ''}>
          <span class="user-row-icon"><User size={15} /></span>
          <span class="user-row-copy">
            <strong>{user.username}{user.owner ? ` (${t('users.you')})` : ''}{user.disabled ? ` · ${t('users.disabled')}` : ''}</strong>
            <small>{t(`users.${user.role}`)}{user.projects ? ` · ${user.projects.length} ${t('users.projects').toLowerCase()}` : ''}{user.agents ? ` · ${user.agents.length} CLI` : ''}</small>
          </span>
          {!user.owner && <vscode-badge>{draft?.id === user.id ? t('common.cancel') : t('users.edit')}</vscode-badge>}
        </button>
        {draft?.id === user.id && (
          <div class="user-editor">
            <div class="settings-control-row">
              <div class="settings-control-copy"><span><strong>{t('users.role')}</strong><small>{t('users.roleHint')}</small></span></div>
              <VscSelect value={draft.role} onChange={(value) => setDraft({ ...draft, role: value })} aria-label={t('users.role')}>
                <vscode-option value="member">{t('users.member')}</vscode-option>
                <vscode-option value="admin">{t('users.admin')}</vscode-option>
              </VscSelect>
            </div>
            <div class="settings-control-row">
              <div class="settings-control-copy"><span><strong>{t('users.projects')}</strong><small>{t('users.projectsHint')}</small></span></div>
              <label class="user-toggle"><input type="checkbox" checked={draft.allProjects} onChange={() => setDraft({ ...draft, allProjects: !draft.allProjects })} /> {t('users.all')}</label>
            </div>
            {!draft.allProjects && (
              <div class="user-checklist">
                {projects.map((project) => (
                  <label key={project.id} class="user-check"><input type="checkbox" checked={draft.projects.has(project.id)} onChange={() => toggle('projects', project.id)} /> {project.name}</label>
                ))}
                {!projects.length && <small>{t('users.noProjects')}</small>}
              </div>
            )}
            <div class="settings-control-row">
              <div class="settings-control-copy"><span><strong>{t('users.agents')}</strong><small>{t('users.agentsHint')}</small></span></div>
              <label class="user-toggle"><input type="checkbox" checked={draft.allAgents} onChange={() => setDraft({ ...draft, allAgents: !draft.allAgents })} /> {t('users.all')}</label>
            </div>
            {!draft.allAgents && (
              <div class="user-checklist">
                {agents.map((agent) => (
                  <label key={agent.id} class="user-check"><input type="checkbox" checked={draft.agents.has(agent.id)} onChange={() => toggle('agents', agent.id)} /> {agent.label}</label>
                ))}
              </div>
            )}
            <div class="settings-control-row">
              <div class="settings-control-copy"><span><strong>{t('users.resetPassword')}</strong><small>{t('users.resetPasswordHint')}</small></span></div>
              <vscode-textfield type="password" value={draft.password} placeholder={t('users.newPassword')} onInput={(event) => setDraft({ ...draft, password: event.currentTarget.value })} />
            </div>
            <div class="settings-control-row">
              <div class="settings-control-copy"><span><strong>{t('users.disableAccount')}</strong><small>{t('users.disableHint')}</small></span></div>
              <label class="user-toggle"><input type="checkbox" checked={draft.disabled} onChange={() => setDraft({ ...draft, disabled: !draft.disabled })} /> {t('users.disabled')}</label>
            </div>
            <div class="user-editor-actions">
              <vscode-button secondary onClick={save} disabled={busy}>{t('users.save')}</vscode-button>
              <vscode-button secondary onClick={() => remove(draft.id)} disabled={busy}>{t('users.delete')}</vscode-button>
            </div>
          </div>
        )}
      </div>
    ))}
    <form class="user-create" onSubmit={create}>
      <div class="user-create-head"><UserPlus size={15} /><strong>{t('users.add')}</strong></div>
      <div class="user-create-fields">
        <vscode-textfield type="text" value={form.username} placeholder={t('users.username')} onInput={(event) => setForm({ ...form, username: event.currentTarget.value })} required minlength={3} maxlength={32} />
        <vscode-textfield type="password" value={form.password} placeholder={t('users.password')} onInput={(event) => setForm({ ...form, password: event.currentTarget.value })} required minlength={6} />
        <VscSelect value={form.role} onChange={(value) => setForm({ ...form, role: value })} aria-label={t('users.role')}>
          <vscode-option value="member">{t('users.member')}</vscode-option>
          <vscode-option value="admin">{t('users.admin')}</vscode-option>
        </VscSelect>
        <vscode-button type="submit" disabled={busy || !form.username.trim() || form.password.length < 6}>{t('users.add')}</vscode-button>
      </div>
    </form>
  </div>
}
