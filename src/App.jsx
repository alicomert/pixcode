import { useEffect, useState } from 'preact/hooks'
import { api, getToken, setToken } from './lib/api.js'
import { ws } from './lib/ws.js'
import { t } from './lib/i18n.js'
import { AuthGate } from './components/AuthGate.jsx'
import { Shell } from './components/Shell.jsx'

export function App() {
  const [state, setState] = useState({ loading: true, setupRequired: false, authenticated: false })

  useEffect(() => {
    let cancelled = false
    const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

    // The desktop shell starts the bundled Node process asynchronously. Give
    // it a brief window to bind its port before treating the backend as down.
    async function healthWithRetry() {
      let lastError
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return null
        try { return await api.health() } catch (error) {
          lastError = error
          if (attempt < 11) {
            await wait(Math.min(250 + attempt * 150, 1_000))
            if (cancelled) return null
          }
        }
      }
      throw lastError || new Error('server unavailable')
    }

    async function boot() {
      try {
        const health = await healthWithRetry()
        if (!health || cancelled) return
        let authenticated = false
        if (getToken()) {
          try {
            await api.get('/api/auth/me')
            authenticated = true
          } catch {
            setToken('')
          }
        }
        if (!cancelled) setState({ loading: false, setupRequired: health.setupRequired, authenticated })
      } catch {
        if (!cancelled) setState({ loading: false, setupRequired: false, authenticated: false, unavailable: true })
      }
    }
    boot()
    return () => { cancelled = true; ws.close() }
  }, [])

  if (state.loading) return <div class="loading-screen"><img src="/logo.png" alt="Pixcode" /><span>Pixcode</span></div>
  if (state.unavailable) return <div class="loading-screen loading-unavailable"><img src="/logo.png" alt="Pixcode" /><span>{t('app.unavailable')}</span></div>
  if (state.authenticated) return <Shell />
  return <AuthGate setupRequired={state.setupRequired} onAuthenticated={() => setState((current) => ({ ...current, authenticated: true }))} />
}

export default App
