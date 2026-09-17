import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { VscSelect } from './vsc.jsx'
import { Folder, Shield, User, UserPlus } from '../lib/icons.jsx'

// vscode-scrollable swallows every wheel event that bubbles through it, which
// kills native scrolling in nested lists. Keep the wheel on the inner list
// while it can still move; at the edge let it bubble so the outer scrollable
// takes over.
function nestedWheel(el) {
  if (!el || el._nestedWheel) return
  el._nestedWheel = true
  el.addEventListener('wheel', (event) => {
    const canScroll = event.deltaY < 0
      ? el.scrollTop > 0
      : el.scrollTop + el.clientHeight < el.scrollHeight - 1
    if (canScroll) event.stopPropagation()
  })
}

// Shared allowlist editor: "All allowed" toggle plus a scrollable checklist of
// items. `children` renders under the list (used for the folder picker).
function AccessPicker({ label, allChecked, onToggleAll, items, selected, onToggleItem, grid = false, empty, children }) {
  return (
    <div class="user-edit-block">
      <div class="user-edit-label-row">
        <span class="user-edit-label">{label}</span>
        <label class="user-toggle"><input type="checkbox" checked={allChecked} onChange={onToggleAll} />{t('users.all')}</label>
      </div>
      {!allChecked && (
        <>
          <div class={`user-checklist ${grid ? 'user-checklist-grid' : ''}`} ref={nestedWheel}>
            {items.map((item) => (
              <label key={item.id} class="user-check" title={item.sub || undefined}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggleItem(item.id)} />
                <span class="user-check-copy"><span>{item.label}</span>{item.sub && <small>{item.sub}</small>}</span>
              </label>
            ))}
            {!items.length && <small>{empty}</small>}
          </div>
          {children}
        </>
      )}
    </div>
  )
}

