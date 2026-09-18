import { useEffect, useRef, useState } from 'preact/hooks'
import { Check, Copy, ExternalLink, Globe, RefreshCw } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

// Public link manager. Opened via the 'pixcode:share-open' event from the
// Remote view or the settings launcher row — the heavy configuration lives
// here instead of being crammed into the settings list.
export function ShareModal() {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [fields, setFields] = useState({})
  const [status, setStatus] = useState(null)
  const [health, setHealth] = useState(null)
  const [bore, setBore] = useState(null) // { signedIn, authUrl, waiting }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    const show = () => { setOpen(true); load() }
    window.addEventListener('pixcode:share-open', show)
    return () => window.removeEventListener('pixcode:share-open', show)
  }, [])

  useEffect(() => () => window.clearInterval(pollRef.current), [])

  async function load() {
    setError('')
    try {
      const [{ providers: list }, st] = await Promise.all([
        ws.request('share', 'providers'),
        ws.request('share', 'status'),
      ])
      setProviders(list || [])
      setStatus(st)
      setProvider((current) => current || st?.provider || list?.[0]?.id || '')
      if (st?.running) probe()
      else setHealth(null)
      refreshBore()
    } catch { setStatus(null) }
  }

  async function refreshBore() {
    try { setBore(await ws.request('share', 'boreStatus')) } catch { setBore({ signedIn: false }) }
  }

  async function probe() {
    setHealth({ state: 'checking' })
    try {
      const result = await ws.request('share', 'probe')
      setHealth({ state: result.healthy ? 'healthy' : 'dead', http: result.http, reason: result.reason })
    } catch { setHealth({ state: 'unknown' }) }
  }

  async function enable() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const st = await ws.request('share', 'enable', { provider, opts: fields })
      setStatus({ ...st, running: true })
      probe()
    } catch (requestError) {
      setError(requestError.message)
      if (/sign-in/i.test(requestError.message)) refreshBore()
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      await ws.request('share', 'disable')
      setStatus({ enabled: false, running: false })
      setHealth(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function startBoreLogin() {
    setError('')
    setBore((current) => ({ ...current, waiting: true }))
    try {
      const result = await ws.request('share', 'boreLogin', { origin: location.origin })
      if (result.signedIn) { setBore({ signedIn: true }); return }
      setBore({ signedIn: false, authUrl: result.authUrl, waiting: true })
      window.clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const next = await ws.request('share', 'boreStatus')
          if (next.signedIn) {
            window.clearInterval(pollRef.current)
            setBore({ signedIn: true })
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch (requestError) {
      setBore({ signedIn: false })
      setError(requestError.message)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(status.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const setField = (key, value) => setFields((current) => ({ ...current, [key]: value }))
  const active = providers.find((item) => item.id === provider)
  const runningSame = status?.running && status.provider === provider
  const enableLabel = !status?.running ? t('share.enable') : (runningSame ? t('share.restart') : t('share.switch'))

  if (!open) return null
  return <div class="modal-backdrop share-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
    <section class="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <div class="share-modal-heading">
        <strong id="share-modal-title"><Globe size={15} />{t('share.title')}</strong>
        <vscode-toolbar-button icon="close" onClick={() => setOpen(false)} title={t('common.cancel')} aria-label={t('common.cancel')}></vscode-toolbar-button>
      </div>
      <vscode-scrollable class="share-modal-body">
        {status?.running && status.url && (
          <div class="share-live-card">
            <div class="share-live-top">
              <span class={`share-dot ${health?.state === 'dead' ? 'dead' : 'live'}`} />
              <a class="share-url" href={status.url} target="_blank" rel="noreferrer">{status.url}</a>
              <button class="tw-icon-button" type="button" title={t('share.copy')} aria-label={t('share.copy')} onClick={copy}><Copy size={13} /></button>
              <a class="tw-icon-button" href={status.url} target="_blank" rel="noreferrer" title={t('share.open')} aria-label={t('share.open')}><ExternalLink size={13} /></a>
            </div>
            <div class="share-live-meta">
              <span class="share-badge">{status.provider}</span>
              {copied && <small class="muted">{t('share.copied')}</small>}
              {health?.state === 'checking' && <small class="muted">{t('share.checking')}</small>}
              {health?.state === 'dead' && <small class="share-dead">{t('share.unreachable')}</small>}
              <button class="share-link-button" type="button" onClick={probe}><RefreshCw size={11} />{t('share.checkAgain')}</button>
            </div>
          </div>
        )}
        <div class="share-provider-grid" role="radiogroup" aria-label={t('share.provider')}>
          {providers.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={provider === item.id}
              class={`share-provider-card ${provider === item.id ? 'active' : ''}`}
              onClick={() => setProvider(item.id)}>
              <strong>{item.label}</strong>
              <span class="share-provider-badges">
                <span class={`share-badge ${item.fixed ? 'fixed' : ''}`}>{item.fixed ? t('share.fixedUrl') : t('share.randomUrl')}</span>
                <span class="share-badge">{t(`share.account.${item.account || 'none'}`)}</span>
              </span>
            </button>
          ))}
        </div>
        {active && <p class="share-provider-hint">{t(`share.hint.${active.id}`)}</p>}
        {active?.id === 'bore' && (
          <div class="share-bore-box">
            {bore?.signedIn ? (
              <span class="share-signed-in"><Check size={14} />{t('share.boreSignedIn')}</span>
            ) : (
              <>
                <span class="muted">{t('share.boreNeedSignIn')}</span>
                <span class="share-bore-actions">
                  <vscode-button secondary onClick={startBoreLogin} disabled={bore?.waiting && !bore?.authUrl}>{t('share.boreSignIn')}</vscode-button>
                  {bore?.authUrl && <a class="share-link-button" href={bore.authUrl} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('share.boreOpenSignIn')}</a>}
                </span>
                {bore?.waiting && <small class="muted">{t('share.boreWaiting')}</small>}
              </>
            )}
          </div>
        )}
        {(active?.fields || []).map((field) => (
          <vscode-textfield
            key={field.key}
            class="share-field-input"
            value={fields[field.key] ?? field.default ?? ''}
            type={field.secret ? 'password' : 'text'}
            placeholder={`${field.label}${field.required ? ' *' : ''}${field.placeholder ? ` — ${field.placeholder}` : ''}`}
            onInput={(event) => setField(field.key, event.currentTarget.value)} />
        ))}
        {active?.id === 'sish' && status?.pubkey && (
          <small class="muted share-pubkey" title={t('share.pubkeyHint')}>{status.pubkey}</small>
        )}
        {error && <span class="error-text">{error}</span>}
      </vscode-scrollable>
      <div class="share-modal-actions">
        {status?.running && <vscode-button secondary disabled={busy} onClick={disable}>{t('share.disable')}</vscode-button>}
        <vscode-button disabled={busy || !provider} onClick={enable}>{busy ? t('share.enabling') : enableLabel}</vscode-button>
      </div>
    </section>
  </div>
}
