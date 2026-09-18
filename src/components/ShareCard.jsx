import { useEffect, useState } from 'preact/hooks'
import { Copy, Globe } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

// Slim launcher row: full provider configuration lives in ShareModal so the
// settings list stays uncluttered.
export function ShareCard() {
  const [status, setStatus] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    ws.request('share', 'status').then(setStatus).catch(() => setStatus(null))
  }, [])

  function copy() {
    navigator.clipboard?.writeText(status.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const live = status?.running && status.url
  return <div class="settings-card">
    <div class="settings-control-row settings-control-row-last">
      <div class="settings-control-copy">
        <Globe size={16} />
        <span>
          <strong>{t('share.title')}</strong>
          {live
            ? <small class="share-card-live"><a class="share-url" href={status.url} target="_blank" rel="noreferrer">{status.url}</a>
                <button class="tw-icon-button" type="button" title={t('share.copy')} aria-label={t('share.copy')} onClick={copy}><Copy size={12} /></button>
                {copied && <small class="muted">{t('share.copied')}</small>}
              </small>
            : <small>{t('share.off')}</small>}
        </span>
      </div>
      <vscode-button secondary onClick={() => window.dispatchEvent(new Event('pixcode:share-open'))}>{t('share.manage')}</vscode-button>
    </div>
  </div>
}
