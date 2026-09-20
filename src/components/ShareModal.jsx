import { useEffect, useRef, useState } from 'preact/hooks'
import { Check, Copy, ExternalLink, Globe, RefreshCw } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { useEscape } from '../lib/useEscape.js'
import { TField } from './Fields.jsx'

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
  const [bore, setBore] = useState(null) // { signedIn, authUrl, waiting, needsPaste }
  const [pasteUrl, setPasteUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)
  useEscape(open, () => setOpen(false))

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
    try {
      const next = await ws.request('share', 'boreStatus')
      setBore((current) => ({ ...current, ...next }))
    } catch { setBore((current) => ({ ...current, signedIn: false })) }
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

  function watchBoreSignIn() {
    window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await ws.request('share', 'boreStatus')
        if (next.signedIn) {
          window.clearInterval(pollRef.current)
          setBore({ signedIn: true })
          // Sign-in done → turn the tunnel on without a second click.
          if (provider === 'bore') enable()
        }
      } catch { /* keep polling */ }
    }, 2000)
  }

  async function startBoreLogin() {
    setError('')
    // Open the window inside the click gesture so popup blockers allow it;
    // its location is filled once the daemon returns the auth URL.
    const popup = window.open('', '_blank', 'noopener')
    setBore((current) => ({ ...current, waiting: true }))
    try {
      const result = await ws.request('share', 'boreLogin', { origin: location.origin })
      if (result.signedIn) { popup?.close(); setBore({ signedIn: true }); return }
      if (popup) popup.location.href = result.authUrl
      setBore({ signedIn: false, authUrl: result.authUrl, waiting: true, needsPaste: result.needsPaste })
      watchBoreSignIn()
    } catch (requestError) {
      popup?.close()
      setBore({ signedIn: false })
      setError(requestError.message)
    }
  }

  async function finishBore() {
    setError('')
    try {
      await ws.request('share', 'boreCallback', { url: pasteUrl })
      setPasteUrl('')
      refreshBore()
      watchBoreSignIn()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text)
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
              <button class="tw-icon-button" type="button" title={t('share.copy')} aria-label={t('share.copy')} onClick={() => copy(status.url)}><Copy size={13} /></button>
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
        <span class="share-section-label">{t('share.provider')}</span>
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
                {item.recommended && <span class="share-badge recommended">{t('share.recommended')}</span>}
                <span class={`share-badge ${item.fixed ? 'fixed' : ''}`}>{item.fixed ? t('share.fixedUrl') : t('share.randomUrl')}</span>
                <span class="share-badge">{t(`share.account.${item.account || 'none'}`)}</span>
              </span>
            </button>
          ))}
        </div>
        {active && <p class="share-provider-hint">{t(`share.hint.${active.id}`)}</p>}
        {active?.docs && <a class="share-docs-row" href={active.docs} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('share.getCreds')}</a>}
        {active?.id === 'bore' && (
          <div class="share-bore-box">
            {bore?.signedIn ? (
              <span class="share-signed-in"><Check size={14} />{t('share.boreSignedIn')}</span>
            ) : (
              <>
                <span class="muted">{t('share.boreNeedSignIn')}</span>
                <span class="share-bore-actions">
                  <vscode-button secondary onClick={startBoreLogin}>{t('share.boreSignIn')}</vscode-button>
                  {bore?.authUrl && <a class="share-link-button" href={bore.authUrl} target="_blank" rel="noreferrer"><ExternalLink size={11} />{t('share.boreOpenSignIn')}</a>}
                </span>
                {bore?.waiting && <small class="muted">{t('share.boreWaiting')}</small>}
                {(bore?.needsPaste || bore?.authUrl) && (
                  <div class="share-paste-box">
                    <small class="muted">{t('share.borePasteHint')}</small>
                    <span class="share-paste-row">
                      <TField value={pasteUrl} placeholder="http://127.0.0.1:PORT/callback?code=…" onInput={(event) => setPasteUrl(event.currentTarget.value)} />
                      <vscode-button secondary disabled={!pasteUrl.trim()} onClick={finishBore}>{t('share.borePasteGo')}</vscode-button>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {(active?.fields || []).length > 0 && <span class="share-section-label">{t('share.options')}</span>}
        {(active?.fields || []).map((field) => (
          <label class="share-field" key={field.key}>
            <span class="share-field-label">{field.label}{field.required && <em class="share-req">*</em>}</span>
            <TField
              class="share-field-input"
              value={fields[field.key] ?? field.default ?? ''}
              type={field.secret ? 'password' : 'text'}
              placeholder={field.placeholder || ''}
              onInput={(event) => setField(field.key, event.currentTarget.value)} />
          </label>
        ))}
        {active?.id === 'sish' && status?.pubkey && (
          <details class="share-pubkey-box">
            <summary>{t('share.pubkeyShow')}</summary>
            <div class="share-pubkey-row">
              <code>{status.pubkey}</code>
              <button class="tw-icon-button" type="button" title={t('share.copy')} aria-label={t('share.copy')} onClick={() => copy(status.pubkey)}><Copy size={12} /></button>
            </div>
          </details>
        )}
        {error && <span class="error-text" role="alert">{error}</span>}
      </vscode-scrollable>
      <div class="share-modal-actions">
        {status?.running && <vscode-button secondary disabled={busy} onClick={disable}>{t('share.disable')}</vscode-button>}
        <vscode-button disabled={busy || !provider} onClick={enable}>{busy ? t('share.enabling') : enableLabel}</vscode-button>
      </div>
    </section>
  </div>
}
