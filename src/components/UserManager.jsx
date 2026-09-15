import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { VscSelect } from './vsc.jsx'
import { Shield, User, UserPlus } from '../lib/icons.jsx'

// Admin-only account management. The settings sidebar only carries a summary
// row — the real UI lives in a centered modal where allowlists and forms have
// room to breathe.
export function UserManager() {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState(null) // {username, password, role} while creating
  const [draft, setDraft] = useState(null) // editable copy of the user being edited
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
  useEffect(() => { if (open) void load() }, [open])

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
      setForm(null)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  function edit(user) {
    if (user.owner) return
    setForm(null)
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

  const memberCount = users.filter((user) => !user.owner).length

  return <>
    <div class="settings-control-row">
      <div class="settings-control-copy"><User size={16} /><span><strong>{t('users.title')}</strong><small>{memberCount ? t('users.count', { count: memberCount }) : t('users.onlyYou')}</small></span></div>
      <vscode-button secondary onClick={() => setOpen(true)}>{t('users.manage')}</vscode-button>
    </div>
    {open && (
      <div class="modal-backdrop user-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) { setOpen(false); setDraft(null); setForm(null) } }}>
        <section class="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
          <div class="user-modal-heading">
            <strong id="user-modal-title">{t('users.title')}</strong>
            <span class="user-modal-heading-actions">
              {!form && <vscode-button secondary icon="add" onClick={() => { setDraft(null); setForm({ username: '', password: '', role: 'member' }) }}>{t('users.add')}</vscode-button>}
              <vscode-toolbar-button icon="close" onClick={() => { setOpen(false); setDraft(null); setForm(null) }} title={t('common.cancel')} aria-label={t('common.cancel')}></vscode-toolbar-button>
            </span>
          </div>
          {error && <p class="user-modal-error">{error}</p>}

          {form && (
            <form class="user-create-card" onSubmit={create}>
              <div class="user-create-title"><UserPlus size={15} /><strong>{t('users.add')}</strong></div>
              <div class="user-create-grid">
                <label class="user-field"><span>{t('users.username')}</span><vscode-textfield type="text" value={form.username} onInput={(event) => setForm({ ...form, username: event.currentTarget.value })} required minlength={3} maxlength={32} autofocus /></label>
                <label class="user-field"><span>{t('users.password')}</span><vscode-textfield type="password" value={form.password} onInput={(event) => setForm({ ...form, password: event.currentTarget.value })} required minlength={6} /></label>
                <label class="user-field"><span>{t('users.role')}</span>
                  <VscSelect value={form.role} onChange={(value) => setForm({ ...form, role: value })}>
                    <vscode-option value="member">{t('users.member')}</vscode-option>
                    <vscode-option value="admin">{t('users.admin')}</vscode-option>
                  </VscSelect>
                </label>
              </div>
              <div class="user-card-actions user-card-actions-end">
                <vscode-button secondary onClick={() => setForm(null)}>{t('common.cancel')}</vscode-button>
                <vscode-button type="submit" disabled={busy || !form.username.trim() || form.password.length < 6}>{t('users.add')}</vscode-button>
              </div>
            </form>
          )}

          <vscode-scrollable class="user-modal-list">
            {users.map((user) => (
              <div class={`user-card ${draft?.id === user.id ? 'editing' : ''}`} key={user.id}>
                <div class="user-card-head">
                  <span class={`user-avatar ${user.role === 'admin' ? 'admin' : ''}`}>{user.role === 'admin' ? <Shield size={14} /> : <User size={14} />}</span>
                  <span class="user-card-copy">
                    <strong>{user.username}{user.owner ? ` (${t('users.you')})` : ''}</strong>
                    <small>
                      {t(`users.${user.role}`)}
                      {user.projects ? ` · ${user.projects.length} ${t('users.projects').toLowerCase()}` : ''}
                      {user.agents ? ` · ${user.agents.length} CLI` : ''}
                    </small>
                  </span>
                  {user.disabled && <vscode-badge class="user-badge-disabled">{t('users.disabled')}</vscode-badge>}
                  {user.owner
                    ? <vscode-badge>{t('users.owner')}</vscode-badge>
                    : <vscode-button secondary onClick={() => (draft?.id === user.id ? setDraft(null) : edit(user))}>{draft?.id === user.id ? t('common.cancel') : t('users.edit')}</vscode-button>}
                </div>

                {draft?.id === user.id && (
                  <div class="user-card-body">
                    <div class="user-edit-grid">
                      <div class="user-edit-block">
                        <span class="user-edit-label">{t('users.role')}</span>
                        <VscSelect value={draft.role} onChange={(value) => setDraft({ ...draft, role: value })}>
                          <vscode-option value="member">{t('users.member')}</vscode-option>
                          <vscode-option value="admin">{t('users.admin')}</vscode-option>
                        </VscSelect>
                      </div>
                      <div class="user-edit-block">
                        <span class="user-edit-label">{t('users.resetPassword')}</span>
                        <vscode-textfield type="password" value={draft.password} placeholder={t('users.newPassword')} onInput={(event) => setDraft({ ...draft, password: event.currentTarget.value })} />
                      </div>
                    </div>

                    <div class="user-edit-block">
                      <div class="user-edit-label-row"><span class="user-edit-label">{t('users.projects')}</span><label class="user-toggle"><input type="checkbox" checked={draft.allProjects} onChange={() => setDraft({ ...draft, allProjects: !draft.allProjects })} />{t('users.all')}</label></div>
                      {!draft.allProjects && (
                        <div class="user-checklist">
                          {projects.map((project) => (
                            <label key={project.id} class="user-check"><input type="checkbox" checked={draft.projects.has(project.id)} onChange={() => toggle('projects', project.id)} /><span>{project.name}</span></label>
                          ))}
                          {!projects.length && <small>{t('users.noProjects')}</small>}
                        </div>
                      )}
                    </div>

                    <div class="user-edit-block">
                      <div class="user-edit-label-row"><span class="user-edit-label">{t('users.agents')}</span><label class="user-toggle"><input type="checkbox" checked={draft.allAgents} onChange={() => setDraft({ ...draft, allAgents: !draft.allAgents })} />{t('users.all')}</label></div>
                      {!draft.allAgents && (
                        <div class="user-checklist user-checklist-grid">
                          {agents.map((agent) => (
                            <label key={agent.id} class="user-check"><input type="checkbox" checked={draft.agents.has(agent.id)} onChange={() => toggle('agents', agent.id)} /><span>{agent.label}</span></label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div class="user-card-actions">
                      <label class="user-toggle user-danger-toggle"><input type="checkbox" checked={draft.disabled} onChange={() => setDraft({ ...draft, disabled: !draft.disabled })} />{t('users.disableAccount')}</label>
                      <span class="user-card-actions-right">
                        <vscode-button secondary onClick={() => remove(draft.id)} disabled={busy}>{t('users.delete')}</vscode-button>
                        <vscode-button onClick={save} disabled={busy}>{t('users.save')}</vscode-button>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </vscode-scrollable>
        </section>
      </div>
    )}
  </>
}
