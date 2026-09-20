import { useEffect, useRef, useState } from 'preact/hooks'
import { Globe2, Maximize2, RefreshCw, X } from '../lib/icons.jsx'
import { api, desktopRuntime, getToken, resolveApiUrl } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { TInput } from './Fields.jsx'
import { workspace } from '../state/app.js'

// Device frames: the iframe keeps its own layout width while the wrapper
// constrains the visible viewport — a phone preview is just a narrower box.
const DEVICES = [
  { id: 'desktop', label: 'preview.desktop', width: null },
  { id: 'tablet', label: 'preview.tablet', width: 768 },
  { id: 'phone', label: 'preview.phone', width: 390 }
]

function targetUrl(target) {
  // The dev server lives on the Pixcode host; the iframe reaches it through
  // the same hostname the browser used for this UI.
  const host = desktopRuntime ? '127.0.0.1' : location.hostname
  return `http://${host}:${target.port}/`
}

export function PreviewPane() {
  const [targets, setTargets] = useState([])
  const [selected, setSelected] = useState('')
  const [device, setDevice] = useState('desktop')
  const [staticPath, setStaticPath] = useState('index.html')
  const [mode, setMode] = useState('server')
  const [frameKey, setFrameKey] = useState(0)
  const [error, setError] = useState('')
  const scanningRef = useRef(false)

  async function scan() {
    if (scanningRef.current) return
    scanningRef.current = true
    try {
      const { targets: found } = await api.get('/api/preview/targets')
      setTargets(found || [])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      scanningRef.current = false
    }
  }

  useEffect(() => {
    scan()
    const interval = setInterval(scan, 5_000)
    const reconnect = () => scan()
    window.addEventListener('pixcode:ws-open', reconnect)
    window.addEventListener('pixcode:workspace-change', scan)
    return () => { clearInterval(interval); window.removeEventListener('pixcode:ws-open', reconnect); window.removeEventListener('pixcode:workspace-change', scan) }
  }, [])

  const active = targets.find((item) => String(item.port) === selected)
  useEffect(() => {
    if (!active && targets.length && !selected) setSelected(String(targets[0].port))
    if (active && selected !== String(active.port)) setSelected(String(active.port))
  }, [targets])

  const src = mode === 'static'
    ? `${resolveApiUrl('/api/preview/static')}?w=${encodeURIComponent(workspace.value?.path || '')}&p=${encodeURIComponent(staticPath || 'index.html')}&token=${encodeURIComponent(getToken())}`
    : (active ? targetUrl(active) : '')

  return <div class="preview-pane">
    <div class="preview-toolbar">
      <span class="terminal-badge"><Globe2 size={13} /> {t('preview.title')}</span>
      <div class="preview-source">
        <button type="button" class={`preview-mode ${mode === 'server' ? 'active' : ''}`} onClick={() => setMode('server')}>{t('preview.devServer')}</button>
        <button type="button" class={`preview-mode ${mode === 'static' ? 'active' : ''}`} onClick={() => setMode('static')}>{t('preview.staticFile')}</button>
      </div>
      {mode === 'server' ? (
        <select class="preview-port" value={selected} onChange={(event) => setSelected(event.currentTarget.value)} aria-label={t('preview.port')}>
          {!targets.length && <option value="">{t('preview.noServer')}</option>}
          {targets.map((item) => <option key={item.port} value={String(item.port)}>:{item.port}{item.label ? ` · ${item.label}` : ''}</option>)}
        </select>
      ) : (
        <TInput class="preview-path" value={staticPath} onInput={(event) => setStaticPath(event.currentTarget.value)} placeholder="index.html" aria-label={t('preview.staticPath')} spellcheck="false" />
      )}
      <div class="preview-devices" role="group" aria-label={t('preview.device')}>
        {DEVICES.map((item) => <button key={item.id} type="button" class={device === item.id ? 'active' : ''} aria-pressed={device === item.id} onClick={() => setDevice(item.id)} title={t(item.label)}>{t(item.label)}</button>)}
      </div>
      <span class="agent-header-spacer" />
      <vscode-toolbar-button icon="refresh" onClick={() => { setFrameKey((value) => value + 1); scan() }} title={t('preview.refresh')} aria-label={t('preview.refresh')}></vscode-toolbar-button>
      {src && mode === 'server' && <vscode-toolbar-button icon="link-external" onClick={() => window.open(src, '_blank', 'noopener')} title={t('preview.openExternal')} aria-label={t('preview.openExternal')}></vscode-toolbar-button>}
    </div>
    <div class="preview-stage">
      {src ? (
        <div class={`preview-frame preview-${device}`} style={DEVICES.find((item) => item.id === device)?.width ? { '--device-width': `${DEVICES.find((item) => item.id === device).width}px` } : {}}>
          <iframe key={frameKey + src} src={src} title={t('preview.title')} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" />
        </div>
      ) : (
        <div class="preview-empty">
          <Maximize2 size={20} />
          <span>{t('preview.empty')}</span>
          <small>{mode === 'server' ? t('preview.emptyHint') : t('preview.staticHint')}</small>
        </div>
      )}
      {error && <div class="error-text agent-error" role="alert">{error}</div>}
    </div>
  </div>
}
