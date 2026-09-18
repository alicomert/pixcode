import { useEffect, useState } from 'preact/hooks'
import { Globe } from '../lib/icons.jsx'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

// Slim launcher row: full provider configuration lives in ShareModal so the
// settings list stays uncluttered.
export function ShareCard() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    ws.request('share', 'status').then(setStatus).catch(() => setStatus(null))
  }, [])

  const live = status?.running && status.url
  return <div class="settings-card">
    <div class="settings-control-row settings-control-row-last">
      <div class="settings-control-copy">
        <Globe size={16} />
        <span>
          <strong>{t('share.title')}</strong>
          <small>{live ? status.url : t('share.off')}</small>
        </span>
      </div>
      <vscode-button secondary onClick={() => window.dispatchEvent(new Event('pixcode:share-open'))}>{t('share.manage')}</vscode-button>
    </div>
  </div>
}
