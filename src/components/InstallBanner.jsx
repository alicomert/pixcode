import { useEffect, useState } from 'preact/hooks'
import { t } from '../lib/i18n.js'

const DISMISS_KEY = 'pixcode.installBannerDismissed'

function isInstalled() {
  return navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: window-controls-overlay)').matches
}

function isIos() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

// Ask once per session to install the PWA. Android/desktop fire
// beforeinstallprompt; iOS never does, so the banner falls back to the
// Share -> Add to Home Screen instructions there.
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [hidden, setHidden] = useState(() => isInstalled() || sessionStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setPromptEvent(event) }
    const installed = () => { setPromptEvent(null); setHidden(true) }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', installed) }
  }, [])

  if (hidden || (!promptEvent && !isIos())) return null

  async function install() {
    const event = promptEvent
    setPromptEvent(null)
    try { await event?.prompt() } catch { /* already consumed elsewhere */ }
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setHidden(true)
  }

  return (
    <div class="install-banner" role="dialog" aria-label={t('pwa.install')}>
      <img class="install-banner-icon" src="/icons/icon-192x192.png" alt="" />
      <div class="install-banner-copy">
        <strong>{t('pwa.bannerTitle')}</strong>
        <span>{isIos() ? t('pwa.iosHint') : t('pwa.bannerHint')}</span>
      </div>
      {promptEvent && <vscode-button class="install-banner-action" icon="cloud-download" onClick={install}>{t('pwa.installAction')}</vscode-button>}
      <vscode-toolbar-button class="install-banner-close" icon="close" aria-label={t('pwa.dismiss')} onClick={dismiss}></vscode-toolbar-button>
    </div>
  )
}
