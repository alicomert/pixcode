import { useEffect, useState } from 'preact/hooks'
import { Copy, Globe } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { VscSelect } from './vsc.jsx'

// Public link card: pick a tunnel provider, fill its fields, and the daemon
// exposes this workbench on a public HTTPS URL (state lives server-side in
// $PIXCODE_HOME/share.json; the tunnel process survives restarts).
export function ShareCard() {
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [fields, setFields] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const active = providers.find((item) => item.id === provider)

  useEffect(() => {
    ws.request('share', 'providers').then(({ providers: list }) => {
      setProviders(list || [])
      if (list?.length && !provider) setProvider(list[0].id)
    }).catch(() => {})
    refresh()
  }, [])

  async function refresh() {
    try { setStatus(await ws.request('share', 'status')) } catch { setStatus(null) }
  }

  async function enable() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const st = await ws.request('share', 'enable', { provider, opts: fields })
      setStatus({ ...st, running: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      await ws.request('share', 'disable')
      setStatus({ enabled: false, running: false })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(status.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const setField = (key, value) => setFields((current) => ({ ...current, [key]: value }))

  return <div class="settings-card share-card">
    {status?.running && status.url && (
      <div class="settings-control-row share-live-row">
        <div class="settings-control-copy"><Globe size={16} /><span><strong>{t('share.live')}</strong><small>{status.provider}</small></span></div>
        <span class="share-url-row">
          <a class="share-url" href={status.url} target="_blank" rel="noreferrer">{status.url}</a>
          <button class="tw-icon-button" type="button" title={t('share.copy')} aria-label={t('share.copy')} onClick={copy}><Copy size={13} /></button>
          {copied && <small class="muted">{t('share.copied')}</small>}
        </span>
      </div>
    )}
    <div class="settings-control-row">
      <div class="settings-control-copy"><span><strong>{t('share.provider')}</strong><small>{active?.fixed ? t('share.fixedUrl') : t('share.randomUrl')}</small></span></div>
      <VscSelect value={provider} onChange={setProvider} aria-label={t('share.provider')}>
        {providers.map((item) => <vscode-option key={item.id} value={item.id}>{item.label}</vscode-option>)}
      </VscSelect>
    </div>
    {(active?.fields || []).map((field) => (
      <div class="settings-control-row" key={field.key}>
        <vscode-textfield
          class="share-field-input"
          value={fields[field.key] || ''}
          type={field.secret ? 'password' : 'text'}
          placeholder={`${field.label}${field.required ? ' *' : ''}${field.placeholder ? ` — ${field.placeholder}` : ''}`}
          onInput={(event) => setField(field.key, event.currentTarget.value)} />
      </div>
    ))}
    <div class="settings-control-row settings-control-row-last">
      <vscode-button disabled={busy} onClick={enable}>{busy ? t('share.enabling') : (status?.running ? t('share.restart') : t('share.enable'))}</vscode-button>
      {status?.running && <vscode-button secondary disabled={busy} onClick={disable}>{t('share.disable')}</vscode-button>}
    </div>
    {status?.pubkey && provider === 'sish' && (
      <small class="muted share-pubkey" title={t('share.pubkeyHint')}>{status.pubkey}</small>
    )}
    {error && <span class="error-text">{error}</span>}
  </div>
}