// Inline folder browser so an admin can grant any directory on the server, not
// just workspaces previously opened in the picker.
function FolderGrantPicker({ onGrant }) {
  const [browse, setBrowse] = useState(null)
  const [busy, setBusy] = useState(false)
  const [browseError, setBrowseError] = useState('')

  async function open(target) {
    setBusy(true)
    setBrowseError('')
    try {
      setBrowse(await ws.request('project', 'browse', { path: target || '~' }))
    } catch (requestError) {
      setBrowseError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function grant() {
    setBusy(true)
    setBrowseError('')
    try {
      const record = await ws.request('project', 'grant', { path: browse.path })
      onGrant(record)
      setBrowse(null)
    } catch (requestError) {
      setBrowseError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (!browse) {
    return <vscode-button class="user-add-folder" secondary icon="new-folder" onClick={() => open('~')} disabled={busy}>{t('users.addFolder')}</vscode-button>
  }
  return (
    <div class="user-browse">
      <div class="user-browse-head">
        <vscode-toolbar-button icon="arrow-up" disabled={!browse.parent || busy} onClick={() => open(browse.parent)} title={t('users.up')} aria-label={t('users.up')}></vscode-toolbar-button>
        <span class="user-browse-path" title={browse.path}>{browse.path}</span>
        <vscode-button secondary onClick={() => setBrowse(null)} disabled={busy}>{t('common.cancel')}</vscode-button>
        <vscode-button onClick={grant} disabled={busy}>{t('users.grantFolder')}</vscode-button>
      </div>
      {browseError && <small class="user-browse-error">{browseError}</small>}
      <div class="user-browse-list" ref={nestedWheel}>
        {browse.entries.map((entry) => (
          <button key={entry.path} type="button" class="user-browse-entry" onClick={() => open(entry.path)} disabled={busy}>
            <Folder size={13} /><span>{entry.name}</span>
          </button>
        ))}
        {!browse.entries.length && <small>{t('users.emptyFolder')}</small>}
      </div>
    </div>
  )
}

// Admin-only account management. The settings sidebar only carries a summary
// row — the real UI lives in a centered modal where allowlists and forms have
// room to breathe.
export function UserManager() {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState(null) // blank account form while creating
  const [draft, setDraft] = useState(null) // editable copy of the user being edited
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const blankForm = () => ({ username: '', password: '', role: 'member', allProjects: true, projects: new Set(), allAgents: true, agents: new Set(), cliHome: false })

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

  function toggleIn(state, setState, key, value) {
    const next = new Set(state[key])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setState({ ...state, [key]: next })
  }

  // A freshly granted folder becomes selectable immediately, before the next
  // project.list round-trip.
  function addProjectOption(record) {
    setProjects((current) => current.some((project) => project.id === record.id) ? current : [...current, record])
  }

  const projectItems = projects.map((project) => ({ id: project.id, label: project.name, sub: project.id.startsWith('external:') ? project.path : '' }))
  const agentItems = agents.map((agent) => ({ id: agent.id, label: agent.label }))

  async function create(event) {
    event?.preventDefault?.()
    setBusy(true)
    setError('')
    try {
      const created = await ws.request('auth', 'createUser', {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        projects: form.allProjects ? null : [...form.projects],
        agents: form.allAgents ? null : [...form.agents]
      })
      if (form.cliHome && created?.id) await ws.request('agent', 'saveCliEnv', { for: created.id, home: true })
      setForm(null)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function edit(user) {
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
      password: '',
      cliHome: false
    })
    try {
      const info = await ws.request('agent', 'cliEnv', { for: user.id })
      setDraft((current) => (current?.id === user.id ? { ...current, cliHome: !!info?.home } : current))
    } catch { /* non-fatal: flag defaults to off */ }
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
      await ws.request('agent', 'saveCliEnv', { for: draft.id, home: !!draft.cliHome })
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
              {!form && <vscode-button secondary icon="add" onClick={() => { setDraft(null); setForm(blankForm()) }}>{t('users.add')}</vscode-button>}
              <vscode-toolbar-button icon="close" onClick={() => { setOpen(false); setDraft(null); setForm(null) }} title={t('common.cancel')} aria-label={t('common.cancel')}></vscode-toolbar-button>
            </span>
          </div>
          {error && <p class="user-modal-error">{error}</p>}

          <vscode-scrollable class="user-modal-list">
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
                <AccessPicker
                  label={t('users.projects')}
                  allChecked={form.allProjects}
                  onToggleAll={() => setForm({ ...form, allProjects: !form.allProjects })}
                  items={projectItems}
                  selected={form.projects}
                  onToggleItem={(id) => toggleIn(form, setForm, 'projects', id)}
                  empty={t('users.noProjects')}
                >
                  <FolderGrantPicker onGrant={(record) => { addProjectOption(record); setForm((current) => ({ ...current, projects: new Set(current.projects).add(record.id) })) }} />
                </AccessPicker>
                <AccessPicker
                  label={t('users.agents')}
                  allChecked={form.allAgents}
                  onToggleAll={() => setForm({ ...form, allAgents: !form.allAgents })}
                  items={agentItems}
                  selected={form.agents}
                  onToggleItem={(id) => toggleIn(form, setForm, 'agents', id)}
                  grid
                  empty={t('users.noAgents')}
                />
                <div class="user-edit-block">
                  <label class="user-toggle"><input type="checkbox" checked={form.cliHome} onChange={() => setForm({ ...form, cliHome: !form.cliHome })} />{t('users.cliHome')}</label>
                  <small class="user-field-hint">{t('users.cliHomeHint')}</small>
                </div>
                <div class="user-card-actions user-card-actions-end">
                  <vscode-button secondary onClick={() => setForm(null)}>{t('common.cancel')}</vscode-button>
                  <vscode-button onClick={create} disabled={busy || !form.username.trim() || form.password.length < 6}>{t('users.add')}</vscode-button>
                </div>
              </form>
            )}

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

                    <AccessPicker
                      label={t('users.projects')}
                      allChecked={draft.allProjects}
                      onToggleAll={() => setDraft({ ...draft, allProjects: !draft.allProjects })}
                      items={projectItems}
                      selected={draft.projects}
                      onToggleItem={(id) => toggleIn(draft, setDraft, 'projects', id)}
                      empty={t('users.noProjects')}
                    >
                      <FolderGrantPicker onGrant={(record) => { addProjectOption(record); setDraft((current) => ({ ...current, projects: new Set(current.projects).add(record.id) })) }} />
                    </AccessPicker>

                    <AccessPicker
                      label={t('users.agents')}
                      allChecked={draft.allAgents}
                      onToggleAll={() => setDraft({ ...draft, allAgents: !draft.allAgents })}
                      items={agentItems}
                      selected={draft.agents}
                      onToggleItem={(id) => toggleIn(draft, setDraft, 'agents', id)}
                      grid
                      empty={t('users.noAgents')}
                    />

                    <div class="user-edit-block">
                      <label class="user-toggle"><input type="checkbox" checked={draft.cliHome} onChange={() => setDraft({ ...draft, cliHome: !draft.cliHome })} />{t('users.cliHome')}</label>
                      <small class="user-field-hint">{t('users.cliHomeHint')}</small>
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
