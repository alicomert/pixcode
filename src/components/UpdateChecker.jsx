import { useEffect, useState } from 'preact/hooks'
import { Download, FileCheck, RefreshCw, X } from '../lib/icons.jsx'
import { t } from '../lib/i18n.js'
import { checkForUpdate, CURRENT_VERSION, RELEASE_URL } from '../lib/updater.js'

function safeReleaseUrl(value) {
  try {
    const url = new URL(value || RELEASE_URL)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : RELEASE_URL
  } catch {
    return RELEASE_URL
  }
}

function shortenNotes(notes) {
  if (!notes) return ''
  const plain = notes.replace(/[_* >#]/g, '').replace(/\[(.*?)\]\([^)]*\)/g, '$1').trim()
  return plain.length > 280 ? plain.slice(0, 277) + '...' : plain
}

/** Check releases without making the app dependent on GitHub availability. */
export function UpdateChecker({ detailed = false }) {
  const [state, setState] = useState({ status: 'idle', release: null, error: '' })
  const [open, setOpen] = useState(false)

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
  }

  useEffect(() => {
    const timer = window.setTimeout(() => check(), detailed ? 0 : 1_200)
    return () => window.clearTimeout(timer)
  }, [])

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

  return <div class={'update-checker ' + (detailed ? 'update-checker-detailed' : 'update-checker-compact')}>
    <button
      type="button"
      class={state.status === 'available' ? 'update-button update-button-available' : 'update-button'}
      onClick={() => state.status === 'available' ? setOpen(true) : check(true)}
      disabled={state.status === 'checking'}
      title={state.status === 'error' ? t('update.error') : label}
      aria-label={label}
    >
      {state.status === 'checking' ? <RefreshCw size={15} class="update-spin" /> : state.status === 'current' ? <FileCheck size={15} /> : <Download size={15} />}
      {detailed && <span>{label}</span>}
      {!detailed && <span class="update-compact-label">{compactVersion}</span>}
      {state.status === 'available' && <span class="update-dot" aria-hidden="true" />}
    </button>
    {detailed && state.status === 'error' && <span class="update-error" title={state.error}>{t('update.unavailable')}</span>}
    {open && release?.updateAvailable && <div class="update-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section class="update-modal" role="dialog" aria-modal="true" aria-labelledby="pixcode-update-title">
        <button type="button" class="update-modal-close" onClick={() => setOpen(false)} title={t('update.dismiss')} aria-label={t('update.dismiss')}><X size={16} /></button>
        <span class="update-eyebrow">{t('update.eyebrow')}</span>
        <h2 id="pixcode-update-title">{t('update.available', { version: release.version })}</h2>
        {shortenNotes(release.notes) && <p>{shortenNotes(release.notes)}</p>}
        <div class="update-actions">
          <a class="btn-accent update-download" href={downloadUrl} target="_blank" rel="noopener noreferrer">
            <Download size={14} /> {release.assetName ? t('update.download') : t('update.releaseNotes')}
          </a>
          <a class="update-release-link" href={safeReleaseUrl(release.releaseUrl)} target="_blank" rel="noopener noreferrer">{t('update.releaseNotes')}</a>
        </div>
        <small>{t('update.manualInstall')}</small>
      </section>
    </div>}
  </div>
}
