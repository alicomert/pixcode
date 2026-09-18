import { useEffect, useRef, useState } from 'preact/hooks'
import { Download, FileCheck } from '../lib/icons.jsx'
import { t } from '../lib/i18n.js'
import { ws } from '../lib/ws.js'
import { isAdmin } from '../state/app.js'
import { checkForUpdate, CURRENT_VERSION, RELEASE_URL } from '../lib/updater.js'

function safeReleaseUrl(value) {
  try {
    const url = new URL(value || RELEASE_URL)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : RELEASE_URL
  } catch {
    return RELEASE_URL
  }
}

const isTauri = typeof window !== 'undefined'
  && (location.hostname === 'tauri.localhost' || location.protocol === 'tauri:' || !!window.__TAURI_INTERNALS__)

// Markdown-lite for release notes: headings, bullet lists, bold, code, links.
// Newlines are preserved so notes never render as one collapsed wall of text.
function inlineMd(text) {
  const parts = []
  let rest = text
  let key = 0
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:[^)]+)\))/
  while (rest) {
    const match = rest.match(pattern)
    if (!match) { parts.push(rest); break }
    if (match.index > 0) parts.push(rest.slice(0, match.index))
    if (match[2] != null) parts.push(<strong key={key++}>{match[2]}</strong>)
    else if (match[4] != null) parts.push(<code key={key++}>{match[4]}</code>)
    else if (match[6] != null) parts.push(<a key={key++} href={match[7]} target="_blank" rel="noopener noreferrer">{match[6]}</a>)
    rest = rest.slice(match.index + match[0].length)
  }
  return parts
}

function ReleaseNotes({ notes }) {
  if (!notes?.trim()) return null
  const blocks = []
  let list = null
  const flushList = () => { if (list?.length) blocks.push(<ul key={blocks.length}>{list}</ul>); list = null }
  for (const raw of notes.split('\n')) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) { flushList(); continue }
    const heading = trimmed.match(/^#{1,4}\s+(.*)/)
    const bullet = trimmed.match(/^[-*•]\s+(.*)/)
    if (heading) { flushList(); blocks.push(<h4 key={blocks.length}>{inlineMd(heading[1])}</h4>); continue }
    if (bullet) { (list ||= []).push(<li key={list.length}>{inlineMd(bullet[1])}</li>); continue }
    flushList()
    blocks.push(<p key={blocks.length}>{inlineMd(trimmed)}</p>)
    if (blocks.length > 40) break
  }
  flushList()
  return <div class="update-notes">{blocks.slice(0, 40)}</div>
}

/** Check releases without making the app dependent on GitHub availability. */
export function UpdateChecker({ detailed = false }) {
  const [state, setState] = useState({ status: 'idle', release: null, error: '' })
  const [open, setOpen] = useState(false)
  const [installMode, setInstallMode] = useState('')
  const [updating, setUpdating] = useState(false)
  const reloadPoll = useRef(null)

  async function check(force = false) {
    if (state.status === 'checking' && !force) return
    setState((current) => ({ ...current, status: 'checking', error: '' }))
    try {
      const release = await checkForUpdate()
      setState({ status: release.updateAvailable ? 'available' : 'current', release, error: '' })
      if (release.updateAvailable) setOpen(true)
    } catch (error) {
      setState({ status: 'error', release: null, error: error?.message || 'update check failed' })
    }
    if (isAdmin.value && !isTauri) {
      ws.request('system', 'updateCheck').then((info) => setInstallMode(info.mode || '')).catch(() => {})
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => check(), detailed ? 0 : 1_200)
    return () => { window.clearTimeout(timer); window.clearInterval(reloadPoll.current) }
  }, [])

  // Web/server installs self-update through the daemon: npm or git channel.
  // The daemon restarts itself, so we poll /api/health until the new version
  // answers and then reload the page.
  async function updateNow() {
    if (updating) return
    setUpdating(true)
    try {
      await ws.request('system', 'updateApply')
      const deadline = Date.now() + 6 * 60_000 // npm/git update + rebuild can take minutes
      reloadPoll.current = window.setInterval(async () => {
        try {
          const res = await fetch('/api/health')
          const info = await res.json()
          if (info?.version && info.version !== CURRENT_VERSION) { location.reload(); return }
        } catch { /* daemon mid-restart — keep polling */ }
        if (Date.now() > deadline) {
          window.clearInterval(reloadPoll.current)
          setUpdating(false)
          setState((current) => ({ ...current, error: 'timeout' }))
        }
      }, 4000)
    } catch {
      setUpdating(false)
    }
  }

  const release = state.release
  const downloadUrl = safeReleaseUrl(release?.assetUrl || release?.releaseUrl)
  const compactVersion = release?.updateAvailable
    ? `v${release.version}`
    : `v${release?.currentVersion || CURRENT_VERSION}`
  const label = state.status === 'checking'
    ? t('update.checking')
    : state.status === 'available'
      ? t('update.available', { version: release?.version || '' })
      : detailed && state.status === 'current'
        ? t('update.current', { version: release?.currentVersion || '' })
        : t('update.check')
  const canSelfUpdate = !isTauri && isAdmin.value && (installMode === 'npm' || installMode === 'git')

  return <div class={'update-checker ' + (detailed ? 'update-checker-detailed' : 'update-checker-compact')}>
    <button
      type="button"
      class={state.status === 'available' ? 'update-button update-button-available' : 'update-button'}
      onClick={() => state.status === 'available' ? setOpen(true) : check(true)}
      disabled={state.status === 'checking'}
      title={state.status === 'error' ? t('update.error') : label}
      aria-label={label}
    >
      {state.status === 'checking' ? <vscode-progress-ring class="update-ring" /> : state.status === 'current' ? <FileCheck size={15} /> : <Download size={15} />}
      {detailed && <span>{label}</span>}
      {!detailed && <span class="update-compact-label">{compactVersion}</span>}
      {state.status === 'available' && <span class="update-dot" aria-hidden="true" />}
    </button>
    {detailed && state.status === 'error' && <span class="update-error" title={state.error}>{t('update.unavailable')}</span>}
    {open && release?.updateAvailable && <div class="update-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !updating) setOpen(false) }}>
      <section class="update-modal" role="dialog" aria-modal="true" aria-labelledby="pixcode-update-title">
        <vscode-toolbar-button class="update-modal-close" icon="close" onClick={() => !updating && setOpen(false)} title={t('update.dismiss')} aria-label={t('update.dismiss')}></vscode-toolbar-button>
        <span class="update-eyebrow">{t('update.eyebrow')}</span>
        <h2 id="pixcode-update-title">{t('update.available', { version: release.version })}</h2>
        <ReleaseNotes notes={release.notes} />
        {updating && <p class="update-progress"><vscode-progress-ring /> {t('update.applying')}</p>}
        <div class="update-actions">
          {isTauri && <a class="btn-accent update-download" href={downloadUrl} target="_blank" rel="noopener noreferrer">
            <Download size={14} /> {release.assetName ? t('update.download') : t('update.releaseNotes')}
          </a>}
          {canSelfUpdate && !updating && <vscode-button onClick={updateNow}>{t('update.updateNow', { mode: installMode })}</vscode-button>}
          <a class="update-release-link" href={safeReleaseUrl(release.releaseUrl)} target="_blank" rel="noopener noreferrer">{t('update.releaseNotes')}</a>
        </div>
        <small>{isTauri ? t('update.manualInstall') : t('update.serverHint', { mode: installMode || 'npm' })}</small>
      </section>
    </div>}
  </div>
}
